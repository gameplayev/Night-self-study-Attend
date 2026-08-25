import { ReadableStream, TransformStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';
import { createHash } from 'node:crypto';

const mockGetSupabase = jest.fn();

jest.mock('./supabase', () => ({
  getSupabase: mockGetSupabase,
}));

Object.defineProperties(globalThis, {
  TextDecoder: { configurable: true, writable: true, value: TextDecoder },
  TextEncoder: { configurable: true, writable: true, value: TextEncoder },
  ReadableStream: { configurable: true, writable: true, value: ReadableStream },
  TransformStream: { configurable: true, writable: true, value: TransformStream },
});

const SUPABASE_ENVIRONMENT_VARIABLES = [
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const originalEnvironment = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of SUPABASE_ENVIRONMENT_VARIABLES) {
    originalEnvironment.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of SUPABASE_ENVIRONMENT_VARIABLES) {
    const value = originalEnvironment.get(name);
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  originalEnvironment.clear();
});

test('returns no-store liveness JSON when Supabase configuration is absent', async () => {
  // Given: Supabase configuration is absent.

  // When: the health route is requested through the real API boundary.
  const { Request: EdgeRequest, Response: EdgeResponse } = await import(
    'next/dist/compiled/@edge-runtime/primitives/fetch'
  );
  Object.defineProperties(globalThis, {
    Response: {
      configurable: true,
      writable: true,
      value: EdgeResponse,
    },
    Request: {
      configurable: true,
      writable: true,
      value: EdgeRequest,
    },
  });
  const { NextRequest } = await import('next/server');
  const { handleApiRoute } = await import('./attendanceApi');
  const response = await handleApiRoute(
    new NextRequest('http://localhost/api/health', { method: 'GET' }),
  );

  // Then: liveness remains available without initializing the database.
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  await expect(response.json()).resolves.toEqual({ status: 'ok' });
});

test.each(['present', 'absent', 'check_in', 'check_out'] as const)(
  'rejects dated off-schedule %s after teacher session and CSRF validation',
  async (action) => {
    const sessionToken = 'teacher-session';
    const csrfToken = 'teacher-csrf';
    const sha256 = (value: string) =>
      createHash('sha256').update(value).digest('hex');
    const visitedTables: string[] = [];
    const attendanceInsert = jest.fn();

    interface FakeResult {
      readonly data?: unknown;
      readonly count?: number;
      readonly error: null;
    }

    interface FakeQuery {
      readonly select: (...args: readonly unknown[]) => FakeQuery;
      readonly eq: (...args: readonly unknown[]) => FakeQuery;
      readonly insert: (payload: unknown) => FakeQuery;
      readonly maybeSingle: () => Promise<FakeResult>;
      readonly single: () => Promise<FakeResult>;
      readonly then: Promise<FakeResult>['then'];
    }

    const fakeSupabase = {
      from(table: string) {
        visitedTables.push(table);
        const directResult = (): FakeResult =>
          table === 'users'
            ? { count: 1, error: null }
            : { error: null };
        const query: FakeQuery = {
          select: () => query,
          eq: () => query,
          insert: (payload) => {
            if (table === 'attendance_records') attendanceInsert(payload);
            return query;
          },
          maybeSingle: async () => {
            if (table === 'web_sessions') {
              return {
                data: {
                  token_hash: sha256(sessionToken),
                  csrf_token_hash: sha256(csrfToken),
                  user_id: 7,
                  expires_at: '2099-01-01T00:00:00.000Z',
                },
                error: null,
              };
            }
            if (table === 'users') {
              return {
                data: {
                  id: 7,
                  username: 'teacher:test',
                  password_hash: 'unused',
                  display_name: '검증 교사',
                  role: 'teacher',
                  student_id: null,
                },
                error: null,
              };
            }
            return {
              data: {
                id: 1,
                student_number: '20101',
                name: '김민준',
                grade: 2,
                class_number: 1,
                seat_number: 1,
                attendance_weekdays: [1],
              },
              error: null,
            };
          },
          single: async () => ({
            data: { recorded_sequence: 1 },
            error: null,
          }),
          then(onFulfilled, onRejected) {
            return Promise.resolve(directResult()).then(onFulfilled, onRejected);
          },
        };
        return query;
      },
    };
    mockGetSupabase.mockReturnValue(fakeSupabase);

    const { Request: EdgeRequest, Response: EdgeResponse } = await import(
      'next/dist/compiled/@edge-runtime/primitives/fetch'
    );
    Object.defineProperties(globalThis, {
      Response: { configurable: true, writable: true, value: EdgeResponse },
      Request: { configurable: true, writable: true, value: EdgeRequest },
    });
    const { NextRequest } = await import('next/server');
    const { handleApiRoute } = await import('./attendanceApi');
    const response = await handleApiRoute(
      new NextRequest('http://localhost/api/attendance/manual', {
        method: 'POST',
        headers: {
          cookie: `attend_session=${sessionToken}`,
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ studentId: 1, action, dateKey: '2026-08-04' }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: '해당 학생의 출석 대상 요일이 아닙니다.',
    });
    expect(visitedTables).toEqual(
      expect.arrayContaining(['web_sessions', 'users', 'students']),
    );
    expect(attendanceInsert).not.toHaveBeenCalled();
  },
);
