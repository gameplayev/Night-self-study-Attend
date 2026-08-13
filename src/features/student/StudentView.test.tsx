import { render, screen } from '@testing-library/react';
import type { AttendanceRecord } from '../../lib/attendance';
import type { AuthSession } from '../../services/appService';
import type { DeviceIdentity } from '../../services/deviceService';
import { StudentView } from './StudentView';

test('student screen does not show recent attendance records', () => {
  // Given: 최근 출결 기록이 있는 학생 세션
  const session: AuthSession = {
    user: {
      id: 1,
      username: '10101',
      displayName: '홍길동',
      role: 'student',
      studentNumber: '10101',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    csrfToken: 'csrf-token',
  };
  const device: DeviceIdentity = { id: 'device', label: '브라우저 기기' };
  const records: AttendanceRecord[] = [
    {
      id: 'record',
      studentNumber: '10101',
      studentName: '홍길동',
      action: 'check_in',
      timestamp: '2026-08-13T09:00:00.000Z',
      deviceId: 'device',
      deviceLabel: '브라우저 기기',
    },
  ];

  // When: 학생 화면을 렌더링한다.
  render(
    <StudentView
      session={session}
      device={device}
      records={records}
      onSubmitAttendance={async () => undefined}
      onOpenLocationGuide={() => undefined}
      isSubmitting={false}
      message={null}
    />,
  );

  // Then: 학생 처리 화면만 보이고 최근 기록 영역은 보이지 않는다.
  expect(screen.getByText('학생 처리')).toBeVisible();
  expect(screen.queryByText('최근 처리')).not.toBeInTheDocument();
});
