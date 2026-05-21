import { AttendanceRecord, formatKoreanDateTime } from '../../lib/attendance';

export function RecentRecords({ records }: { records: AttendanceRecord[] }) {
  return (
    <aside className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">최근 처리</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-900">기록</h2>
      <div className="mt-5 space-y-3">
        {records.length === 0 ? (
          <p className="rounded-md bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            아직 처리된 기록이 없습니다.
          </p>
        ) : (
          records.slice(0, 8).map((record) => (
            <article
              key={record.id}
              className="rounded-md border border-slate-200 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {record.studentName}
                  </p>
                  <p className="text-sm text-slate-500">
                    {record.studentNumber}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    record.action === 'check_in' || record.action === 'present'
                      ? 'bg-emerald-50 text-emerald-700'
                      : record.action === 'check_out'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {record.action === 'check_in' || record.action === 'present'
                    ? record.action === 'present'
                      ? '정상 출석'
                      : '출석'
                    : record.action === 'check_out'
                      ? '퇴실'
                      : '결석'}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {formatKoreanDateTime(record.timestamp)}
              </p>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}
