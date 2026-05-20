import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  hashSecret,
  isLegacySha256Hash,
  randomToken,
  sha256Hex,
  verifySecret,
} from './security';
import { getSupabase } from './supabase';

type UserRole = 'student' | 'teacher';
type AttendanceAction = 'check_in' | 'check_out' | 'absent';
type DailyPresence = null | 'present' | 'checked_out';

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
}

interface StudentAccountRow extends AuthUserRow {
  student_id: number;
  name: string;
}

interface BrowserDeviceRow {
  id: string;
  token_hash: string;
  label: string;
  student_id: number | null;
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
  device_id: string;
  device_label: string;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECONDS = 60 * 60;
const DEVICE_SECONDS = 60 * 60 * 24 * 365;
const MAX_DEVICES_PER_STUDENT = 2;
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
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 8;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

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

function requestIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded?.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

function rateLimitKey(req: NextRequest, bucket: string, subject = '') {
  return `${bucket}:${requestIp(req)}:${subject}`;
}

function checkRateLimit(req: NextRequest, bucket: string, subject = '') {
  const key = rateLimitKey(req, bucket, subject);
  const now = Date.now();
  const existing = rateLimits.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  existing.count += 1;
  if (existing.count > RATE_LIMIT_MAX_ATTEMPTS) {
    const seconds = Math.ceil((existing.resetAt - now) / 1000);
    fail(`잠시 후 다시 시도해 주세요. (${seconds}초 후 가능)`, 429);
  }
}

function clearRateLimit(req: NextRequest, bucket: string, subject = '') {
  rateLimits.delete(rateLimitKey(req, bucket, subject));
}

async function readJson(req: NextRequest) {
  const body = await req.text();
  if (!body.trim()) return {} as Record<string, unknown>;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    fail('요청 본문이 올바르지 않습니다.', 400);
  }
}

function assertString(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(message, 400);
  }
  return value.trim();
}

function assertInteger(value: unknown, message: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    fail(message, 400);
  }
  return parsed;
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
    bootstrapPromise = seedInitialData();
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
      password_hash: hashSecret(identifier),
      display_name: name,
      role: 'teacher',
    });
    if (teacherError) failFromDatabase(teacherError);
    return;
  }

  const { error: teacherError } = await supabase.from('users').insert({
    username: 'teacher:1',
    password_hash: hashSecret('teacher01'),
    display_name: '담당 교사',
    role: 'teacher',
  });
  if (teacherError) failFromDatabase(teacherError);

  const students = [
    ['20101', '김민준', 2, 1],
    ['20102', '이서연', 2, 1],
    ['20103', '박지호', 2, 1],
    ['20211', '최유진', 2, 2],
    ['20212', '정하린', 2, 2],
    ['30105', '오도윤', 3, 1],
  ] as const;

  for (const [studentNumber, name, grade, classNumber] of students) {
    const { data: student, error: studentError } = await supabase
      .from('students')
      .insert({
        student_number: studentNumber,
        name,
        grade,
        class_number: classNumber,
      })
      .select('id, student_number, name, grade, class_number')
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

async function ensureBrowserDevice(
  req: NextRequest,
  state: ApiState,
  label: unknown,
) {
  const supabase = getSupabase();
  const rawToken = req.cookies.get(DEVICE_COOKIE)?.value;
  const tokenHash = rawToken ? sha256Hex(rawToken) : null;
  const nextLabel = browserDeviceLabel(req, label);

  if (tokenHash) {
    const { data: existing, error } = await supabase
      .from('browser_devices')
      .select('id, token_hash, label, student_id')
      .eq('token_hash', tokenHash)
      .maybeSingle<BrowserDeviceRow>();
    if (error) failFromDatabase(error);
    if (existing) {
      const { error: updateError } = await supabase
        .from('browser_devices')
        .update({ label: nextLabel, last_seen_at: nowIso() })
        .eq('id', existing.id);
      if (updateError) failFromDatabase(updateError);
      return {
        id: existing.id,
        label: nextLabel,
        studentId:
          existing.student_id == null ? null : Number(existing.student_id),
      };
    }
  }

  const nextRawToken = randomToken();
  const nextDevice = {
    id: randomUUID(),
    label: nextLabel,
    studentId: null,
  };
  const now = nowIso();
  const { error } = await supabase.from('browser_devices').insert({
    id: nextDevice.id,
    token_hash: sha256Hex(nextRawToken),
    label: nextDevice.label,
    student_id: null,
    created_at: now,
    last_seen_at: now,
  });
  if (error) failFromDatabase(error);

  appendCookie(state, DEVICE_COOKIE, nextRawToken, {
    maxAge: DEVICE_SECONDS,
    secure: IS_PRODUCTION,
  });

  return nextDevice;
}

async function studentAccount(studentNumber: string, name: string) {
  const supabase = getSupabase();
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, student_number, name, grade, class_number')
    .eq('student_number', studentNumber)
    .eq('name', name)
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
  } satisfies StudentAccountRow;
}

async function studentDeviceCount(studentId: number) {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('browser_devices')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId);
  if (error) failFromDatabase(error);
  return count ?? 0;
}

function toStudent(row: StudentRow & { device_count: number }) {
  return {
    id: Number(row.id),
    studentNumber: row.student_number,
    name: row.name,
    grade: Number(row.grade),
    classNumber: Number(row.class_number),
    deviceCount: Number(row.device_count),
  };
}

async function getStudentWithDeviceCount(studentId: number) {
  const supabase = getSupabase();
  const { data: student, error } = await supabase
    .from('students')
    .select('id, student_number, name, grade, class_number')
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
    .select('id, student_number, name, grade, class_number')
    .order('grade', { ascending: true })
    .order('class_number', { ascending: true })
    .order('student_number', { ascending: true })
    .returns<StudentRow[]>();
  if (error) failFromDatabase(error);

  const { data: devices, error: deviceError } = await supabase
    .from('browser_devices')
    .select('student_id')
    .not('student_id', 'is', null)
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
    .select('id, student_id, action, timestamp, device_id, device_label')
    .order('timestamp', { ascending: false });
  if (studentId != null) {
    query = query.eq('student_id', studentId);
  }

  const { data: records, error } = await query.returns<AttendanceRecordRow[]>();
  if (error) failFromDatabase(error);
  if (!records?.length) return [];

  const studentIds = [...new Set(records.map((record) => record.student_id))];
  const { data: students, error: studentError } = await supabase
    .from('students')
    .select('id, student_number, name, grade, class_number')
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
        deviceId: row.device_id,
        deviceLabel: row.device_label,
      },
    ];
  });
}

async function dailyPresence(studentId: number): Promise<DailyPresence> {
  const today = koreaDateKey();
  const supabase = getSupabase();
  const { data: records, error } = await supabase
    .from('attendance_records')
    .select('action, timestamp')
    .eq('student_id', studentId)
    .order('timestamp', { ascending: false })
    .returns<Array<{ action: AttendanceAction; timestamp: string }>>();
  if (error) failFromDatabase(error);

  const latestRecord = (records ?? []).find(
    (row) => koreaDateKey(row.timestamp) === today,
  );
  if (!latestRecord || latestRecord.action === 'absent') return null;
  return latestRecord.action === 'check_in' ? 'present' : 'checked_out';
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
) {
  const record = {
    id: randomUUID(),
    studentNumber: student.student_number,
    studentName: student.name,
    action,
    timestamp: nowIso(),
    deviceId,
    deviceLabel,
  };
  const supabase = getSupabase();
  const { error } = await supabase.from('attendance_records').insert({
    id: record.id,
    student_id: student.id,
    action: record.action,
    timestamp: record.timestamp,
    device_id: record.deviceId,
    device_label: record.deviceLabel,
  });
  if (error) failFromDatabase(error);
  return record;
}

async function handleApi(req: NextRequest, state: ApiState) {
  const { pathname } = req.nextUrl;
  const supabase = getSupabase();

  if (req.method === 'POST' && pathname === '/api/device') {
    const body = await readJson(req);
    const device = await ensureBrowserDevice(req, state, body.label);
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
    const identifier = assertString(body.identifier, '고유 번호를 입력해 주세요.');
    const displayName = assertString(body.displayName, '이름을 입력해 주세요.');
    checkRateLimit(req, 'teacher-login', displayName);
    const { data: teachers, error } = await supabase
      .from('users')
      .select('id, username, password_hash, display_name, role, student_id')
      .eq('role', 'teacher')
      .eq('display_name', displayName)
      .returns<DbUserRow[]>();
    if (error) failFromDatabase(error);

    const teacher = (teachers ?? []).find((item) =>
      verifySecret(identifier, item.password_hash),
    );
    if (!teacher) {
      fail('번호 또는 이름이 올바르지 않습니다.', 401);
    }
    if (isLegacySha256Hash(teacher.password_hash)) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: hashSecret(identifier) })
        .eq('id', teacher.id);
      if (updateError) failFromDatabase(updateError);
    }
    clearRateLimit(req, 'teacher-login', displayName);
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

  if (req.method === 'POST' && pathname === '/api/students/access') {
    const body = await readJson(req);
    const studentNumber = assertString(body.studentNumber, '학번을 입력해 주세요.');
    const name = assertString(body.name, '이름을 입력해 주세요.');
    checkRateLimit(req, 'student-access', studentNumber);
    const device = await ensureBrowserDevice(req, state, body.deviceLabel);
    const student = await studentAccount(studentNumber, name);
    if (!student) {
      fail('학번 또는 이름이 올바르지 않습니다.', 401);
    }
    clearRateLimit(req, 'student-access', studentNumber);
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
    const studentNumber = assertString(body.studentNumber, '학번을 입력해 주세요.');
    const name = assertString(body.name, '이름을 입력해 주세요.');
    checkRateLimit(req, 'student-register', studentNumber);
    const device = await ensureBrowserDevice(req, state, body.deviceLabel);
    const student = await studentAccount(studentNumber, name);
    if (!student) {
      fail('학번 또는 이름이 올바르지 않습니다.', 401);
    }
    if (device.studentId != null && device.studentId !== student.student_id) {
      fail('이 기기는 이미 다른 학생에게 등록되어 있습니다.', 409);
    }
    const count = await studentDeviceCount(student.student_id);
    if (device.studentId == null && count >= MAX_DEVICES_PER_STUDENT) {
      fail('등록 가능한 기기 수를 모두 사용했습니다.', 409);
    }
    const { error } = await supabase
      .from('browser_devices')
      .update({
        student_id: student.student_id,
        label: device.label,
        last_seen_at: nowIso(),
      })
      .eq('id', device.id);
    if (error) failFromDatabase(error);
    clearRateLimit(req, 'student-register', studentNumber);
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
    const studentNumber = assertString(body.studentNumber, '학번을 입력해 주세요.');
    const name = assertString(body.name, '이름을 입력해 주세요.');
    const grade = assertInteger(body.grade, '학년을 올바르게 입력해 주세요.');
    const classNumber = assertInteger(body.classNumber, '반을 올바르게 입력해 주세요.');
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
      })
      .select('id, student_number, name, grade, class_number')
      .single<StudentRow>();
    if (studentError) failFromDatabase(studentError);

    const { error: userError } = await supabase.from('users').insert({
      username: studentNumber,
      password_hash: 'unused',
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
    const studentNumber = assertString(body.studentNumber, '학번을 입력해 주세요.');
    const name = assertString(body.name, '이름을 입력해 주세요.');
    const grade = assertInteger(body.grade, '학년을 올바르게 입력해 주세요.');
    const classNumber = assertInteger(body.classNumber, '반을 올바르게 입력해 주세요.');
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

    const { data: updatedStudent, error } = await supabase
      .from('students')
      .update({
        student_number: studentNumber,
        name,
        grade,
        class_number: classNumber,
      })
      .eq('id', studentId)
      .select('id, student_number, name, grade, class_number')
      .maybeSingle<StudentRow>();
    if (error) failFromDatabase(error);
    if (!updatedStudent) {
      fail('학생을 찾을 수 없습니다.', 404);
    }

    const { error: userError } = await supabase
      .from('users')
      .update({ username: studentNumber, display_name: name })
      .eq('student_id', studentId);
    if (userError) failFromDatabase(userError);

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
    const { error } = await supabase
      .from('browser_devices')
      .update({ student_id: null })
      .eq('student_id', Number(resetDeviceMatch[1]));
    if (error) failFromDatabase(error);
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
    const identifier = assertString(body.identifier, '고유 번호를 입력해 주세요.');
    const name = assertString(body.name, '이름을 입력해 주세요.');
    const { data: teachers, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('role', 'teacher')
      .returns<Array<{ password_hash: string }>>();
    if (error) failFromDatabase(error);
    const duplicateIdentifier = (teachers ?? []).some((teacher) =>
      verifySecret(identifier, teacher.password_hash),
    );
    if (duplicateIdentifier) {
      fail('이미 사용 중인 고유 번호입니다.', 409);
    }
    const { data: teacher, error: insertError } = await supabase
      .from('users')
      .insert({
        username: `teacher:${randomUUID()}`,
        password_hash: hashSecret(identifier),
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
    const name = assertString(body.name, '이름을 입력해 주세요.');
    const updatePayload: { display_name: string; password_hash?: string } = {
      display_name: name,
    };

    if (typeof body.newIdentifier === 'string' && body.newIdentifier.trim()) {
      const newIdentifier = body.newIdentifier.trim();
      const { data: teachers, error } = await supabase
        .from('users')
        .select('id, password_hash')
        .eq('role', 'teacher')
        .neq('id', teacherId)
        .returns<Array<{ id: number; password_hash: string }>>();
      if (error) failFromDatabase(error);
      const duplicateIdentifier = (teachers ?? []).some((teacher) =>
        verifySecret(newIdentifier, teacher.password_hash),
      );
      if (duplicateIdentifier) {
        fail('이미 사용 중인 고유 번호입니다.', 409);
      }
      updatePayload.password_hash = hashSecret(newIdentifier);
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', teacherId)
      .eq('role', 'teacher');
    if (updateError) failFromDatabase(updateError);

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

  if (req.method === 'POST' && pathname === '/api/attendance/self') {
    const session = await requireRole(req, 'student');
    requireCsrf(req, session);
    const body = await readJson(req);
    validateLocation(body.location);
    const device = await ensureBrowserDevice(req, state, body.deviceLabel);
    const { data: student, error } = await supabase
      .from('students')
      .select('id, student_number, name, grade, class_number')
      .eq('student_number', session.user.studentNumber)
      .maybeSingle<StudentRow>();
    if (error) failFromDatabase(error);
    if (!student || device.studentId !== Number(student.id)) {
      fail('등록된 기기에서만 출석할 수 있습니다.', 403);
    }
    const presence = await dailyPresence(student.id);
    if (presence === 'checked_out') {
      fail('오늘 출석과 퇴실 처리를 모두 마쳤습니다.', 409);
    }
    const action = presence === 'present' ? 'check_out' : 'check_in';
    return sendJson(
      state,
      201,
      await createAttendanceRecord(student, action, device.id, device.label),
    );
  }

  if (req.method === 'POST' && pathname === '/api/attendance/manual') {
    const session = await requireRole(req, 'teacher');
    requireCsrf(req, session);
    const body = await readJson(req);
    const studentId = assertInteger(body.studentId, '학생을 선택해 주세요.');
    const action = assertString(body.action, '처리 유형을 선택해 주세요.');
    if (!['check_in', 'check_out', 'absent'].includes(action)) {
      fail('처리 유형이 올바르지 않습니다.', 400);
    }
    const { data: student, error } = await supabase
      .from('students')
      .select('id, student_number, name, grade, class_number')
      .eq('id', studentId)
      .maybeSingle<StudentRow>();
    if (error) failFromDatabase(error);
    if (!student) {
      fail('학생을 찾을 수 없습니다.', 404);
    }
    return sendJson(
      state,
      201,
      await createAttendanceRecord(
        student,
        action as AttendanceAction,
        'teacher-manual',
        `교사 수동 처리 · ${session.user.displayName}`,
      ),
    );
  }

  return sendJson(state, 404, { message: '요청한 기능을 찾을 수 없습니다.' });
}

export async function handleApiRoute(req: NextRequest) {
  const state: ApiState = { cookies: [] };
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
