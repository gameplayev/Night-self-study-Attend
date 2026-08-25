import type { DailyPresence, Student } from '../../lib/attendance';
import type { UpdateStudentInput } from '../../services/appService';
import { StudentRosterRow } from './StudentRosterRow';

export function StudentRosterSection({
  students,
  presenceMap,
  query,
  onQueryChange,
  onDeleteStudent,
  absentCountMap,
  onManualAttendance,
  onResetDevices,
  onUpdateStudent,
}: {
  students: Student[];
  presenceMap: Map<string, DailyPresence>;
  absentCountMap: Map<string, number>;
  query: string;
  onQueryChange: (query: string) => void;
  onDeleteStudent: (student: Student) => Promise<void>;
  onManualAttendance: (
    student: Student,
    action: 'check_in' | 'check_out' | 'absent',
  ) => Promise<void>;
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

  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">교사 관리</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            학생 명단
          </h2>
        </div>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="학번 또는 이름 검색"
          className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-72"
        />
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
