import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { assetRegistry, type AssetKey } from '../../assets/registry';
import { HandDrawnIcon } from '../../design-system/components/HandDrawnIcon';
import type { EntryOptions } from '../../view-model/types';
import type {
  EntryDraftController,
  EntryField,
  EntryType,
} from './entry-draft';
import styles from './TransactionEntryPage.module.css';

export type TransactionEntryPageProps = {
  controller: EntryDraftController;
  options: EntryOptions;
  onClose(): void;
  onSaved(transactionId: string): void;
};

const primaryTypes: Array<{ type: EntryType; label: string }> = [
  { type: 'expense', label: '支出' },
  { type: 'income', label: '收入' },
];

const moreTypes: Array<{ type: EntryType; label: string }> = [
  { type: 'transfer', label: '转账' },
  { type: 'refund', label: '退款' },
  { type: 'adjustment', label: '余额校准' },
];

function categoryAsset(iconKey: string): AssetKey {
  const candidate = `category:${iconKey}` as AssetKey;
  return candidate in assetRegistry ? candidate : 'category:other';
}

export function TransactionEntryPage({
  controller,
  options,
  onClose,
  onSaved,
}: TransactionEntryPageProps) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLSelectElement>(null);
  const fromAccountRef = useRef<HTMLSelectElement>(null);
  const toAccountRef = useRef<HTMLSelectElement>(null);
  const originalExpenseRef = useRef<HTMLSelectElement>(null);
  const occurredAtRef = useRef<HTMLInputElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    controller.setOptions(options);
  }, [controller, options]);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  const focusField = (field: EntryField) => {
    const refs = {
      amount: amountRef,
      category: categoryRef,
      account: accountRef,
      fromAccount: fromAccountRef,
      toAccount: toAccountRef,
      originalExpense: originalExpenseRef,
      occurredAt: occurredAtRef,
    };
    queueMicrotask(() => refs[field].current?.focus());
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await controller.submit();
      onSaved(result.transactionId);
    } catch {
      const error = controller.getState().error;
      if (error) focusField(error.field);
    }
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (!state.submitting) {
        event.preventDefault();
        onClose();
      }
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      '[data-entry-control="true"]:not(:disabled)',
    ) ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const values = state.values;
  const categories = values.type === 'income'
    ? options.incomeCategories
    : options.expenseCategories;
  const selectedRefund = options.refundableExpenses.find(
    (item) => item.id === values.originalTransactionId,
  );
  const refundAccount = selectedRefund
    ? options.accounts.find((account) => account.id === selectedRefund.accountId)
    : undefined;

  const typeButton = ({ type, label }: { type: EntryType; label: string }) => (
    <button
      key={type}
      className={styles.typeButton}
      type="button"
      aria-pressed={values.type === type}
      data-entry-control="true"
      disabled={state.submitting}
      onClick={() => controller.changeType(type)}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={dialogRef}
      className={styles.layer}
      role="dialog"
      aria-modal="true"
      aria-labelledby="transaction-entry-title"
      onKeyDownCapture={handleDialogKeyDown}
    >
      <form className={styles.page} onSubmit={submit}>
        <header className={styles.header}>
          <button
            ref={closeRef}
            className={styles.iconButton}
            type="button"
            aria-label="关闭记账"
            data-entry-control="true"
            disabled={state.submitting}
            onClick={onClose}
          >
            <HandDrawnIcon asset="action:close" decorative />
          </button>
          <h1 id="transaction-entry-title" className={styles.srOnly}>记账</h1>
          <fieldset className={styles.typeGroup} aria-label="主要记账类型">
            <legend className={styles.srOnly}>主要记账类型</legend>
            {primaryTypes.map(typeButton)}
          </fieldset>
          <span className={styles.headerSpacer} aria-hidden="true" />
        </header>

        <div className={styles.scroller}>
          <label className={`${styles.field} ${styles.amountField}`}>
            <span className={styles.srOnly}>金额</span>
            <span className={styles.amountShell}>
              <span aria-hidden="true">¥</span>
              <input
                ref={amountRef}
                className={styles.amountInput}
                name="amount"
                aria-label="金额"
                inputMode="decimal"
                autoComplete="off"
                data-entry-control="true"
                disabled={state.submitting}
                value={values.amountYuan}
                onChange={(event) => controller.update({ amountYuan: event.target.value })}
              />
            </span>
          </label>

          {values.type === 'expense' || values.type === 'income' ? (
            <fieldset
              className={styles.categoryGroup}
              aria-label={values.type === 'expense' ? '支出分类' : '收入分类'}
            >
              <legend className={styles.srOnly}>
                {values.type === 'expense' ? '支出分类' : '收入分类'}
              </legend>
              <div className={styles.categoryGrid}>
                {categories.map((category, index) => (
                  <button
                    key={category.id}
                    ref={index === 0 ? categoryRef : undefined}
                    className={styles.categoryButton}
                    type="button"
                    aria-pressed={values.categoryId === category.id}
                    data-entry-control="true"
                    disabled={state.submitting}
                    onClick={() => controller.update({ categoryId: category.id })}
                  >
                    <HandDrawnIcon asset={categoryAsset(category.iconKey)} decorative />
                    <span>{category.name}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <section className={styles.detailCard} aria-label="记账详情">
            <label className={styles.detailField}>
              <span>备注</span>
              <textarea
                rows={1}
                maxLength={500}
                placeholder="点击写备注…"
                data-entry-control="true"
                disabled={state.submitting}
                value={values.note}
                onChange={(event) => controller.update({ note: event.target.value })}
              />
            </label>

            <label className={styles.detailField}>
              <span>日期</span>
              <input
                ref={occurredAtRef}
                aria-label="发生时间"
                type="datetime-local"
                data-entry-control="true"
                disabled={state.submitting}
                value={values.occurredAtLocal}
                onChange={(event) => controller.update({ occurredAtLocal: event.target.value })}
              />
            </label>

            {values.type === 'expense' || values.type === 'income' ? (
              <label className={styles.detailField}>
                <span>账户</span>
                <select
                  ref={accountRef}
                  aria-label={values.type === 'income' ? '收入账户' : '支出账户'}
                  data-entry-control="true"
                  disabled={state.submitting}
                  value={values.accountId ?? ''}
                  onChange={(event) => controller.update({ accountId: event.target.value || null })}
                >
                  {(values.type === 'income'
                    ? options.accounts.filter((account) => account.accountClass === 'asset')
                    : options.accounts
                  ).map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {values.type === 'transfer' ? (
              <div className={styles.transferFields}>
                <label className={styles.detailField}>
                  <span>转出账户</span>
                  <select
                    ref={fromAccountRef}
                    data-entry-control="true"
                    disabled={state.submitting}
                    value={values.fromAccountId ?? ''}
                    onChange={(event) => controller.update({
                      fromAccountId: event.target.value || null,
                    })}
                  >
                    {options.accounts
                      .filter((account) => account.accountClass === 'asset')
                      .map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                  </select>
                </label>
                <label className={styles.detailField}>
                  <span>转入账户</span>
                  <select
                    ref={toAccountRef}
                    data-entry-control="true"
                    disabled={state.submitting}
                    value={values.toAccountId ?? ''}
                    onChange={(event) => controller.update({
                      toAccountId: event.target.value || null,
                    })}
                  >
                    {options.accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {values.type === 'refund' ? (
              <>
                <label className={styles.detailField}>
                  <span>原支出</span>
                  <select
                    ref={originalExpenseRef}
                    data-entry-control="true"
                    disabled={state.submitting}
                    value={values.originalTransactionId ?? ''}
                    onChange={(event) => controller.update({
                      originalTransactionId: event.target.value || null,
                    })}
                  >
                    <option value="">请选择</option>
                    {options.refundableExpenses.map((expense) => (
                      <option key={expense.id} value={expense.id}>
                        {expense.title} · 可退 ¥{(expense.remainingCents / 100).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className={styles.readOnlyAccount}>
                  {refundAccount ? `退款原账户：${refundAccount.name}` : '选择原支出后显示退款账户'}
                </p>
              </>
            ) : null}

            {values.type === 'adjustment' ? (
              <>
                <fieldset className={styles.directionGroup}>
                  <legend>调整方向</legend>
                  <label>
                    <input
                      type="radio"
                      name="adjustment-direction"
                      value="increase"
                      checked={values.adjustmentDirection === 'increase'}
                      data-entry-control="true"
                      disabled={state.submitting}
                      onChange={() => controller.update({ adjustmentDirection: 'increase' })}
                    />
                    <span>增加余额</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="adjustment-direction"
                      value="decrease"
                      checked={values.adjustmentDirection === 'decrease'}
                      data-entry-control="true"
                      disabled={state.submitting}
                      onChange={() => controller.update({ adjustmentDirection: 'decrease' })}
                    />
                    <span>减少余额</span>
                  </label>
                </fieldset>
                <label className={styles.detailField}>
                  <span>调整账户</span>
                  <select
                    ref={accountRef}
                    data-entry-control="true"
                    disabled={state.submitting}
                    value={values.accountId ?? ''}
                    onChange={(event) => controller.update({ accountId: event.target.value || null })}
                  >
                    {options.accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
          </section>

          <button
            className={styles.moreTypeTrigger}
            type="button"
            aria-expanded={advancedOpen}
            data-entry-control="true"
            disabled={state.submitting}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            更多记账类型
          </button>

          {advancedOpen ? (
            <fieldset className={styles.moreGroup} aria-label="更多类型">
              <legend className={styles.srOnly}>更多类型</legend>
              <div className={styles.moreButtons}>{moreTypes.map(typeButton)}</div>
            </fieldset>
          ) : null}

          {state.error ? (
            <p className={styles.error} role="alert">{state.error.message}</p>
          ) : null}
        </div>

        <div className={styles.saveBar}>
          <button
            className={styles.saveButton}
            type="submit"
            data-entry-control="true"
            disabled={state.submitting}
            aria-busy={state.submitting ? 'true' : undefined}
          >
            {state.submitting ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}
