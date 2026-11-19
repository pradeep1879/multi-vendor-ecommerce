import { useEffect, useRef, useState, type FormEvent } from 'react';

export type DialogField = {
  name: string;
  label: string;
  type?: 'text' | 'number';
  required?: boolean;
  min?: string;
  max?: string;
  minLength?: number;
  placeholder?: string;
};
export type ActionDialogRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  fields?: DialogField[];
  destructive?: boolean;
  onConfirm: (values: Record<string, string>) => void | Promise<void>;
};

export function ActionDialog({
  request,
  onClose,
}: {
  request: ActionDialogRequest | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  if (!request) return <dialog ref={ref} />;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      await request.onConfirm(
        Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])),
      );
      ref.current?.close();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="action-dialog"
      aria-labelledby="action-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <h2 id="action-dialog-title">{request.title}</h2>
        <p className="muted">{request.description}</p>
        {request.fields?.map((field) => (
          <label className="field dialog-field" key={field.name}>
            <span>{field.label}</span>
            <input
              name={field.name}
              type={field.type ?? 'text'}
              required={field.required ?? true}
              min={field.min}
              max={field.max}
              minLength={field.minLength}
              placeholder={field.placeholder}
              autoFocus
            />
          </label>
        ))}
        <div className="dialog-actions">
          <button type="button" className="button subtle" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className={`button ${request.destructive ? 'danger' : 'primary'}`}
            disabled={busy}
          >
            {busy ? 'Saving…' : request.confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
