import { ReadableStream, TransformStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

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
