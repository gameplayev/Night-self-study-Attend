import { useEffect, useRef, useState } from 'react';
import type { FormEvent, SyntheticEvent } from 'react';

type StudentPinDialogProps = {
  readonly onChangePin: (currentPin: string, newPin: string) => Promise<void>;
  readonly onClose: () => void;
};

export function StudentPinDialog({
  onChangePin,
  onClose,
}: StudentPinDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirmation, setNewPinConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function handleClose() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    onClose();
  }

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    handleClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPin !== newPinConfirmation) {
      setError('새 PIN이 서로 일치하지 않습니다.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onChangePin(currentPin, newPin);
    } catch (caught) {
      if (caught instanceof Error) {
        setError(caught.message);
        return;
      }
      throw caught;
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="student-pin-dialog-title"
      onCancel={handleCancel}
      className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-md border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="student-pin-dialog-title" className="text-xl font-semibold">
              PIN 변경
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              현재 PIN과 새 PIN 4자리를 입력합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="h-10 shrink-0 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            닫기
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            <span>현재 PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              value={currentPin}
              onChange={(event) => setCurrentPin(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-base outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            <span>새 PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              value={newPin}
              onChange={(event) => setNewPin(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-base outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            <span>새 PIN 확인</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              value={newPinConfirmation}
              onChange={(event) => setNewPinConfirmation(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-base outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? '변경 중' : '변경하기'}
        </button>
      </form>
    </dialog>
  );
}
