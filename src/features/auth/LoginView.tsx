import { FormEvent, useState } from 'react';
import { DeviceIdentity } from '../../services/deviceService';
import { PendingRegistration } from './types';

export function LoginView({
  device,
  pendingRegistration,
  onTeacherLogin,
  onStudentCheck,
  onRegisterDevice,
  onClearRegistration,
  isBusy,
  error,
}: {
  device: DeviceIdentity | null;
  pendingRegistration: PendingRegistration | null;
  onTeacherLogin: (identifier: string, displayName: string) => Promise<void>;
  onStudentCheck: (studentNumber: string, name: string) => Promise<void>;
  onRegisterDevice: () => Promise<void>;
  onClearRegistration: () => void;
  isBusy: boolean;
  error: string | null;
}) {
  // 한 화면에서 학생/교사 로그인을 모두 처리하므로 현재 선택된 역할을 별도로 기억한다.
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (role === 'teacher') {
      await onTeacherLogin(identifier, displayName);
      return;
    }
    await onStudentCheck(identifier, displayName);
  }

  // 역할을 바꾸면 학생 기기 등록 안내도 더 이상 유효하지 않으므로 함께 초기화한다.
  function handleRoleChange(nextRole: 'student' | 'teacher') {
    setRole(nextRole);
    onClearRegistration();
  }

  const identifierField = (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {role === 'teacher' ? '선생님 고유 번호' : '학번'}
      </span>
      <input
        type={role === 'teacher' ? 'password' : 'text'}
        value={identifier}
        onChange={(event) => {
          setIdentifier(event.target.value);
          onClearRegistration();
        }}
        autoComplete={role === 'teacher' ? 'current-password' : 'username'}
        className="h-12 w-full rounded-md border border-slate-300 px-4 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      />
    </label>
  );

  const nameField = (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        이름
      </span>
      <input
        value={displayName}
        onChange={(event) => {
          setDisplayName(event.target.value);
          onClearRegistration();
        }}
        className="h-12 w-full rounded-md border border-slate-300 px-4 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      />
    </label>
  );

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-4 text-slate-900">
      <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpeg"
            alt="고색고등학교"
            className="h-12 w-12 shrink-0 object-contain"
          />
          <div>
            <p className="text-sm font-medium text-slate-500">야간자율학습</p>
            <h1 className="mt-1 text-2xl font-semibold">출석 관리 시스템</h1>
          </div>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 rounded-md border border-slate-300 p-1">
            <button
              type="button"
              onClick={() => handleRoleChange('student')}
              className={`h-10 rounded text-sm font-semibold transition ${
                role === 'student'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              학생
            </button>
            <button
              type="button"
              onClick={() => handleRoleChange('teacher')}
              className={`h-10 rounded text-sm font-semibold transition ${
                role === 'teacher'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              선생님
            </button>
          </div>

          {role === 'teacher' ? (
            <>
              {nameField}
              {identifierField}
            </>
          ) : (
            <>
              {identifierField}
              {nameField}
            </>
          )}
          <button
            type="submit"
            disabled={isBusy || (role === 'student' && !device)}
            className="h-12 w-full rounded-md bg-slate-900 px-4 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? '확인 중' : role === 'teacher' ? '로그인' : '학생 확인'}
          </button>
        </form>

        {pendingRegistration && role === 'student' && (
          <section className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-4">
            <p className="font-semibold text-sky-900">
              {pendingRegistration.access.studentName}
            </p>
            <p className="mt-1 text-sm text-sky-700">
              {pendingRegistration.access.deviceLabel}
            </p>
            <button
              type="button"
              onClick={() => void onRegisterDevice()}
              disabled={isBusy}
              className="mt-4 h-10 w-full rounded-md bg-sky-700 px-4 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              이 기기 등록하기
            </button>
          </section>
        )}

        {error && (
          <p className="mt-4 rounded-md bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
