import { describe, expect, it } from 'vitest';
import { validateOperation } from './operations';

const operation = {
  schemaVersion: 1,
  operationId: '00000000-0000-4000-8000-000000000010',
  ledgerId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-07-18T08:00:00.000Z',
  kind: 'transaction.create',
  transaction: {
    id: '00000000-0000-4000-8000-000000000020',
    operationId: '00000000-0000-4000-8000-000000000010',
    ledgerId: '00000000-0000-4000-8000-000000000001',
    type: 'expense',
    amountCents: 6800,
    categoryId: null,
    occurredAt: '2026-07-18T08:00:00.000Z',
    note: '',
    originalTransactionId: null,
    version: 1,
    deletedAt: null,
  },
  entries: [{ accountId: '00000000-0000-4000-8000-000000000030', deltaCents: -6800 }],
} as const;

describe('validateOperation', () => {
  it('accepts a complete versioned transaction operation', () => {
    expect(validateOperation(operation)).toEqual(operation);
  });

  it('rejects unknown fields and invalid operation identifiers', () => {
    expect(() => validateOperation({ ...operation, unexpected: true })).toThrow('操作数据格式无效');
    expect(() => validateOperation({ ...operation, operationId: 'not-a-uuid' })).toThrow('操作数据格式无效');
  });

  it('rejects non-integer cents', () => {
    expect(() => validateOperation({
      ...operation,
      transaction: { ...operation.transaction, amountCents: 68.5 },
    })).toThrow('操作数据格式无效');
  });

  it('accepts a versioned category archive operation', () => {
    const categoryArchive = {
      schemaVersion: 1,
      operationId: '00000000-0000-4000-8000-000000000011',
      ledgerId: operation.ledgerId,
      createdAt: operation.createdAt,
      kind: 'category.archive',
      categoryId: '00000000-0000-4000-8000-000000000040',
      baseVersion: 3,
      archivedAt: '2026-07-18T08:10:00.000Z',
    };
    expect(validateOperation(categoryArchive)).toEqual(categoryArchive);
  });
});
