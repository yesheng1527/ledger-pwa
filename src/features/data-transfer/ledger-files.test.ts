import { describe, expect, it } from 'vitest';
import {
  applyBatchCategory,
  exportLedgerCsv,
  exportLedgerWorkbook,
  ledgerRowFingerprint,
  ledgerImportOperationId,
  parseLedgerCsv,
  parseLedgerWorkbook,
  type LedgerFileRow,
} from './ledger-files';

const row: LedgerFileRow = {
  occurredAt: '2026-08-08T08:30:00.000Z', type: 'expense', amountYuan: '12.50',
  name: '早餐“海风” 🥐', note: '第一行\n第二行，含逗号', account: '微信', toAccount: '',
  category: '餐饮', source: '微信', externalId: 'wx-001',
};

describe('ledger file import and export', () => {
  it('round trips arbitrary names and notes through CSV without exposing internal envelopes', () => {
    const csv = exportLedgerCsv([row]);
    expect(csv).not.toContain('SBLEDGER');
    const preview = parseLedgerCsv(csv);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject(row);
  });

  it('adapts WeChat and Alipay style headers, reports bad rows, and deduplicates transaction ids', () => {
    const csv = '\uFEFF交易时间,收/支,金额(元),商品说明,支付方式,交易单号,备注\n2026-08-08 08:30:00,支出,¥12.50,早餐,微信,w-1,早饭\n坏日期,支出,1.00,错误,微信,w-2,\n2026-08-08 09:30:00,支出,8.00,咖啡,支付宝,w-1,';
    const existing = new Set(['微信:id:w-1']);
    const preview = parseLedgerCsv(csv, existing);
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows.map((item) => item.duplicate)).toEqual([true, true]);
    expect(preview.errors).toEqual([{ line: 3, message: '日期格式无效' }]);
  });

  it('rejects unknown spreadsheets instead of guessing column meanings', () => {
    expect(() => parseLedgerCsv('时间点,数值,说明\n2026-08-08,12,早餐'))
      .toThrow('无法识别文件格式');
  });

  it('round trips an xlsx workbook and applies batch categories without changing transfers', async () => {
    const transfer = { ...row, type: 'transfer' as const, toAccount: '银行卡', category: '' };
    const workbook = await exportLedgerWorkbook([row, transfer]);
    const preview = await parseLedgerWorkbook(workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength) as ArrayBuffer);
    expect(preview.errors).toEqual([]);
    expect(applyBatchCategory(preview, '日常').rows.map((item) => item.category)).toEqual(['日常', '']);
  });

  it('uses external ids first and falls back to normalized semantic fields', () => {
    expect(ledgerRowFingerprint(row)).toBe('微信:id:wx-001');
    expect(ledgerRowFingerprint({ ...row, externalId: '' })).toContain('早餐“海风”');
    expect(ledgerImportOperationId(ledgerRowFingerprint(row))).toMatch(/^[0-9a-f-]{36}$/);
    expect(ledgerImportOperationId(ledgerRowFingerprint(row))).toBe(ledgerImportOperationId(ledgerRowFingerprint(row)));
  });
});
