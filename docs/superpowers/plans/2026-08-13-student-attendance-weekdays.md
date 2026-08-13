# Student Attendance Weekdays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators configure Monday-Friday attendance days per student and ensure weekends or unscheduled weekdays never count as absences.

**Architecture:** Store a validated `integer[]` directly on each `students` row and carry it through the existing student list/update API. Reuse the existing row edit flow for weekday changes, then centralize date eligibility in attendance helpers consumed by both absence totals and the daily attendance table.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Supabase PostgreSQL, Jest, Testing Library, Tailwind CSS.

## Global Constraints

- Preserve the current Tailwind look and existing table interaction patterns.
- Existing and new students default to Monday-Friday.
- At least one weekday must remain selected.
- Saturday and Sunday are never absence-eligible.
- Do not add dependencies or a separate schedule abstraction.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Student schedule domain and database contract

**Files:**
- Modify: `src/lib/attendance.test.ts`
- Modify: `src/lib/attendance.ts`
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: `Student.attendanceWeekdays: readonly AttendanceWeekday[]`
- Produces: `parseAttendanceWeekdays(value: unknown): AttendanceWeekday[] | null`
- Produces: `isStudentScheduledOnDate(dateKey: string, activeWeekdays: readonly AttendanceWeekday[]): boolean`
- Updates: `getStudentAbsentCount(studentNumber, records, options)` to use the supplied student's weekdays.

- [ ] **Step 1: Add failing domain tests**

Add tests proving Monday-only students do not accrue Tuesday absences, Saturday/Sunday never accrue absences, and invalid/empty weekday arrays are rejected. The decisive assertions are:

```ts
expect(isStudentScheduledOnDate('2026-08-03', [1])).toBe(true);
expect(isStudentScheduledOnDate('2026-08-04', [1])).toBe(false);
expect(isStudentScheduledOnDate('2026-08-08', DEFAULT_ATTENDANCE_WEEKDAYS)).toBe(false);
expect(parseAttendanceWeekdays([])).toBeNull();
```

- [ ] **Step 2: Verify red**

Run: `npm test -- --runInBand src/lib/attendance.test.ts`

Expected: FAIL because the student date-eligibility helper and per-student contract are missing.

- [ ] **Step 3: Implement minimum domain and schema change**

Add `attendanceWeekdays` to `Student`, share one strict parser for values `1..5`, and implement eligibility from a parsed `YYYY-MM-DD` date using UTC weekday calculation. In `students`, add:

```sql
attendance_weekdays integer[] not null default '{1,2,3,4,5}'
```

For existing databases, use `alter table ... add column if not exists` and a named check constraint requiring a non-empty subset of `[1,2,3,4,5]`. Remove the unfinished global `attendance_settings` table because the setting is student-specific.

- [ ] **Step 4: Verify green**

Run: `npm test -- --runInBand src/lib/attendance.test.ts`

Expected: PASS for schedule eligibility, weekend exclusion, and absence-count behavior.

### Task 2: Existing student API persists weekdays

**Files:**
- Modify: `src/services/appService.test.ts`
- Modify: `src/services/appService.ts`
- Modify: `src/server/attendanceApi.ts`

**Interfaces:**
- Consumes: `parseAttendanceWeekdays` and `AttendanceWeekday` from Task 1.
- Updates: `UpdateStudentInput` with `readonly attendanceWeekdays: readonly AttendanceWeekday[]`.
- Updates: `GET /api/students`, `POST /api/students`, and `PUT /api/students/:id` student payloads.

- [ ] **Step 1: Add failing service tests**

Replace unfinished global settings tests with a student update request test asserting the existing endpoint carries the schedule and CSRF header:

```ts
expect(fetch).toHaveBeenCalledWith('/api/students/7', expect.objectContaining({
  method: 'PUT',
  body: JSON.stringify({
    studentNumber: '10101',
    name: '홍길동',
    seatNumber: 1,
    attendanceWeekdays: [1, 3, 5],
  }),
}));
```

- [ ] **Step 2: Verify red**

Run: `npm test -- --runInBand src/services/appService.test.ts`

Expected: FAIL because `UpdateStudentInput` and server student serialization do not yet carry per-student weekdays.

- [ ] **Step 3: Implement API persistence**

Select `attendance_weekdays` in every student query, serialize it as `attendanceWeekdays`, default new students to Monday-Friday, validate update bodies through `parseAttendanceWeekdays`, and update the column in the existing student `PUT` route. Delete `/api/settings/attendance-days` and its global helpers.

- [ ] **Step 4: Verify green**

Run: `npm test -- --runInBand src/services/appService.test.ts src/lib/attendance.test.ts`

Expected: PASS with the real student update request body and domain checks.

### Task 3: Row-level weekday editor and daily status

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/teacher/TeacherView.tsx`
- Modify: `src/features/teacher/StudentRosterSection.tsx`
- Modify: `src/features/teacher/DailyAttendanceSection.tsx`
- Create: `src/features/teacher/DailyAttendanceSection.test.tsx`
- Delete: `src/features/teacher/AttendanceDaysSettingsModal.tsx`
- Delete: `src/features/teacher/AttendanceDaysSettingsModal.test.tsx`

**Interfaces:**
- Consumes: `Student.attendanceWeekdays` and `isStudentScheduledOnDate`.
- Reuses: existing `onUpdateStudent(student, input)` flow and save button.
- Produces: a `출석 요일` table column immediately after `결석`.

- [ ] **Step 1: Add failing UI tests**

Add one high-signal administrator flow: load a student with `[1,2,3,4,5]`, click that row's `수정`, uncheck Tuesday/Thursday, save, and assert the request body contains `[1,3,5]` and the rendered summary becomes `월·수·금`. Add a daily-table test asserting weekend/unscheduled dates render `비대상` and no `결석 처리` button for that student.

- [ ] **Step 2: Verify red**

Run: `npm test -- --runInBand src/App.test.tsx src/features/teacher/DailyAttendanceSection.test.tsx`

Expected: FAIL because the per-row schedule editor and `비대상` status do not exist.

- [ ] **Step 3: Implement minimum UI**

Remove the global header button/modal/state. Pass each student's own weekdays to absence counting. Add `출석 요일` after `결석`; render compact text when idle and five accessible checkboxes in edit mode. Prevent saving an empty selection with inline `출석 요일을 하나 이상 선택해 주세요.`. In the daily table, call `isStudentScheduledOnDate(activeDateKey, student.attendanceWeekdays)` before deriving absence status or rendering manual absence action.

- [ ] **Step 4: Verify feature tests**

Run: `npm test -- --runInBand src/App.test.tsx src/features/teacher/DailyAttendanceSection.test.tsx src/lib/attendance.test.ts src/services/appService.test.ts`

Expected: PASS for administrator editing, API payload, weekend exclusion, and unscheduled weekday display.

### Task 4: Product verification and atomic commit

**Files:**
- Verify all files above; do not create shallow tests or debug artifacts.

- [ ] **Step 1: Run full automated checks**

Run: `npm test -- --runInBand`

Run: `npm run build`

Expected: all meaningful Jest scenarios pass and Next production build completes.

- [ ] **Step 2: Run real UI QA**

Use a real browser at 375, 768, and 1280 CSS pixels. Log in as a teacher, edit one student's weekdays, save, reload, and verify persistence. Inspect keyboard labels, row overflow, `월·수·금` summary, weekend `비대상`, and absence count.

- [ ] **Step 3: Inspect and commit only feature files**

Use path/hunk staging so unrelated `.env.development`, `next-env.d.ts`, and pre-existing changes are not accidentally included. Verify staged diff, then commit using the repository's Korean subject style:

```bash
git commit -m "학생별 출석 요일 설정 추가"
```
