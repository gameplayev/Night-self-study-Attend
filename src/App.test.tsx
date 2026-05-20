import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

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
