import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'subtle' | 'danger';
  children: ReactNode;
};

export function Button({ variant = 'subtle', className = '', children, ...props }: Props) {
  return (
    <button className={`button ${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
