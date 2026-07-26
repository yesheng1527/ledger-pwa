import type { TransactionDetail } from '../../view-model/types';
import styles from './TransactionsPage.module.css';

const typeLabels: Record<TransactionDetail['type'], string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
  refund: '退款',
  adjustment: '余额调整',
};

function localDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${String(
    date.getHours(),
  ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export type TransactionDetailSheetProps = {
  detail: TransactionDetail;
  deleting: boolean;
  deleteDisabled: boolean;
  deleteMessage: string | null;
  error: string | null;
  onEdit(): void;
  onDelete(): Promise<void>;
};

export function TransactionDetailSheet({
  detail,
  deleting,
  deleteDisabled,
  deleteMessage,
  error,
  onEdit,
  onDelete,
}: TransactionDetailSheetProps) {
  return (
    <>
      <dl className={styles.detailList}>
        <div>
          <dt>类型</dt>
          <dd>{typeLabels[detail.type]}</dd>
        </div>
        <div>
          <dt>金额</dt>
          <dd data-numeric="">{detail.amountLabel}</dd>
        </div>
        <div>
          <dt>分类</dt>
          <dd>{detail.categoryName ?? '无分类'}</dd>
        </div>
        <div>
          <dt>{detail.entries.length > 1 ? '账户' : '账户'}</dt>
          <dd>{detail.entries.map((entry) => entry.accountName).join(' → ')}</dd>
        </div>
        <div>
          <dt>发生时间</dt>
          <dd>{localDateTime(detail.occurredAt)}</dd>
        </div>
        <div>
          <dt>备注</dt>
          <dd>{detail.note || '无备注'}</dd>
        </div>
        <div>
          <dt>版本</dt>
          <dd>版本 {detail.version}</dd>
        </div>
        {detail.originalTransactionTitle ? (
          <div>
            <dt>原支出</dt>
            <dd>{detail.originalTransactionTitle}</dd>
          </div>
        ) : null}
      </dl>

      {deleteMessage ? <p className={styles.inlineNotice}>{deleteMessage}</p> : null}
      {error ? <p className={styles.overlayError} role="alert">{error}</p> : null}

      <div className={styles.overlayActions}>
        <button
          className={styles.secondaryAction}
          type="button"
          data-dialog-initial-focus=""
          onClick={onEdit}
        >
          编辑流水
        </button>
        <button
          className={styles.dangerAction}
          type="button"
          disabled={deleting || deleteDisabled}
          onClick={() => void onDelete()}
        >
          删除流水
        </button>
      </div>
    </>
  );
}
