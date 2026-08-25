import { createHash } from 'node:crypto';
import { ReadableStream, TransformStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';
import { hashSecret } from './security';

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

const DEVICE_TOKEN = 'student-device-token';
const STUDENT_PIN = '1234';
let studentPinHash = '';

type QueryResult = {
  readonly data?: unknown;
  readonly count?: number;
  readonly error: null;
};

type Query = {
  readonly delete: () => Query;
  readonly eq: (column: string, value: unknown) => Query;
  readonly gt: (column: string, value: unknown) => Query;
  readonly insert: (payload: unknown) => Query;
  readonly maybeSingle: () => Promise<QueryResult>;
  readonly select: (...args: readonly unknown[]) => Query;
  readonly single: () => Promise<QueryResult>;
  readonly then: <TResult1 = QueryResult, TResult2 = never>(
    onFulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onRejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ) => PromiseLike<TResult1 | TResult2>;
  readonly update: (payload: unknown) => Query;
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function createStudentBoundary({
  loginAllowed = true,
  studentExists = true,
} = {}) {
  const deviceInsert = jest.fn();
  const rpc = jest.fn(async (name: string) => {
    if (name === 'consume_login_attempt') {
      return {
        data: {
          allowed: loginAllowed,
          retry_after_seconds: loginAllowed ? 0 : 600,
        },
        error: null,
      };
    }
    if (name === 'clear_login_attempt') {
      return { data: true, error: null };
    }
    if (name === 'claim_student_device') {
      return {
        data: {
          status: 'claimed',
          device_id: '10000000-0000-4000-8000-000000000001',
          registered_count: 1,
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });

  const fakeSupabase = {
    rpc,
    from(table: string) {
      const filters = new Map<string, unknown>();
      let query: Query;
      query = {
        delete: () => query,
        eq: (column: string, value: unknown) => {
          filters.set(column, value);
          return query;
        },
        gt: () => query,
        insert: (payload: unknown) => {
          if (table === 'browser_devices') deviceInsert(payload);
          return query;
        },
        maybeSingle: async (): Promise<QueryResult> => {
          if (table === 'students') {
            return {
              data: studentExists
                ? {
                    id: 1,
                    student_number: '20101',
                    name: '김민준',
                    grade: 2,
                    class_number: 1,
                    seat_number: 1,
                    attendance_weekdays: [1, 2, 3, 4, 5],
                  }
                : null,
              error: null,
            };
          }
          if (table === 'users') {
            return {
              data: {
                id: 2,
                username: '20101',
                password_hash: studentPinHash,
                display_name: '김민준',
                role: 'student',
                student_id: 1,
              },
              error: null,
            };
          }
          if (table === 'browser_devices') {
            return filters.get('token_hash') === sha256(DEVICE_TOKEN)
              ? {
                  data: {
                    id: '10000000-0000-4000-8000-000000000001',
                    token_hash: sha256(DEVICE_TOKEN),
                    label: '브라우저 기기',
                    student_id: 1,
                    expires_at: '2099-01-01T00:00:00.000Z',
                  },
                  error: null,
                }
              : { data: null, error: null };
          }
          return { data: null, error: null };
        },
        select: () => query,
        single: async (): Promise<QueryResult> => ({
          data: { recorded_sequence: 1 },
          error: null,
        }),
        then<TResult1 = QueryResult, TResult2 = never>(
          onFulfilled?:
            | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
            | null,
          onRejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null,
        ): PromiseLike<TResult1 | TResult2> {
          const result =
            table === 'users'
              ? { count: 1, error: null }
              : table === 'browser_devices'
                ? { count: 1, error: null }
                : { error: null };
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
        update: () => query,
      };
      return query;
    },
  };
  mockGetSupabase.mockReturnValue(fakeSupabase);
  return { deviceInsert, rpc };
}

async function studentRequest(
  path: '/api/students/access' | '/api/students/register-device',
  pin: string,
  padding = '',
) {
  const { Request: EdgeRequest, Response: EdgeResponse } = await import(
    'next/dist/compiled/@edge-runtime/primitives/fetch'
  );
  Object.defineProperties(globalThis, {
    Response: { configurable: true, writable: true, value: EdgeResponse },
    Request: { configurable: true, writable: true, value: EdgeRequest },
  });
  const { NextRequest } = await import('next/server');
  const { handleApiRoute } = await import('./attendanceApi');
  return handleApiRoute(
    new NextRequest(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        cookie: `attend_device=${DEVICE_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        studentNumber: '20101',
        name: '김민준',
        pin,
        deviceLabel: '브라우저 기기',
        padding,
      }),
    }),
  );
}

beforeAll(async () => {
  studentPinHash = await hashSecret(STUDENT_PIN);
});

beforeEach(() => {
  mockGetSupabase.mockReset();
});

test.each(['/api/students/access', '/api/students/register-device'] as const)(
  '%s rejects a wrong PIN before creating a student session',
  async (path) => {
    createStudentBoundary();

    const response = await studentRequest(path, '9999');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: '학번, 이름 또는 PIN이 올바르지 않습니다.',
    });
  },
);

test('student access rejects anything other than four ASCII digits', async () => {
  createStudentBoundary();

  const response = await studentRequest('/api/students/access', '12a4');

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    message: 'PIN은 숫자 4자리로 입력해 주세요.',
  });
});

test('student access honors the shared database login limiter', async () => {
  const boundary = createStudentBoundary({ loginAllowed: false });

  const response = await studentRequest('/api/students/access', STUDENT_PIN);

  expect(response.status).toBe(429);
  expect(boundary.rpc).toHaveBeenCalledWith(
    'consume_login_attempt',
    expect.objectContaining({ p_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }),
  );
  expect(JSON.stringify(boundary.rpc.mock.calls)).not.toContain('20101');
});

test('unknown student accounts use the shared database limiter too', async () => {
  const boundary = createStudentBoundary({ studentExists: false });

  const response = await studentRequest('/api/students/access', STUDENT_PIN);

  expect(response.status).toBe(401);
  expect(boundary.rpc).toHaveBeenCalledWith(
    'consume_login_attempt',
    expect.objectContaining({ p_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }),
  );
});

test('teacher login rejects an oversized display name before allocating limiter state', async () => {
  const boundary = createStudentBoundary();
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
    new NextRequest('http://localhost/api/auth/teacher-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'teacher01', displayName: '가'.repeat(81) }),
    }),
  );

  expect(response.status).toBe(400);
  expect(boundary.rpc).not.toHaveBeenCalledWith(
    'consume_login_attempt',
    expect.anything(),
  );
});

test.each(['/api/students/access', '/api/students/register-device'] as const)(
  '%s clears the shared limiter only after a correct PIN',
  async (path) => {
    const boundary = createStudentBoundary();

    const response = await studentRequest(path, STUDENT_PIN);

    expect(response.status).toBe(200);
    expect(boundary.rpc.mock.calls.map(([name]) => name)).toEqual(
      expect.arrayContaining(['consume_login_attempt', 'clear_login_attempt']),
    );
    if (path === '/api/students/register-device') {
      expect(boundary.rpc).toHaveBeenCalledWith(
        'claim_student_device',
        expect.objectContaining({ p_student_id: 1, p_max_devices: 2 }),
      );
    } else {
      expect(boundary.rpc).not.toHaveBeenCalledWith(
        'claim_student_device',
        expect.anything(),
      );
    }
  },
);

test('public device bootstrap does not create a permanent database row', async () => {
  const boundary = createStudentBoundary();
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
    new NextRequest('http://localhost/api/device', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: '브라우저 기기' }),
    }),
  );

  expect(response.status).toBe(200);
  expect(boundary.deviceInsert).not.toHaveBeenCalled();
});

test('oversized public JSON is rejected before authentication work', async () => {
  createStudentBoundary();

  const response = await studentRequest(
    '/api/students/access',
    STUDENT_PIN,
    'x'.repeat(20_000),
  );

  expect(response.status).toBe(413);
});

test('JSON endpoints reject a body with the wrong media type before database work', async () => {
  const boundary = createStudentBoundary();
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
    new NextRequest('http://localhost/api/students/access', {
      method: 'POST',
      headers: { cookie: `attend_device=${DEVICE_TOKEN}` },
      body: JSON.stringify({
        studentNumber: '20101',
        name: '김민준',
        pin: STUDENT_PIN,
      }),
    }),
  );

  expect(response.status).toBe(415);
  expect(boundary.rpc).not.toHaveBeenCalled();
});
