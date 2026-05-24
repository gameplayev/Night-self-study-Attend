PRAGMA foreign_keys = ON;

DELETE FROM web_sessions;
DELETE FROM attendance_records;
DELETE FROM browser_devices;
DELETE FROM users;
DELETE FROM students;
DELETE FROM sqlite_sequence WHERE name IN ('users', 'students');

INSERT INTO students
  (id, student_number, name, grade, class_number, seat_number)
VALUES
  (1, '20101', '김민준', 2, 1, 1),
  (2, '20102', '이서연', 2, 1, 2),
  (3, '20103', '박지호', 2, 1, 3),
  (4, '20211', '최유진', 2, 2, 11),
  (5, '20212', '정하린', 2, 2, 12),
  (6, '30105', '오도윤', 3, 1, 5);

-- 선생님 로그인: 이름 "담당 교사", 고유 번호 "teacher01"
-- 첫 로그인 성공 시 서버가 더 강한 scrypt 해시로 자동 업그레이드합니다.
INSERT INTO users
  (id, username, password_hash, display_name, role, student_id)
VALUES
  (
    1,
    'teacher:1',
    '2b8d87aceb45bb77a987fa49ad22f51f2c99aeae73295e16429a07f8645ddc33',
    '담당 교사',
    'teacher',
    NULL
  ),
  (2, '20101', 'unused', '김민준', 'student', 1),
  (3, '20102', 'unused', '이서연', 'student', 2),
  (4, '20103', 'unused', '박지호', 'student', 3),
  (5, '20211', 'unused', '최유진', 'student', 4),
  (6, '20212', 'unused', '정하린', 'student', 5),
  (7, '30105', 'unused', '오도윤', 'student', 6);

INSERT INTO browser_devices
  (id, token_hash, label, student_id, created_at, last_seen_at)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'example-device-token-hash-20101',
    'iPadOS · Safari · 1024x1366 · touch',
    1,
    '2026-05-24T09:00:00.000Z',
    '2026-05-24T09:00:00.000Z'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'example-device-token-hash-20102',
    'Chrome · Mac · 1440x900',
    2,
    '2026-05-24T09:05:00.000Z',
    '2026-05-24T09:05:00.000Z'
  );

INSERT INTO attendance_records
  (id, student_id, action, timestamp, device_id, device_label)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    1,
    'check_in',
    '2026-05-24T09:10:00.000Z',
    '11111111-1111-4111-8111-111111111111',
    'iPadOS · Safari · 1024x1366 · touch'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    1,
    'check_out',
    '2026-05-24T12:00:00.000Z',
    '11111111-1111-4111-8111-111111111111',
    'iPadOS · Safari · 1024x1366 · touch'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    2,
    'check_in',
    '2026-05-24T09:15:00.000Z',
    '22222222-2222-4222-8222-222222222222',
    'Chrome · Mac · 1440x900'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    3,
    'absent',
    '2026-05-24T13:00:00.000Z',
    'teacher-manual',
    '교사 수동 처리 · 담당 교사'
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    4,
    'present',
    '2026-05-24T13:05:00.000Z',
    'teacher-manual',
    '교사 수동 처리 · 담당 교사'
  );
