import { AttendanceRecord, Student } from '../lib/attendance';
import type { AttendanceWeekday } from '../lib/attendance';
import { DeviceIdentity } from './deviceService';
import { LocationSample } from '../lib/location';

export type UserRole = 'student' | 'teacher';
export type StudentAccessStatus =
  | 'authenticated'
  | 'registration_required'
  | 'device_limit_reached'
  | 'device_owned_by_other';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  studentNumber: string | null;
}

// 웹 배포판은 인증 토큰을 자바스크립트에 노출하지 않는다.
// 세션 쿠키는 HttpOnly로 서버가 관리하고, 프론트엔드는 변경 요청용 CSRF 토큰만 가진다.
export interface AuthSession {
  user: User;
  expiresAt: string;
  csrfToken: string;
}

export interface StudentAccess {
  status: StudentAccessStatus;
  studentNumber: string;
  studentName: string;
  registeredCount: number;
  maxDevices: number;
  deviceLabel: string;
  session: AuthSession | null;
}

export interface CreateStudentInput {
  studentNumber: string;
  name: string;
  seatNumber: number;
}

export interface UpdateStudentInput {
  studentNumber: string;
  name: string;
  seatNumber: number;
  attendanceWeekdays: readonly AttendanceWeekday[];
}

export interface Teacher {
  id: number;
  name: string;
}

export interface CreateTeacherInput {
  identifier: string;
  name: string;
}

export interface UpdateTeacherInput {
  name: string;
  newIdentifier?: string;
}

export type ManualAttendanceAction =
  | 'check_in'
  | 'check_out'
  | 'absent'
  | 'present';

async function apiRequest<T>(
  path: string,
  options: RequestInit & { csrfToken?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.csrfToken) {
    headers.set('X-CSRF-Token', options.csrfToken);
  }
  const response = await window.fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | T
    | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'message' in payload
        ? payload.message || '요청을 처리하지 못했습니다.'
        : '요청을 처리하지 못했습니다.',
    );
  }
  return payload as T;
}

// 새로고침 뒤 세션을 복원할 때는 쿠키를 읽지 않고 서버에 현재 세션을 묻는다.
export async function getCurrentSession() {
  const response = await window.fetch('/api/session', {
    credentials: 'include',
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error('세션을 확인하지 못했습니다.');
  return (await response.json()) as AuthSession;
}

export async function teacherLogin(identifier: string, displayName: string) {
  return apiRequest<AuthSession>('/api/auth/teacher-login', {
    method: 'POST',
    body: JSON.stringify({ identifier, displayName }),
  });
}

export async function checkStudentAccess(
  studentNumber: string,
  name: string,
  device: DeviceIdentity,
) {
  return apiRequest<StudentAccess>('/api/students/access', {
    method: 'POST',
    body: JSON.stringify({
      studentNumber,
      name,
      deviceLabel: device.label,
    }),
  });
}

export async function registerStudentDevice(
  studentNumber: string,
  name: string,
  device: DeviceIdentity,
) {
  return apiRequest<AuthSession>('/api/students/register-device', {
    method: 'POST',
    body: JSON.stringify({
      studentNumber,
      name,
      deviceLabel: device.label,
    }),
  });
}

export async function logout(csrfToken: string) {
  return apiRequest<void>('/api/auth/logout', {
    method: 'POST',
    csrfToken,
  });
}

export async function listStudents() {
  return apiRequest<Student[]>('/api/students');
}

export async function createStudent(
  input: CreateStudentInput,
  csrfToken: string,
) {
  return apiRequest<Student>('/api/students', {
    method: 'POST',
    body: JSON.stringify(input),
    csrfToken,
  });
}

export async function updateStudent(
  studentId: number,
  input: UpdateStudentInput,
  csrfToken: string,
) {
  return apiRequest<Student>(`/api/students/${studentId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
    csrfToken,
  });
}

export async function deleteStudent(studentId: number, csrfToken: string) {
  return apiRequest<void>(`/api/students/${studentId}`, {
    method: 'DELETE',
    csrfToken,
  });
}

export async function listTeachers() {
  return apiRequest<Teacher[]>('/api/teachers');
}

export async function createTeacher(
  input: CreateTeacherInput,
  csrfToken: string,
) {
  return apiRequest<Teacher>('/api/teachers', {
    method: 'POST',
    body: JSON.stringify(input),
    csrfToken,
  });
}

export async function updateTeacher(
  teacherId: number,
  input: UpdateTeacherInput,
  csrfToken: string,
) {
  return apiRequest<Teacher>(`/api/teachers/${teacherId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
    csrfToken,
  });
}

export async function resetStudentDevices(
  studentId: number,
  csrfToken: string,
) {
  return apiRequest<void>(`/api/students/${studentId}/reset-devices`, {
    method: 'POST',
    csrfToken,
  });
}

export async function listAttendanceRecords() {
  return apiRequest<AttendanceRecord[]>('/api/attendance');
}

export async function deleteAttendanceRecordsByDate(
  dateKey: string,
  csrfToken: string,
) {
  return apiRequest<{ deletedCount: number }>(
    `/api/attendance?dateKey=${encodeURIComponent(dateKey)}`,
    {
      method: 'DELETE',
      csrfToken,
    },
  );
}

export async function deleteAllAttendanceRecords(csrfToken: string) {
  return apiRequest<{ deletedCount: number }>('/api/attendance', {
    method: 'DELETE',
    csrfToken,
  });
}

export async function submitAttendance(
  csrfToken: string,
  device: DeviceIdentity,
  location: LocationSample,
) {
  return apiRequest<AttendanceRecord>('/api/attendance/self', {
    method: 'POST',
    body: JSON.stringify({
      location,
      deviceLabel: device.label,
    }),
    csrfToken,
  });
}

export async function submitManualAttendance(
  studentId: number,
  action: ManualAttendanceAction,
  csrfToken: string,
  dateKey?: string,
) {
  return apiRequest<AttendanceRecord>('/api/attendance/manual', {
    method: 'POST',
    body: JSON.stringify({ studentId, action, dateKey }),
    csrfToken,
  });
}
