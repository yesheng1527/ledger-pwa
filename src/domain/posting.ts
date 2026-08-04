import type { Account, LedgerEntry } from './types';

type ExpensePosting = { type: 'expense'; amountCents: number; account: Account };
type IncomePosting = { type: 'income'; amountCents: number; account: Account };
type TransferPosting = { type: 'transfer'; amountCents: number; from: Account; to: Account };
type RefundPosting = {
  type: 'refund';
  amountCents: number;
  originalExpenseAmountCents: number;
  alreadyRefundedCents: number;
  originalEntry: LedgerEntry;
};
type AdjustmentPosting = { type: 'adjustment'; account: Account; deltaCents: number };

export type PostingInput =
  | ExpensePosting
  | IncomePosting
  | TransferPosting
  | RefundPosting
  | AdjustmentPosting;

function assertPositiveCents(cents: number): void {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error('金额必须是正整数分');
  }
}

export function buildPosting(input: PostingInput): LedgerEntry[] {
  if (input.type === 'adjustment') {
    if (!Number.isSafeInteger(input.deltaCents) || input.deltaCents === 0) {
      throw new Error('余额校准差额不能为零');
    }
    return [{ accountId: input.account.id, deltaCents: input.deltaCents }];
  }

  assertPositiveCents(input.amountCents);

  if (input.type === 'expense') {
    return [{
      accountId: input.account.id,
      deltaCents: input.account.accountClass === 'asset' ? -input.amountCents : input.amountCents,
    }];
  }

  if (input.type === 'income') {
    if (input.account.accountClass !== 'asset') {
      throw new Error('收入只能存入资产账户');
    }
    return [{ accountId: input.account.id, deltaCents: input.amountCents }];
  }

  if (input.type === 'transfer') {
    if (input.from.id === input.to.id) {
      throw new Error('转出和转入账户不能相同');
    }
    if (input.from.accountClass !== 'asset') {
      throw new Error('转出账户必须是资产账户');
    }
    return [
      { accountId: input.from.id, deltaCents: -input.amountCents },
      {
        accountId: input.to.id,
        deltaCents: input.to.accountClass === 'asset' ? input.amountCents : -input.amountCents,
      },
    ];
  }

  if (!Number.isSafeInteger(input.alreadyRefundedCents) || input.alreadyRefundedCents < 0) {
    throw new Error('已退款金额无效');
  }
  assertPositiveCents(input.originalExpenseAmountCents);
  if (Math.abs(input.originalEntry.deltaCents) !== input.originalExpenseAmountCents) {
    throw new Error('原支出分录与金额不一致');
  }
  if (input.alreadyRefundedCents + input.amountCents > input.originalExpenseAmountCents) {
    throw new Error('退款总额不能超过原支出');
  }
  return [{
    accountId: input.originalEntry.accountId,
    deltaCents: input.originalEntry.deltaCents < 0 ? input.amountCents : -input.amountCents,
  }];
}
