import {
  AttendanceRecord,
  getDailyAttendanceSummary,
  getCurrentPresence,
  getDailyPresence,
  getDailyAttendanceResult,
  formatKoreanFullDate,
  getStudentAbsentCount,
} from './attendance';

const records: AttendanceRecord[] = [
  {
    id: '2',
    studentNumber: '20101',
    studentName: '김민준',
    action: 'check_out',
    timestamp: '2026-05-17T12:00:00.000Z',
    deviceId: 'device-1',
    deviceLabel: '김민준의 MacBook',
  },
  {
    id: '1',
    studentNumber: '20101',
    studentName: '김민준',
    action: 'check_in',
    timestamp: '2026-05-17T10:00:00.000Z',
    deviceId: 'device-1',
    deviceLabel: '김민준의 MacBook',
  },
];

test('returns the latest presence for a student', () => {
  expect(getCurrentPresence('20101', records)).toBe('checked_out');
});

test('returns null when a student has no records', () => {
  expect(getCurrentPresence('20102', records)).toBeNull();
});

test('uses only the current Korea day for daily presence', () => {
  expect(
    getDailyPresence('20101', records, new Date('2026-05-17T14:00:00.000Z')),
  ).toBe('checked_out');
  expect(
    getDailyPresence('20101', records, new Date('2026-05-18T14:00:00.000Z')),
  ).toBeNull();
});

test('summarizes a student attendance for a selected date', () => {
  expect(getDailyAttendanceSummary('20101', records, '2026-05-17')).toEqual({
    studentNumber: '20101',
    checkInAt: '2026-05-17T10:00:00.000Z',
    checkOutAt: '2026-05-17T12:00:00.000Z',
    status: 'checked_out',
  });
  expect(getDailyAttendanceSummary('20102', records, '2026-05-17')).toEqual({
    studentNumber: '20102',
    checkInAt: null,
    checkOutAt: null,
    status: 'absent',
  });
});

test('shows current dates as live presence states', () => {
  const summary = getDailyAttendanceSummary('20101', records, '2026-05-17');

  expect(
    getDailyAttendanceResult(
      summary,
      '2026-05-17',
      new Date('2026-05-17T14:00:00.000Z'),
    ),
  ).toBe('checked_out');
});

test('shows past dates as final attendance results', () => {
  const attendedSummary = getDailyAttendanceSummary(
    '20101',
    records,
    '2026-05-17',
  );
  const absentSummary = getDailyAttendanceSummary(
    '20102',
    records,
    '2026-05-17',
  );

  expect(
    getDailyAttendanceResult(
      attendedSummary,
      '2026-05-17',
      new Date('2026-05-18T14:00:00.000Z'),
    ),
  ).toBe('normal_attendance');
  expect(
    getDailyAttendanceResult(
      absentSummary,
      '2026-05-17',
      new Date('2026-05-18T14:00:00.000Z'),
    ),
  ).toBe('absent');
});

test('uses the latest teacher correction as the current daily status', () => {
  const correctedRecords: AttendanceRecord[] = [
    {
      id: '4',
      studentNumber: '20101',
      studentName: '김민준',
      action: 'check_in',
      timestamp: '2026-05-17T13:00:00.000Z',
      deviceId: 'teacher-manual',
      deviceLabel: '교사 수동 처리',
    },
    ...records,
  ];

  expect(
    getDailyPresence(
      '20101',
      correctedRecords,
      new Date('2026-05-17T14:00:00.000Z'),
    ),
  ).toBe('present');
  expect(
    getDailyAttendanceSummary('20101', correctedRecords, '2026-05-17'),
  ).toEqual({
    studentNumber: '20101',
    checkInAt: '2026-05-17T13:00:00.000Z',
    checkOutAt: '2026-05-17T12:00:00.000Z',
    status: 'present',
  });
});

test('uses a latest absent correction without changing recorded times', () => {
  const correctedRecords: AttendanceRecord[] = [
    {
      id: '5',
      studentNumber: '20101',
      studentName: '김민준',
      action: 'absent',
      timestamp: '2026-05-17T13:30:00.000Z',
      deviceId: 'teacher-manual',
      deviceLabel: '교사 수동 처리',
    },
    ...records,
  ];

  expect(
    getDailyPresence(
      '20101',
      correctedRecords,
      new Date('2026-05-17T14:00:00.000Z'),
    ),
  ).toBeNull();
  expect(
    getDailyAttendanceSummary('20101', correctedRecords, '2026-05-17'),
  ).toEqual({
    studentNumber: '20101',
    checkInAt: '2026-05-17T10:00:00.000Z',
    checkOutAt: '2026-05-17T12:00:00.000Z',
    status: 'absent',
  });
});

test('uses a manual present correction without changing recorded times', () => {
  const correctedRecords: AttendanceRecord[] = [
    {
      id: '6',
      studentNumber: '20101',
      studentName: '김민준',
      action: 'present',
      timestamp: '2026-05-17T13:30:00.000Z',
      deviceId: 'teacher-manual',
      deviceLabel: '교사 수동 처리',
    },
    ...records,
  ];

  expect(
    getDailyAttendanceSummary('20101', correctedRecords, '2026-05-17'),
  ).toEqual({
    studentNumber: '20101',
    checkInAt: '2026-05-17T10:00:00.000Z',
    checkOutAt: '2026-05-17T12:00:00.000Z',
    status: 'present',
  });
});

test('counts one absence per date using the final daily status', () => {
  const correctedRecords: AttendanceRecord[] = [
    {
      id: '7',
      studentNumber: '20101',
      studentName: '김민준',
      action: 'absent',
      timestamp: '2026-05-18T13:30:00.000Z',
      deviceId: 'teacher-manual',
      deviceLabel: '교사 수동 처리',
    },
    {
      id: '6',
      studentNumber: '20101',
      studentName: '김민준',
      action: 'present',
      timestamp: '2026-05-17T13:30:00.000Z',
      deviceId: 'teacher-manual',
      deviceLabel: '교사 수동 처리',
    },
    {
      id: '5',
      studentNumber: '20101',
      studentName: '김민준',
      action: 'absent',
      timestamp: '2026-05-17T13:00:00.000Z',
      deviceId: 'teacher-manual',
      deviceLabel: '교사 수동 처리',
    },
    ...records,
  ];

  expect(
    getStudentAbsentCount(
      '20101',
      correctedRecords,
      ['2026-05-17', '2026-05-18'],
      new Date('2026-05-19T14:00:00.000Z'),
    ),
  ).toBe(1);
  expect(
    getStudentAbsentCount(
      '20102',
      correctedRecords,
      ['2026-05-17', '2026-05-18'],
      new Date('2026-05-19T14:00:00.000Z'),
    ),
  ).toBe(2);
});

test('formats a Korean full date without duplicated day suffix', () => {
  expect(formatKoreanFullDate(new Date('2026-05-17T00:00:00.000Z'))).toBe(
    '2026년 5월 17일 (일)',
  );
});
