# Automatic Absence Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist missing scheduled attendance as an automatic absence when a teacher first loads attendance after one or more unattended days.

**Architecture:** PostgreSQL owns the catch-up transaction through one advisory-locked reconciliation function and a singleton checkpoint row. The existing teacher attendance GET calls that function before reading records; student GET requests remain read-only.

**Tech Stack:** Next.js 16, TypeScript 6, Supabase/PostgreSQL, Jest 30, Docker PostgreSQL for SQL integration verification

## Global Constraints

- Use the Asia/Seoul calendar date for every reconciliation boundary.
- Reconcile from `last_processed_date + 1` through yesterday, including Friday when the next teacher access is Monday.
- Skip Saturday, Sunday, student non-scheduled weekdays, and dates before student registration.
- Persist automatic absences with `device_id='system-auto'` and `device_label='시스템 자동 결석'`.
- Do not add a cron job or holiday calendar.
- Preserve the unrelated `.env.development` deletion and do not stage it.

---

### Task 1: Atomic PostgreSQL Reconciliation

**Files:**
- Modify: `supabase/schema.sql`
- Create: `supabase/automatic_absence_reconciliation.test.sql`

**Interfaces:**
- Consumes: `students.attendance_weekdays`, `attendance_records`, PostgreSQL `pgcrypto`
- Produces: `students.attendance_started_on date`, `attendance_reconciliation_state`, `public.reconcile_attendance_absences(target_date date default null) returns integer`

- [ ] **Step 1: Write the failing SQL integration test**

Create `supabase/automatic_absence_reconciliation.test.sql` as a transaction that:

```sql
begin;

truncate public.attendance_records, public.users, public.students restart identity cascade;
update public.attendance_reconciliation_state
set last_processed_date = date '2026-08-06'
where singleton = true;

insert into public.students (
  student_number, name, grade, class_number, seat_number,
  attendance_weekdays, attendance_started_on
) values
  ('10101', '금요일 미출석', 1, 1, 1, '{5}', date '2026-08-07'),
  ('10102', '금요일 출석', 1, 1, 2, '{5}', date '2026-08-07'),
  ('10103', '월요일만 대상', 1, 1, 3, '{1}', date '2026-08-07'),
  ('10104', '주말 신규', 1, 1, 4, '{5}', date '2026-08-08');

insert into public.attendance_records (
  id, student_id, action, "timestamp", device_id, device_label
)
select gen_random_uuid(), id, 'present', timestamptz '2026-08-07 19:00:00+09', 'teacher-manual', '교사 처리'
from public.students
where student_number = '10102';

create function pg_temp.reject_automatic_absence()
returns trigger
language plpgsql
as $$
begin
  if new.device_id = 'system-auto' then
    raise exception 'forced automatic absence failure';
  end if;
  return new;
end;
$$;

create trigger reject_automatic_absence
before insert on public.attendance_records
for each row execute function pg_temp.reject_automatic_absence();

do $$
declare
  processed_date date;
begin
  begin
    perform public.reconcile_attendance_absences(date '2026-08-09');
    raise exception 'expected reconciliation failure';
  exception
    when others then
      if sqlerrm = 'expected reconciliation failure' then
        raise;
      end if;
  end;

  select last_processed_date into processed_date
  from public.attendance_reconciliation_state
  where singleton = true;

  if processed_date <> date '2026-08-06' then
    raise exception 'checkpoint advanced after failed reconciliation';
  end if;

  if exists (
    select 1 from public.attendance_records where device_id = 'system-auto'
  ) then
    raise exception 'automatic absence survived failed reconciliation';
  end if;
end $$;

drop trigger reject_automatic_absence on public.attendance_records;

select public.reconcile_attendance_absences(date '2026-08-09');
select public.reconcile_attendance_absences(date '2026-08-09');

do $$
declare
  automatic_count integer;
  processed_date date;
begin
  select count(*) into automatic_count
  from public.attendance_records
  where action = 'absent' and device_id = 'system-auto';

  if automatic_count <> 1 then
    raise exception 'expected one automatic Friday absence, got %', automatic_count;
  end if;

  if not exists (
    select 1
    from public.attendance_records r
    join public.students s on s.id = r.student_id
    where s.student_number = '10101'
      and r.action = 'absent'
      and (r."timestamp" at time zone 'Asia/Seoul')::date = date '2026-08-07'
  ) then
    raise exception 'missing Friday automatic absence';
  end if;

  select last_processed_date into processed_date
  from public.attendance_reconciliation_state
  where singleton = true;

  if processed_date <> date '2026-08-09' then
    raise exception 'checkpoint did not advance through the requested date';
  end if;
end $$;

rollback;
```

- [ ] **Step 2: Run the SQL test to verify RED**

Run:

```bash
docker run --rm -d --name night-attend-absence-red -e POSTGRES_PASSWORD=postgres -v /Users/choiwuseck/Desktop/Night-self-study-Attend:/workspace:ro postgres:17-alpine
until docker exec night-attend-absence-red pg_isready -U postgres; do sleep 1; done
docker exec night-attend-absence-red psql -U postgres -f /workspace/supabase/schema.sql
docker exec night-attend-absence-red psql -v ON_ERROR_STOP=1 -U postgres -f /workspace/supabase/automatic_absence_reconciliation.test.sql
docker stop night-attend-absence-red
```

Expected: the test command fails because `attendance_reconciliation_state`, `attendance_started_on`, or `reconcile_attendance_absences` does not exist.

- [ ] **Step 3: Add the schema and reconciliation function**

In `supabase/schema.sql`:

```sql
alter table public.students
  add column if not exists attendance_started_on date;

update public.students
set attendance_started_on = (timezone('Asia/Seoul', now()))::date
where attendance_started_on is null;

alter table public.students
  alter column attendance_started_on
  set default (timezone('Asia/Seoul', now()))::date,
  alter column attendance_started_on set not null;

create table if not exists public.attendance_reconciliation_state (
  singleton boolean primary key default true check (singleton),
  last_processed_date date not null
);

insert into public.attendance_reconciliation_state (singleton, last_processed_date)
values (true, (timezone('Asia/Seoul', now()))::date - 1)
on conflict (singleton) do nothing;
```

Add the reconciliation function and enable RLS for the server-only checkpoint table:

```sql
create or replace function public.reconcile_attendance_absences(
  target_date date default null
)
returns integer
language plpgsql
as $$
declare
  today_in_korea date := (timezone('Asia/Seoul', now()))::date;
  reconciliation_end date;
  reconciliation_start date;
  inserted_count integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtext('night-attend-absence-reconciliation')
  );

  reconciliation_end := least(
    coalesce(target_date, today_in_korea - 1),
    today_in_korea - 1
  );

  select last_processed_date into reconciliation_start
  from public.attendance_reconciliation_state
  where singleton = true
  for update;

  if reconciliation_start >= reconciliation_end then
    return 0;
  end if;

  with pending_dates as (
    select generated_date::date as attendance_date
    from generate_series(
      reconciliation_start + 1,
      reconciliation_end,
      interval '1 day'
    ) generated_date
  ), inserted as (
    insert into public.attendance_records (
      id, student_id, action, "timestamp", device_id, device_label
    )
    select
      gen_random_uuid(),
      student.id,
      'absent',
      (pending.attendance_date::timestamp + time '23:59:59')
        at time zone 'Asia/Seoul',
      'system-auto',
      '시스템 자동 결석'
    from pending_dates pending
    cross join public.students student
    where extract(isodow from pending.attendance_date)::integer =
          any(student.attendance_weekdays)
      and pending.attendance_date >= student.attendance_started_on
      and not exists (
        select 1
        from public.attendance_records existing
        where existing.student_id = student.id
          and (existing."timestamp" at time zone 'Asia/Seoul')::date =
              pending.attendance_date
      )
    returning 1
  )
  select count(*) into inserted_count from inserted;

  update public.attendance_reconciliation_state
  set last_processed_date = reconciliation_end
  where singleton = true;

  return inserted_count;
end;
$$;

alter table public.attendance_reconciliation_state enable row level security;
```

- [ ] **Step 4: Run the SQL test to verify GREEN and idempotency**

Run:

```bash
docker run --rm -d --name night-attend-absence-green -e POSTGRES_PASSWORD=postgres -v /Users/choiwuseck/Desktop/Night-self-study-Attend:/workspace:ro postgres:17-alpine
until docker exec night-attend-absence-green pg_isready -U postgres; do sleep 1; done
docker exec night-attend-absence-green psql -v ON_ERROR_STOP=1 -U postgres -f /workspace/supabase/schema.sql
docker exec night-attend-absence-green psql -v ON_ERROR_STOP=1 -U postgres -f /workspace/supabase/automatic_absence_reconciliation.test.sql
docker stop night-attend-absence-green
```

Expected: schema and integration SQL both exit 0; a forced INSERT failure rolls back the checkpoint and generated absence, the second successful function call inserts zero rows, Friday produces one absence, weekend/non-scheduled/new-student cases produce none, and the checkpoint reaches `2026-08-09`.

- [ ] **Step 5: Commit the database slice**

```bash
git add supabase/schema.sql supabase/automatic_absence_reconciliation.test.sql
git commit -m "자동 결석 DB 정산 추가"
```

### Task 2: Teacher Attendance Read Trigger

**Files:**
- Modify: `src/server/attendanceApi.ts`

**Interfaces:**
- Consumes: Supabase RPC `reconcile_attendance_absences`
- Produces: teacher attendance GET reconciles before `attendanceRecords`; student attendance GET remains read-only

- [ ] **Step 1: Add the minimal server reconciliation call**

Add one focused helper next to `attendanceRecords`:

```typescript
async function reconcileAttendanceAbsences() {
  const { error } = await getSupabase().rpc('reconcile_attendance_absences');
  if (error) failFromDatabase(error);
}
```

Wire it after session validation and before reading records:

```typescript
if (req.method === 'GET' && pathname === '/api/attendance') {
  const session = await requireSession(req);
  if (session.user.role === 'teacher') {
    await reconcileAttendanceAbsences();
  }
  return sendJson(state, 200, await attendanceRecords(session));
}
```

The branch is intentionally not wrapped in a new abstraction: authorization already yields the discriminant, the RPC owns business logic, and the server only sequences the two operations.

- [ ] **Step 2: Run existing behavioral and type checks**

Run:

```bash
npm test -- --runInBand
npx tsc --noEmit
```

Expected: all existing weekday/weekend/teacher workspace tests pass and TypeScript exits 0. No extra mock-only test is added because it would assert only that a hard-coded RPC method calls that same hard-coded RPC name; the SQL integration test protects the failure-prone behavior.

- [ ] **Step 3: Run the no-excuse TypeScript audit when callable**

Run:

```bash
bun /Users/choiwuseck/.codex/plugins/cache/sisyphuslabs/omo/4.19.2/skills/programming/scripts/typescript/check-no-excuse-rules.ts src/server/attendanceApi.ts
```

Expected: exit 0. If the installed script cannot resolve project TypeScript, record that tool failure and rely on `npx tsc --noEmit`; do not modify application dependencies for the audit.

- [ ] **Step 4: Commit the server slice**

```bash
git add src/server/attendanceApi.ts
git commit -m "관리자 조회 시 자동 결석 정산"
```

### Task 3: Final Verification and Deployment Boundary

**Files:**
- Verify: `supabase/schema.sql`
- Verify: `supabase/automatic_absence_reconciliation.test.sql`
- Verify: `src/server/attendanceApi.ts`

**Interfaces:**
- Consumes: completed database and server slices
- Produces: locally verified commits and an explicit remote migration handoff

- [ ] **Step 1: Run the complete project verification**

```bash
npm test -- --runInBand
npx tsc --noEmit
npm run build
git diff --check
```

Expected: Jest has zero failures, TypeScript exits 0, Next.js production build exits 0, and no whitespace errors are reported.

- [ ] **Step 2: Re-run the real PostgreSQL integration scenario**

Run:

```bash
docker run --rm -d --name night-attend-absence-final -e POSTGRES_PASSWORD=postgres -v /Users/choiwuseck/Desktop/Night-self-study-Attend:/workspace:ro postgres:17-alpine
until docker exec night-attend-absence-final pg_isready -U postgres; do sleep 1; done
docker exec night-attend-absence-final psql -v ON_ERROR_STOP=1 -U postgres -f /workspace/supabase/schema.sql
docker exec night-attend-absence-final psql -v ON_ERROR_STOP=1 -U postgres -f /workspace/supabase/automatic_absence_reconciliation.test.sql
docker stop night-attend-absence-final
```

Expected: the Friday-to-Monday catch-up, weekend skip, existing-record exclusion, registration boundary, and repeated-call idempotency assertions all pass.

- [ ] **Step 3: Confirm the remote migration boundary without exposing secrets**

Query only whether the new column/function are available. Do not print URL or keys. If the remote project still reports `42703` or missing RPC, report `supabase/schema.sql` as pending application in Supabase SQL Editor; do not claim the deployed feature works.

- [ ] **Step 4: Verify repository scope**

```bash
git status --short
git log -5 --oneline
```

Expected: feature commits are present; the unrelated `.env.development` deletion remains unstaged and unchanged.
