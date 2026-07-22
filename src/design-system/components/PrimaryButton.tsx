import type { ButtonHTMLAttributes } from 'react';

export type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
};

export function PrimaryButton({ busy = false, disabled, className, children, ...props }: PrimaryButtonProps) {
  return (
    <button
      type="button"
      className={['ds-primary-button', className].filter(Boolean).join(' ')}
      aria-busy={busy || undefined}
      disabled={busy || disabled}
      {...props}
    >
      {busy ? <span className="ds-primary-button__busy-mark" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
