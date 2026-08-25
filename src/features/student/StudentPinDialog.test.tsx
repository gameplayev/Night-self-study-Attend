import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StudentPinDialog } from './StudentPinDialog';

const dialogPrototype = HTMLDialogElement.prototype;
const originalShowModal = dialogPrototype.showModal;
const originalClose = dialogPrototype.close;

beforeAll(() => {
  if (!originalShowModal) {
    Object.defineProperty(dialogPrototype, 'showModal', {
      configurable: true,
      value: function showModal(this: HTMLDialogElement) {
        this.open = true;
      },
    });
  }
  if (!originalClose) {
    Object.defineProperty(dialogPrototype, 'close', {
      configurable: true,
      value: function close(this: HTMLDialogElement) {
        this.open = false;
      },
    });
  }
});

afterAll(() => {
  if (!originalShowModal) Reflect.deleteProperty(dialogPrototype, 'showModal');
  if (!originalClose) Reflect.deleteProperty(dialogPrototype, 'close');
});

test('does not submit when the new PIN confirmation differs', async () => {
  const onChangePin = jest.fn(async () => undefined);
  render(<StudentPinDialog onChangePin={onChangePin} onClose={() => undefined} />);
  fireEvent.change(screen.getByLabelText('현재 PIN'), {
    target: { value: '0000' },
  });
  fireEvent.change(screen.getByLabelText('새 PIN'), {
    target: { value: '0123' },
  });
  fireEvent.change(screen.getByLabelText('새 PIN 확인'), {
    target: { value: '0124' },
  });

  fireEvent.click(screen.getByRole('button', { name: '변경하기' }));
  expect(await screen.findByText('새 PIN이 서로 일치하지 않습니다.')).toBeVisible();
  await waitFor(() => expect(onChangePin).not.toHaveBeenCalled());
});
