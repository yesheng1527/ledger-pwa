import type { LocalLedgerRepository } from '../db/local-repository';
import type { LedgerOperation } from '../domain/operations';
import type { Account, Category, Transaction } from '../domain/types';

export interface HomeSnapshot {
  totalAssetsCents: number;
  todayExpenseCents: number;
  monthIncomeCents: number;
  monthExpenseCents: number;
  monthBalanceCents: number;
  budget: null | { amountCents: number; usedCents: number; remainingCents: number };
  quickCategories: Array<{ id: string; name: string; iconKey: string }>;
  recentTransactions: TransactionRowModel[];
}

export interface TransactionFilters {
  month: string;
  accountId: string | null;
  date: string | null;
  categoryId: string | null;
  query: string;
}

export interface TransactionRowModel {
  id: string;
  type: Transaction['type'];
  title: string;
  categoryName: string | null;
  categoryIconKey: string;
  occurredAt: string;
  timeLabel: string;
  accountLabel: string;
  amountCents: number;
  amountLabel: string;
  amountTone: 'expense' | 'income' | 'refund' | 'neutral' | 'adjustment';
  version: number;
}

export interface TransactionDateGroup {
  dateKey: string;
  dateLabel: string;
  expenseCents: number;
  incomeCents: number;
  rows: TransactionRowModel[];
}

export interface TransactionListSnapshot {
  groups: TransactionDateGroup[];
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; iconKey: string }>;
}

export interface HomeSyncState {
  label: string;
  tone: 'quiet' | 'warning' | 'error';
  retryable: boolean;
}

export interface TransactionDetail extends TransactionRowModel {
  ledgerId: string;
  categoryId: string | null;
  note: string;
  originalTransactionId: string | null;
  originalTransactionTitle: string | null;
  entries: Array<{ accountId: string; accountName: string; deltaCents: number }>;
  accountOptions: Array<{ id: string; name: string; accountClass: Account['accountClass'] }>;
  categoryOptions: Array<{ id: string; name: string; kind: Category['kind'] }>;
}

export type TransactionEditInput =
  | {
      id: string;
      baseVersion: number;
      type: 'expense' | 'income';
      amountCents: number;
      accountId: string;
      categoryId: string;
      occurredAt: string;
      note: string;
    }
  | {
      id: string;
      baseVersion: number;
      type: 'transfer';
      amountCents: number;
      fromAccountId: string;
      toAccountId: string;
      occurredAt: string;
      note: string;
    }
  | {
      id: string;
      baseVersion: number;
      type: 'refund';
      amountCents: number;
      occurredAt: string;
      note: string;
    }
  | {
      id: string;
      baseVersion: number;
      type: 'adjustment';
      deltaCents: number;
      accountId: string;
      occurredAt: string;
      note: string;
    };

export type TransactionCreateInput =
  | {
      type: 'expense' | 'income';
      amountCents: number;
      accountId: string;
      categoryId: string;
      occurredAt: string;
      note: string;
    }
  | {
      type: 'transfer';
      amountCents: number;
      fromAccountId: string;
      toAccountId: string;
      occurredAt: string;
      note: string;
    }
  | {
      type: 'refund';
      amountCents: number;
      originalTransactionId: string;
      occurredAt: string;
      note: string;
    }
  | {
      type: 'adjustment';
      deltaCents: number;
      accountId: string;
      occurredAt: string;
      note: string;
    };

export interface EntryOptions {
  accounts: Array<{ id: string; name: string; accountClass: Account['accountClass'] }>;
  expenseCategories: Array<{ id: string; name: string; iconKey: string }>;
  incomeCategories: Array<{ id: string; name: string; iconKey: string }>;
  refundableExpenses: Array<{
    id: string;
    title: string;
    accountId: string;
    remainingCents: number;
    occurredAt: string;
  }>;
}

export type LedgerQueryState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; retry: () => void };

export interface LedgerViewModelOptions {
  ledgerId: string;
  repository: Pick<
    LocalLedgerRepository,
    'readLedgerSnapshot' | 'watchLedger' | 'undoTransactionDelete'
  >;
  saveOperation(operation: LedgerOperation): Promise<void>;
  syncNow(): Promise<void>;
  now(): Date;
  makeUuid(): string;
}
