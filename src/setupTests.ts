// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

const testFetch =
  typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : () => Promise.reject(new Error('window.fetch was not mocked.'));

Object.defineProperty(window, 'fetch', {
  configurable: true,
  writable: true,
  value: testFetch,
});

if (typeof Response === 'undefined') {
  class TestResponse {
    readonly status: number;
    readonly headers: Record<string, string>;
    readonly ok: boolean;

    constructor(
      private readonly body: BodyInit | null = null,
      init: ResponseInit = {},
    ) {
      this.status = init.status ?? 200;
      this.headers =
        typeof Headers !== 'undefined' && init.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : ((init.headers ?? {}) as Record<string, string>);
      this.ok = this.status >= 200 && this.status < 300;
    }

    async json() {
      if (this.body == null) return null;
      return JSON.parse(String(this.body));
    }
  }

  Object.defineProperty(globalThis, 'Response', {
    configurable: true,
    writable: true,
    value: TestResponse,
  });
  Object.defineProperty(window, 'Response', {
    configurable: true,
    writable: true,
    value: TestResponse,
  });
}
