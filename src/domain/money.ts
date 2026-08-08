function assertSafeCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new Error('金额必须是安全的整数分');
  }
}

export const MAX_TRANSACTION_CENTS = 9_999_999_999;

export function parseYuan(input: string): number {
  const value = input.trim();
  if (/^\d+\.\d{3,}$/.test(value)) {
    throw new Error('金额最多保留两位小数');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error('请输入有效金额');
  }

  const [yuan, fen = ''] = value.split('.');
  const cents = (BigInt(yuan) * 100n) + BigInt(fen.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('金额超出可记录范围');
  }
  return Number(cents);
}

export function parsePositiveYuan(input: string): number {
  const cents = parseYuan(input);
  if (cents <= 0) throw new Error('金额必须大于0');
  if (cents > MAX_TRANSACTION_CENTS) throw new Error('金额不能超过99,999,999.99元');
  return cents;
}

export function formatYuan(cents: number): string {
  assertSafeCents(cents);
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const yuan = Math.floor(absolute / 100);
  const fen = String(absolute % 100).padStart(2, '0');
  return `${sign}¥${yuan}.${fen}`;
}
