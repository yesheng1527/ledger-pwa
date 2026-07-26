import { useRef, useState, type FormEvent } from 'react';
import { parseYuan } from '../../domain/money';
import type { TransactionDetail, TransactionEditInput } from '../../view-model/types';
import styles from './TransactionsPage.module.css';

function centsInput(cents: number): string {
  const absolute = Math.abs(cents);
  return `${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

function localDateTimeInput(iso: string): string {
  const date = new Date(iso);
  return [
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`,
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(
      2,
      '0',
    )}:${String(date.getSeconds()).padStart(2, '0')}.${String(
      date.getMilliseconds(),
    ).padStart(3, '0')}`,
  ].join('T');
}

function authoredAmountError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('最多保留两位') || message.includes('鏈€澶氫繚鐣欎袱浣')) {
    return '金额最多保留两位小数';
  }
  if (message.includes('超出') || message.includes('瓒呭嚭')) {
    return '金额超出可记录范围';
  }
  return '请输入有效金额';
}

export type TransactionEditFormProps = {
  detail: TransactionDetail;
  onCancel(): void;
  onSave(input: TransactionEditInput): Promise<void>;
};

export function TransactionEditForm({
  detail,
  onCancel,
  onSave,
}: TransactionEditFormProps) {
  const [amount, setAmount] = useState(centsInput(detail.amountCents));
  const [occurredAt, setOccurredAt] = useState(localDateTimeInput(detail.occurredAt));
  const [note, setNote] = useState(detail.note);
  const [accountId, setAccountId] = useState(detail.entries[0]?.accountId ?? '');
  const [categoryId, setCategoryId] = useState(detail.categoryId ?? '');
  const [fromAccountId, setFromAccountId] = useState(
    detail.entries.find((entry) => entry.deltaCents < 0)?.accountId
      ?? detail.entries[0]?.accountId
      ?? '',
  );
  const [toAccountId, setToAccountId] = useState(
    detail.entries.find((entry) => entry.deltaCents > 0)?.accountId
      ?? detail.entries[1]?.accountId
      ?? '',
  );
  const [adjustmentDirection, setAdjustmentDirection] = useState<'increase' | 'decrease'>(
    (detail.entries[0]?.deltaCents ?? 0) < 0 ? 'decrease' : 'increase',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLSelectElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const fromAccountRef = useRef<HTMLSelectElement>(null);
  const toAccountRef = useRef<HTMLSelectElement>(null);
  const occurredAtRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  const fail = (
    message: string,
    target: { current: HTMLInputElement | HTMLSelectElement | null },
  ) => {
    setError(message);
    queueMicrotask(() => target.current?.focus());
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    let parsedAmount: number;
    try {
      parsedAmount = parseYuan(amount);
      if (parsedAmount === 0) {
        fail('金额必须大于 0', amountRef);
        return;
      }
    } catch (parseError) {
      fail(authoredAmountError(parseError), amountRef);
      return;
    }

    if (!occurredAt || Number.isNaN(new Date(occurredAt).getTime())) {
      fail('请选择有效的发生时间', occurredAtRef);
      return;
    }
    if (note.length > 500) {
      fail('备注不能超过 500 个字', noteRef);
      return;
    }
    if ((detail.type === 'expense' || detail.type === 'income') && !accountId) {
      fail('请选择账户', accountRef);
      return;
    }
    if ((detail.type === 'expense' || detail.type === 'income') && !categoryId) {
      fail('请选择分类', categoryRef);
      return;
    }
    if (detail.type === 'transfer' && fromAccountId === toAccountId) {
      fail('转出和转入账户不能相同', toAccountRef);
      return;
    }

    const common = {
      id: detail.id,
      baseVersion: detail.version,
      occurredAt: new Date(occurredAt).toISOString(),
      note,
    };
    let input: TransactionEditInput;
    switch (detail.type) {
      case 'expense':
      case 'income':
        input = {
          ...common,
          type: detail.type,
          amountCents: parsedAmount,
          accountId,
          categoryId,
        };
        break;
      case 'transfer':
        input = {
          ...common,
          type: 'transfer',
          amountCents: parsedAmount,
          fromAccountId,
          toAccountId,
        };
        break;
      case 'refund':
        input = {
          ...common,
          type: 'refund',
          amountCents: parsedAmount,
        };
        break;
      case 'adjustment':
        input = {
          ...common,
          type: 'adjustment',
          deltaCents: adjustmentDirection === 'increase' ? parsedAmount : -parsedAmount,
          accountId,
        };
        break;
    }

    setSaving(true);
    try {
      await onSave(input);
    } catch (saveError) {
      const raw = saveError instanceof Error ? saveError.message : '';
      const stale = raw.includes('流水已更新')
        || raw.includes('娴佹按宸叉洿鏂')
        || raw.includes('version');
      const invalidCategory = raw.includes('分类') || raw.includes('鍒嗙被');
      const invalidAccount = raw.includes('账户') || raw.includes('璐︽埛');
      const selectedSourceUnavailable = detail.type === 'transfer'
        && !detail.accountOptions.some((account) => account.id === fromAccountId);
      const invalidTransferSource = raw.includes('转出账户')
        || raw.includes('杞嚭璐︽埛')
        || (invalidAccount && selectedSourceUnavailable);
      const refundLimit = raw.includes('退款总额') || raw.includes('閫€娆炬€婚');
      if (stale) {
        setError('流水已更新，请刷新后重试');
        queueMicrotask(() => amountRef.current?.focus());
      } else if (invalidCategory) {
        setError('分类不可用，请重新选择');
        queueMicrotask(() => categoryRef.current?.focus());
      } else if (invalidTransferSource) {
        setError('转出账户不可用，请重新选择');
        queueMicrotask(() => fromAccountRef.current?.focus());
      } else if (invalidAccount) {
        setError('账户不可用，请重新选择');
        queueMicrotask(() => (
          detail.type === 'transfer' ? toAccountRef.current : accountRef.current
        )?.focus());
      } else if (refundLimit) {
        setError('退款金额超过原支出可退款余额');
        queueMicrotask(() => amountRef.current?.focus());
      } else {
        setError('保存失败，请检查输入后重试');
        queueMicrotask(() => amountRef.current?.focus());
      }
    } finally {
      setSaving(false);
    }
  };

  const sameTypeCategories = detail.categoryOptions.filter(
    (category) => category.kind === detail.type,
  );
  const singleAccountOptions = detail.type === 'income'
    ? detail.accountOptions.filter((account) => account.accountClass === 'asset')
    : detail.accountOptions;
  const transferFromOptions = detail.accountOptions.filter(
    (account) => account.accountClass === 'asset',
  );

  return (
    <form className={styles.editForm} onSubmit={(event) => void submit(event)}>
      <label className={styles.overlayField}>
        <span>金额</span>
        <input
          ref={amountRef}
          data-dialog-initial-focus=""
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>

      {detail.type === 'expense' || detail.type === 'income' ? (
        <>
          <label className={styles.overlayField}>
            <span>账户</span>
            <select
              ref={accountRef}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {singleAccountOptions.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <label className={styles.overlayField}>
            <span>分类</span>
            <select
              ref={categoryRef}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {sameTypeCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {detail.type === 'transfer' ? (
        <>
          <label className={styles.overlayField}>
            <span>转出账户</span>
            <select
              ref={fromAccountRef}
              value={fromAccountId}
              onChange={(event) => setFromAccountId(event.target.value)}
            >
              {transferFromOptions.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <label className={styles.overlayField}>
            <span>转入账户</span>
            <select
              ref={toAccountRef}
              value={toAccountId}
              onChange={(event) => setToAccountId(event.target.value)}
            >
              {detail.accountOptions.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {detail.type === 'refund' ? (
        <p className={styles.fixedAccount}>退款账户：{detail.entries[0]?.accountName}</p>
      ) : null}

      {detail.type === 'adjustment' ? (
        <>
          <fieldset className={styles.directionChoices}>
            <legend>余额方向</legend>
            <label>
              <input
                type="radio"
                name="adjustment-direction"
                checked={adjustmentDirection === 'increase'}
                onChange={() => setAdjustmentDirection('increase')}
              />
              增加余额
            </label>
            <label>
              <input
                type="radio"
                name="adjustment-direction"
                checked={adjustmentDirection === 'decrease'}
                onChange={() => setAdjustmentDirection('decrease')}
              />
              减少余额
            </label>
          </fieldset>
          <label className={styles.overlayField}>
            <span>账户</span>
            <select
              ref={accountRef}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {detail.accountOptions.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      <label className={styles.overlayField}>
        <span>发生时间</span>
        <input
          ref={occurredAtRef}
          type="datetime-local"
          step="0.001"
          value={occurredAt}
          onChange={(event) => setOccurredAt(event.target.value)}
        />
      </label>
      <label className={styles.overlayField}>
        <span>备注</span>
        <input
          ref={noteRef}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {error ? <p className={styles.overlayError} role="alert">{error}</p> : null}

      <div className={styles.overlayActions}>
        <button className={styles.secondaryAction} type="button" onClick={onCancel}>
          取消编辑
        </button>
        <button className={styles.primaryAction} type="submit" disabled={saving}>
          保存修改
        </button>
      </div>
    </form>
  );
}
