import { render, screen } from '@testing-library/react';
import type { AttendanceRecord, Student } from '../../lib/attendance';
import { DailyAttendanceSection } from './DailyAttendanceSection';

test('weekend attendance record is shown as not scheduled without absence action', () => {
  const students: Student[] = [
    {
      id: 1,
      studentNumber: '10101',
      name: '홍길동',
      grade: 1,
      classNumber: 1,
      seatNumber: 1,
      deviceCount: 0,
      attendanceWeekdays: [1, 2, 3, 4, 5],
    },
  ];
  const records: AttendanceRecord[] = [
    {
      id: 'saturday-absence',
      studentNumber: '10101',
      studentName: '홍길동',
      action: 'absent',
      timestamp: '2026-08-08T12:00:00.000Z',
      deviceId: 'teacher',
      deviceLabel: '교사 처리',
    },
  ];

  render(
    <DailyAttendanceSection
      students={students}
      records={records}
      onManualAttendance={jest.fn()}
      onDeleteAttendanceDate={jest.fn()}
      onDeleteAllAttendanceRecords={jest.fn()}
    />,
  );

  expect(screen.getByText('비대상')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: '결석 처리' }),
  ).not.toBeInTheDocument();
});
