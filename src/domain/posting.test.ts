import { describe, expect, it } from 'vitest';
import { buildPosting } from './posting';
import type { Account } from './types';

function account(id: string, accountClass: 'asset' | 'liability'): Account {
  return {
    id,
    ledgerId: '00000000-0000-4000-8000-000000000001',
    name: id,
    kind: accountClass === 'asset' ? 'debit_card' : 'credit_card',
    accountClass,
    currency: 'CNY',
    openingBalanceCents: 0,
    sortOrder: 0,
    version: 1,
    archivedAt: null,
  };
}

describe('buildPosting', () => {
  it('posts asset and credit-card expenses with the correct direction', () => {
    expect(buildPosting({ type: 'expense', amountCents: 6800, account: account('bank', 'asset') }))
      .toEqual([{ accountId: 'bank', deltaCents: -6800 }]);
    expect(buildPosting({ type: 'expense', amountCents: 6800, account: account('card', 'liability') }))
      .toEqual([{ accountId: 'card', deltaCents: 6800 }]);
  });

  it('posts income only to an asset account', () => {
    expect(buildPosting({ type: 'income', amountCents: 50000, account: account('bank', 'asset') }))
      .toEqual([{ accountId: 'bank', deltaCents: 50000 }]);
    expect(() => buildPosting({ type: 'income', amountCents: 50000, account: account('card', 'liability') }))
      .toThrow('收入只能存入资产账户');
  });

  it('posts transfers and credit-card repayments without creating expense', () => {
    expect(buildPosting({
      type: 'transfer',
      amountCents: 10000,
      from: account('bank', 'asset'),
      to: account('cash', 'asset'),
    })).toEqual([
      { accountId: 'bank', deltaCents: -10000 },
      { accountId: 'cash', deltaCents: 10000 },
    ]);

    expect(buildPosting({
      type: 'transfer',
      amountCents: 10000,
      from: account('bank', 'asset'),
      to: account('card', 'liability'),
    })).toEqual([
      { accountId: 'bank', deltaCents: -10000 },
      { accountId: 'card', deltaCents: -10000 },
    ]);
  });

  it('rejects same-account transfers and liability sources', () => {
    const bank = account('bank', 'asset');
    expect(() => buildPosting({ type: 'transfer', amountCents: 1, from: bank, to: bank }))
      .toThrow('转出和转入账户不能相同');
    expect(() => buildPosting({
      type: 'transfer',
      amountCents: 1,
      from: account('card', 'liability'),
      to: bank,
    })).toThrow('转出账户必须是资产账户');
  });

  it('reverses the original expense direction and caps cumulative refunds', () => {
    expect(buildPosting({
      type: 'refund',
      amountCents: 4000,
      originalExpenseAmountCents: 10000,
      alreadyRefundedCents: 5000,
      originalEntry: { accountId: 'bank', deltaCents: -10000 },
    })).toEqual([{ accountId: 'bank', deltaCents: 4000 }]);

    expect(buildPosting({
      type: 'refund',
      amountCents: 4000,
      originalExpenseAmountCents: 10000,
      alreadyRefundedCents: 0,
      originalEntry: { accountId: 'card', deltaCents: 10000 },
    })).toEqual([{ accountId: 'card', deltaCents: -4000 }]);

    expect(() => buildPosting({
      type: 'refund',
      amountCents: 5001,
      originalExpenseAmountCents: 10000,
      alreadyRefundedCents: 5000,
      originalEntry: { accountId: 'bank', deltaCents: -10000 },
    })).toThrow('退款总额不能超过原支出');
  });

  it('records one explicit signed adjustment', () => {
    expect(buildPosting({ type: 'adjustment', account: account('bank', 'asset'), deltaCents: -123 }))
      .toEqual([{ accountId: 'bank', deltaCents: -123 }]);
    expect(() => buildPosting({ type: 'adjustment', account: account('bank', 'asset'), deltaCents: 0 }))
      .toThrow('余额校准差额不能为零');
  });
});
