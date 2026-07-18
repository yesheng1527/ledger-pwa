import { z } from 'zod';

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const positiveVersion = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const positiveCents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const signedCents = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

const operationBase = {
  schemaVersion: z.literal(1),
  operationId: uuid,
  ledgerId: uuid,
  createdAt: timestamp,
};

const transactionSchema = z.object({
  id: uuid,
  operationId: uuid,
  ledgerId: uuid,
  type: z.enum(['expense', 'income', 'transfer', 'refund', 'adjustment']),
  amountCents: positiveCents,
  categoryId: uuid.nullable(),
  occurredAt: timestamp,
  note: z.string().max(500),
  originalTransactionId: uuid.nullable(),
  version: positiveVersion,
  deletedAt: timestamp.nullable(),
}).strict();

const entrySchema = z.object({
  accountId: uuid,
  deltaCents: signedCents.refine((value) => value !== 0),
}).strict();

const accountSchema = z.object({
  id: uuid,
  ledgerId: uuid,
  name: z.string().trim().min(1).max(50),
  kind: z.enum(['cash', 'wechat', 'alipay', 'debit_card', 'credit_card', 'custom']),
  accountClass: z.enum(['asset', 'liability']),
  currency: z.literal('CNY'),
  openingBalanceCents: signedCents,
  sortOrder: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  version: positiveVersion,
  archivedAt: timestamp.nullable(),
}).strict();

const categorySchema = z.object({
  id: uuid,
  ledgerId: uuid,
  name: z.string().trim().min(1).max(30),
  kind: z.enum(['expense', 'income']),
  iconKey: z.string().trim().min(1).max(50),
  sortOrder: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  version: positiveVersion,
  archivedAt: timestamp.nullable(),
}).strict();

const budgetSchema = z.object({
  id: uuid,
  ledgerId: uuid,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amountCents: positiveCents,
  version: positiveVersion,
  archivedAt: timestamp.nullable(),
}).strict();

const categoryBudgetSchema = z.object({
  id: uuid,
  ledgerId: uuid,
  categoryId: uuid,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amountCents: positiveCents,
  version: positiveVersion,
  archivedAt: timestamp.nullable(),
}).strict();

const reminderSchema = z.object({
  id: uuid,
  ledgerId: uuid,
  name: z.string().trim().min(1).max(50),
  amountCents: positiveCents.nullable(),
  categoryId: uuid.nullable(),
  accountId: uuid.nullable(),
  recurrence: z.string().trim().min(1).max(100),
  nextDueAt: timestamp,
  version: positiveVersion,
  archivedAt: timestamp.nullable(),
}).strict();

const transactionCreateSchema = z.object({
  ...operationBase,
  kind: z.literal('transaction.create'),
  transaction: transactionSchema,
  entries: z.array(entrySchema).min(1).max(2),
}).strict();

const transactionUpdateSchema = z.object({
  ...operationBase,
  kind: z.literal('transaction.update'),
  transactionId: uuid,
  baseVersion: positiveVersion,
  transaction: transactionSchema,
  entries: z.array(entrySchema).min(1).max(2),
}).strict();

const transactionDeleteSchema = z.object({
  ...operationBase,
  kind: z.literal('transaction.delete'),
  transactionId: uuid,
  baseVersion: positiveVersion,
  deletedAt: timestamp,
}).strict();

const transactionRestoreSchema = z.object({
  ...operationBase,
  kind: z.literal('transaction.restore'),
  transactionId: uuid,
  baseVersion: positiveVersion,
}).strict();

const accountCreateSchema = z.object({
  ...operationBase,
  kind: z.literal('account.create'),
  account: accountSchema,
}).strict();
const accountUpdateSchema = z.object({
  ...operationBase,
  kind: z.literal('account.update'),
  accountId: uuid,
  baseVersion: positiveVersion,
  account: accountSchema,
}).strict();
const accountArchiveSchema = z.object({
  ...operationBase,
  kind: z.literal('account.archive'),
  accountId: uuid,
  baseVersion: positiveVersion,
  archivedAt: timestamp,
}).strict();

const categoryCreateSchema = z.object({
  ...operationBase,
  kind: z.literal('category.create'),
  category: categorySchema,
}).strict();
const categoryUpdateSchema = z.object({
  ...operationBase,
  kind: z.literal('category.update'),
  categoryId: uuid,
  baseVersion: positiveVersion,
  category: categorySchema,
}).strict();
const categoryArchiveSchema = z.object({
  ...operationBase,
  kind: z.literal('category.archive'),
  categoryId: uuid,
  baseVersion: positiveVersion,
  archivedAt: timestamp,
}).strict();

const budgetCreateSchema = z.object({
  ...operationBase,
  kind: z.literal('budget.create'),
  budget: budgetSchema,
}).strict();
const budgetUpdateSchema = z.object({
  ...operationBase,
  kind: z.literal('budget.update'),
  budgetId: uuid,
  baseVersion: positiveVersion,
  budget: budgetSchema,
}).strict();
const budgetArchiveSchema = z.object({
  ...operationBase,
  kind: z.literal('budget.archive'),
  budgetId: uuid,
  baseVersion: positiveVersion,
  archivedAt: timestamp,
}).strict();

const categoryBudgetCreateSchema = z.object({
  ...operationBase,
  kind: z.literal('category-budget.create'),
  categoryBudget: categoryBudgetSchema,
}).strict();
const categoryBudgetUpdateSchema = z.object({
  ...operationBase,
  kind: z.literal('category-budget.update'),
  categoryBudgetId: uuid,
  baseVersion: positiveVersion,
  categoryBudget: categoryBudgetSchema,
}).strict();
const categoryBudgetArchiveSchema = z.object({
  ...operationBase,
  kind: z.literal('category-budget.archive'),
  categoryBudgetId: uuid,
  baseVersion: positiveVersion,
  archivedAt: timestamp,
}).strict();

const reminderCreateSchema = z.object({
  ...operationBase,
  kind: z.literal('reminder.create'),
  reminder: reminderSchema,
}).strict();
const reminderUpdateSchema = z.object({
  ...operationBase,
  kind: z.literal('reminder.update'),
  reminderId: uuid,
  baseVersion: positiveVersion,
  reminder: reminderSchema,
}).strict();
const reminderArchiveSchema = z.object({
  ...operationBase,
  kind: z.literal('reminder.archive'),
  reminderId: uuid,
  baseVersion: positiveVersion,
  archivedAt: timestamp,
}).strict();

const operationSchema = z.discriminatedUnion('kind', [
  transactionCreateSchema,
  transactionUpdateSchema,
  transactionDeleteSchema,
  transactionRestoreSchema,
  accountCreateSchema,
  accountUpdateSchema,
  accountArchiveSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryArchiveSchema,
  budgetCreateSchema,
  budgetUpdateSchema,
  budgetArchiveSchema,
  categoryBudgetCreateSchema,
  categoryBudgetUpdateSchema,
  categoryBudgetArchiveSchema,
  reminderCreateSchema,
  reminderUpdateSchema,
  reminderArchiveSchema,
]);

export type LedgerOperation = z.infer<typeof operationSchema>;

function hasRecordLedgerMismatch(operation: LedgerOperation): boolean {
  if ('transaction' in operation) return operation.transaction.ledgerId !== operation.ledgerId;
  if ('account' in operation) return operation.account.ledgerId !== operation.ledgerId;
  if ('category' in operation) return operation.category.ledgerId !== operation.ledgerId;
  if ('budget' in operation) return operation.budget.ledgerId !== operation.ledgerId;
  if ('categoryBudget' in operation) return operation.categoryBudget.ledgerId !== operation.ledgerId;
  if ('reminder' in operation) return operation.reminder.ledgerId !== operation.ledgerId;
  return false;
}

export function validateOperation(input: unknown): LedgerOperation {
  const result = operationSchema.safeParse(input);
  if (!result.success) {
    throw new Error('操作数据格式无效');
  }

  const operation = result.data;
  if (hasRecordLedgerMismatch(operation)) {
    throw new Error('操作数据格式无效');
  }
  if ('transaction' in operation) {
    if (operation.transaction.operationId !== operation.operationId) {
      throw new Error('操作数据格式无效');
    }
    if (operation.kind === 'transaction.update' && operation.transaction.id !== operation.transactionId) {
      throw new Error('操作数据格式无效');
    }
  }
  return operation;
}
