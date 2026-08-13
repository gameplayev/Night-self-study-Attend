import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

afterEach(() => {
  jest.restoreAllMocks();
});

function jsonResponse(body: object) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

test('renders the attendance system heading', async () => {
  jest.spyOn(window, 'fetch').mockImplementation((input) => {
    if (input === '/api/device') {
      return Promise.resolve(
        new Response(
          JSON.stringify({ id: 'device', label: '브라우저 기기' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (input === '/api/session') {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  render(<App />);
  expect(screen.getByText('출석 관리 시스템')).toBeInTheDocument();
  expect(await screen.findByText('학생 확인')).toBeInTheDocument();
  expect(screen.getByText('학번')).toBeInTheDocument();
  expect(screen.getByText('이름')).toBeInTheDocument();
});

test('shows teacher login fields as name first, then identifier', async () => {
  jest.spyOn(window, 'fetch').mockImplementation((input) => {
    if (input === '/api/device') {
      return Promise.resolve(
        new Response(
          JSON.stringify({ id: 'device', label: '브라우저 기기' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (input === '/api/session') {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  });

  render(<App />);
  expect(await screen.findByText('학생 확인')).toBeInTheDocument();

  fireEvent.click(screen.getByText('선생님'));

  const visibleLabels = Array.from(document.querySelectorAll('label span')).map(
    (label) => label.textContent,
  );
  expect(visibleLabels).toEqual(['이름', '선생님 고유 번호']);
});

test('teacher edits one student attendance weekdays and absence total updates', async () => {
  let updateBody: BodyInit | null | undefined;
  let globalSettingsRequested = false;

  jest.spyOn(window, 'fetch').mockImplementation((input, init) => {
    if (input === '/api/device') {
      return jsonResponse({ id: 'device', label: '브라우저 기기' });
    }
    if (input === '/api/session') {
      return jsonResponse({
        user: {
          id: 1,
          username: 'teacher',
          displayName: '김교사',
          role: 'teacher',
          studentNumber: null,
        },
        expiresAt: '2099-01-01T00:00:00.000Z',
        csrfToken: 'csrf-token',
      });
    }
    if (input === '/api/attendance') {
      return jsonResponse([
        {
          id: 'monday-absence',
          studentNumber: '10101',
          studentName: '홍길동',
          action: 'absent',
          timestamp: '2026-08-03T12:00:00.000Z',
          deviceId: 'teacher',
          deviceLabel: '교사 처리',
        },
        {
          id: 'tuesday-absence',
          studentNumber: '10101',
          studentName: '홍길동',
          action: 'absent',
          timestamp: '2026-08-04T12:00:00.000Z',
          deviceId: 'teacher',
          deviceLabel: '교사 처리',
        },
      ]);
    }
    if (input === '/api/students/1' && init?.method === 'PUT') {
      updateBody = init.body;
      return jsonResponse({
        id: 1,
        studentNumber: '10101',
        name: '홍길동',
        grade: 1,
        classNumber: 1,
        seatNumber: 1,
        deviceCount: 0,
        attendanceWeekdays: [1],
      });
    }
    if (input === '/api/students') {
      return jsonResponse([
        {
          id: 1,
          studentNumber: '10101',
          name: '홍길동',
          grade: 1,
          classNumber: 1,
          seatNumber: 1,
          deviceCount: 0,
          attendanceWeekdays: [1, 2],
        },
      ]);
    }
    if (input === '/api/teachers') {
      return jsonResponse([{ id: 1, name: '김교사' }]);
    }
    if (input === '/api/settings/attendance-days') {
      globalSettingsRequested = true;
      return jsonResponse({ activeWeekdays: [1, 2] });
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  });

  render(<App />);

  expect(await screen.findByText('2회')).toBeInTheDocument();
  const roster = screen
    .getByRole('heading', { name: '학생 명단' })
    .closest<HTMLElement>('.rounded-md');
  expect(roster).not.toBeNull();
  if (!roster) return;
  const studentRow = within(roster).getByText('홍길동').closest('tr');
  expect(studentRow).not.toBeNull();
  if (!studentRow) return;

  fireEvent.click(within(studentRow).getByRole('button', { name: '수정' }));
  fireEvent.click(within(studentRow).getByRole('checkbox', { name: '화' }));
  fireEvent.click(within(studentRow).getByRole('button', { name: '저장' }));

  expect(await screen.findByText('1회')).toBeInTheDocument();
  await waitFor(() => {
    expect(updateBody).toBe(
      JSON.stringify({
        studentNumber: '10101',
        name: '홍길동',
        seatNumber: 1,
        attendanceWeekdays: [1],
      }),
    );
  });
  expect(within(studentRow).getByText('월')).toBeVisible();
  expect(globalSettingsRequested).toBe(false);
});
