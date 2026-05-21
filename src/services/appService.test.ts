import {
  createStudent,
  getCurrentSession,
  registerStudentDevice,
  teacherLogin,
} from './appService';

beforeEach(() => {
  jest.restoreAllMocks();
});

function mockJsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

test('teacher login is sent to the secure web API', async () => {
  const fetchSpy = jest
    .spyOn(window, 'fetch')
    .mockImplementation(() =>
      mockJsonResponse({
        user: {
          id: 1,
          username: 'teacher:1',
          displayName: '담당 교사',
          role: 'teacher',
          studentNumber: null,
        },
        expiresAt: '2026-05-17T10:00:00.000Z',
        csrfToken: 'csrf',
      }),
    );

  await teacherLogin('teacher01', '담당 교사');

  expect(fetchSpy).toHaveBeenCalledWith(
    '/api/auth/teacher-login',
    expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }),
  );
});

test('current session is restored through the server instead of localStorage', async () => {
  jest.spyOn(window, 'fetch').mockImplementation(() =>
    mockJsonResponse({
      user: {
        id: 1,
        username: 'teacher:1',
        displayName: '담당 교사',
        role: 'teacher',
        studentNumber: null,
      },
      expiresAt: '2026-05-17T10:00:00.000Z',
      csrfToken: 'csrf',
    }),
  );

  await expect(getCurrentSession()).resolves.toMatchObject({
    csrfToken: 'csrf',
  });
});

test('student creation sends the expected payload with csrf token', async () => {
  const fetchSpy = jest
    .spyOn(window, 'fetch')
    .mockImplementation(() =>
      mockJsonResponse({
        id: 7,
        studentNumber: '20999',
        name: '김수정',
        grade: 2,
        classNumber: 3,
        seatNumber: 14,
        deviceCount: 0,
      }),
    );

  await createStudent(
    {
      studentNumber: '20999',
      name: '김수정',
      seatNumber: 14,
    },
    'csrf-token',
  );

  const [, request] = fetchSpy.mock.calls[0];
  expect((request?.headers as Headers).get('X-CSRF-Token')).toBe('csrf-token');
  expect(request?.body).toBe(
    JSON.stringify({
      studentNumber: '20999',
      name: '김수정',
      seatNumber: 14,
    }),
  );
});

test('student device registration sends student identity and device label', async () => {
  const fetchSpy = jest.spyOn(window, 'fetch').mockImplementation(() =>
    mockJsonResponse({
      user: {
        id: 2,
        username: '20101',
        displayName: '김민준',
        role: 'student',
        studentNumber: '20101',
      },
      expiresAt: '2026-05-17T10:00:00.000Z',
      csrfToken: 'csrf',
    }),
  );

  await registerStudentDevice('20101', '김민준', {
    id: 'device',
    label: '브라우저 기기',
  });

  expect(fetchSpy.mock.calls[0][1]?.body).toBe(
    JSON.stringify({
      studentNumber: '20101',
      name: '김민준',
      deviceLabel: '브라우저 기기',
    }),
  );
});
