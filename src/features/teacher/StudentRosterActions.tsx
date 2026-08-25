import type { Student } from '../../lib/attendance';

type StudentRosterActionsProps = {
  readonly student: Student;
  readonly isEditing: boolean;
  readonly canSave: boolean;
  readonly canMarkAbsentToday: boolean;
  readonly onStartEditing: () => void;
  readonly onSave: () => Promise<void>;
  readonly onCancelEditing: () => void;
  readonly onDeleteStudent: (student: Student) => Promise<void>;
  readonly onManualAttendance: (
    student: Student,
    action: 'check_in' | 'check_out' | 'absent',
  ) => Promise<void>;
  readonly onResetDevices: (student: Student) => Promise<void>;
};

export function StudentRosterActions({
  student,
  isEditing,
  canSave,
  canMarkAbsentToday,
  onStartEditing,
  onSave,
  onCancelEditing,
  onDeleteStudent,
  onManualAttendance,
  onResetDevices,
}: StudentRosterActionsProps) {
  return (
    <td className="px-5 py-3">
      <div className="flex flex-wrap gap-2">
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!canSave}
              className="h-8 rounded-md border border-sky-300 px-3 text-xs font-medium text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              저장
            </button>
            <button
              type="button"
              onClick={onCancelEditing}
              className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              취소
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onStartEditing}
            className="h-8 rounded-md border border-sky-300 px-3 text-xs font-medium text-sky-700 transition hover:bg-sky-50"
          >
            수정
          </button>
        )}
        <button
          type="button"
          onClick={() => void onManualAttendance(student, 'check_in')}
          className="h-8 rounded-md border border-emerald-300 px-3 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
        >
          출석
        </button>
        <button
          type="button"
          onClick={() => void onManualAttendance(student, 'check_out')}
          className="h-8 rounded-md border border-amber-300 px-3 text-xs font-medium text-amber-700 transition hover:bg-amber-50"
        >
          퇴실
        </button>
        {canMarkAbsentToday && (
          <button
            type="button"
            onClick={() => void onManualAttendance(student, 'absent')}
            className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            미출석
          </button>
        )}
        <button
          type="button"
          onClick={() => void onResetDevices(student)}
          disabled={student.deviceCount === 0}
          className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          기기 초기화
        </button>
        <button
          type="button"
          onClick={() => void onDeleteStudent(student)}
          className="h-8 rounded-md border border-rose-300 px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
        >
          삭제
        </button>
      </div>
    </td>
  );
}
