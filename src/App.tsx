'use client';

import { useEffect, useRef, useState } from 'react';
import { AttendanceRecord, Student, getAttendanceDateKey } from './lib/attendance';
import {
  AuthSession,
  CreateTeacherInput,
  CreateStudentInput,
  ManualAttendanceAction,
  Teacher,
  UpdateStudentInput,
  UpdateTeacherInput,
  checkStudentAccess,
  createTeacher,
  createStudent,
  deleteAllAttendanceRecords,
  deleteAttendanceRecordsByDate,
  deleteStudent,
  listAttendanceRecords,
  listStudents,
  listTeachers,
  logout,
  keepApiAlive,
  registerStudentDevice,
  resetStudentDevices,
  updateStudent,
  updateTeacher,
  getCurrentSession,
  submitAttendance,
  submitManualAttendance,
  teacherLogin,
} from './services/appService';
import { DeviceIdentity, getCurrentDevice } from './services/deviceService';
import {
  LocationAccessError,
  LocationCapability,
  getCurrentLocation,
  getLocationCapability,
} from './services/locationService';
import { LoginView } from './features/auth/LoginView';
import { PendingRegistration } from './features/auth/types';
import { LocationGuideModal } from './features/location/LocationGuideModal';
import { StudentView } from './features/student/StudentView';
import { TeacherView } from './features/teacher/TeacherView';
import { FeedbackMessage } from './types/ui';
import { SpeedInsights } from "@vercel/speed-insights/next"

const LOCATION_GUIDE_SEEN_KEY = 'attend.location-guide-seen';
const KEEP_ALIVE_INTERVAL_MS = 8 * 60 * 1000;

// App은 화면 자체를 많이 그리지 않고, 세션과 공통 상태를 연결하는 루트 컨테이너 역할을 맡는다.
function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [device, setDevice] = useState<DeviceIdentity | null>(null);
  const [pendingRegistration, setPendingRegistration] =
    useState<PendingRegistration | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocationGuideOpen, setIsLocationGuideOpen] = useState(false);
  const [locationCapability, setLocationCapability] =
    useState<LocationCapability | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [isLogoNoticeVisible, setIsLogoNoticeVisible] = useState(false);
  const logoNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // 앱이 시작되면 기기 표시 정보와 서버 세션을 함께 복원한다.
    void bootstrap();
  }, []);

  useEffect(() => {
    const keepAliveTimer = window.setInterval(() => {
      void keepApiAlive().catch((error) => {
        console.warn('Keep-alive request failed', error);
      });
    }, KEEP_ALIVE_INTERVAL_MS);

    return () => window.clearInterval(keepAliveTimer);
  }, []);

  useEffect(() => {
    if (!session) return;
    // 로그인 직후 역할별로 필요한 작업 공간 데이터를 한 번에 불러온다.
    void loadWorkspace(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(
    () => () => {
      if (logoNoticeTimerRef.current) {
        window.clearTimeout(logoNoticeTimerRef.current);
      }
    },
    [],
  );

  async function bootstrap() {
    setIsBooting(true);
    try {
      const [nextDevice, nextSession] = await Promise.all([
        getCurrentDevice(),
        getCurrentSession(),
      ]);
      setDevice(nextDevice);
      setSession(nextSession);
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : '앱 초기화에 실패했습니다.',
      );
    } finally {
      setIsBooting(false);
    }
  }

  // 로그인 성공 시 세션 쿠키는 서버가 저장하고, 화면은 공개 가능한 세션 정보만 기억한다.
  function applySession(nextSession: AuthSession) {
    setSession(nextSession);
  }

  // 학생과 교사는 필요한 데이터 범위가 다르므로,
  // 공통 기록 조회와 교사용 데이터 조회를 역할에 맞게 병렬 처리한다.
  async function loadWorkspace(nextSession: AuthSession) {
    setIsBooting(true);
    try {
      const [nextRecords, nextStudents, nextTeachers] = await Promise.all([
        listAttendanceRecords(),
        nextSession.user.role === 'teacher'
          ? listStudents()
          : Promise.resolve([]),
        nextSession.user.role === 'teacher'
          ? listTeachers()
          : Promise.resolve([]),
      ]);
      setRecords(nextRecords);
      setStudents(nextStudents);
      setTeachers(nextTeachers);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.',
      });
    } finally {
      setIsBooting(false);
    }
  }

  async function handleTeacherLogin(identifier: string, displayName: string) {
    setIsWorking(true);
    setLoginError(null);
    setPendingRegistration(null);
    try {
      applySession(await teacherLogin(identifier, displayName));
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : '로그인에 실패했습니다.',
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleStudentCheck(studentNumber: string, name: string) {
    if (!device) return;
    setIsWorking(true);
    setLoginError(null);
    try {
      const access = await checkStudentAccess(studentNumber, name, device);
      if (access.status === 'authenticated' && access.session) {
        applySession(access.session);
        return;
      }
      if (access.status === 'registration_required') {
        setPendingRegistration({ studentNumber, name, access });
        return;
      }
      if (access.status === 'device_owned_by_other') {
        setLoginError('이 기기는 이미 다른 학생에게 등록되어 있습니다.');
        return;
      }
      setLoginError('등록 가능한 기기 수를 모두 사용했습니다.');
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : '학생 확인에 실패했습니다.',
      );
    } finally {
      setIsWorking(false);
    }
  }

  // 첫 로그인 학생이 현재 기기를 자기 계정에 연결하는 흐름이다.
  async function handleRegisterDevice() {
    if (!pendingRegistration || !device) return;
    setIsWorking(true);
    setLoginError(null);
    try {
      const nextSession = await registerStudentDevice(
        pendingRegistration.studentNumber,
        pendingRegistration.name,
        device,
      );
      setPendingRegistration(null);
      applySession(nextSession);
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : '기기 등록에 실패했습니다.',
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleLogout() {
    if (session) await logout(session.csrfToken);
    setSession(null);
    setStudents([]);
    setTeachers([]);
    setRecords([]);
    setPendingRegistration(null);
    setMessage(null);
  }

  // 위치 권한 안내를 아직 보지 않은 학생은 출석 처리보다 안내를 먼저 보게 한다.
  async function handleSubmitAttendance() {
    if (!session || !device) return;
    if (!window.localStorage.getItem(LOCATION_GUIDE_SEEN_KEY)) {
      await openLocationGuide();
      return;
    }
    await performSubmitAttendance();
  }

  // 실제 학생 출결 처리 단계다.
  // 위치 획득 실패 중 사용자가 직접 해결할 수 있는 경우는 안내 모달을 다시 연다.
  async function performSubmitAttendance() {
    if (!session || !device) return;
    setIsSubmitting(true);
    try {
      const location = await getCurrentLocation();
      const record = await submitAttendance(
        session.csrfToken,
        device,
        location,
      );
      setRecords((value) => [record, ...value]);
      setMessage({
        tone: 'success',
        text:
          record.action === 'check_in'
            ? '출석이 처리되었습니다.'
            : '퇴실이 처리되었습니다.',
      });
    } catch (error) {
      if (
        error instanceof LocationAccessError &&
        (error.reason === 'permission_denied' ||
          error.reason === 'insecure_context' ||
          error.reason === 'unsupported')
      ) {
        await openLocationGuide();
      }
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '처리에 실패했습니다.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleContinueFromLocationGuide() {
    window.localStorage.setItem(LOCATION_GUIDE_SEEN_KEY, 'true');
    setIsLocationGuideOpen(false);
    await performSubmitAttendance();
  }

  async function openLocationGuide() {
    setLocationCapability(await getLocationCapability());
    setIsLocationGuideOpen(true);
  }

  // 교사가 학생 행에서 직접 누르는 수동 출결 처리다.
  async function handleManualAttendance(
    student: Student,
    action: ManualAttendanceAction,
    dateKey?: string,
  ) {
    if (!session) return;
    try {
      const record = await submitManualAttendance(
        student.id,
        action,
        session.csrfToken,
        dateKey,
      );
      setRecords((value) => [record, ...value]);
      const actionLabel =
        action === 'check_in'
          ? '출석'
          : action === 'check_out'
            ? '퇴실'
            : action === 'present'
              ? '정상출석'
              : dateKey
                ? '결석'
                : '미출석';
      setMessage({
        tone: 'success',
        text: `${student.name} 학생의 ${actionLabel}을 처리했습니다.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : '수동 처리를 완료하지 못했습니다.',
      });
    }
  }

  // 학생 추가 후 화면 상태도 즉시 동기화해 새로고침 없이 명단에 반영한다.
  async function handleAddStudent(input: CreateStudentInput) {
    if (!session) return;
    try {
      const student = await createStudent(input, session.csrfToken);
      setStudents((value) => [...value, student]);
      setMessage({
        tone: 'success',
        text: `${student.name} 학생을 추가했습니다.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error ? error.message : '학생을 추가하지 못했습니다.',
      });
      throw error;
    }
  }

  // 교사 추가 후 오른쪽 교사 목록에도 바로 반영한다.
  async function handleAddTeacher(input: CreateTeacherInput) {
    if (!session) return;
    try {
      const teacher = await createTeacher(input, session.csrfToken);
      setTeachers((value) => [...value, teacher]);
      setMessage({
        tone: 'success',
        text: `${teacher.name} 선생님 계정을 추가했습니다.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : '선생님 계정을 추가하지 못했습니다.',
      });
      throw error;
    }
  }

  // 학생 정보 수정 후 명단과 날짜별 출결표에 쓰이는 상태를 함께 갱신한다.
  async function handleUpdateStudent(
    student: Student,
    input: UpdateStudentInput,
  ) {
    if (!session) return;
    try {
      const updatedStudent = await updateStudent(
        student.id,
        input,
        session.csrfToken,
      );
      setStudents((value) =>
        value.map((item) =>
          item.id === student.id ? updatedStudent : item,
        ),
      );
      setRecords((value) =>
        value.map((record) =>
          record.studentNumber === student.studentNumber
            ? {
                ...record,
                studentNumber: updatedStudent.studentNumber,
                studentName: updatedStudent.name,
              }
            : record,
        ),
      );
      setMessage({
        tone: 'success',
        text: `${updatedStudent.name} 학생 정보를 수정했습니다.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : '학생 정보를 수정하지 못했습니다.',
      });
      throw error;
    }
  }

  // 보안 해시는 복원할 수 없으므로, 교사 번호 수정은 기존 값을 보여주는 대신 새 값으로 재설정한다.
  async function handleUpdateTeacher(
    teacher: Teacher,
    input: UpdateTeacherInput,
  ) {
    if (!session) return;
    try {
      const updatedTeacher = await updateTeacher(
        teacher.id,
        input,
        session.csrfToken,
      );
      setTeachers((value) =>
        value.map((item) =>
          item.id === teacher.id ? updatedTeacher : item,
        ),
      );
      setMessage({
        tone: 'success',
        text: `${updatedTeacher.name} 선생님 계정을 수정했습니다.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : '선생님 계정을 수정하지 못했습니다.',
      });
      throw error;
    }
  }

  // 교사가 기기 등록을 초기화하면 화면의 카운트도 즉시 0으로 바꾼다.
  async function handleResetDevices(student: Student) {
    if (!session) return;
    try {
      await resetStudentDevices(student.id, session.csrfToken);
      setStudents((value) =>
        value.map((item) =>
          item.id === student.id ? { ...item, deviceCount: 0 } : item,
        ),
      );
      setMessage({
        tone: 'success',
        text: `${student.name} 학생의 기기 등록을 초기화했습니다.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : '기기 등록을 초기화하지 못했습니다.',
      });
    }
  }

  // 삭제는 되돌리기 어려운 동작이므로 사용자 확인을 먼저 받고,
  // 삭제된 학생의 기록도 현재 화면 상태에서 함께 제거한다.
  async function handleDeleteStudent(student: Student) {
    if (!session) return;
    if (!window.confirm(`${student.name} 학생을 삭제할까요?`)) return;
    try {
      await deleteStudent(student.id, session.csrfToken);
      setStudents((value) => value.filter((item) => item.id !== student.id));
      setRecords((value) =>
        value.filter((record) => record.studentNumber !== student.studentNumber),
      );
      setMessage({
        tone: 'success',
        text: `${student.name} 학생을 삭제했습니다.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error ? error.message : '학생을 삭제하지 못했습니다.',
      });
    }
  }

  async function handleDeleteAttendanceDate(dateKey: string) {
    if (!session) return;
    if (!window.confirm(`${dateKey} 출결기록을 삭제할까요?`)) return;
    try {
      const result = await deleteAttendanceRecordsByDate(
        dateKey,
        session.csrfToken,
      );
      if (result.deletedCount === 0) {
        setMessage({
          tone: 'error',
          text: `${dateKey}에 삭제할 저장 기록이 없습니다.`,
        });
        return;
      }
      setRecords((value) =>
        value.filter((record) => getAttendanceDateKey(record.timestamp) !== dateKey),
      );
      setMessage({
        tone: 'success',
        text: `${dateKey} 출결기록 ${result.deletedCount}건을 삭제했습니다.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : '출결기록을 삭제하지 못했습니다.',
      });
    }
  }

  async function handleDeleteAllAttendanceRecords() {
    if (!session) return;
    if (!window.confirm('전체 출결기록을 모두 삭제할까요?')) return;
    try {
      const result = await deleteAllAttendanceRecords(session.csrfToken);
      if (result.deletedCount === 0) {
        setMessage({
          tone: 'error',
          text: '삭제할 저장 기록이 없습니다.',
        });
        return;
      }
      setRecords([]);
      setMessage({
        tone: 'success',
        text: `전체 출결기록 ${result.deletedCount}건을 삭제했습니다.`,
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : '전체 출결기록을 삭제하지 못했습니다.',
      });
    }
  }

  function handleLogoClick() {
    setIsLogoNoticeVisible(true);
    if (logoNoticeTimerRef.current) {
      window.clearTimeout(logoNoticeTimerRef.current);
    }
    logoNoticeTimerRef.current = window.setTimeout(() => {
      setIsLogoNoticeVisible(false);
      logoNoticeTimerRef.current = null;
    }, 1000);
  }

  if (!session) {
    return (
      <LoginView
        device={device}
        pendingRegistration={pendingRegistration}
        onTeacherLogin={handleTeacherLogin}
        onStudentCheck={handleStudentCheck}
        onRegisterDevice={handleRegisterDevice}
        onClearRegistration={() => setPendingRegistration(null)}
        isBusy={isWorking || isBooting}
        error={loginError}
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="relative flex items-center gap-3">
            <button
              type="button"
              onClick={handleLogoClick}
              className="shrink-0 cursor-pointer rounded-md focus:outline-none focus:ring-2 focus:ring-sky-200"
              aria-label="고색고등학교 로고"
            >
              <img
                src="/logo.jpeg"
                alt="고색고등학교"
                className="h-12 w-12 object-contain"
              />
            </button>
            {isLogoNoticeVisible && (
              <p className="absolute left-0 top-14 z-10 w-max rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm">
                야자 째지 말고 열심히 공부해 얘들아
              </p>
            )}
            <div>
              <p className="text-sm font-medium text-slate-500">야간자율학습</p>
              <h1 className="text-2xl font-semibold">출석 관리 시스템</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">
                {session.user.displayName}
              </p>
              <p className="text-xs text-slate-500">
                {session.user.role === 'teacher' ? '교사 계정' : '학생 계정'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {isBooting || !device ? (
          <section className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            데이터를 불러오는 중입니다.
          </section>
        ) : session.user.role === 'student' ? (
          <StudentView
            session={session}
            device={device}
            records={records}
            onSubmitAttendance={handleSubmitAttendance}
            onOpenLocationGuide={() => void openLocationGuide()}
            isSubmitting={isSubmitting}
            message={message}
          />
        ) : (
          <TeacherView
            teachers={teachers}
            students={students}
            records={records}
            onAddTeacher={handleAddTeacher}
            onAddStudent={handleAddStudent}
            onDeleteStudent={handleDeleteStudent}
            onManualAttendance={handleManualAttendance}
            onDeleteAttendanceDate={handleDeleteAttendanceDate}
            onDeleteAllAttendanceRecords={handleDeleteAllAttendanceRecords}
            onResetDevices={handleResetDevices}
            onUpdateStudent={handleUpdateStudent}
            onUpdateTeacher={handleUpdateTeacher}
            message={message}
          />
        )}
      </div>
      {isLocationGuideOpen && (
        <LocationGuideModal
          capability={locationCapability}
          onClose={() => setIsLocationGuideOpen(false)}
          onContinue={() => void handleContinueFromLocationGuide()}
        />
      )}
    </main>
  );
}

export default App;
