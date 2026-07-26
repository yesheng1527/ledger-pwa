import type { AssetKey } from '../../assets/registry';
import { Amount } from '../../design-system/components/Amount';
import { HandDrawnIcon } from '../../design-system/components/HandDrawnIcon';
import type { TransactionRowModel } from '../../view-model/types';
import styles from './TransactionsPage.module.css';

export type TransactionRowProps = {
  row: TransactionRowModel;
  onOpen: (id: string) => void;
};

function categoryAsset(iconKey: string): AssetKey {
  const asset = `category:${iconKey}` as AssetKey;
  const knownAssets: readonly AssetKey[] = [
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

function spokenAmount(amountLabel: string): string {
  const negative = amountLabel.startsWith('-');
  return `${negative ? '负' : ''}${amountLabel.replace(/[+\-¥,]/g, '')}元`;
}

export function TransactionRow({ row, onOpen }: TransactionRowProps) {
  const category = row.categoryName ? `，${row.categoryName}` : '';
  const accessibleName = `${row.title}${category}，${row.timeLabel}，${row.accountLabel}，${spokenAmount(row.amountLabel)}`;

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
      <Amount
        cents={row.amountLabel.startsWith('-') ? -row.amountCents : row.amountCents}
        label={row.title}
        tone={row.amountTone}
      />
    </button>
  );
}
