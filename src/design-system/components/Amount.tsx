import { formatYuan } from '../../domain/money';

export type AmountTone =
  | 'neutral'
  | 'balance'
  | 'expense'
  | 'income'
  | 'refund'
  | 'adjustment';

export type AmountProps = {
  cents: number;
  label: string;
  tone: AmountTone;
};

function spokenYuan(formatted: string): string {
  const negative = formatted.startsWith('-');
  const amount = formatted.replace(/[-¥,]/g, '');
  return `${negative ? '负' : ''}${amount}元`;
}

function groupYuan(formatted: string): string {
  return formatted.replace(/\d+(?=\.)/, (yuan) =>
    yuan.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
  );
}

export function Amount({ cents, label, tone }: AmountProps) {
  const formatted = groupYuan(formatYuan(cents));

  return (
    <span
      className="ds-amount"
      aria-label={`${label}，${spokenYuan(formatted)}`}
      data-numeric=""
      data-tone={tone}
    >
      {formatted}
    </span>
  );
}
