import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AttendanceRecord, Student } from '../../lib/attendance';
import type { Teacher } from '../../services/appService';
import { TeacherView } from './TeacherView';

const dialogPrototype = HTMLDialogElement.prototype;
const originalShowModal = Object.getOwnPropertyDescriptor(
  dialogPrototype,
  'showModal',
);

beforeAll(() => {
  if (originalShowModal) return;
  Object.defineProperty(dialogPrototype, 'showModal', {
    configurable: true,
    value: function showModal(this: HTMLDialogElement) {
      this.open = true;
    },
  });
});

afterAll(() => {
  if (originalShowModal) return;
  Reflect.deleteProperty(dialogPrototype, 'showModal');
});

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

const teachers: Teacher[] = [{ id: 1, name: '김교사' }];

const records: AttendanceRecord[] = [
  {
    id: 'monday-absence',
    studentNumber: '10101',
    studentName: '홍길동',
    action: 'absent',
    timestamp: '2026-08-03T12:00:00.000Z',
    deviceId: 'teacher',
    deviceLabel: '교사 처리',
  },
];

test('teacher corrects the dated record behind a student absence total', () => {
  const onManualAttendance = jest.fn().mockResolvedValue(undefined);

  render(
    <TeacherView
      teachers={teachers}
      students={students}
      records={records}
      onAddTeacher={jest.fn()}
      onAddStudent={jest.fn()}
      onDeleteStudent={jest.fn()}
      onManualAttendance={onManualAttendance}
      onDeleteAttendanceDate={jest.fn()}
      onDeleteAllAttendanceRecords={jest.fn()}
      onResetDevices={jest.fn()}
      onUpdateStudent={jest.fn()}
      onUpdateTeacher={jest.fn()}
      message={null}
    />,
  );

  fireEvent.click(
    screen.getByRole('button', { name: '홍길동 결석 기록 수정' }),
  );
  const dialog = screen.getByRole('dialog', { name: '홍길동 결석 기록 수정' });
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: '2026-08-03 정상출석으로 수정',
    }),
  );

  expect(onManualAttendance).toHaveBeenCalledWith(
    students[0],
    'present',
    '2026-08-03',
  );
});
