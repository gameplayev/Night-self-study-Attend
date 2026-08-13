import {
  AttendanceRecord,
  getDailyPresence,
} from '../../lib/attendance';
import { AuthSession } from '../../services/appService';
import { DeviceIdentity } from '../../services/deviceService';
import { FeedbackMessage } from '../../types/ui';

export function StudentView({
  session,
  device,
  records,
  onSubmitAttendance,
  onOpenLocationGuide,
  isSubmitting,
  message,
}: {
  session: AuthSession;
  device: DeviceIdentity;
  records: AttendanceRecord[];
  onSubmitAttendance: () => Promise<void>;
  onOpenLocationGuide: () => void;
  isSubmitting: boolean;
  message: FeedbackMessage | null;
}) {
  // 학생 화면은 오늘 하루 기준 상태만 보면 충분하므로 과거 기록 전체 대신 일일 상태를 계산한다.
  const studentNumber = session.user.studentNumber ?? '';
  const currentPresence = getDailyPresence(studentNumber, records);
  const isCompleted = currentPresence === 'checked_out';

  return (
    <div>
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">학생 처리</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">
          {session.user.displayName}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{studentNumber}</p>

        <div className="mt-5 rounded-md bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">현재 기기</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {device.label}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onSubmitAttendance()}
          disabled={isSubmitting || isCompleted}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? '처리 중'
            : isCompleted
              ? '오늘 처리 완료'
              : currentPresence === 'present'
                ? '퇴실 처리'
                : '출석 처리'}
        </button>
        <button
          type="button"
          onClick={onOpenLocationGuide}
          className="mt-2 h-10 w-full rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          위치 권한 안내 보기
        </button>

        {message && (
          <p
            className={`mt-4 rounded-md px-4 py-3 text-sm font-medium ${
              message.tone === 'success'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            }`}
          >
            {message.text}
          </p>
        )}
      </section>
    </div>
  );
}
