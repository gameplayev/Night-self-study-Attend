import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AttendanceRecord, Student } from '../../lib/attendance';
import type { Teacher } from '../../services/appService';
import { TeacherView } from './TeacherView';

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
const teachers: Teacher[] = [{ id: 1, name: '김교사' }];

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function showModal(this: HTMLDialogElement) {
      this.open = true;
    },
  });
});

test('teacher opens the seat map and sees the current student presence', async () => {
  const presentRecords: AttendanceRecord[] = [
    {
      id: 'today-check-in',
      studentNumber: student.studentNumber,
      studentName: student.name,
      action: 'check_in',
      timestamp: new Date().toISOString(),
      deviceId: 'student-device',
      deviceLabel: '학생 기기',
    },
  ];

  render(
    <TeacherView
      teachers={teachers}
      students={[student]}
      records={presentRecords}
      onRefreshAttendance={jest.fn().mockResolvedValue(undefined)}
      onAddTeacher={jest.fn()}
      onAddStudent={jest.fn()}
      onDeleteStudent={jest.fn()}
      onManualAttendance={jest.fn()}
      onDeleteAttendanceDate={jest.fn()}
      onDeleteAllAttendanceRecords={jest.fn()}
      onResetDevices={jest.fn()}
      onUpdateStudent={jest.fn()}
      onUpdateTeacher={jest.fn()}
      message={null}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '좌석 현황' }));
  const dialog = screen.getByRole('dialog', { name: '야자 좌석 현황' });
  expect(within(dialog).getAllByRole('listitem')).toHaveLength(81);
  expect(
    within(dialog).getByLabelText('1번 좌석, 홍길동, 출석중'),
  ).toBeVisible();
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: '새로고침' }),
    ).toBeEnabled(),
  );
});
