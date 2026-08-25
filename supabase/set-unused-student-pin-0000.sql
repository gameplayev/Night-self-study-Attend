-- Run only after the latest supabase/schema.sql.
-- This one-time migration changes only student accounts that still use
-- password_hash = 'unused'. Existing PINs, devices, and attendance stay intact.

begin;

with targets as materialized (
  select id, student_id
  from public.users
  where role = 'student'
    and student_id is not null
    and password_hash = 'unused'
  for update
),
updated as (
  update public.users as users
  set password_hash = 'scrypt$7150cafdc66b5c4f8a3d2894912d1c01$82ce109ed5a18b9de4848bffa3feee7f97bf193a601881d5a21abca0f9307d4daa12aa8f04da3fe6794b44fc61942e4e466c16c943f7836d2c50d6baa2d64125'
  from targets
  where users.id = targets.id
  returning users.id
),
revoked_sessions as (
  delete from public.web_sessions as sessions
  using updated
  where sessions.user_id = updated.id
  returning sessions.user_id
),
cleared_attempts as (
  delete from public.auth_login_attempts as attempts
  using updated
  where attempts.user_id = updated.id
  returning attempts.user_id
)
select
  (select count(*) from updated) as updated_student_accounts,
  (select count(*) from revoked_sessions) as revoked_sessions,
  (select count(*) from cleared_attempts) as cleared_login_attempts;

select count(*) as remaining_unused_student_accounts
from public.users
where role = 'student'
  and student_id is not null
  and password_hash = 'unused';

commit;
