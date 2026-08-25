-- Run after supabase/schema.sql with psql -v ON_ERROR_STOP=1.
-- The transaction rolls back all randomized fixtures, so this is safe to rerun.
begin;

do $$
declare
  v_suffix text := encode(gen_random_bytes(8), 'hex');
  v_student_id bigint;
  v_student_user_id bigint;
  v_other_student_id bigint;
  v_teacher_id bigint;
  v_active_device_id uuid := gen_random_uuid();
  v_second_device_id uuid := gen_random_uuid();
  v_third_device_id uuid := gen_random_uuid();
  v_foreign_device_id uuid := gen_random_uuid();
  v_expired_device_id uuid := gen_random_uuid();
  v_reset_device_id uuid := gen_random_uuid();
  v_result jsonb;
  v_function regprocedure;
  v_index integer;
  v_device_count_before bigint;
  v_attendance_count_before bigint;
begin
  insert into public.students (
    student_number, name, grade, class_number, seat_number, attendance_weekdays
  ) values (
    'security-test-' || v_suffix, '보안 검증 학생', 3, 99, 999999, array[1]
  ) returning id into v_student_id;

  insert into public.users (username, password_hash, display_name, role, student_id)
  values (
    'security-test-user-' || v_suffix, 'student-old-hash', '보안 검증 학생', 'student', v_student_id
  ) returning id into v_student_user_id;

  insert into public.students (
    student_number, name, grade, class_number, seat_number, attendance_weekdays
  ) values (
    'security-other-' || v_suffix, '다른 검증 학생', 3, 99, 999998, array[1]
  ) returning id into v_other_student_id;

  insert into public.users (username, password_hash, display_name, role)
  values (
    'security-teacher-' || v_suffix, 'teacher-old-hash', '보안 검증 교사', 'teacher'
  ) returning id into v_teacher_id;

  -- A sixth failed login in the same window must be throttled, not merely recorded.
  for v_index in 1..5 loop
    v_result := public.consume_login_attempt(repeat('1', 64), v_student_user_id, 5, 900);
    if v_result ->> 'allowed' <> 'true' then
      raise exception 'login attempt % unexpectedly rejected: %', v_index, v_result;
    end if;
  end loop;
  v_result := public.consume_login_attempt(repeat('1', 64), v_student_user_id, 5, 900);
  if v_result ->> 'allowed' <> 'false'
     or coalesce((v_result ->> 'retry_after_seconds')::integer, 0) <= 0 then
    raise exception 'sixth login attempt was not throttled: %', v_result;
  end if;

  -- Expired limiter rows must be pruned so anonymous names cannot grow the table forever.
  insert into public.auth_login_attempts (
    key_hash, user_id, attempt_count, window_started_at
  ) values (
    repeat('9', 64), null, 1, clock_timestamp() - interval '901 seconds'
  );
  perform public.consume_login_attempt(repeat('8', 64), null, 5, 900);
  if exists (select 1 from public.auth_login_attempts where key_hash = repeat('9', 64)) then
    raise exception 'expired login attempt row was not pruned';
  end if;

  -- An expired registration is removed before quota counting; two active devices are the hard ceiling.
  insert into public.browser_devices (
    id, token_hash, label, student_id, created_at, last_seen_at, expires_at
  ) values (
    v_expired_device_id, repeat('e', 64), 'expired fixture', v_student_id,
    clock_timestamp() - interval '91 days', clock_timestamp() - interval '91 days',
    clock_timestamp() - interval '1 second'
  );

  v_result := public.claim_student_device(
    v_active_device_id, repeat('a', 64), 'active fixture', v_student_id, 2
  );
  if v_result ->> 'status' <> 'claimed' then
    raise exception 'first device was not claimed: %', v_result;
  end if;
  v_result := public.claim_student_device(
    v_second_device_id, repeat('b', 64), 'second fixture', v_student_id, 2
  );
  if v_result ->> 'status' <> 'claimed' then
    raise exception 'second device was not claimed: %', v_result;
  end if;

  v_result := public.claim_student_device(
    v_third_device_id, repeat('c', 64), 'third fixture', v_student_id, 2
  );
  if v_result ->> 'status' <> 'device_limit_reached' then
    raise exception 'third device bypassed the quota: %', v_result;
  end if;
  if (select count(*) from public.browser_devices
      where student_id = v_student_id and expires_at > clock_timestamp()) <> 2 then
    raise exception 'active device count is not capped at two';
  end if;

  -- Self attendance must reject a different student's device and an expired device.
  insert into public.browser_devices (
    id, token_hash, label, student_id, created_at, last_seen_at, expires_at
  ) values (
    v_foreign_device_id, repeat('f', 64), 'foreign fixture', v_other_student_id,
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '90 days'
  );

  v_result := public.record_self_attendance(
    v_student_id, v_foreign_device_id, repeat('f', 64)
  );
  if v_result ->> 'status' = 'created' then
    raise exception 'self attendance accepted another student''s device: %', v_result;
  end if;

  v_result := public.record_self_attendance(
    v_student_id, v_expired_device_id, repeat('e', 64)
  );
  if v_result ->> 'status' = 'created' then
    raise exception 'self attendance accepted an expired device: %', v_result;
  end if;

  -- A valid device transitions check-in -> check-out once, then cannot create another record that day.
  v_result := public.record_self_attendance(
    v_student_id, v_active_device_id, repeat('a', 64)
  );
  if v_result ->> 'status' <> 'created' or v_result ->> 'action' <> 'check_in' then
    raise exception 'valid device did not create check-in: %', v_result;
  end if;
  if clock_timestamp() - ((clock_timestamp() at time zone 'Asia/Seoul')::date::timestamp
                           at time zone 'Asia/Seoul') >= interval '31 seconds' then
    update public.attendance_records
    set "timestamp" = clock_timestamp() - interval '31 seconds'
    where id = (v_result ->> 'id')::uuid;

    v_result := public.record_self_attendance(
      v_student_id, v_active_device_id, repeat('a', 64)
    );
    if v_result ->> 'status' <> 'created' or v_result ->> 'action' <> 'check_out' then
      raise exception 'valid device did not create check-out: %', v_result;
    end if;
    v_result := public.record_self_attendance(
      v_student_id, v_active_device_id, repeat('a', 64)
    );
    if v_result ->> 'status' <> 'closed' then
      raise exception 'closed attendance day accepted another self record: %', v_result;
    end if;
  end if;

  -- Self-service PIN changes revoke sessions without altering devices or attendance.
  select count(*) into v_device_count_before
  from public.browser_devices where student_id = v_student_id;
  select count(*) into v_attendance_count_before
  from public.attendance_records where student_id = v_student_id;
  insert into public.web_sessions (token_hash, csrf_token_hash, user_id, expires_at)
  values
    ('pin-session-1-' || v_suffix, 'pin-csrf-1-' || v_suffix,
     v_student_user_id, clock_timestamp() + interval '1 hour'),
    ('pin-session-2-' || v_suffix, 'pin-csrf-2-' || v_suffix,
     v_student_user_id, clock_timestamp() + interval '1 hour');
  perform public.consume_login_attempt(repeat('4', 64), v_student_user_id, 5, 900);
  if not public.change_student_pin(
    v_student_user_id, 'student-old-hash', 'student-self-changed-hash'
  ) then
    raise exception 'student PIN change returned false';
  end if;
  if not exists (select 1 from public.users
                 where id = v_student_user_id
                   and password_hash = 'student-self-changed-hash')
     or exists (select 1 from public.web_sessions where user_id = v_student_user_id)
     or exists (select 1 from public.auth_login_attempts where user_id = v_student_user_id)
     or (select count(*) from public.browser_devices
         where student_id = v_student_id) <> v_device_count_before
     or (select count(*) from public.attendance_records
         where student_id = v_student_id) <> v_attendance_count_before then
    raise exception 'student PIN change altered or retained the wrong account artifacts';
  end if;

  -- A stale concurrent request cannot overwrite a newer PIN or revoke its session.
  insert into public.web_sessions (token_hash, csrf_token_hash, user_id, expires_at)
  values ('pin-stale-session-' || v_suffix, 'pin-stale-csrf-' || v_suffix,
          v_student_user_id, clock_timestamp() + interval '1 hour');
  if public.change_student_pin(
    v_student_user_id, 'student-old-hash', 'student-stale-overwrite'
  ) or not exists (select 1 from public.users
                   where id = v_student_user_id
                     and password_hash = 'student-self-changed-hash')
     or not exists (select 1 from public.web_sessions
                    where token_hash = 'pin-stale-session-' || v_suffix) then
    raise exception 'stale PIN change overwrote credentials or revoked a valid session';
  end if;

  -- Identity/PIN updates revoke sessions without discarding registered devices.
  insert into public.web_sessions (token_hash, csrf_token_hash, user_id, expires_at)
  values ('student-session-' || v_suffix, 'student-csrf-' || v_suffix, v_student_user_id,
          clock_timestamp() + interval '1 hour');
  if not public.update_student_profile(
    v_student_id,
    'security-renamed-' || v_suffix,
    '보안 검증 학생 수정',
    3,
    99,
    999997,
    array[1, 2],
    'student-new-hash'
  ) then
    raise exception 'student profile update returned false';
  end if;
  if not exists (select 1 from public.students
                 where id = v_student_id
                   and student_number = 'security-renamed-' || v_suffix
                   and name = '보안 검증 학생 수정'
                   and seat_number = 999997
                   and attendance_weekdays = array[1, 2])
     or not exists (select 1 from public.users
                    where id = v_student_user_id
                      and username = 'security-renamed-' || v_suffix
                      and display_name = '보안 검증 학생 수정'
                      and password_hash = 'student-new-hash')
     or exists (select 1 from public.web_sessions where user_id = v_student_user_id)
     or (select count(*) from public.browser_devices where student_id = v_student_id) < 2
     or exists (select 1 from public.auth_login_attempts where user_id = v_student_user_id) then
    raise exception 'student credential update left an old credential artifact active';
  end if;

  -- A seat/schedule-only edit is not a credential change and must preserve the session.
  insert into public.web_sessions (token_hash, csrf_token_hash, user_id, expires_at)
  values ('student-profile-session-' || v_suffix, 'student-profile-csrf-' || v_suffix,
          v_student_user_id, clock_timestamp() + interval '1 hour');
  if not public.update_student_profile(
    v_student_id,
    'security-renamed-' || v_suffix,
    '보안 검증 학생 수정',
    3,
    99,
    999996,
    array[1, 2, 3],
    null
  ) or not exists (
    select 1 from public.web_sessions
    where token_hash = 'student-profile-session-' || v_suffix
  ) then
    raise exception 'non-credential student edit revoked the active session';
  end if;

  -- Reset access revokes current devices, sessions, and throttling state without altering the PIN.
  insert into public.browser_devices (
    id, token_hash, label, student_id, created_at, last_seen_at, expires_at
  ) values (
    v_reset_device_id, repeat('r', 64), 'reset fixture', v_student_id,
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '90 days'
  );
  insert into public.web_sessions (token_hash, csrf_token_hash, user_id, expires_at)
  values ('reset-session-' || v_suffix, 'reset-csrf-' || v_suffix, v_student_user_id,
          clock_timestamp() + interval '1 hour');
  perform public.consume_login_attempt(repeat('2', 64), v_student_user_id, 5, 900);
  if not public.reset_student_access(v_student_id) then
    raise exception 'student access reset returned false';
  end if;
  if exists (select 1 from public.browser_devices where student_id = v_student_id)
     or exists (select 1 from public.web_sessions where user_id = v_student_user_id)
     or exists (select 1 from public.auth_login_attempts where user_id = v_student_user_id)
     or not exists (select 1 from public.users
                    where id = v_student_user_id and password_hash = 'student-new-hash') then
    raise exception 'student access reset did not revoke only access artifacts';
  end if;

  -- A teacher display-name change is part of the login tuple and revokes every session.
  insert into public.web_sessions (token_hash, csrf_token_hash, user_id, expires_at)
  values ('teacher-session-' || v_suffix, 'teacher-csrf-' || v_suffix, v_teacher_id,
          clock_timestamp() + interval '1 hour');
  perform public.consume_login_attempt(repeat('3', 64), v_teacher_id, 5, 900);
  if not public.update_teacher_account(v_teacher_id, '보안 검증 교사 수정', null) then
    raise exception 'teacher identity update returned false';
  end if;
  if not exists (select 1 from public.users
                 where id = v_teacher_id
                   and display_name = '보안 검증 교사 수정'
                   and password_hash = 'teacher-old-hash')
     or exists (select 1 from public.web_sessions where user_id = v_teacher_id)
     or exists (select 1 from public.auth_login_attempts where user_id = v_teacher_id) then
    raise exception 'teacher identity update left an old credential artifact active';
  end if;

  insert into public.web_sessions (token_hash, csrf_token_hash, user_id, expires_at)
  values ('teacher-secret-session-' || v_suffix, 'teacher-secret-csrf-' || v_suffix,
          v_teacher_id, clock_timestamp() + interval '1 hour');
  if not public.update_teacher_account(
    v_teacher_id, '보안 검증 교사 수정', 'teacher-new-hash'
  ) then
    raise exception 'teacher secret update returned false';
  end if;
  if not exists (
    select 1 from public.users
    where id = v_teacher_id and password_hash = 'teacher-new-hash'
  ) or exists (
    select 1 from public.web_sessions where user_id = v_teacher_id
  ) then
    raise exception 'teacher secret update failed: account=%, sessions=%',
      (select row_to_json(users) from public.users where id = v_teacher_id),
      (select count(*) from public.web_sessions where user_id = v_teacher_id);
  end if;

  -- Browser-facing database roles must not invoke security-definer operations.
  foreach v_function in array array[
    'public.consume_login_attempt(text,bigint,integer,integer)'::regprocedure,
    'public.clear_login_attempt(text)'::regprocedure,
    'public.claim_student_device(uuid,text,text,bigint,integer)'::regprocedure,
    'public.change_student_pin(bigint,text,text)'::regprocedure,
    'public.update_student_profile(bigint,text,text,integer,integer,integer,integer[],text)'::regprocedure,
    'public.reset_student_access(bigint)'::regprocedure,
    'public.update_teacher_account(bigint,text,text)'::regprocedure,
    'public.record_self_attendance(bigint,uuid,text)'::regprocedure
  ] loop
    if not has_function_privilege('service_role', v_function, 'EXECUTE')
       or has_function_privilege('anon', v_function, 'EXECUTE')
       or has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'unsafe function execute privilege for %', v_function::text;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.auth_login_attempts', 'SELECT')
     or has_table_privilege('authenticated', 'public.auth_login_attempts', 'SELECT') then
    raise exception 'browser role can read login attempt state';
  end if;
end;
$$;

rollback;
