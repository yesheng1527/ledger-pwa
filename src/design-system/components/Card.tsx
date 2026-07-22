import type { HTMLAttributes } from 'react';

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return <div className={['ds-card', className].filter(Boolean).join(' ')} {...props} />;
}
