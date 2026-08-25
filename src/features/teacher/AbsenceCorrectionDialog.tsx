import { useEffect, useRef } from 'react';
import {
  getDailyAttendanceResult,
  getDailyAttendanceSummary,
  isStudentScheduledOnDate,
} from '../../lib/attendance';
import type { AttendanceRecord, Student } from '../../lib/attendance';

export type AbsenceCorrectionDialogProps = {
  readonly student: Student;
  readonly records: AttendanceRecord[];
  readonly dateKeys: readonly string[];
  readonly onCorrect: (
    student: Student,
    action: 'present' | 'absent',
    dateKey: string,
  ) => Promise<void>;
  readonly onClose: () => void;
};

function statusLabel(status: ReturnType<typeof getDailyAttendanceResult>) {
  if (status === 'normal_attendance') return '정상 출석';
  if (status === 'absent') return '결석';
  if (status === 'checked_out') return '퇴실';
  if (status === 'present') return '출석중';
  return status === 'not_scheduled' ? '비대상' : '미출석';
}

export function AbsenceCorrectionDialog({
  student,
  records,
  dateKeys,
  onCorrect,
  onClose,
}: AbsenceCorrectionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scheduledDateKeys = [...dateKeys]
    .filter((dateKey) =>
      isStudentScheduledOnDate(dateKey, student.attendanceWeekdays),
    )
    .sort((left, right) => right.localeCompare(left));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="absence-correction-title"
      onCancel={onClose}
      className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-md border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="absence-correction-title" className="text-xl font-semibold">
              {student.name} 결석 기록 수정
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              날짜별 출결 상태를 정정합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-10 shrink-0 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        <div className="mt-5 max-h-96 space-y-3 overflow-y-auto">
          {scheduledDateKeys.map((dateKey) => {
            const status = getDailyAttendanceResult(
              getDailyAttendanceSummary(student.studentNumber, records, dateKey),
              dateKey,
            );
            return (
              <div
                key={dateKey}
                className="rounded-md border border-slate-200 p-4"
              >
                <p className="font-medium">{dateKey}</p>
                <p className="mt-1 text-sm text-slate-600">
                  현재 상태: {statusLabel(status)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void onCorrect(student, 'present', dateKey)}
                    className="h-10 rounded-md border border-emerald-300 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                    aria-label={`${dateKey} 정상출석으로 수정`}
                  >
                    정상출석
                  </button>
                  <button
                    type="button"
                    onClick={() => void onCorrect(student, 'absent', dateKey)}
                    className="h-10 rounded-md border border-rose-300 px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                    aria-label={`${dateKey} 결석으로 수정`}
                  >
                    결석
                  </button>
                </div>
              </div>
            );
          })}
          {scheduledDateKeys.length === 0 && (
            <p className="rounded-md border border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              정정할 과거 출결 날짜가 없습니다.
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}
