import { useState } from 'react';
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

type EditStudentForm = {
  readonly studentNumber: string;
  readonly name: string;
  readonly seatNumber: string;
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
  onDeleteStudent,
  onManualAttendance,
  onResetDevices,
  onUpdateStudent,
}: StudentRosterRowProps) {
  const [editStudent, setEditStudent] = useState<EditStudentForm | null>(null);
  const isEditing = editStudent !== null;
  const parsedClassLabel = isEditing
    ? formatParsedStudentClass(editStudent.studentNumber)
    : null;
  const canMarkAbsentToday = isStudentScheduledOnDate(
    getTodayDateKey(),
    student.attendanceWeekdays,
  );

  function startEditing() {
    setEditStudent({
      studentNumber: student.studentNumber,
      name: student.name,
      seatNumber: String(student.seatNumber),
      attendanceWeekdays: [...student.attendanceWeekdays],
    });
  }

  function toggleAttendanceWeekday(
    weekday: AttendanceWeekday,
    checked: boolean,
  ) {
    setEditStudent((value) => {
      if (!value) return value;
      const attendanceWeekdays = checked
        ? [...value.attendanceWeekdays, weekday].sort((left, right) => left - right)
        : value.attendanceWeekdays.filter((item) => item !== weekday);
      return { ...value, attendanceWeekdays };
    });
  }

  async function saveStudent() {
    if (!editStudent || editStudent.attendanceWeekdays.length === 0) return;
    await onUpdateStudent(student, {
      ...editStudent,
      seatNumber: Number(editStudent.seatNumber),
    });
    setEditStudent(null);
  }

  return (
    <tr>
      <td className="whitespace-nowrap px-5 py-3 text-slate-600">
        {isEditing ? (
          <input
            value={editStudent.seatNumber}
            onChange={(event) =>
              setEditStudent((value) =>
                value
                  ? {
                      ...value,
                      seatNumber: event.target.value.replace(/\D/g, ''),
                    }
                  : value,
              )
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
              setEditStudent((value) =>
                value
                  ? {
                      ...value,
                      studentNumber: normalizeStudentNumberInput(event.target.value),
                    }
                  : value,
              )
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
              setEditStudent((value) =>
                value ? { ...value, name: event.target.value } : value,
              )
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
        {absentCount}회
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
      </td>
      <td className="px-5 py-3">
        <div className="flex flex-wrap gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={() => void saveStudent()}
                disabled={editStudent.attendanceWeekdays.length === 0}
                className="h-8 rounded-md border border-sky-300 px-3 text-xs font-medium text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setEditStudent(null)}
                className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEditing}
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
    </tr>
  );
}
