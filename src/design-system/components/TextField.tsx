import { forwardRef, type InputHTMLAttributes } from 'react';

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  description?: string;
  error?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({
  id,
  label,
  description,
  error,
  className,
  'aria-describedby': ariaDescribedBy,
  ...inputProps
}, ref) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [ariaDescribedBy, descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="ds-text-field">
      <label className="ds-text-field__label" htmlFor={id}>{label}</label>
      {description ? <p className="ds-text-field__description" id={descriptionId}>{description}</p> : null}
      <input
        {...inputProps}
        ref={ref}
        id={id}
        className={['ds-text-field__input', className].filter(Boolean).join(' ')}
        aria-describedby={describedBy}
        aria-invalid={error ? true : inputProps['aria-invalid']}
      />
      {error ? <p className="ds-text-field__error" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
});
