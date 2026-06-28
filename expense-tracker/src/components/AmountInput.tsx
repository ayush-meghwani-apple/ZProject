import type { InputHTMLAttributes } from 'react';

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (value: number) => void;
}

/**
 * A money input that shows the amount grouped the Indian way as you type — type
 * "100000" and it reads "1,00,000". Backed by a plain integer; non-digits are
 * stripped so the bound value is always a clean number.
 */
export default function AmountInput({ value, onChange, className = 'input', ...rest }: Props) {
  const display = value ? value.toLocaleString('en-IN') : '';
  return (
    <input
      {...rest}
      className={className}
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, '');
        onChange(digits ? parseInt(digits, 10) : 0);
      }}
    />
  );
}
