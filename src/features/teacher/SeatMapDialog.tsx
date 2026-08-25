import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { DailyPresence, Student } from '../../lib/attendance';

type SeatState = 'present' | 'checked_out' | 'not_checked_in' | 'unassigned';

type SeatCellProps = {
  readonly number: number;
  readonly student: Student | undefined;
  readonly presence: DailyPresence | undefined;
};

type SeatIsland = {
  readonly label: string;
  readonly top: number;
  readonly bottom: number;
  readonly left: readonly number[];
  readonly right: readonly number[];
};

const TOP_ROW = [16, 17, 18, 19, 20, 21, 22] as const;
const RIGHT_ROW = [23, 24, 25, 26, 27, 28, 29] as const;
const LEFT_UPPER_ROW = [9, 10, 11, 12, 13, 14, 15] as const;
const LEFT_LOWER_ROW = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const UPPER_DESKS = [
  [71, 73, 75, 77, 79, 81],
  [70, 72, 74, 76, 78, 80],
] as const;
const MIDDLE_DESKS = [
  [59, 61, 63, 65, 67, 69],
  [58, 60, 62, 64, 66, 68],
] as const;
const ISLANDS: readonly SeatIsland[] = [
  {
    label: '중앙 좌석',
    top: 37,
    bottom: 30,
    left: [36, 35, 34, 33, 32, 31],
    right: [38, 39, 40, 41, 42, 43],
  },
  {
    label: '지도교사 앞 좌석',
    top: 51,
    bottom: 44,
    left: [50, 49, 48, 47, 46, 45],
    right: [52, 53, 54, 55, 56, 57],
  },
] as const;

function seatState(student: Student | undefined, presence: DailyPresence | undefined): SeatState {
  if (!student) return 'unassigned';
  if (presence === 'present') return 'present';
  if (presence === 'checked_out') return 'checked_out';
  return 'not_checked_in';
}

function seatLabel(state: SeatState) {
  switch (state) {
    case 'present':
      return '출석중';
    case 'checked_out':
      return '퇴실';
    case 'not_checked_in':
      return '미출석';
    case 'unassigned':
      return '미배정';
  }
}

function seatTone(state: SeatState) {
  switch (state) {
    case 'present':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800';
    case 'checked_out':
      return 'border-amber-300 bg-amber-50 text-amber-800';
    case 'not_checked_in':
      return 'border-slate-300 bg-white text-slate-700';
    case 'unassigned':
      return 'border-dashed border-slate-200 bg-slate-50 text-slate-400';
  }
}

function SeatCell({ number, student, presence }: SeatCellProps) {
  const state = seatState(student, presence);
  const label = seatLabel(state);
  return (
    <div
      role="listitem"
      aria-label={`${number}번 좌석, ${student?.name ?? '미배정'}, ${label}`}
      className={`flex h-14 min-w-14 flex-col justify-between rounded-md border p-2 text-left ${seatTone(state)}`}
    >
      <span className="text-xs font-semibold">{number}</span>
      <span className="truncate text-xs font-medium">{student?.name ?? label}</span>
    </div>
  );
}

export type SeatMapDialogProps = {
  readonly students: readonly Student[];
  readonly presenceMap: ReadonlyMap<string, DailyPresence>;
  readonly onRefreshAttendance: () => Promise<void>;
  readonly onClose: () => void;
};

export function SeatMapDialog({
  students,
  presenceMap,
  onRefreshAttendance,
  onClose,
}: SeatMapDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const refreshActionRef = useRef(onRefreshAttendance);
  const refreshingRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const studentBySeat = useMemo(
    () => new Map(students.map((student) => [student.seatNumber, student])),
    [students],
  );

  useEffect(() => {
    refreshActionRef.current = onRefreshAttendance;
  }, [onRefreshAttendance]);

  const refreshPresence = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await refreshActionRef.current();
      setRefreshError(null);
    } catch (error) {
      setRefreshError(
        error instanceof Error ? error.message : '출석 현황을 갱신하지 못했습니다.',
      );
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    void refreshPresence();
    const intervalId = window.setInterval(() => void refreshPresence(), 10_000);
    return () => window.clearInterval(intervalId);
  }, [refreshPresence]);

  function closeDialog() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    onClose();
  }

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    closeDialog();
  }

  function renderSeat(number: number) {
    const student = studentBySeat.get(number);
    return (
      <SeatCell
        key={number}
        number={number}
        student={student}
        presence={student ? presenceMap.get(student.studentNumber) : undefined}
      />
    );
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="seat-map-title"
      onCancel={handleCancel}
      className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-screen-2xl overflow-y-auto rounded-md border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="seat-map-title" className="text-xl font-semibold">
              야자 좌석 현황
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              오늘 출석 기록을 지정석 기준으로 표시합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshPresence()}
              disabled={isRefreshing}
              className="h-10 rounded-md border border-sky-300 px-3 text-sm font-medium text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRefreshing ? '갱신 중' : '새로고침'}
            </button>
            <button
              type="button"
              onClick={closeDialog}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
        </div>

        <p className={`mt-3 text-xs ${refreshError ? 'font-medium text-rose-700' : 'text-slate-500'}`} role={refreshError ? 'alert' : undefined}>
          {refreshError ?? '10초마다 DB 출석 기록을 자동으로 갱신합니다.'}
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-800">출석중</span>
          <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">퇴실</span>
          <span className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700">미출석</span>
          <span className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-1 text-slate-500">미배정</span>
        </div>

        <div className="mt-5 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="min-w-[980px] space-y-4" role="list" aria-label="야자실 좌석 배치">
            <div className="ml-auto grid w-[620px] grid-cols-7 gap-2">
              {TOP_ROW.map(renderSeat)}
            </div>

            <div className="grid grid-cols-[240px_1fr_72px] gap-6">
              <div className="flex min-h-64 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-500">
                도서 공간
              </div>
              <div className="space-y-4">
                {UPPER_DESKS.map((row) => (
                  <div key={row[0]} className="grid grid-cols-6 gap-4">{row.map(renderSeat)}</div>
                ))}
                {MIDDLE_DESKS.map((row) => (
                  <div key={row[0]} className="grid grid-cols-6 gap-4">{row.map(renderSeat)}</div>
                ))}
              </div>
              <div className="grid gap-2">{RIGHT_ROW.map(renderSeat)}</div>
            </div>

            <div className="grid grid-cols-[1fr_280px_280px] items-end gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-7 gap-2">{LEFT_UPPER_ROW.map(renderSeat)}</div>
                <div className="grid grid-cols-8 gap-2">{LEFT_LOWER_ROW.map(renderSeat)}</div>
              </div>
              {ISLANDS.map((island) => (
                <section key={island.label} aria-label={island.label} className="rounded-md border border-slate-300 bg-white p-3">
                  <div className="mx-auto w-14">{renderSeat(island.top)}</div>
                  <div className="my-2 grid grid-cols-2 gap-x-16 gap-y-2">
                    {island.left.flatMap((seat, index) => [renderSeat(seat), renderSeat(island.right[index])])}
                  </div>
                  <div className="mx-auto w-14">{renderSeat(island.bottom)}</div>
                </section>
              ))}
            </div>

            <div className="ml-auto w-[580px] rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-center text-sm font-medium text-sky-700">
              지도교사 자리
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
