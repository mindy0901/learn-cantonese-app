import { cn } from '../lib/cn.js'
import { spinnerClass } from './ui/buttonStyles.js'

export function BtnSpinner({ size } = {}) {
  return <span className={spinnerClass(size)} aria-hidden="true" />
}

export function LoadingButton({
  loading = false,
  loadingText,
  children,
  className,
  disabled,
  ...props
}) {
  return (
    <button
      type="button"
      className={cn(className, loading && 'cursor-wait')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <BtnSpinner />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  )
}
