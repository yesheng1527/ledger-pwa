import { describe, expect, it } from 'vitest';
import {
  decodeTransactionText,
  encodeTransactionText,
  isInternalTransactionText,
} from './transaction-text';

const transactionId = '00000000-0000-4000-8000-000000000123';

describe('transaction text compatibility gate', () => {
  it('round trips Chinese, newlines, quotes, backslashes and emoji losslessly', () => {
    const name = '午餐“海风” 🍜';
    const note = '第一行\n第二行：他说“好”\\路径 🏝️';
    const stored = encodeTransactionText(transactionId, name, note);
    expect(decodeTransactionText(transactionId, stored)).toEqual({ name, note, legacy: false });
  });

  it('preserves legacy plain text exactly as a note without inventing a name', () => {
    const legacy = '  深度体验测试-可删除\n第二行  ';
    expect(decodeTransactionText(transactionId, legacy)).toEqual({
      name: '',
      note: legacy,
      legacy: true,
    });
  });

  it('treats prefix collisions, valid-looking foreign envelopes and damage as legacy notes', () => {
    const collision = '@seabreeze-transaction-text:2:{"name":"旧文字","note":"不能误解","check":"fake"}';
    const genuineForAnotherTransaction = encodeTransactionText(
      '00000000-0000-4000-8000-000000000999',
      '别的交易',
      '别的备注',
    );
    for (const legacy of [collision, genuineForAnotherTransaction, '@seabreeze-transaction-text:2:{oops']) {
      expect(decodeTransactionText(transactionId, legacy)).toEqual({ name: '', note: legacy, legacy: true });
    }
  });

  it('does not double encode during edit, duplicate or offline retry boundaries', () => {
    const stored = encodeTransactionText(transactionId, '午餐', '离线保存');
    const retried = encodeTransactionText(transactionId, '', stored);
    expect(retried).toBe(stored);
    expect(retried.match(/@seabreeze-transaction-text:2:/g)).toHaveLength(1);
  });

  it('marks storage envelopes so presentation/export code can prohibit leaking them', () => {
    expect(isInternalTransactionText(encodeTransactionText(transactionId, '名称', '备注'))).toBe(true);
    expect(isInternalTransactionText('普通旧备注')).toBe(false);
  });
});
