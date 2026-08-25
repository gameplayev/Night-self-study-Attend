import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AttendanceRecord, Student } from '../../lib/attendance';
import type { Teacher } from '../../services/appService';
import { TeacherView } from './TeacherView';

const dialogPrototype = HTMLDialogElement.prototype;
const originalShowModal = Object.getOwnPropertyDescriptor(
  dialogPrototype,
  'showModal',
);
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, 'close');

beforeAll(() => {
  if (!originalShowModal) {
    Object.defineProperty(dialogPrototype, 'showModal', {
      configurable: true,
      value: function showModal(this: HTMLDialogElement) {
        this.open = true;
      },
    });
  }
  if (!originalClose) {
    Object.defineProperty(dialogPrototype, 'close', {
      configurable: true,
      value: function close(this: HTMLDialogElement) {
        this.open = false;
      },
    });
  }
});

afterAll(() => {
  if (!originalShowModal) Reflect.deleteProperty(dialogPrototype, 'showModal');
  if (!originalClose) Reflect.deleteProperty(dialogPrototype, 'close');
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

test('teacher corrects the dated record behind a student absence total', async () => {
  const onManualAttendance = jest.fn().mockResolvedValue(undefined);

  render(
    <TeacherView
      teachers={teachers}
      students={students}
      records={records}
      onRefreshAttendance={jest.fn().mockResolvedValue(undefined)}
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
  const dialog = screen.getByRole<HTMLDialogElement>('dialog', {
    name: '홍길동 결석 기록 수정',
  });
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
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', {
        name: '2026-08-03 정상출석으로 수정',
      }),
    ).toBeEnabled(),
  );
});

test('teacher sees scheduled dates newest first, corrects absence, and closes with Escape', async () => {
  const onManualAttendance = jest.fn().mockResolvedValue(undefined);
  const correctionRecords: AttendanceRecord[] = [
    ...records,
    {
      id: 'wednesday-present',
      studentNumber: '10101',
      studentName: '홍길동',
      action: 'present',
      timestamp: '2026-08-05T12:00:00.000Z',
      deviceId: 'teacher',
      deviceLabel: '교사 처리',
    },
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
    <TeacherView
      teachers={teachers}
      students={students}
      records={correctionRecords}
      onRefreshAttendance={jest.fn().mockResolvedValue(undefined)}
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
  const dialog = screen.getByRole<HTMLDialogElement>('dialog', {
    name: '홍길동 결석 기록 수정',
  });

  expect(
    within(dialog)
      .getAllByText(/^2026-08-\d{2}$/)
      .map((date) => date.textContent),
  ).toEqual(['2026-08-05', '2026-08-03']);

  fireEvent.click(
    within(dialog).getByRole('button', { name: '2026-08-03 결석으로 수정' }),
  );
  expect(onManualAttendance).toHaveBeenCalledWith(
    students[0],
    'absent',
    '2026-08-03',
  );
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', {
        name: '2026-08-03 결석으로 수정',
      }),
    ).toBeEnabled(),
  );

  fireEvent(
    dialog,
    new Event('cancel', { bubbles: true, cancelable: true }),
  );
  expect(dialog.open).toBe(false);
  expect(
    screen.queryByRole('dialog', { name: '홍길동 결석 기록 수정' }),
  ).not.toBeInTheDocument();
});

test('teacher correction buttons stay locked until the pending correction settles', async () => {
  let finishFirstCorrection: (() => void) | undefined;
  const onManualAttendance = jest.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishFirstCorrection = resolve;
      }),
  );

  render(
    <TeacherView
      teachers={teachers}
      students={students}
      records={records}
      onRefreshAttendance={jest.fn().mockResolvedValue(undefined)}
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
  const presentButton = screen.getByRole('button', {
    name: '2026-08-03 정상출석으로 수정',
  });
  const absentButton = screen.getByRole('button', {
    name: '2026-08-03 결석으로 수정',
  });

  fireEvent.click(presentButton);
  expect(presentButton).toBeDisabled();
  expect(absentButton).toBeDisabled();
  fireEvent.click(absentButton);
  expect(onManualAttendance).toHaveBeenCalledTimes(1);

  finishFirstCorrection?.();
  await waitFor(() => expect(absentButton).toBeEnabled());
  fireEvent.click(absentButton);
  expect(onManualAttendance).toHaveBeenCalledTimes(2);
});
