import { useEffect, useMemo, useState } from 'react';
import {
  AttendanceRecord,
  Student,
  formatAttendanceDateLabel,
  formatKoreanDateTime,
  getAttendanceDateKey,
  getDateKeyDaysAgo,
  getDailyAttendanceResult,
  getDailyAttendanceSummary,
} from '../../lib/attendance';
import type { DailyAttendanceResult } from '../../lib/attendance';

function statusClassName(status: DailyAttendanceResult) {
  if (status === 'checked_out') return 'bg-amber-50 text-amber-700';
  if (status === 'present' || status === 'normal_attendance') {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (status === 'absent') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}

function statusLabel(status: DailyAttendanceResult) {
  if (status === 'checked_out') return '퇴실';
  if (status === 'present') return '출석중';
  if (status === 'normal_attendance') return '정상 출석';
  if (status === 'absent') return '결석';
  return '미출석';
}

export function DailyAttendanceSection({
  students,
  records,
  onManualAttendance,
  onDeleteAttendanceDate,
  onDeleteAllAttendanceRecords,
}: {
  students: Student[];
  records: AttendanceRecord[];
  onManualAttendance: (
    student: Student,
    action: 'present' | 'absent',
    dateKey: string,
  ) => Promise<void>;
  onDeleteAttendanceDate: (dateKey: string) => Promise<void>;
  onDeleteAllAttendanceRecords: () => Promise<void>;
}) {
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
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
  const recordCountByDate = useMemo(
    () =>
      new Map(
        recordsByDate.map(([dateKey, dailyRecords]) => [
          dateKey,
          dailyRecords.length,
        ]),
      ),
    [recordsByDate],
  );
  const selectableDateKeys = useMemo(() => {
    const dateKeys = recordsByDate.map(([dateKey]) => dateKey);
    return dateKeys.sort((left, right) => right.localeCompare(left));
  }, [recordsByDate]);
  const activeDateKey = selectedDateKey ?? selectableDateKeys[0] ?? getDateKeyDaysAgo(0);
  const activeDateStudentNumbers = useMemo(
    () =>
      new Set(
        (recordsByDate.find(([dateKey]) => dateKey === activeDateKey)?.[1] ?? [])
          .map((record) => record.studentNumber),
      ),
    [activeDateKey, recordsByDate],
  );
  // 출결기록 표는 DB에 저장된 이벤트가 있는 학생만 보여준다.
  // 저장 기록이 없는 학생까지 결석으로 계산해 보여주면 삭제 후에도 기록이 남은 것처럼 보이기 때문이다.
  const selectedDateRows = useMemo(
    () =>
      students
        .filter((student) => activeDateStudentNumbers.has(student.studentNumber))
        .map((student) => {
          const summary = getDailyAttendanceSummary(
            student.studentNumber,
            records,
            activeDateKey,
          );
          return {
            student,
            summary,
            status: getDailyAttendanceResult(summary, activeDateKey),
          };
        }),
    [activeDateKey, activeDateStudentNumbers, records, students],
  );
  const filteredDateRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return selectedDateRows;
    return selectedDateRows.filter(({ student }) =>
      `${student.seatNumber} ${student.studentNumber} ${student.name} ${student.grade}학년 ${student.classNumber}반`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, selectedDateRows]);

  useEffect(() => {
    if (selectedDateKey && selectableDateKeys.includes(selectedDateKey)) {
      return;
    }
    setSelectedDateKey(selectableDateKeys[0] ?? null);
  }, [selectableDateKeys, selectedDateKey]);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">출석 기록</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              {formatAttendanceDateLabel(activeDateKey)} 출결 기록
            </h2>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="좌석, 학번 또는 이름 검색"
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-72"
            />
            <button
              type="button"
              onClick={() => void onDeleteAllAttendanceRecords()}
              disabled={records.length === 0}
              className="h-10 rounded-md border border-rose-300 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              전체 삭제
            </button>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-[1220px] divide-y divide-slate-200 text-left text-sm">
            <colgroup>
              <col className="w-44" />
              <col className="w-24" />
              <col className="w-40" />
              <col className="w-32" />
              <col className="w-60" />
              <col className="w-60" />
              <col className="w-64" />
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
              {filteredDateRows.map(({ student, summary, status }) => (
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
                      className={`rounded px-2 py-1 text-xs font-semibold ${statusClassName(
                        status,
                      )}`}
                    >
                      {statusLabel(status)}
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
                        정상출석 처리
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void onManualAttendance(student, 'absent', activeDateKey)
                        }
                        className="h-8 rounded-md border border-rose-300 px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                      >
                        결석 처리
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDateRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-sm text-slate-500"
                  >
                    {students.length === 0
                      ? '등록된 학생이 없습니다.'
                      : query.trim()
                        ? '검색 결과가 없습니다.'
                        : '이 날짜에 저장된 출결기록이 없습니다.'}
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
          {selectableDateKeys.length === 0 && (
            <p className="rounded-md border border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              저장된 출결기록이 없습니다.
            </p>
          )}
          {selectableDateKeys.map((dateKey) => {
            const recordCount = recordCountByDate.get(dateKey) ?? 0;
            return (
              <div key={dateKey} className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDateKey(dateKey)}
                  className={`flex h-12 min-w-0 flex-1 items-center justify-between rounded-md border px-4 text-sm transition ${
                    activeDateKey === dateKey
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate font-semibold">
                    {formatAttendanceDateLabel(dateKey)} 출결 기록
                  </span>
                  <span className="ml-3 shrink-0 text-xs opacity-80">
                    {recordCount}건
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void onDeleteAttendanceDate(dateKey)}
                  disabled={recordCount === 0}
                  className="h-12 rounded-md border border-rose-300 px-3 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </section>
  );
}
