import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  DUMMY_SECRET_HASH,
  findSecretMatch,
  hashSecret,
  isLegacySha256Hash,
  randomToken,
  sha256Hex,
  verifySecret,
} from './security';
import { getSupabase } from './supabase';
import { STUDENT_NUMBER_PATTERN, parseStudentNumber } from '../lib/students';
import {
  DEFAULT_ATTENDANCE_WEEKDAYS,
  isStudentScheduledOnDate,
  parseAttendanceWeekdays,
} from '../lib/attendance';
import type { AttendanceWeekday } from '../lib/attendance';

type UserRole = 'student' | 'teacher';
type AttendanceAction = 'check_in' | 'check_out' | 'absent' | 'present';

interface ApiError extends Error {
  statusCode?: number;
}

interface CookieSpec {
  name: string;
  value: string;
  options: {
    maxAge?: number;
    secure?: boolean;
    httpOnly: boolean;
    sameSite: 'strict';
    path: string;
  };
}

interface ApiState {
  cookies: CookieSpec[];
}

interface AuthUserRow {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  student_number: string | null;
}

interface DbUserRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: UserRole;
  student_id: number | null;
}

interface StudentRow {
  id: number;
  student_number: string;
  name: string;
  grade: number;
  class_number: number;
  seat_number: number;
  attendance_weekdays: unknown;
}

interface StudentAccountRow extends AuthUserRow {
  student_id: number;
  name: string;
  password_hash: string;
}

interface BrowserDeviceRow {
  id: string;
  token_hash: string;
  label: string;
  student_id: number | null;
  expires_at: string;
}

interface WebSessionRow {
  token_hash: string;
  csrf_token_hash: string;
  user_id: number;
  expires_at: string;
}

interface AttendanceRecordRow {
  id: string;
  student_id: number;
  action: AttendanceAction;
  timestamp: string;
  recorded_sequence: number;
  device_id: string;
  device_label: string;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECONDS = 60 * 60;
const DEVICE_SECONDS = 60 * 60 * 24 * 90;
const MAX_DEVICES_PER_STUDENT = 2;
const MAX_JSON_BYTES = 16 * 1024;
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const SCHOOL = {
  latitude: 37.2537794,
  longitude: 126.9824637,
  radiusMeters: 250,
  maxAccuracyMeters: 100,
};
const SESSION_COOKIE = IS_PRODUCTION
  ? '__Host-attend_session'
  : 'attend_session';
const DEVICE_COOKIE = IS_PRODUCTION
  ? '__Host-attend_device'
  : 'attend_device';
let bootstrapPromise: Promise<void> | null = null;

function nowIso() {
  return new Date().toISOString();
}

function plusSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function koreaDateKey(timestamp: string | number | Date = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

function apiHeaders() {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'Content-Security-Policy':
      "default-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  };
  if (IS_PRODUCTION) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  return headers;
}

function applyCookies(response: NextResponse, state: ApiState) {
  for (const cookie of state.cookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
}

function sendJson(state: ApiState, status: number, payload: unknown) {
  const response = NextResponse.json(payload, {
    status,
    headers: apiHeaders(),
  });
  applyCookies(response, state);
  return response;
}

function sendEmpty(state: ApiState, status = 204) {
  const response = new NextResponse(null, {
    status,
    headers: apiHeaders(),
  });
  applyCookies(response, state);
  return response;
}

function appendCookie(
  state: ApiState,
  name: string,
  value: string,
  { maxAge, secure, httpOnly = true }: {
    maxAge?: number;
    secure?: boolean;
    httpOnly?: boolean;
  },
) {
  state.cookies.push({
    name,
    value,
    options: {
      maxAge,
      secure,
      httpOnly,
      sameSite: 'strict',
      path: '/',
    },
  });
}

function fail(message: string, statusCode = 400): never {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  throw error;
}

function isPostgrestSchemaCacheError(error: unknown) {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'PGRST205'
  );
}

function isRowLevelSecurityError(error: unknown) {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code?: unknown }).code === '42501'
  );
}

function failFromDatabase(error: unknown, message = '데이터베이스 요청에 실패했습니다.'): never {
  console.error(message, error);
  if (isPostgrestSchemaCacheError(error)) {
    fail(
      'Supabase 테이블을 찾지 못했습니다. Supabase SQL editor에서 supabase/schema.sql을 실행한 뒤 다시 시도해 주세요.',
      500,
    );
  }
  if (isRowLevelSecurityError(error)) {
    fail(
      'Supabase RLS에 막혔습니다. .env.local의 SUPABASE_SERVICE_ROLE_KEY에 anon/public key가 아니라 service_role secret key를 넣어 주세요.',
      500,
    );
  }
  fail(message, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    fail('요청 본문이 너무 큽니다.', 413);
  }
  if (!req.body) return {};
  if (
    req.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !==
    'application/json'
  ) {
    fail('JSON 형식의 요청만 사용할 수 있습니다.', 415);
  }

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let body = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    receivedBytes += chunk.value.byteLength;
    if (receivedBytes > MAX_JSON_BYTES) {
      await reader.cancel();
      fail('요청 본문이 너무 큽니다.', 413);
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  body += decoder.decode();
  if (!body.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) {
      fail('요청 본문이 올바르지 않습니다.', 400);
    }
    throw error;
  }
  if (!isRecord(value)) fail('요청 본문이 올바르지 않습니다.', 400);
  return value;
}

function assertString(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(message, 400);
  }
  return value.trim();
}

function assertPersonName(value: unknown) {
  const name = assertString(value, '이름을 입력해 주세요.');
  if (name.length > 80) fail('이름은 80자 이하로 입력해 주세요.', 400);
  return name;
}

function assertInteger(value: unknown, message: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    fail(message, 400);
  }
  return parsed;
}

function assertPositiveInteger(value: unknown, message: string) {
  const parsed = assertInteger(value, message);
  if (parsed <= 0) {
    fail(message, 400);
  }
  return parsed;
}

function assertStudentNumber(value: unknown) {
  const studentNumber = assertString(value, '학번을 입력해 주세요.');
  if (!STUDENT_NUMBER_PATTERN.test(studentNumber)) {
    fail('학번은 5자리 숫자로 입력해 주세요.', 400);
  }
  return studentNumber;
}

function assertStudentPin(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9]{4}$/.test(value)) {
    fail('PIN은 숫자 4자리로 입력해 주세요.', 400);
  }
  return value;
}

function assertNewTeacherIdentifier(value: unknown) {
  const identifier = assertString(value, '고유 번호를 입력해 주세요.');
  if (identifier.length < 8 || identifier.length > 128) {
    fail('고유 번호는 8~128자로 입력해 주세요.', 400);
  }
  return identifier;
}

function assertTeacherIdentifier(value: unknown) {
  const identifier = assertString(value, '고유 번호를 입력해 주세요.');
  if (identifier.length > 128) {
    fail('고유 번호는 128자 이하로 입력해 주세요.', 400);
  }
  return identifier;
}

function parseStudentClassOrFail(studentNumber: string) {
  const parsed = parseStudentNumber(studentNumber);
  if (!parsed || parsed.grade <= 0 || parsed.classNumber <= 0) {
    fail('학번에서 학년과 반을 확인하지 못했습니다.', 400);
  }
  return parsed;
}

function assertAttendanceDateKey(value: unknown) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail('출결 날짜가 올바르지 않습니다.', 400);
  }
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    fail('출결 날짜가 올바르지 않습니다.', 400);
  }
  if (value > koreaDateKey()) {
    fail('미래 날짜는 처리할 수 없습니다.', 400);
  }
  return value;
}

function assertAttendanceWeekdays(value: unknown): AttendanceWeekday[] {
  const weekdays = parseAttendanceWeekdays(value);
  if (!weekdays) {
    fail('출석 요일은 월~금 중에서 하나 이상 선택해 주세요.', 400);
  }
  return weekdays;
}

function attendanceDateRange(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const start = new Date(
    Date.UTC(year, month - 1, day - 1, 15, 0, 0, 0),
  ).toISOString();
  const end = new Date(
    Date.UTC(year, month - 1, day, 14, 59, 59, 999),
  ).toISOString();
  return { start, end };
}

function timestampForManualAttendanceDate(dateKey: string | null) {
  if (!dateKey || dateKey === koreaDateKey()) return nowIso();
  return attendanceDateRange(dateKey).end;
}

function publicUser(row: AuthUserRow) {
  return {
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    studentNumber: row.student_number ?? null,
  };
}

async function ensureBootstrapData() {
  if (!bootstrapPromise) {
    bootstrapPromise = seedInitialData().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

async function seedInitialData() {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true });
  if (error) failFromDatabase(error);
  if (count && count > 0) return;

  if (IS_PRODUCTION) {
    const identifier = process.env.BOOTSTRAP_TEACHER_IDENTIFIER;
    const name = process.env.BOOTSTRAP_TEACHER_NAME;
    if (!identifier || !name) return;
    const { error: teacherError } = await supabase.from('users').insert({
      username: 'teacher:bootstrap',
      password_hash: await hashSecret(identifier),
      display_name: name,
      role: 'teacher',
    });
    if (teacherError) failFromDatabase(teacherError);
    return;
  }

  const { error: teacherError } = await supabase.from('users').insert({
    username: 'teacher:1',
    password_hash: await hashSecret('teacher01'),
    display_name: '담당 교사',
    role: 'teacher',
  });
  if (teacherError) failFromDatabase(teacherError);

  const students = [
    ['20101', '김민준', 2, 1, 1],
    ['20102', '이서연', 2, 1, 2],
    ['20103', '박지호', 2, 1, 3],
    ['20211', '최유진', 2, 2, 11],
    ['20212', '정하린', 2, 2, 12],
    ['30105', '오도윤', 3, 1, 5],
  ] as const;

  for (const [studentNumber, name, grade, classNumber, seatNumber] of students) {
    const { data: student, error: studentError } = await supabase
      .from('students')
      .insert({
        student_number: studentNumber,
        name,
        grade,
        class_number: classNumber,
        seat_number: seatNumber,
      })
      .select('id, student_number, name, grade, class_number, seat_number, attendance_weekdays')
      .single<StudentRow>();
    if (studentError) failFromDatabase(studentError);

    const { error: userError } = await supabase.from('users').insert({
      username: studentNumber,
      password_hash: 'unused',
      display_name: name,
      role: 'student',
      student_id: student.id,
    });
    if (userError) failFromDatabase(userError);
  }
}

async function loadUserRow(userId: number): Promise<AuthUserRow | null> {
  const supabase = getSupabase();
  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, password_hash, display_name, role, student_id')
    .eq('id', userId)
    .maybeSingle<DbUserRow>();
  if (error) failFromDatabase(error);
  if (!user) return null;

  if (user.role !== 'student' || user.student_id == null) {
    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      student_number: null,
    };
  }

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('student_number')
    .eq('id', user.student_id)
    .maybeSingle<{ student_number: string }>();
  if (studentError) failFromDatabase(studentError);
  if (!student) return null;

  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    student_number: student.student_number,
  };
}

async function createSession(state: ApiState, user: AuthUserRow) {
  const supabase = getSupabase();
  const rawToken = randomToken();
  const rawCsrfToken = randomToken();
  const expiresAt = plusSeconds(SESSION_SECONDS);
  const { error } = await supabase.from('web_sessions').insert({
    token_hash: sha256Hex(rawToken),
    csrf_token_hash: sha256Hex(rawCsrfToken),
    user_id: user.id,
    expires_at: expiresAt,
  });
  if (error) failFromDatabase(error);

  appendCookie(state, SESSION_COOKIE, rawToken, {
    maxAge: SESSION_SECONDS,
    secure: IS_PRODUCTION,
  });

  return {
    user: publicUser(user),
    expiresAt,
    csrfToken: rawCsrfToken,
  };
}

async function currentSession(req: NextRequest): Promise<{
  tokenHash: string;
  csrfTokenHash: string;
  expiresAt: string;
  user: ReturnType<typeof publicUser>;
} | null> {
  const rawToken = req.cookies.get(SESSION_COOKIE)?.value;
  if (!rawToken) return null;

  const supabase = getSupabase();
  const { data: session, error } = await supabase
    .from('web_sessions')
    .select('token_hash, csrf_token_hash, user_id, expires_at')
    .eq('token_hash', sha256Hex(rawToken))
    .maybeSingle<WebSessionRow>();
  if (error) failFromDatabase(error);
  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    const { error: deleteError } = await supabase
      .from('web_sessions')
      .delete()
      .eq('token_hash', session.token_hash);
    if (deleteError) failFromDatabase(deleteError);
    return null;
  }

  const user = await loadUserRow(session.user_id);
  if (!user) {
    const { error: deleteError } = await supabase
      .from('web_sessions')
      .delete()
      .eq('token_hash', session.token_hash);
    if (deleteError) failFromDatabase(deleteError);
    return null;
  }

  return {
    tokenHash: session.token_hash,
    csrfTokenHash: session.csrf_token_hash,
    expiresAt: session.expires_at,
    user: publicUser(user),
  };
}

async function refreshCsrfToken(session: { tokenHash: string }) {
  const supabase = getSupabase();
  const rawCsrfToken = randomToken();
  const { error } = await supabase
    .from('web_sessions')
    .update({ csrf_token_hash: sha256Hex(rawCsrfToken) })
    .eq('token_hash', session.tokenHash);
  if (error) failFromDatabase(error);
  return rawCsrfToken;
}

async function requireSession(req: NextRequest) {
  const session = await currentSession(req);
  if (!session) {
    fail('로그인이 필요합니다.', 401);
  }
  return session;
}

async function requireRole(req: NextRequest, role: UserRole) {
  const session = await requireSession(req);
  if (session.user.role !== role) {
    fail(
      role === 'teacher'
        ? '교사 계정만 사용할 수 있습니다.'
        : '학생 계정만 사용할 수 있습니다.',
      403,
    );
  }
  return session;
}

function requireCsrf(req: NextRequest, session: { csrfTokenHash: string }) {
  const rawToken = req.headers.get('x-csrf-token');
  if (
    typeof rawToken !== 'string' ||
    sha256Hex(rawToken) !== session.csrfTokenHash
  ) {
    fail('요청 검증에 실패했습니다.', 403);
  }
}

function browserDeviceLabel(req: NextRequest, fallbackLabel: unknown) {
  return (
    typeof fallbackLabel === 'string' && fallbackLabel.trim()
      ? fallbackLabel.trim()
      : `브라우저 기기 · ${req.headers.get('user-agent') || 'Unknown'}`
  ).slice(0, 240);
}

function deviceIdFromTokenHash(tokenHash: string) {
  return `${tokenHash.slice(0, 8)}-${tokenHash.slice(8, 12)}-${tokenHash.slice(12, 16)}-${tokenHash.slice(16, 20)}-${tokenHash.slice(20, 32)}`;
}

async function browserDevice(
  req: NextRequest,
  state: ApiState,
  label: unknown,
) {
  const supabase = getSupabase();
  const existingRawToken = req.cookies.get(DEVICE_COOKIE)?.value;
  const rawToken = existingRawToken || randomToken();
  const tokenHash = sha256Hex(rawToken);
  const nextLabel = browserDeviceLabel(req, label);

  const { data: existing, error } = await supabase
    .from('browser_devices')
    .select('id, token_hash, label, student_id, expires_at')
    .eq('token_hash', tokenHash)
    .gt('expires_at', nowIso())
    .maybeSingle<BrowserDeviceRow>();
  if (error) failFromDatabase(error);
  if (existing) {
    const { error: updateError } = await supabase
      .from('browser_devices')
      .update({ label: nextLabel, last_seen_at: nowIso() })
      .eq('id', existing.id);
    if (updateError) failFromDatabase(updateError);
  }

  if (!existingRawToken) {
    appendCookie(state, DEVICE_COOKIE, rawToken, {
      maxAge: DEVICE_SECONDS,
      secure: IS_PRODUCTION,
    });
  }

  return {
    id: existing?.id ?? deviceIdFromTokenHash(tokenHash),
    label: nextLabel,
    studentId:
      existing?.student_id == null ? null : Number(existing.student_id),
    tokenHash,
  };
}

async function studentAccount(studentNumber: string) {
  const supabase = getSupabase();
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, student_number, name, grade, class_number, seat_number, attendance_weekdays')
    .eq('student_number', studentNumber)
    .maybeSingle<StudentRow>();
  if (studentError) failFromDatabase(studentError);
  if (!student) return null;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, username, password_hash, display_name, role, student_id')
    .eq('student_id', student.id)
    .eq('role', 'student')
    .maybeSingle<DbUserRow>();
  if (userError) failFromDatabase(userError);
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    student_number: student.student_number,
    student_id: student.id,
    name: student.name,
    password_hash: user.password_hash,
  } satisfies StudentAccountRow;
}

function loginAttemptKey(
  bucket: 'student' | 'teacher' | 'pin-change',
  subject: string,
) {
  return sha256Hex(`${bucket}\0${subject.normalize('NFKC').toLowerCase()}`);
}

async function consumeLoginAttempt(keyHash: string, userId: number | null) {
  const { data, error } = await getSupabase().rpc('consume_login_attempt', {
    p_key_hash: keyHash,
    p_user_id: userId,
    p_limit: LOGIN_ATTEMPT_LIMIT,
    p_window_seconds: LOGIN_WINDOW_SECONDS,
  });
  if (error) failFromDatabase(error, '로그인 제한을 확인하지 못했습니다.');
  const result = data as {
    allowed?: unknown;
    retry_after_seconds?: unknown;
  } | null;
  if (!result || typeof result.allowed !== 'boolean') {
    fail('로그인 제한 응답이 올바르지 않습니다.', 500);
  }
  if (!result.allowed) {
    const retryAfter = Number(result.retry_after_seconds);
    fail(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? `잠시 후 다시 시도해 주세요. (${Math.ceil(retryAfter)}초 후 가능)`
        : '잠시 후 다시 시도해 주세요.',
      429,
    );
  }
}

async function clearLoginAttempt(keyHash: string) {
  const { data, error } = await getSupabase().rpc('clear_login_attempt', {
    p_key_hash: keyHash,
  });
  if (error) failFromDatabase(error, '로그인 제한을 초기화하지 못했습니다.');
  if (data !== true) fail('로그인 제한 응답이 올바르지 않습니다.', 500);
}

async function authenticateStudent(body: Record<string, unknown>) {
  const studentNumber = assertStudentNumber(body.studentNumber);
  const name = assertPersonName(body.name);
  const pin = assertStudentPin(body.pin);
  const attemptKey = loginAttemptKey('student', studentNumber);
  const student = await studentAccount(studentNumber);
  await consumeLoginAttempt(attemptKey, student?.id ?? null);
  const pinMatches = await verifySecret(
    pin,
    student?.password_hash ?? DUMMY_SECRET_HASH,
  );
  if (!student || student.name !== name || !pinMatches) {
    fail('학번, 이름 또는 PIN이 올바르지 않습니다.', 401);
  }
  await clearLoginAttempt(attemptKey);
  return student;
}

async function claimStudentDevice(
  studentId: number,
  device: Awaited<ReturnType<typeof browserDevice>>,
) {
  const { data, error } = await getSupabase().rpc('claim_student_device', {
    p_device_id: device.id,
    p_token_hash: device.tokenHash,
    p_label: device.label,
    p_student_id: studentId,
    p_max_devices: MAX_DEVICES_PER_STUDENT,
  });
  if (error) failFromDatabase(error, '기기 등록을 완료하지 못했습니다.');
  const result = data as {
    status?: unknown;
    device_id?: unknown;
    registered_count?: unknown;
  } | null;
  if (!result || typeof result.status !== 'string') {
    fail('기기 등록 응답이 올바르지 않습니다.', 500);
  }
  if (result.status === 'device_owned_by_other') {
    fail('이 기기는 이미 다른 학생에게 등록되어 있습니다.', 409);
  }
  if (result.status === 'device_limit_reached') {
    fail('등록 가능한 기기 수를 모두 사용했습니다.', 409);
  }
  if (result.status !== 'claimed') {
    fail('기기 등록을 완료하지 못했습니다.', 500);
  }
  return result;
}

async function studentDeviceCount(studentId: number) {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('browser_devices')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .gt('expires_at', nowIso());
  if (error) failFromDatabase(error);
  return count ?? 0;
}

function toStudent(row: StudentRow & { device_count: number }) {
  const attendanceWeekdays = parseAttendanceWeekdays(row.attendance_weekdays);
  if (!attendanceWeekdays) {
    fail('저장된 학생 출석 요일이 올바르지 않습니다.', 500);
  }
  return {
    id: Number(row.id),
    studentNumber: row.student_number,
    name: row.name,
    grade: Number(row.grade),
    classNumber: Number(row.class_number),
    seatNumber: Number(row.seat_number),
    deviceCount: Number(row.device_count),
    attendanceWeekdays,
  };
}

async function getStudentWithDeviceCount(studentId: number) {
  const supabase = getSupabase();
  const { data: student, error } = await supabase
    .from('students')
    .select('id, student_number, name, grade, class_number, seat_number, attendance_weekdays')
    .eq('id', studentId)
    .maybeSingle<StudentRow>();
  if (error) failFromDatabase(error);
  if (!student) return null;
  return toStudent({
    ...student,
    device_count: await studentDeviceCount(student.id),
  });
}

async function listStudents() {
  const supabase = getSupabase();
  const { data: students, error } = await supabase
    .from('students')
    .select('id, student_number, name, grade, class_number, seat_number, attendance_weekdays')
    .order('seat_number', { ascending: true })
    .order('grade', { ascending: true })
    .order('class_number', { ascending: true })
    .order('student_number', { ascending: true })
    .returns<StudentRow[]>();
  if (error) failFromDatabase(error);

  const { data: devices, error: deviceError } = await supabase
    .from('browser_devices')
    .select('student_id')
    .not('student_id', 'is', null)
    .gt('expires_at', nowIso())
    .returns<Array<{ student_id: number }>>();
  if (deviceError) failFromDatabase(deviceError);

  const counts = new Map<number, number>();
  for (const device of devices ?? []) {
    counts.set(device.student_id, (counts.get(device.student_id) ?? 0) + 1);
  }

  return (students ?? []).map((student) =>
    toStudent({
      ...student,
      device_count: counts.get(student.id) ?? 0,
    }),
  );
}

async function attendanceRecords(session: Awaited<ReturnType<typeof requireSession>>) {
  const supabase = getSupabase();
  let studentId: number | null = null;

  if (session.user.role === 'student') {
    if (!session.user.studentNumber) return [];
    const { data: student, error } = await supabase
      .from('students')
      .select('id')
      .eq('student_number', session.user.studentNumber)
      .maybeSingle<{ id: number }>();
    if (error) failFromDatabase(error);
    if (!student) return [];
    studentId = student.id;
  }

  let query = supabase
    .from('attendance_records')
    .select('id, student_id, action, timestamp, recorded_sequence, device_id, device_label')
    .order('timestamp', { ascending: false })
    .order('recorded_sequence', { ascending: false });
  if (studentId != null) {
    query = query.eq('student_id', studentId);
  }

  const { data: records, error } = await query.returns<AttendanceRecordRow[]>();
  if (error) failFromDatabase(error);
  if (!records?.length) return [];

  const studentIds = [...new Set(records.map((record) => record.student_id))];
  const { data: students, error: studentError } = await supabase
    .from('students')
    .select('id, student_number, name, grade, class_number, seat_number, attendance_weekdays')
    .in('id', studentIds)
    .returns<StudentRow[]>();
  if (studentError) failFromDatabase(studentError);

  const studentMap = new Map((students ?? []).map((student) => [student.id, student]));
  return records.flatMap((row) => {
    const student = studentMap.get(row.student_id);
    if (!student) return [];
    return [
      {
        id: row.id,
        studentNumber: student.student_number,
        studentName: student.name,
        action: row.action,
        timestamp: row.timestamp,
        recordedSequence: Number(row.recorded_sequence),
        deviceId: row.device_id,
        deviceLabel: row.device_label,
      },
    ];
  });
}

function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

function validateLocation(location: unknown) {
  if (
    typeof location !== 'object' ||
    location == null ||
    !Number.isFinite((location as { latitude?: unknown }).latitude) ||
    !Number.isFinite((location as { longitude?: unknown }).longitude) ||
    !Number.isFinite((location as { accuracy?: unknown }).accuracy)
  ) {
    fail('위치 정보가 올바르지 않습니다.', 400);
  }

  const sample = location as {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  if (sample.accuracy > SCHOOL.maxAccuracyMeters) {
    fail('위치 정확도가 낮습니다. 잠시 후 다시 시도해 주세요.', 400);
  }
  if (distanceMeters(sample, SCHOOL) > SCHOOL.radiusMeters) {
    fail('학교 위치에서만 출석할 수 있습니다.', 403);
  }
}

async function createAttendanceRecord(
  student: Pick<StudentRow, 'id' | 'student_number' | 'name'>,
  action: AttendanceAction,
  deviceId: string,
  deviceLabel: string,
  timestamp = nowIso(),
) {
  const record = {
    id: randomUUID(),
    studentNumber: student.student_number,
    studentName: student.name,
    action,
    timestamp,
    deviceId,
    deviceLabel,
  };
  const supabase = getSupabase();
  const { data: inserted, error } = await supabase
    .from('attendance_records')
    .insert({
      id: record.id,
      student_id: student.id,
      action: record.action,
      timestamp: record.timestamp,
      device_id: record.deviceId,
      device_label: record.deviceLabel,
    })
    .select('recorded_sequence')
    .single<{ recorded_sequence: number }>();
  if (error) failFromDatabase(error);
  return { ...record, recordedSequence: Number(inserted.recorded_sequence) };
}

async function createSelfAttendanceRecord(
  student: Pick<StudentRow, 'id' | 'student_number' | 'name'>,
  device: Awaited<ReturnType<typeof browserDevice>>,
) {
  const { data, error } = await getSupabase().rpc('record_self_attendance', {
    p_student_id: student.id,
    p_device_id: device.id,
    p_device_token_hash: device.tokenHash,
  });
  if (error) failFromDatabase(error, '출석 처리를 완료하지 못했습니다.');
  const result = data as {
    status?: unknown;
    id?: unknown;
    action?: unknown;
    timestamp?: unknown;
    recorded_sequence?: unknown;
    device_id?: unknown;
    device_label?: unknown;
  } | null;
  if (!result || typeof result.status !== 'string') {
    fail('출석 처리 응답이 올바르지 않습니다.', 500);
  }
  if (result.status === 'closed') {
    fail('오늘 출석과 퇴실 처리를 모두 마쳤습니다.', 409);
  }
  if (result.status === 'too_soon') {
    fail('중복 요청이 감지되었습니다. 잠시 후 다시 시도해 주세요.', 409);
  }
  if (result.status === 'device_invalid') {
    fail('등록된 기기에서만 출석할 수 있습니다.', 403);
  }
  if (
    result.status !== 'created' ||
    typeof result.id !== 'string' ||
    (result.action !== 'check_in' && result.action !== 'check_out') ||
    typeof result.timestamp !== 'string' ||
    typeof result.device_id !== 'string' ||
    typeof result.device_label !== 'string'
  ) {
    fail('출석 처리 응답이 올바르지 않습니다.', 500);
  }
  return {
    id: result.id,
    studentNumber: student.student_number,
    studentName: student.name,
    action: result.action,
    timestamp: result.timestamp,
    recordedSequence: Number(result.recorded_sequence),
    deviceId: result.device_id,
    deviceLabel: result.device_label,
  };
}

async function handleApi(req: NextRequest, state: ApiState) {
  const { pathname } = req.nextUrl;
  const supabase = getSupabase();

  if (req.method === 'POST' && pathname === '/api/device') {
    const body = await readJson(req);
    const device = await browserDevice(req, state, body.label);
    return sendJson(state, 200, { id: device.id, label: device.label });
  }

  if (req.method === 'GET' && pathname === '/api/session') {
    const session = await currentSession(req);
    if (!session) {
      return sendEmpty(state, 204);
    }
    return sendJson(state, 200, {
      user: session.user,
      expiresAt: session.expiresAt,
      csrfToken: await refreshCsrfToken(session),
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/teacher-login') {
    const body = await readJson(req);
    const identifier = assertTeacherIdentifier(body.identifier);
    const displayName = assertPersonName(body.displayName);
    const attemptKey = loginAttemptKey('teacher', displayName);
    const { data: teachers, error } = await supabase
      .from('users')
      .select('id, username, password_hash, display_name, role, student_id')
      .eq('role', 'teacher')
      .eq('display_name', displayName)
      .returns<DbUserRow[]>();
    if (error) failFromDatabase(error);
    await consumeLoginAttempt(attemptKey, teachers?.[0]?.id ?? null);

    let teacher: DbUserRow | null = null;
    if (teachers?.length) {
      teacher = await findSecretMatch(identifier, teachers);
    } else {
      await verifySecret(identifier, DUMMY_SECRET_HASH);
    }
    if (!teacher) {
      fail('번호 또는 이름이 올바르지 않습니다.', 401);
    }
    await clearLoginAttempt(attemptKey);
    if (isLegacySha256Hash(teacher.password_hash)) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: await hashSecret(identifier) })
        .eq('id', teacher.id);
      if (updateError) failFromDatabase(updateError);
    }
    return sendJson(
      state,
      200,
      await createSession(state, {
        id: teacher.id,
        username: teacher.username,
        display_name: teacher.display_name,
        role: teacher.role,
        student_number: null,
      }),
    );
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const session = await requireSession(req);
    requireCsrf(req, session);
    const { error } = await supabase
      .from('web_sessions')
      .delete()
      .eq('token_hash', session.tokenHash);
    if (error) failFromDatabase(error);
    appendCookie(state, SESSION_COOKIE, '', {
      maxAge: 0,
      secure: IS_PRODUCTION,
    });
    return sendEmpty(state);
  }

  if (req.method === 'POST' && pathname === '/api/students/me/pin') {
    const session = await requireRole(req, 'student');
    requireCsrf(req, session);
    const body = await readJson(req);
    const currentPin = assertStudentPin(body.currentPin);
    const newPin = assertStudentPin(body.newPin);
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', session.user.id)
      .eq('role', 'student')
      .maybeSingle<{ password_hash: string }>();
    if (userError) failFromDatabase(userError);
    if (!user) fail('학생 계정을 찾지 못했습니다.', 404);

    const attemptKey = loginAttemptKey('pin-change', String(session.user.id));
    await consumeLoginAttempt(attemptKey, session.user.id);
    if (!(await verifySecret(currentPin, user.password_hash))) {
      fail('현재 PIN이 올바르지 않습니다.', 401);
    }

    const { data: changed, error: changeError } = await supabase.rpc(
      'change_student_pin',
      {
        p_user_id: session.user.id,
        p_expected_password_hash: user.password_hash,
        p_new_password_hash: await hashSecret(newPin),
      },
    );
    if (changeError) failFromDatabase(changeError, 'PIN을 변경하지 못했습니다.');
    if (changed !== true) fail('PIN이 이미 변경되었습니다. 다시 로그인해 주세요.', 409);

    appendCookie(state, SESSION_COOKIE, '', {
      maxAge: 0,
      secure: IS_PRODUCTION,
    });
    return sendEmpty(state);
  }

  if (req.method === 'POST' && pathname === '/api/students/access') {
    const body = await readJson(req);
    const student = await authenticateStudent(body);
    const device = await browserDevice(req, state, body.deviceLabel);
    const count = await studentDeviceCount(student.student_id);
    if (device.studentId === student.student_id) {
      return sendJson(state, 200, {
        status: 'authenticated',
        studentNumber: student.student_number,
        studentName: student.name,
        registeredCount: count,
        maxDevices: MAX_DEVICES_PER_STUDENT,
        deviceLabel: device.label,
        session: await createSession(state, student),
      });
    }
    if (device.studentId != null) {
      return sendJson(state, 200, {
        status: 'device_owned_by_other',
        studentNumber: student.student_number,
        studentName: student.name,
        registeredCount: count,
        maxDevices: MAX_DEVICES_PER_STUDENT,
        deviceLabel: device.label,
        session: null,
      });
    }
    if (count >= MAX_DEVICES_PER_STUDENT) {
      return sendJson(state, 200, {
        status: 'device_limit_reached',
        studentNumber: student.student_number,
        studentName: student.name,
        registeredCount: count,
        maxDevices: MAX_DEVICES_PER_STUDENT,
        deviceLabel: device.label,
        session: null,
      });
    }
    return sendJson(state, 200, {
      status: 'registration_required',
      studentNumber: student.student_number,
      studentName: student.name,
      registeredCount: count,
      maxDevices: MAX_DEVICES_PER_STUDENT,
      deviceLabel: device.label,
      session: null,
    });
  }

  if (req.method === 'POST' && pathname === '/api/students/register-device') {
    const body = await readJson(req);
    const student = await authenticateStudent(body);
    const device = await browserDevice(req, state, body.deviceLabel);
    await claimStudentDevice(student.student_id, device);
    return sendJson(state, 200, await createSession(state, student));
  }

  if (req.method === 'GET' && pathname === '/api/students') {
    await requireRole(req, 'teacher');
    return sendJson(state, 200, await listStudents());
  }

  if (req.method === 'POST' && pathname === '/api/students') {
    const session = await requireRole(req, 'teacher');
    requireCsrf(req, session);
    const body = await readJson(req);
    const studentNumber = assertStudentNumber(body.studentNumber);
    const name = assertPersonName(body.name);
    const pin = assertStudentPin(body.pin);
    const seatNumber = assertPositiveInteger(
      body.seatNumber,
      '좌석 번호를 올바르게 입력해 주세요.',
    );
    const attendanceWeekdays = [...DEFAULT_ATTENDANCE_WEEKDAYS];
    const { grade, classNumber } = parseStudentClassOrFail(studentNumber);
    const { data: existing, error: existingError } = await supabase
      .from('students')
      .select('id')
      .eq('student_number', studentNumber)
      .maybeSingle<{ id: number }>();
    if (existingError) failFromDatabase(existingError);
    if (existing) {
      fail('이미 등록된 학번입니다.', 409);
    }

    const { data: student, error: studentError } = await supabase
      .from('students')
      .insert({
        student_number: studentNumber,
        name,
        grade,
        class_number: classNumber,
        seat_number: seatNumber,
        attendance_weekdays: attendanceWeekdays,
      })
      .select('id, student_number, name, grade, class_number, seat_number, attendance_weekdays')
      .single<StudentRow>();
    if (studentError) failFromDatabase(studentError);

    const { error: userError } = await supabase.from('users').insert({
      username: studentNumber,
      password_hash: await hashSecret(pin),
      display_name: name,
      role: 'student',
      student_id: student.id,
    });
    if (userError) {
      await supabase.from('students').delete().eq('id', student.id);
      failFromDatabase(userError);
    }

    return sendJson(state, 201, toStudent({ ...student, device_count: 0 }));
  }

  const studentMatch = pathname.match(/^\/api\/students\/(\d+)$/);
  if (studentMatch && req.method === 'PUT') {
    const session = await requireRole(req, 'teacher');
    requireCsrf(req, session);
    const studentId = Number(studentMatch[1]);
    const body = await readJson(req);
    const studentNumber = assertStudentNumber(body.studentNumber);
    const name = assertPersonName(body.name);
    const seatNumber = assertPositiveInteger(
      body.seatNumber,
      '좌석 번호를 올바르게 입력해 주세요.',
    );
    const attendanceWeekdays = assertAttendanceWeekdays(body.attendanceWeekdays);
    const newPin =
      typeof body.newPin === 'string' && body.newPin
        ? assertStudentPin(body.newPin)
        : null;
    const { grade, classNumber } = parseStudentClassOrFail(studentNumber);
    const { data: duplicate, error: duplicateError } = await supabase
      .from('students')
      .select('id')
      .eq('student_number', studentNumber)
      .neq('id', studentId)
      .maybeSingle<{ id: number }>();
    if (duplicateError) failFromDatabase(duplicateError);
    if (duplicate) {
      fail('이미 등록된 학번입니다.', 409);
    }

    const { data: updated, error } = await supabase.rpc(
      'update_student_profile',
      {
        p_student_id: studentId,
        p_student_number: studentNumber,
        p_name: name,
        p_grade: grade,
        p_class_number: classNumber,
        p_seat_number: seatNumber,
        p_attendance_weekdays: attendanceWeekdays,
        p_password_hash: newPin ? await hashSecret(newPin) : null,
      },
    );
    if (error) {
      failFromDatabase(error, '학생 정보를 수정하지 못했습니다.');
    }
    if (updated !== true) fail('학생 계정을 찾을 수 없습니다.', 404);

    const responseStudent = await getStudentWithDeviceCount(studentId);
    if (!responseStudent) {
      fail('학생을 찾을 수 없습니다.', 404);
    }
    return sendJson(state, 200, responseStudent);
  }

  if (studentMatch && req.method === 'DELETE') {
    const session = await requireRole(req, 'teacher');
    requireCsrf(req, session);
    const studentId = Number(studentMatch[1]);
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('id', studentId)
      .maybeSingle<{ id: number }>();
    if (studentError) failFromDatabase(studentError);
    if (!student) {
      fail('학생을 찾을 수 없습니다.', 404);
    }
    const { error } = await supabase.from('students').delete().eq('id', studentId);
    if (error) failFromDatabase(error);
    return sendEmpty(state);
  }

  const resetDeviceMatch = pathname.match(/^\/api\/students\/(\d+)\/reset-devices$/);
  if (resetDeviceMatch && req.method === 'POST') {
    const session = await requireRole(req, 'teacher');
    requireCsrf(req, session);
    const { data: reset, error } = await supabase.rpc('reset_student_access', {
      p_student_id: Number(resetDeviceMatch[1]),
    });
    if (error) failFromDatabase(error);
    if (reset !== true) fail('학생을 찾을 수 없습니다.', 404);
    return sendEmpty(state);
  }

  if (req.method === 'GET' && pathname === '/api/teachers') {
    await requireRole(req, 'teacher');
    const { data: teachers, error } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('role', 'teacher')
      .order('display_name', { ascending: true })
      .order('id', { ascending: true })
      .returns<Array<{ id: number; display_name: string }>>();
    if (error) failFromDatabase(error);
    return sendJson(
      state,
      200,
      (teachers ?? []).map((teacher) => ({
        id: Number(teacher.id),
        name: teacher.display_name,
      })),
    );
  }

  if (req.method === 'POST' && pathname === '/api/teachers') {
    const session = await requireRole(req, 'teacher');
    requireCsrf(req, session);
    const body = await readJson(req);
    const identifier = assertNewTeacherIdentifier(body.identifier);
    const name = assertPersonName(body.name);
    const { data: teachers, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('role', 'teacher')
      .returns<Array<{ password_hash: string }>>();
    if (error) failFromDatabase(error);
    const duplicateIdentifier =
      (await findSecretMatch(identifier, teachers ?? [])) != null;
    if (duplicateIdentifier) {
      fail('이미 사용 중인 고유 번호입니다.', 409);
    }
    const { data: teacher, error: insertError } = await supabase
      .from('users')
      .insert({
        username: `teacher:${randomUUID()}`,
        password_hash: await hashSecret(identifier),
        display_name: name,
        role: 'teacher',
      })
      .select('id, display_name')
      .single<{ id: number; display_name: string }>();
    if (insertError) failFromDatabase(insertError);
    return sendJson(state, 201, { id: Number(teacher.id), name });
  }

  const teacherMatch = pathname.match(/^\/api\/teachers\/(\d+)$/);
  if (teacherMatch && req.method === 'PUT') {
    const session = await requireRole(req, 'teacher');
    requireCsrf(req, session);
    const teacherId = Number(teacherMatch[1]);
    const body = await readJson(req);
    const name = assertPersonName(body.name);
    let newPasswordHash: string | null = null;
    if (typeof body.newIdentifier === 'string' && body.newIdentifier.trim()) {
      const newIdentifier = assertNewTeacherIdentifier(body.newIdentifier);
      const { data: teachers, error } = await supabase
        .from('users')
        .select('id, password_hash')
        .eq('role', 'teacher')
        .neq('id', teacherId)
        .returns<Array<{ id: number; password_hash: string }>>();
      if (error) failFromDatabase(error);
      const duplicateIdentifier =
        (await findSecretMatch(newIdentifier, teachers ?? [])) != null;
      if (duplicateIdentifier) {
        fail('이미 사용 중인 고유 번호입니다.', 409);
      }
      newPasswordHash = await hashSecret(newIdentifier);
    }

    const { data: updated, error: updateError } = await supabase.rpc(
      'update_teacher_account',
      {
        p_teacher_id: teacherId,
        p_display_name: name,
        p_password_hash: newPasswordHash,
      },
    );
    if (updateError) {
      failFromDatabase(updateError, '선생님 계정을 수정하지 못했습니다.');
    }
    if (updated !== true) fail('선생님 계정을 찾을 수 없습니다.', 404);

    const { data: teacher, error } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('id', teacherId)
      .eq('role', 'teacher')
      .maybeSingle<{ id: number; display_name: string }>();
    if (error) failFromDatabase(error);
    if (!teacher) {
      fail('선생님 계정을 찾을 수 없습니다.', 404);
    }
    return sendJson(state, 200, { id: Number(teacher.id), name: teacher.display_name });
  }

  if (req.method === 'GET' && pathname === '/api/attendance') {
    const session = await requireSession(req);
    return sendJson(state, 200, await attendanceRecords(session));
  }

  if (req.method === 'DELETE' && pathname === '/api/attendance') {
    const session = await requireRole(req, 'teacher');
    requireCsrf(req, session);
    const dateKey = assertAttendanceDateKey(req.nextUrl.searchParams.get('dateKey'));
    let query = supabase.from('attendance_records').delete();
    if (dateKey) {
      const { start, end } = attendanceDateRange(dateKey);
      query = query.gte('timestamp', start).lte('timestamp', end);
    } else {
      query = query.not('id', 'is', null);
    }
    const { data: deletedRecords, error } = await query.select('id');
    if (error) failFromDatabase(error);
    return sendJson(state, 200, {
      deletedCount: deletedRecords?.length ?? 0,
    });
  }

  if (req.method === 'POST' && pathname === '/api/attendance/self') {
    const session = await requireRole(req, 'student');
    requireCsrf(req, session);
    const body = await readJson(req);
    validateLocation(body.location);
    const device = await browserDevice(req, state, body.deviceLabel);
    const { data: student, error } = await supabase
      .from('students')
      .select('id, student_number, name, grade, class_number, seat_number, attendance_weekdays')
      .eq('student_number', session.user.studentNumber)
      .maybeSingle<StudentRow>();
    if (error) failFromDatabase(error);
    if (!student || device.studentId !== Number(student.id)) {
      fail('등록된 기기에서만 출석할 수 있습니다.', 403);
    }
    if (
      !isStudentScheduledOnDate(
        koreaDateKey(),
        assertAttendanceWeekdays(student.attendance_weekdays),
      )
    ) {
      fail('오늘은 출석 대상 요일이 아닙니다.', 400);
    }
    return sendJson(
      state,
      201,
      await createSelfAttendanceRecord(student, device),
    );
  }

  if (req.method === 'POST' && pathname === '/api/attendance/manual') {
    const session = await requireRole(req, 'teacher');
    requireCsrf(req, session);
    const body = await readJson(req);
    const studentId = assertInteger(body.studentId, '학생을 선택해 주세요.');
    const action = assertString(body.action, '처리 유형을 선택해 주세요.');
    if (!['check_in', 'check_out', 'absent', 'present'].includes(action)) {
      fail('처리 유형이 올바르지 않습니다.', 400);
    }
    const dateKey = assertAttendanceDateKey(body.dateKey);
    const { data: student, error } = await supabase
      .from('students')
      .select('id, student_number, name, grade, class_number, seat_number, attendance_weekdays')
      .eq('id', studentId)
      .maybeSingle<StudentRow>();
    if (error) failFromDatabase(error);
    if (!student) {
      fail('학생을 찾을 수 없습니다.', 404);
    }
    const studentWeekdays = assertAttendanceWeekdays(
      student.attendance_weekdays,
    );
    if (
      (dateKey != null || action === 'absent') &&
      !isStudentScheduledOnDate(dateKey ?? koreaDateKey(), studentWeekdays)
    ) {
      fail('해당 학생의 출석 대상 요일이 아닙니다.', 400);
    }
    return sendJson(
      state,
      201,
      await createAttendanceRecord(
        student,
        action as AttendanceAction,
        'teacher-manual',
        `교사 수동 처리 · ${session.user.displayName}`,
        timestampForManualAttendanceDate(dateKey),
      ),
    );
  }

  return sendJson(state, 404, { message: '요청한 기능을 찾을 수 없습니다.' });
}

export async function handleApiRoute(req: NextRequest) {
  const state: ApiState = { cookies: [] };
  if (req.method === 'GET' && req.nextUrl.pathname === '/api/health') {
    return NextResponse.json(
      { status: 'ok' },
      { status: 200, headers: { ...apiHeaders(), 'Cache-Control': 'no-store' } },
    );
  }
  try {
    await ensureBootstrapData();
    return await handleApi(req, state);
  } catch (error) {
    const apiError = error as ApiError;
    return sendJson(state, apiError.statusCode || 500, {
      message:
        error instanceof Error ? error.message : '서버 처리 중 오류가 발생했습니다.',
    });
  }
}
