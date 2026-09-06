import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'default' | 'small';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'default',
  icon,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = [
    'btn',
    'ui-button',
    variant === 'secondary' ? 'btn--ghost' : '',
    variant === 'danger' ? 'btn--danger' : '',
    size === 'small' ? 'btn--sm' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button type={type} className={classes} {...props}>
      {icon}
      {children}
    </button>
  );
}