import { parseYuan } from '../../domain/money';
import type { EntryOptions, TransactionCreateInput } from '../../view-model/types';

export type EntryType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment';
export type EntryField =
  | 'amount'
  | 'category'
  | 'account'
  | 'fromAccount'
  | 'toAccount'
  | 'originalExpense'
  | 'occurredAt';

export interface EntryDraftValues {
  type: EntryType;
  amountYuan: string;
  categoryId: string | null;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  originalTransactionId: string | null;
  adjustmentDirection: 'increase' | 'decrease';
  occurredAtLocal: string;
  note: string;
}

export interface EntryDraftState {
  values: EntryDraftValues;
  submitting: boolean;
  error: null | { field: EntryField; message: string };
}

export interface EntryPreferencePort {
  loadLastAccountId(): string | null;
  saveLastAccountId(accountId: string): void;
}

export interface EntryDraftController {
  getState(): EntryDraftState;
  subscribe(listener: () => void): () => void;
  update(patch: Partial<EntryDraftValues>): void;
  changeType(type: EntryType): void;
  setOptions(options: EntryOptions): void;
  validate(): { input: TransactionCreateInput } | { field: EntryField; message: string };
  submit(): Promise<{ transactionId: string }>;
  resetAfterSuccess(): void;
}

export interface EntryDraftControllerOptions {
  options: EntryOptions;
  quickCategoryId?: string | null;
  preferences: EntryPreferencePort;
  createTransaction(input: TransactionCreateInput): Promise<{ transactionId: string }>;
  now(): Date;
}

type ValidationResult = ReturnType<EntryDraftController['validate']>;
type ValidationError = Extract<ValidationResult, { field: EntryField }>;

const amountMessage = '请输入大于 0 的金额';
const staleMessage = '账户、分类或原支出已经变化，请重新选择';
const saveFailureMessage = '保存失败，请稍后重试';

function localMinute(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function occurredAtIso(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validationError(field: EntryField, message: string): ValidationError {
  return { field, message };
}

function rawErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mappedSaveError(error: unknown): ValidationError {
  const message = rawErrorMessage(error);
  const knownValidationMessages: Array<[string, EntryField, string]> = [
    ['转出和转入账户不能相同', 'toAccount', '转出和转入账户不能相同'],
    ['杞嚭鍜岃浆鍏ヨ处鎴', 'toAccount', '转出和转入账户不能相同'],
    ['转出账户必须是资产账户', 'fromAccount', '负债账户不能作为转出账户'],
    ['杞嚭璐︽埛蹇呴』鏄祫浜ц处鎴', 'fromAccount', '负债账户不能作为转出账户'],
    ['退款总额不能超过原支出', 'amount', '退款金额不能超过原支出剩余可退金额'],
    ['閫€娆炬€婚', 'amount', '退款金额不能超过原支出剩余可退金额'],
    ['余额校准差额不能为零', 'amount', '余额校准金额不能为 0'],
    ['浣欓鏍″噯宸涓嶈兘涓洪浂', 'amount', '余额校准金额不能为 0'],
  ];
  const known = knownValidationMessages.find(([fragment]) => message.includes(fragment));
  if (known) return validationError(known[1], known[2]);

  if (
    /账户|分类|原支出|已归档|不存在|分录|璐︽埛|鍒嗙被|鍘熸敮鍑|褰掓。|鍒嗗綍/.test(message)
  ) {
    const field: EntryField = message.includes('分类') || message.includes('鍒嗙被')
      ? 'category'
      : message.includes('原支出')
          || message.includes('分录')
          || message.includes('鍘熸敮鍑')
          || message.includes('鍒嗗綍')
        ? 'originalExpense'
        : 'account';
    return validationError(field, staleMessage);
  }
  return validationError('amount', saveFailureMessage);
}

export function createEntryDraftController(
  dependencies: EntryDraftControllerOptions,
): EntryDraftController {
  let currentOptions = dependencies.options;
  const listeners = new Set<() => void>();

  const compatibleAccountId = (candidate: string | null): string | null => (
    currentOptions.accounts.some((account) => account.id === candidate)
      ? candidate
      : currentOptions.accounts[0]?.id ?? null
  );

  const firstTransferDestination = (fromAccountId: string | null): string | null => (
    currentOptions.accounts.find((account) => account.id !== fromAccountId)?.id ?? null
  );

  const defaultValues = (preferredAccountId?: string | null): EntryDraftValues => {
    const storedAccountId = preferredAccountId ?? dependencies.preferences.loadLastAccountId();
    const accountId = compatibleAccountId(storedAccountId);
    const quickCategory = currentOptions.expenseCategories.find(
      (category) => category.id === dependencies.quickCategoryId,
    );
    return {
      type: 'expense',
      amountYuan: '',
      categoryId: quickCategory?.id ?? currentOptions.expenseCategories[0]?.id ?? null,
      accountId,
      fromAccountId: currentOptions.accounts.find(
        (account) => account.id === accountId && account.accountClass === 'asset',
      )?.id ?? currentOptions.accounts.find(
        (account) => account.accountClass === 'asset',
      )?.id ?? null,
      toAccountId: null,
      originalTransactionId: null,
      adjustmentDirection: 'increase',
      occurredAtLocal: localMinute(dependencies.now()),
      note: '',
    };
  };

  const initialValues = defaultValues();
  initialValues.toAccountId = firstTransferDestination(initialValues.fromAccountId);
  let state: EntryDraftState = {
    values: initialValues,
    submitting: false,
    error: null,
  };

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const setState = (next: EntryDraftState) => {
    state = next;
    notify();
  };

  const validate = (): ValidationResult => {
    let amountCents: number;
    try {
      amountCents = parseYuan(state.values.amountYuan);
    } catch {
      return validationError('amount', amountMessage);
    }

    if (amountCents === 0) {
      return validationError(
        'amount',
        state.values.type === 'adjustment'
          ? '余额校准金额不能为 0'
          : amountMessage,
      );
    }

    const occurredAt = occurredAtIso(state.values.occurredAtLocal);
    if (!occurredAt) {
      return validationError('occurredAt', '请选择有效的日期和时间');
    }

    const values = state.values;
    if (values.type === 'expense' || values.type === 'income') {
      const categories = values.type === 'expense'
        ? currentOptions.expenseCategories
        : currentOptions.incomeCategories;
      if (!values.categoryId) return validationError('category', '请选择分类');
      if (!categories.some((category) => category.id === values.categoryId)) {
        return validationError('category', staleMessage);
      }
      if (!values.accountId) return validationError('account', '请选择账户');
      const account = currentOptions.accounts.find((item) => item.id === values.accountId);
      if (!account) return validationError('account', staleMessage);
      if (values.type === 'income' && account.accountClass !== 'asset') {
        return validationError('account', '收入只能存入资产账户');
      }
      return {
        input: {
          type: values.type,
          amountCents,
          accountId: account.id,
          categoryId: values.categoryId,
          occurredAt,
          note: values.note,
        },
      };
    }

    if (values.type === 'transfer') {
      if (!values.fromAccountId) {
        return validationError('fromAccount', '请选择转出账户');
      }
      const from = currentOptions.accounts.find((item) => item.id === values.fromAccountId);
      if (!from) return validationError('fromAccount', staleMessage);
      if (from.accountClass !== 'asset') {
        return validationError('fromAccount', '负债账户不能作为转出账户');
      }
      if (!values.toAccountId) return validationError('toAccount', '请选择转入账户');
      if (!currentOptions.accounts.some((item) => item.id === values.toAccountId)) {
        return validationError('toAccount', staleMessage);
      }
      if (values.fromAccountId === values.toAccountId) {
        return validationError('toAccount', '转出和转入账户不能相同');
      }
      return {
        input: {
          type: 'transfer',
          amountCents,
          fromAccountId: values.fromAccountId,
          toAccountId: values.toAccountId,
          occurredAt,
          note: values.note,
        },
      };
    }

    if (values.type === 'refund') {
      if (!values.originalTransactionId) {
        return validationError('originalExpense', '请选择原支出');
      }
      const original = currentOptions.refundableExpenses.find(
        (item) => item.id === values.originalTransactionId,
      );
      if (!original) return validationError('originalExpense', staleMessage);
      if (amountCents > original.remainingCents) {
        return validationError('amount', '退款金额不能超过原支出剩余可退金额');
      }
      return {
        input: {
          type: 'refund',
          amountCents,
          originalTransactionId: original.id,
          occurredAt,
          note: values.note,
        },
      };
    }

    if (!values.accountId) return validationError('account', '请选择账户');
    if (!currentOptions.accounts.some((item) => item.id === values.accountId)) {
      return validationError('account', staleMessage);
    }
    return {
      input: {
        type: 'adjustment',
        deltaCents: values.adjustmentDirection === 'increase'
          ? amountCents
          : -amountCents,
        accountId: values.accountId,
        occurredAt,
        note: values.note,
      },
    };
  };

  const resetAfterSuccess = (preferredAccountId?: string | null) => {
    const values = defaultValues(preferredAccountId);
    values.toAccountId = firstTransferDestination(values.fromAccountId);
    setState({ values, submitting: false, error: null });
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(patch) {
      setState({
        ...state,
        values: { ...state.values, ...patch },
        error: null,
      });
    },
    changeType(type) {
      const values = { ...state.values, type };
      if (type === 'expense') {
        if (!currentOptions.expenseCategories.some(
          (category) => category.id === values.categoryId,
        )) values.categoryId = currentOptions.expenseCategories[0]?.id ?? null;
      } else if (type === 'income') {
        if (!currentOptions.incomeCategories.some(
          (category) => category.id === values.categoryId,
        )) values.categoryId = currentOptions.incomeCategories[0]?.id ?? null;
        const account = currentOptions.accounts.find((item) => item.id === values.accountId);
        if (account?.accountClass !== 'asset') {
          values.accountId = currentOptions.accounts.find(
            (item) => item.accountClass === 'asset',
          )?.id ?? null;
        }
      } else if (type === 'transfer') {
        const from = currentOptions.accounts.find((item) => (
          item.id === values.fromAccountId && item.accountClass === 'asset'
        ));
        values.fromAccountId = from?.id ?? currentOptions.accounts.find(
          (item) => item.accountClass === 'asset',
        )?.id ?? null;
        if (
          !currentOptions.accounts.some((item) => item.id === values.toAccountId)
          || values.toAccountId === values.fromAccountId
        ) values.toAccountId = firstTransferDestination(values.fromAccountId);
      }
      setState({ ...state, values, error: null });
    },
    setOptions(nextOptions) {
      currentOptions = nextOptions;
      notify();
    },
    validate,
    async submit() {
      if (state.submitting) throw new Error('正在保存，请稍候');
      const result = validate();
      if ('field' in result) {
        setState({ ...state, error: result });
        throw new Error(result.message);
      }
      setState({ ...state, submitting: true, error: null });
      try {
        const input = result.input;
        const saved = await dependencies.createTransaction(input);
        let successfulAccountId: string | null;
        if (input.type === 'transfer') {
          successfulAccountId = input.fromAccountId;
        } else if (input.type === 'refund') {
          successfulAccountId = currentOptions.refundableExpenses.find(
            (item) => item.id === input.originalTransactionId,
          )?.accountId ?? null;
        } else {
          successfulAccountId = input.accountId;
        }
        if (successfulAccountId) {
          dependencies.preferences.saveLastAccountId(successfulAccountId);
        }
        resetAfterSuccess(successfulAccountId);
        return saved;
      } catch (error) {
        setState({
          ...state,
          submitting: false,
          error: mappedSaveError(error),
        });
        throw error;
      }
    },
    resetAfterSuccess() {
      resetAfterSuccess();
    },
  };
}
