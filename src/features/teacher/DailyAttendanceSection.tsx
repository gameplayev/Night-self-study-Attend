import { useEffect, useMemo, useState } from 'react';
import {
  AttendanceRecord,
  Student,
  formatAttendanceDateLabel,
  formatKoreanDateTime,
  getAttendanceDateKey,
  getDateKeyDaysAgo,
  getDailyAttendanceSummary,
} from '../../lib/attendance';

export function DailyAttendanceSection({
  students,
  records,
  onManualAttendance,
}: {
  students: Student[];
  records: AttendanceRecord[];
  onManualAttendance: (
    student: Student,
    action: 'present' | 'absent',
    dateKey: string,
  ) => Promise<void>;
}) {
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  // 기록 이벤트를 날짜별로 묶어 오른쪽 날짜 선택 목록과 왼쪽 일일 표가 같은 기준을 공유하게 한다.
  const recordsByDate = useMemo(() => {
    const grouped = new Map<string, AttendanceRecord[]>();
    records.forEach((record) => {
      const dateKey = getAttendanceDateKey(record.timestamp);
      grouped.set(dateKey, [...(grouped.get(dateKey) ?? []), record]);
    });
    return [...grouped.entries()].sort(([left], [right]) =>
      right.localeCompare(left),
    );
  }, [records]);
  const selectableDateKeys = useMemo(() => {
    const dateKeys = new Set(recordsByDate.map(([dateKey]) => dateKey));
    dateKeys.add(getDateKeyDaysAgo(0));
    dateKeys.add(getDateKeyDaysAgo(1));
    return [...dateKeys].sort((left, right) => right.localeCompare(left));
  }, [recordsByDate]);
  const activeDateKey = selectedDateKey ?? getDateKeyDaysAgo(0);
  // 실제 표는 모든 학생을 기준으로 만들기 때문에 기록이 없는 학생도 미출석으로 남는다.
  const selectedDateRows = useMemo(
    () =>
      students.map((student) => ({
        student,
        summary: getDailyAttendanceSummary(
          student.studentNumber,
          records,
          activeDateKey,
        ),
      })),
    [activeDateKey, records, students],
  );

  useEffect(() => {
    if (selectedDateKey && selectableDateKeys.includes(selectedDateKey)) {
      return;
    }
    setSelectedDateKey(getDateKeyDaysAgo(0));
  }, [selectableDateKeys, selectedDateKey]);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">출석 기록</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">
          {formatAttendanceDateLabel(activeDateKey)} 출결 기록
        </h2>
        <div className="mt-5 overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-[1120px] divide-y divide-slate-200 text-left text-sm">
            <colgroup>
              <col className="w-44" />
              <col className="w-24" />
              <col className="w-40" />
              <col className="w-32" />
              <col className="w-64" />
              <col className="w-64" />
              <col className="w-36" />
            </colgroup>
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="whitespace-nowrap px-5 py-3 font-medium">학생</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">좌석</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">학급</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">상태</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">
                  출석 시각
                </th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">
                  퇴실 시각
                </th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {selectedDateRows.map(({ student, summary }) => (
                <tr key={student.id}>
                  <td className="whitespace-nowrap px-5 py-3">
                    <p className="font-medium text-slate-900">{student.name}</p>
                    <p className="text-xs text-slate-500">
                      {student.studentNumber}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                    {student.seatNumber}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                    {student.grade}학년 {student.classNumber}반
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-semibold ${
                        summary.status === 'checked_out'
                          ? 'bg-amber-50 text-amber-700'
                          : summary.status === 'present'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {summary.status === 'checked_out'
                        ? '퇴실'
                        : summary.status === 'present'
                          ? '출석 중'
                          : '미출석'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                    {summary.checkInAt
                      ? formatKoreanDateTime(summary.checkInAt)
                      : '-'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                    {summary.checkOutAt
                      ? formatKoreanDateTime(summary.checkOutAt)
                      : '-'}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void onManualAttendance(
                            student,
                            'present',
                            activeDateKey,
                          )
                        }
                        className="h-8 rounded-md border border-emerald-300 px-3 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        출석
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void onManualAttendance(student, 'absent', activeDateKey)
                        }
                        className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        미출석
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {selectedDateRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-sm text-slate-500"
                  >
                    등록된 학생이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">날짜별 보기</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">
          출결 기록
        </h2>
        <div className="mt-5 space-y-2">
          {selectableDateKeys.map((dateKey) => (
            <button
              key={dateKey}
              type="button"
              onClick={() => setSelectedDateKey(dateKey)}
              className={`flex h-12 w-full items-center rounded-md border px-4 text-sm transition ${
                activeDateKey === dateKey
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="font-semibold">
                {formatAttendanceDateLabel(dateKey)} 출결 기록
              </span>
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}
