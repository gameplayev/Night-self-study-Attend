import { ReadableStream, TransformStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';
import { createHash } from 'node:crypto';

const mockGetSupabase = jest.fn();
const NativeDate = Date;

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
const SESSION_TOKEN = 'teacher-session';
const CSRF_TOKEN = 'teacher-csrf';

type ManualAttendanceAction = 'present' | 'absent' | 'check_in' | 'check_out';

interface FakeResult {
  readonly data?: unknown;
  readonly count?: number;
  readonly error: null;
}

interface FakeQuery {
  readonly select: (...args: readonly unknown[]) => FakeQuery;
  readonly eq: (column: string, value: unknown) => FakeQuery;
  readonly insert: (payload: unknown) => FakeQuery;
  readonly maybeSingle: () => Promise<FakeResult>;
  readonly single: () => Promise<FakeResult>;
  readonly then: Promise<FakeResult>['then'];
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function installFixedDate() {
  const fixedTimestamp = '2026-08-25T12:00:00.000Z';
  class FixedDate extends NativeDate {
    constructor(value?: string | number) {
      super(value ?? fixedTimestamp);
    }

    static now() {
      return NativeDate.parse(fixedTimestamp);
    }
  }
  Object.defineProperty(globalThis, 'Date', {
    configurable: true,
    writable: true,
    value: FixedDate,
  });
}

function createManualAttendanceBoundary() {
  const visitedTables: string[] = [];
  const sessionTokenFilters: string[] = [];
  const attendanceInsert = jest.fn();
  const fakeSupabase = {
    from(table: string) {
      visitedTables.push(table);
      const filters = new Map<string, unknown>();
      const directResult = (): FakeResult =>
        table === 'users' ? { count: 1, error: null } : { error: null };
      const query: FakeQuery = {
        select: () => query,
        eq: (column, value) => {
          filters.set(column, value);
          if (table === 'web_sessions' && column === 'token_hash') {
            sessionTokenFilters.push(String(value));
          }
          return query;
        },
        insert: (payload) => {
          if (table === 'attendance_records') attendanceInsert(payload);
          return query;
        },
        maybeSingle: async () => {
          if (table === 'web_sessions') {
            return filters.get('token_hash') === sha256(SESSION_TOKEN)
              ? {
                  data: {
                    token_hash: sha256(SESSION_TOKEN),
                    csrf_token_hash: sha256(CSRF_TOKEN),
                    user_id: 7,
                    expires_at: '2099-01-01T00:00:00.000Z',
                  },
                  error: null,
                }
              : { data: null, error: null };
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
  return { attendanceInsert, sessionTokenFilters, visitedTables };
}

async function installEdgeRequestGlobals() {
  const { Request: EdgeRequest, Response: EdgeResponse } = await import(
    'next/dist/compiled/@edge-runtime/primitives/fetch'
  );
  Object.defineProperties(globalThis, {
    Response: { configurable: true, writable: true, value: EdgeResponse },
    Request: { configurable: true, writable: true, value: EdgeRequest },
  });
}

async function requestManualAttendance(
  action: ManualAttendanceAction,
  dateKey?: string,
  csrfToken = CSRF_TOKEN,
) {
  await installEdgeRequestGlobals();
  const { NextRequest } = await import('next/server');
  const { handleApiRoute } = await import('./attendanceApi');
  return handleApiRoute(
    new NextRequest('http://localhost/api/attendance/manual', {
      method: 'POST',
      headers: {
        cookie: `attend_session=${SESSION_TOKEN}`,
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ studentId: 1, action, dateKey }),
    }),
  );
}

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
  mockGetSupabase.mockReset();
  Object.defineProperty(globalThis, 'Date', {
    configurable: true,
    writable: true,
    value: NativeDate,
  });
});

test('returns no-store liveness JSON when Supabase configuration is absent', async () => {
  // Given: Supabase configuration is absent.

  // When: the health route is requested through the real API boundary.
  await installEdgeRequestGlobals();
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
    const boundary = createManualAttendanceBoundary();
    const response = await requestManualAttendance(action, '2026-08-04');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: '해당 학생의 출석 대상 요일이 아닙니다.',
    });
    expect(boundary.sessionTokenFilters).toContain(sha256(SESSION_TOKEN));
    expect(boundary.visitedTables).toEqual(
      expect.arrayContaining(['web_sessions', 'users', 'students']),
    );
    expect(boundary.attendanceInsert).not.toHaveBeenCalled();
  },
);

test('rejects an invalid CSRF token before student lookup or attendance insert', async () => {
  const boundary = createManualAttendanceBoundary();

  const response = await requestManualAttendance(
    'check_in',
    undefined,
    'wrong-csrf',
  );

  expect(response.status).toBe(403);
  expect(boundary.visitedTables).not.toContain('students');
  expect(boundary.attendanceInsert).not.toHaveBeenCalled();
});

test.each(['check_in', 'check_out'] as const)(
  'allows no-date %s for an off-schedule student on the current day',
  async (action) => {
    installFixedDate();
    const boundary = createManualAttendanceBoundary();

    const response = await requestManualAttendance(action);

    expect(response.status).toBe(201);
    expect(boundary.attendanceInsert).toHaveBeenCalledTimes(1);
  },
);
