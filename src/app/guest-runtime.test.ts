import { afterEach, describe, expect, it } from 'vitest';
import { LedgerDatabase } from '../db/local-db';
import { createGuestLedgerViewModel, GUEST_DATABASE_NAME, GUEST_LEDGER_ID } from './guest-runtime';

afterEach(async () => {
  await new LedgerDatabase(GUEST_DATABASE_NAME).delete();
});

describe('isolated guest ledger', () => {
  it('seeds useful demo data in its own database and never leaves an outbox item', async () => {
    const viewModel = await createGuestLedgerViewModel(new Date(2026, 7, 8, 12));
    const home = await viewModel.getHomeSnapshot({ now: new Date(2026, 7, 8, 12) });
    expect(home.recentTransactions.length).toBeGreaterThanOrEqual(3);
    expect(home.budget?.amountCents).toBe(300000);

    const options = await viewModel.getEntryOptions();
    const created = await viewModel.createTransaction({
      type: 'expense',
      amountCents: 1234,
      accountId: options.accounts.find((item) => item.accountClass === 'asset')!.id,
      categoryId: options.expenseCategories[0].id,
      occurredAt: new Date(2026, 7, 8, 13).toISOString(),
      name: '游客新增',
      note: '只在游客库',
    });
    expect(await viewModel.getTransactionDetail(created.transactionId)).toMatchObject({
      title: '游客新增',
      note: '只在游客库',
    });

    const guestDb = new LedgerDatabase(GUEST_DATABASE_NAME);
    expect(await guestDb.ledgers.get(GUEST_LEDGER_ID)).toBeTruthy();
    expect(await guestDb.outbox.count()).toBe(0);
    expect(GUEST_DATABASE_NAME).not.toBe('seabreeze-ledger-v2');
    viewModel.dispose();
    guestDb.close();
  });
});
