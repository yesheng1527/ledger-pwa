import type { ComponentProps } from 'react';
import { HandDrawnIcon } from '../../design-system/components/HandDrawnIcon';
import type { TransactionRowModel } from '../../view-model/types';
import styles from './TransactionsPage.module.css';

export type TransactionRowProps = {
  row: TransactionRowModel;
  onOpen: (id: string) => void;
};

type CategoryAsset = ComponentProps<typeof HandDrawnIcon>['asset'];

function categoryAsset(iconKey: string): CategoryAsset {
  const asset = `category:${iconKey}` as CategoryAsset;
  const knownAssets: readonly CategoryAsset[] = [
    'category:food',
    'category:transport',
    'category:shopping',
    'category:housing',
    'category:entertainment',
    'category:daily',
    'category:study',
    'category:medical',
    'category:travel',
    'category:income',
    'category:other',
  ];
  return knownAssets.includes(asset) ? asset : 'category:other';
}

function spokenAmount(row: TransactionRowModel): string {
  const amount = row.amountLabel.replace(/[+\-¥,]/g, '');
  if (row.amountLabel.startsWith('-')) return `负${amount}元`;
  if (!row.amountLabel.startsWith('+')) return `${amount}元`;
  if (row.type === 'income') return `收入正${amount}元`;
  if (row.type === 'refund') return `退款正${amount}元`;
  if (row.type === 'adjustment') return `调增正${amount}元`;
  return `正${amount}元`;
}

export function TransactionRow({ row, onOpen }: TransactionRowProps) {
  const category = row.categoryName ? `，${row.categoryName}` : '';
  const accessibleName = `${row.title}${category}，${row.timeLabel}，${row.accountLabel}，${spokenAmount(row)}`;

  return (
    <button
      className={styles.transactionRow}
      type="button"
      aria-label={accessibleName}
      data-tone={row.amountTone}
      onClick={() => onOpen(row.id)}
    >
      <HandDrawnIcon asset={categoryAsset(row.categoryIconKey)} decorative />
      <span className={styles.rowCopy}>
        <strong>{row.title}</strong>
        <span>{row.timeLabel} · {row.accountLabel}</span>
      </span>
      <span
        className={styles.rowAmount}
        aria-hidden="true"
        data-numeric=""
        data-tone={row.amountTone}
      >
        {row.amountLabel}
      </span>
    </button>
  );
}
