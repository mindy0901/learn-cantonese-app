import { cn } from '../lib/cn.js'
import { Button } from './ui/Button.jsx'
import { btnClass } from './ui/buttonStyles.js'
import { LoadingButton } from './LoadingButton.jsx'

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger,
  loading = false,
  loadingText,
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={loading ? undefined : onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        aria-busy={loading}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2 id="confirm-title">{title}</h2>
        </div>
        <div className="flex flex-col gap-4 p-6">
          <p id="confirm-message" className="text-sm text-text-muted">
            {message}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <LoadingButton
            className={btnClass(danger ? 'danger' : 'primary')}
            loading={loading}
            loadingText={loadingText ?? confirmLabel}
            onClick={onConfirm}
          >
            {confirmLabel}
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}
