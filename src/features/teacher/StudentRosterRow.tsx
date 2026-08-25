import {
  DEFAULT_ATTENDANCE_WEEKDAYS,
  getTodayDateKey,
  isStudentScheduledOnDate,
} from '../../lib/attendance';
import type {
  AttendanceWeekday,
  DailyPresence,
  Student,
} from '../../lib/attendance';
import {
  formatParsedStudentClass,
  normalizeStudentNumberInput,
} from '../../lib/students';
import type { UpdateStudentInput } from '../../services/appService';
import { StudentRosterActions } from './StudentRosterActions';

export type StudentRosterEditForm = {
  readonly studentNumber: string;
  readonly name: string;
  readonly seatNumber: string;
  readonly newPin: string;
  readonly attendanceWeekdays: readonly AttendanceWeekday[];
};

const WEEKDAY_LABELS: Record<AttendanceWeekday, string> = {
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
};

export type StudentRosterRowProps = {
  readonly student: Student;
  readonly status: DailyPresence;
  readonly absentCount: number;
  readonly onCorrectAbsences: (student: Student) => void;
  readonly editStudent: StudentRosterEditForm | null;
  readonly onStartEditing: (student: Student) => void;
  readonly onEditStudentChange: (editStudent: StudentRosterEditForm) => void;
  readonly onCancelEditing: () => void;
  readonly onDeleteStudent: (student: Student) => Promise<void>;
  readonly onManualAttendance: (
    student: Student,
    action: 'check_in' | 'check_out' | 'absent',
  ) => Promise<void>;
  readonly onResetDevices: (student: Student) => Promise<void>;
  readonly onUpdateStudent: (
    student: Student,
    input: UpdateStudentInput,
  ) => Promise<void>;
};

export function StudentRosterRow({
  student,
  status,
  absentCount,
  onCorrectAbsences,
  editStudent,
  onStartEditing,
  onEditStudentChange,
  onCancelEditing,
  onDeleteStudent,
  onManualAttendance,
  onResetDevices,
  onUpdateStudent,
}: StudentRosterRowProps) {
  const isEditing = editStudent !== null;
  const parsedClassLabel = isEditing
    ? formatParsedStudentClass(editStudent.studentNumber)
    : null;
  const canMarkAbsentToday = isStudentScheduledOnDate(
    getTodayDateKey(),
    student.attendanceWeekdays,
  );

  function toggleAttendanceWeekday(
    weekday: AttendanceWeekday,
    checked: boolean,
  ) {
    if (!editStudent) return;
    const attendanceWeekdays = checked
      ? [...editStudent.attendanceWeekdays, weekday].sort((left, right) => left - right)
      : editStudent.attendanceWeekdays.filter((item) => item !== weekday);
    onEditStudentChange({ ...editStudent, attendanceWeekdays });
  }

  async function saveStudent() {
    if (!editStudent || editStudent.attendanceWeekdays.length === 0) return;
    const { newPin, ...studentFields } = editStudent;
    await onUpdateStudent(student, {
      ...studentFields,
      seatNumber: Number(editStudent.seatNumber),
      ...(newPin ? { newPin } : {}),
    });
    onCancelEditing();
  }

  return (
    <tr>
      <td className="whitespace-nowrap px-5 py-3 text-slate-600">
        {isEditing ? (
          <input
            value={editStudent.seatNumber}
            onChange={(event) =>
              onEditStudentChange({
                ...editStudent,
                seatNumber: event.target.value.replace(/\D/g, ''),
              })
            }
            inputMode="numeric"
            className="h-8 w-16 rounded-md border border-slate-300 px-2 text-sm"
          />
        ) : (
          student.seatNumber
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-slate-600">
        {isEditing ? (
          <input
            value={editStudent.studentNumber}
            onChange={(event) =>
              onEditStudentChange({
                ...editStudent,
                studentNumber: normalizeStudentNumberInput(event.target.value),
              })
            }
            inputMode="numeric"
            maxLength={5}
            pattern="[0-9]{5}"
            className="h-8 w-24 rounded-md border border-slate-300 px-2 text-sm"
          />
        ) : (
          student.studentNumber
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-900">
        {isEditing ? (
          <input
            value={editStudent.name}
            onChange={(event) =>
              onEditStudentChange({ ...editStudent, name: event.target.value })
            }
            className="h-8 w-24 rounded-md border border-slate-300 px-2 text-sm"
          />
        ) : (
          student.name
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-slate-600">
        {isEditing ? (
          parsedClassLabel ?? '학번 확인 필요'
        ) : (
          <>
            {student.grade}학년 {student.classNumber}반
          </>
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-slate-600">
        {student.deviceCount}/2
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-slate-600">
        <button
          type="button"
          onClick={() => onCorrectAbsences(student)}
          className="h-10 rounded-md border border-rose-300 px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
          aria-label={`${student.name} 결석 기록 수정`}
        >
          {absentCount}회
        </button>
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-slate-600">
        {isEditing ? (
          <div>
            <fieldset className="flex gap-2" aria-label="출석 요일">
              {DEFAULT_ATTENDANCE_WEEKDAYS.map((weekday) => (
                <label
                  key={weekday}
                  className="flex items-center gap-1 text-xs font-medium text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={editStudent.attendanceWeekdays.includes(weekday)}
                    onChange={(event) =>
                      toggleAttendanceWeekday(weekday, event.target.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
                  />
                  <span>{WEEKDAY_LABELS[weekday]}</span>
                </label>
              ))}
            </fieldset>
            {editStudent.attendanceWeekdays.length === 0 && (
              <p className="mt-1 text-xs font-medium text-rose-700" role="alert">
                출석 요일을 하나 이상 선택해 주세요.
              </p>
            )}
          </div>
        ) : (
          student.attendanceWeekdays
            .map((weekday) => WEEKDAY_LABELS[weekday])
            .join('·')
        )}
      </td>
      <td className="whitespace-nowrap px-5 py-3">
        <span
          className={`rounded px-2 py-1 text-xs font-semibold ${
            status === 'present'
              ? 'bg-emerald-50 text-emerald-700'
              : status === 'checked_out'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-slate-100 text-slate-600'
          }`}
        >
          {status === 'present'
            ? '출석중'
            : status === 'checked_out'
              ? '퇴실'
              : '미출석'}
        </span>
        {isEditing ? (
          <label className="mt-2 block">
            <span className="sr-only">{student.name} 새 PIN 4자리</span>
            <input
              type="password"
              value={editStudent.newPin}
              onChange={(event) =>
                onEditStudentChange({
                  ...editStudent,
                  newPin: event.target.value.replace(/[^0-9]/g, '').slice(0, 4),
                })
              }
              inputMode="numeric"
              minLength={4}
              maxLength={4}
              pattern="[0-9]{4}"
              autoComplete="new-password"
              placeholder="PIN 재설정 (선택)"
              className="h-8 w-28 rounded-md border border-slate-300 px-2 text-sm"
            />
          </label>
        ) : null}
      </td>
      <StudentRosterActions
        student={student}
        isEditing={isEditing}
        canSave={editStudent?.attendanceWeekdays.length !== 0}
        canMarkAbsentToday={canMarkAbsentToday}
        onStartEditing={() => onStartEditing(student)}
        onSave={saveStudent}
        onCancelEditing={onCancelEditing}
        onDeleteStudent={onDeleteStudent}
        onManualAttendance={onManualAttendance}
        onResetDevices={onResetDevices}
      />
    </tr>
  );
}
