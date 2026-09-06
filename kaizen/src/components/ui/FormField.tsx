import type { HTMLAttributes, ReactNode } from 'react';

interface FormFieldProps extends HTMLAttributes<HTMLLabelElement> {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

export default function FormField({ label, hint, children, className = '', ...props }: FormFieldProps) {
  return (
    <label className={`field ui-field ${className}`.trim()} {...props}>
      <span className="ui-field__label">
        {label}
        {hint && <small className="ui-field__hint">{hint}</small>}
      </span>
      {children}
    </label>
  );
}