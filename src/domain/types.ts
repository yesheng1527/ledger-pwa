export type AccountClass = 'asset' | 'liability';
export type AccountKind =
  | 'cash'
  | 'wechat'
  | 'alipay'
  | 'debit_card'
  | 'credit_card'
  | 'custom';
export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment';
export type CategoryKind = 'expense' | 'income';

export interface Account {
  id: string;
  ledgerId: string;
  name: string;
  kind: AccountKind;
  accountClass: AccountClass;
  currency: 'CNY';
  openingBalanceCents: number;
  sortOrder: number;
  version: number;
  archivedAt: string | null;
}

export interface Category {
  id: string;
  ledgerId: string;
  name: string;
  kind: CategoryKind;
  iconKey: string;
  sortOrder: number;
  version: number;
  archivedAt: string | null;
}

export interface Transaction {
  id: string;
  operationId: string;
  ledgerId: string;
  type: TransactionType;
  amountCents: number;
  categoryId: string | null;
  occurredAt: string;
  note: string;
  originalTransactionId: string | null;
  version: number;
  deletedAt: string | null;
}

export interface LedgerEntry {
  accountId: string;
  deltaCents: number;
}

export interface LedgerEntryRecord extends LedgerEntry {
  id: string;
  ledgerId: string;
  transactionId: string;
}

export interface Budget {
  id: string;
  ledgerId: string;
  month: string;
  amountCents: number;
  version: number;
  archivedAt: string | null;
}

export interface CategoryBudget {
  id: string;
  ledgerId: string;
  categoryId: string;
  month: string;
  amountCents: number;
  version: number;
  archivedAt: string | null;
}

export interface Reminder {
  id: string;
  ledgerId: string;
  name: string;
  amountCents: number | null;
  categoryId: string | null;
  accountId: string | null;
  recurrence: string;
  nextDueAt: string;
  version: number;
  archivedAt: string | null;
}

export interface LedgerMetrics {
  netWorthCents: number;
  todayExpenseCents: number;
  periodIncomeCents: number;
  periodNetExpenseCents: number;
  periodBalanceCents: number;
}
