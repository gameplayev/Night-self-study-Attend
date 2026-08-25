import { createHash } from 'node:crypto';
import { ReadableStream, TransformStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';
import { hashSecret, verifySecret } from './security';

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

const SESSION_TOKEN = 'student-session';
const CSRF_TOKEN = 'student-csrf';

type QueryResult = {
  readonly data?: unknown;
  readonly count?: number;
  readonly error: null;
};

type PinChangeState = {
  passwordHash: string;
  changedUserId: number | null;
};

type Query = {
  readonly eq: (column: string, value: unknown) => Query;
  readonly insert: (payload: unknown) => Query;
  readonly maybeSingle: () => Promise<QueryResult>;
  readonly select: (...args: readonly unknown[]) => Query;
  readonly then: Promise<QueryResult>['then'];
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function createPinChangeBoundary(
  initialPasswordHash: string,
  loginAllowed = true,
) {
  const state: PinChangeState = {
    passwordHash: initialPasswordHash,
    changedUserId: null,
  };
  const rpc = jest.fn(
    async (name: string, parameters: Record<string, unknown>) => {
      if (name === 'consume_login_attempt') {
        return {
          data: {
            allowed: loginAllowed,
            retry_after_seconds: loginAllowed ? 0 : 600,
          },
          error: null,
        };
      }
      if (name === 'change_student_pin') {
        if (
          parameters.p_user_id !== 2 ||
          parameters.p_expected_password_hash !== state.passwordHash ||
          typeof parameters.p_new_password_hash !== 'string'
        ) {
          return { data: false, error: null };
        }
        state.passwordHash = parameters.p_new_password_hash;
        state.changedUserId = 2;
        return { data: true, error: null };
      }
      return { data: null, error: null };
    },
  );

  const fakeSupabase = {
    rpc,
    from(table: string) {
      const filters = new Map<string, unknown>();
      let query: Query;
      query = {
        eq: (column, value) => {
          filters.set(column, value);
          return query;
        },
        insert: () => query,
        maybeSingle: async () => {
          if (table === 'web_sessions') {
            return filters.get('token_hash') === sha256(SESSION_TOKEN)
              ? {
                  data: {
                    token_hash: sha256(SESSION_TOKEN),
                    csrf_token_hash: sha256(CSRF_TOKEN),
                    user_id: 2,
                    expires_at: '2099-01-01T00:00:00.000Z',
                  },
                  error: null,
                }
              : { data: null, error: null };
          }
          if (table === 'users') {
            return {
              data: {
                id: 2,
                username: '20101',
                password_hash: state.passwordHash,
                display_name: '김민준',
                role: 'student',
                student_id: 1,
              },
              error: null,
            };
          }
          if (table === 'students') {
            return { data: { student_number: '20101' }, error: null };
          }
          return { data: null, error: null };
        },
        select: () => query,
        then(onFulfilled, onRejected) {
          const result = table === 'users'
            ? { count: 1, error: null }
            : { error: null };
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };
      return query;
    },
  };
  mockGetSupabase.mockReturnValue(fakeSupabase);
  return { state };
}

async function requestPinChange(
  currentPin: string,
  newPin: string,
  csrfToken = CSRF_TOKEN,
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
    new NextRequest('http://localhost/api/students/me/pin', {
      method: 'POST',
      headers: {
        cookie: `attend_session=${SESSION_TOKEN}`,
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ currentPin, newPin, userId: 999 }),
    }),
  );
}

beforeEach(() => {
  mockGetSupabase.mockReset();
});

test('changes only the signed-in student PIN and expires the session cookie', async () => {
  const boundary = createPinChangeBoundary(await hashSecret('0000'));
  const response = await requestPinChange('0000', '0123');
  expect(response.status).toBe(204);
  expect(boundary.state.changedUserId).toBe(2);
  await expect(verifySecret('0123', boundary.state.passwordHash)).resolves.toBe(true);
  expect(response.headers.get('set-cookie')).toContain('attend_session=;');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});

test('rejects a wrong current PIN without changing the account', async () => {
  const initialPasswordHash = await hashSecret('0000');
  const boundary = createPinChangeBoundary(initialPasswordHash);
  const response = await requestPinChange('9999', '0123');
  expect(response.status).toBe(401);
  expect(boundary.state.changedUserId).toBeNull();
  expect(boundary.state.passwordHash).toBe(initialPasswordHash);
});

test('rejects a PIN change with an invalid CSRF token', async () => {
  const initialPasswordHash = await hashSecret('0000');
  const boundary = createPinChangeBoundary(initialPasswordHash);
  const response = await requestPinChange('0000', '0123', 'wrong-csrf');
  expect(response.status).toBe(403);
  expect(boundary.state.changedUserId).toBeNull();
  expect(boundary.state.passwordHash).toBe(initialPasswordHash);
});

test('honors the shared limiter before verifying the current PIN', async () => {
  const initialPasswordHash = await hashSecret('0000');
  const boundary = createPinChangeBoundary(initialPasswordHash, false);
  const response = await requestPinChange('0000', '0123');
  expect(response.status).toBe(429);
  expect(boundary.state.changedUserId).toBeNull();
  expect(boundary.state.passwordHash).toBe(initialPasswordHash);
});
