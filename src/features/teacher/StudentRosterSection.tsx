import { useState } from 'react';
import type { DailyPresence, Student } from '../../lib/attendance';
import type { UpdateStudentInput } from '../../services/appService';
import {
  StudentRosterRow,
} from './StudentRosterRow';
import type { StudentRosterEditForm } from './StudentRosterRow';

export function StudentRosterSection({
  students,
  presenceMap,
  query,
  onQueryChange,
  onOpenSeatMap,
  onDeleteStudent,
  absentCountMap,
  onManualAttendance,
  onCorrectAbsences,
  onResetDevices,
  onUpdateStudent,
}: {
  students: Student[];
  presenceMap: Map<string, DailyPresence>;
  absentCountMap: Map<string, number>;
  query: string;
  onQueryChange: (query: string) => void;
  onOpenSeatMap: () => void;
  onDeleteStudent: (student: Student) => Promise<void>;
  onManualAttendance: (
    student: Student,
    action: 'check_in' | 'check_out' | 'absent',
  ) => Promise<void>;
  onCorrectAbsences: (student: Student) => void;
  onResetDevices: (student: Student) => Promise<void>;
  onUpdateStudent: (
    student: Student,
    input: UpdateStudentInput,
  ) => Promise<void>;
}) {
  // 검색어는 학번과 이름을 함께 대상으로 삼아 빠른 명단 탐색을 지원한다.
  const filteredStudents = students.filter((student) =>
    `${student.seatNumber} ${student.studentNumber} ${student.name}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [editStudent, setEditStudent] = useState<StudentRosterEditForm | null>(
    null,
  );

  function startEditing(student: Student) {
    setEditingStudentId(student.id);
    setEditStudent({
      studentNumber: student.studentNumber,
      name: student.name,
      seatNumber: String(student.seatNumber),
      newPin: '',
      attendanceWeekdays: [...student.attendanceWeekdays],
    });
  }

  function cancelEditing() {
    setEditingStudentId(null);
    setEditStudent(null);
  }

  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">교사 관리</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            학생 명단
          </h2>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={onOpenSeatMap}
            className="h-10 shrink-0 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-100"
          >
            좌석 현황
          </button>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="학번 또는 이름 검색"
            aria-label="학번 또는 이름 검색"
            className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-72 sm:flex-none"
          />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-[1480px] divide-y divide-slate-200 text-left text-sm">
          <colgroup>
            <col className="w-24" />
            <col className="w-40" />
            <col className="w-32" />
            <col className="w-36" />
            <col className="w-40" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-32" />
            <col className="w-[560px]" />
          </colgroup>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="whitespace-nowrap px-5 py-3 font-medium">좌석</th>
              <th className="whitespace-nowrap px-5 py-3 font-medium">학번</th>
              <th className="whitespace-nowrap px-5 py-3 font-medium">이름</th>
              <th className="whitespace-nowrap px-5 py-3 font-medium">학급</th>
              <th className="whitespace-nowrap px-5 py-3 font-medium">기기</th>
              <th className="whitespace-nowrap px-5 py-3 font-medium">결석</th>
              <th className="whitespace-nowrap px-5 py-3 font-medium">출석 요일</th>
              <th className="whitespace-nowrap px-5 py-3 font-medium">상태</th>
              <th className="whitespace-nowrap px-5 py-3 font-medium">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {filteredStudents.map((student) => (
              <StudentRosterRow
                key={student.id}
                student={student}
                status={presenceMap.get(student.studentNumber) ?? null}
                absentCount={absentCountMap.get(student.studentNumber) ?? 0}
                onCorrectAbsences={onCorrectAbsences}
                editStudent={
                  editingStudentId === student.id ? editStudent : null
                }
                onStartEditing={startEditing}
                onEditStudentChange={(value) => setEditStudent(value)}
                onCancelEditing={cancelEditing}
                onDeleteStudent={onDeleteStudent}
                onManualAttendance={onManualAttendance}
                onResetDevices={onResetDevices}
                onUpdateStudent={onUpdateStudent}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
