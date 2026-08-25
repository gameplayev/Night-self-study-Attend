import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { getDailyPresence } from '../../lib/attendance';
import type { AttendanceRecord, Student } from '../../lib/attendance';
import { SeatMapDialog } from './SeatMapDialog';

const student: Student = {
  id: 1,
  studentNumber: '10101',
  name: '홍길동',
  grade: 1,
  classNumber: 1,
  seatNumber: 1,
  deviceCount: 0,
  attendanceWeekdays: [1, 2, 3, 4, 5],
};

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function showModal(this: HTMLDialogElement) {
      this.open = true;
    },
  });
});

afterEach(() => jest.useRealTimers());

test('open seat map updates a student status after the next DB refresh', async () => {
  jest.useFakeTimers();
  let refreshCount = 0;
  const freshRecords: AttendanceRecord[] = [
    {
      id: 'fresh-check-in',
      studentNumber: student.studentNumber,
      studentName: student.name,
      action: 'check_in',
      timestamp: new Date().toISOString(),
      deviceId: 'student-device',
      deviceLabel: '학생 기기',
    },
  ];

  function LiveSeatMap() {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const presenceMap = new Map([
      [student.studentNumber, getDailyPresence(student.studentNumber, records)],
    ]);
    return (
      <SeatMapDialog
        students={[student]}
        presenceMap={presenceMap}
        onRefreshAttendance={async () => {
          refreshCount += 1;
          if (refreshCount === 2) setRecords(freshRecords);
        }}
        onClose={jest.fn()}
      />
    );
  }

  await act(async () => render(<LiveSeatMap />));
  expect(screen.getByLabelText('1번 좌석, 홍길동, 미출석')).toBeVisible();

  await act(async () => jest.advanceTimersByTimeAsync(10_000));

  expect(screen.getByLabelText('1번 좌석, 홍길동, 출석중')).toBeVisible();
});
