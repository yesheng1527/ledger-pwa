import type ExcelJSTypes from 'exceljs';

export type LedgerFileRow = {
  occurredAt: string;
  type: 'expense' | 'income' | 'transfer';
  amountYuan: string;
  name: string;
  note: string;
  account: string;
  toAccount: string;
  category: string;
  source: string;
  externalId: string;
};

export type LedgerImportPreview = {
  rows: Array<LedgerFileRow & { line: number; fingerprint: string; duplicate: boolean }>;
  errors: Array<{ line: number; message: string }>;
};

export const ledgerFileHeaders = ['日期', '类型', '金额', '名称', '备注', '账户', '转入账户', '类目', '来源', '交易单号'] as const;

function normalizedHeader(value: unknown): string {
  return String(value ?? '').trim().replace(/[（(]/g, '(').replace(/[）)]/g, ')').replace(/\s+/g, '');
}

function parseCsvMatrix(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('CSV 引号未闭合');
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((current) => current.some((value) => value.trim()));
}

function pick(record: Map<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = record.get(normalizedHeader(name));
    if (value?.trim()) return value.trim();
  }
  return '';
}

function normalizeDate(value: string): string {
  const normalized = value.trim().replace(/\//g, '-');
  const parsed = new Date(normalized.includes('T') ? normalized : normalized.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) throw new Error('日期格式无效');
  return parsed.toISOString();
}

function normalizeType(value: string): LedgerFileRow['type'] {
  const normalized = value.replace(/\s+/g, '');
  if (/^(贷|贷方)$/.test(normalized)) return 'income';
  if (/^(借|借方)$/.test(normalized)) return 'expense';
  if (/收入|收款|入账/.test(normalized)) return 'income';
  if (/转账/.test(normalized)) return 'transfer';
  if (/支出|付款|消费|扣款/.test(normalized)) return 'expense';
  throw new Error('类型必须是支出、收入或转账');
}

type LedgerFileFormat = 'standard' | 'wechat' | 'alipay' | 'bank';

function detectFormat(headers: readonly string[]): LedgerFileFormat {
  const has = (...names: string[]) => names.some((name) => headers.includes(normalizedHeader(name)));
  if (has('日期') && has('类型') && has('金额')) return 'standard';
  if (has('交易时间') && has('收/支') && has('金额(元)')) return 'wechat';
  if (has('交易创建时间') && has('收/支') && has('金额(元)', '金额')) return 'alipay';
  if (has('交易日期', '记账日期') && has('借贷标志', '收支标志', '类型') && has('发生金额', '交易金额', '金额')) return 'bank';
  throw new Error('无法识别文件格式，请使用海风模板或微信、支付宝、银行卡标准 CSV/XLSX 表头');
}

function normalizeAmount(value: string): string {
  const normalized = value.replace(/[¥￥,元\s]/g, '').replace(/^[-+]/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) throw new Error('金额必须是正数且最多两位小数');
  return Number(normalized).toFixed(2);
}

export function ledgerRowFingerprint(row: LedgerFileRow): string {
  return row.externalId
    ? `${row.source || 'file'}:id:${row.externalId}`
    : [row.occurredAt, row.type, row.amountYuan, row.name, row.account, row.toAccount].join('|');
}

export function ledgerImportOperationId(fingerprint: string): string {
  let hex = '';
  for (let salt = 0; salt < 4; salt += 1) {
    let hash = 0x811c9dc5 ^ salt;
    for (let index = 0; index < fingerprint.length; index += 1) {
      hash ^= fingerprint.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    hex += (hash >>> 0).toString(16).padStart(8, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function parseMatrix(matrix: string[][], existingFingerprints: ReadonlySet<string>): LedgerImportPreview {
  if (matrix.length < 2) return { rows: [], errors: [{ line: 1, message: '文件没有可导入的数据行' }] };
  const headers = matrix[0].map(normalizedHeader);
  const format = detectFormat(headers);
  const seen = new Set(existingFingerprints);
  const rows: LedgerImportPreview['rows'] = [];
  const errors: LedgerImportPreview['errors'] = [];
  matrix.slice(1).forEach((values, index) => {
    const line = index + 2;
    const record = new Map(headers.map((header, column) => [header, String(values[column] ?? '')]));
    try {
      const occurredAt = normalizeDate(pick(record, '日期', '交易时间', '交易创建时间', '交易日期', '记账日期'));
      const type = normalizeType(pick(record, '类型', '收/支', '交易类型', '借贷标志', '收支标志'));
      const amountYuan = normalizeAmount(pick(record, '金额', '金额(元)', '交易金额', '发生金额'));
      const name = pick(record, '名称', '商品说明', '商品名称', '商品', '交易对方', '摘要', '对方户名') || '未命名流水';
      const note = pick(record, '备注', '交易备注');
      const account = pick(record, '账户', '支付方式', '付款方式', '银行卡', '账号') || '默认账户';
      const toAccount = pick(record, '转入账户', '收款账户');
      const category = pick(record, '类目', '分类');
      const source = pick(record, '来源', '平台') || ({ standard: '海风模板', wechat: '微信', alipay: '支付宝', bank: '银行卡' } as const)[format];
      const externalId = pick(record, '交易单号', '交易号', '商户单号', '流水号');
      const row: LedgerFileRow = { occurredAt, type, amountYuan, name, note, account, toAccount, category, source, externalId };
      const fingerprint = ledgerRowFingerprint(row);
      const duplicate = seen.has(fingerprint) || seen.has(ledgerImportOperationId(fingerprint));
      seen.add(fingerprint);
      rows.push({ ...row, line, fingerprint, duplicate });
    } catch (error) {
      errors.push({ line, message: error instanceof Error ? error.message : '数据格式无效' });
    }
  });
  return { rows, errors };
}

export function parseLedgerCsv(text: string, existingFingerprints: ReadonlySet<string> = new Set()): LedgerImportPreview {
  return parseMatrix(parseCsvMatrix(text), existingFingerprints);
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function exportLedgerCsv(rows: readonly LedgerFileRow[]): string {
  const lines = [ledgerFileHeaders.join(',')];
  for (const row of rows) {
    lines.push([
      row.occurredAt, row.type === 'expense' ? '支出' : row.type === 'income' ? '收入' : '转账',
      row.amountYuan, row.name, row.note, row.account, row.toAccount, row.category, row.source, row.externalId,
    ].map(csvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export async function exportLedgerWorkbook(rows: readonly LedgerFileRow[]): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('海风流水');
  sheet.addRow([...ledgerFileHeaders]);
  rows.forEach((row) => sheet.addRow([
    row.occurredAt, row.type === 'expense' ? '支出' : row.type === 'income' ? '收入' : '转账',
    Number(row.amountYuan), row.name, row.note, row.account, row.toAccount, row.category, row.source, row.externalId,
  ]));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = 18; });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function parseLedgerWorkbook(buffer: ArrayBuffer, existingFingerprints: ReadonlySet<string> = new Set()): Promise<LedgerImportPreview> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], errors: [{ line: 1, message: '工作簿没有工作表' }] };
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as ExcelJSTypes.CellValue[];
    matrix.push(values.slice(1).map((value) => {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'object' && value && 'text' in value) return String(value.text);
      return String(value ?? '');
    }));
  });
  return parseMatrix(matrix, existingFingerprints);
}

export function applyBatchCategory(preview: LedgerImportPreview, category: string): LedgerImportPreview {
  return { ...preview, rows: preview.rows.map((row) => row.type === 'transfer' ? row : { ...row, category }) };
}
