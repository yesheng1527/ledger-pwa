import { describe, expect, it } from 'vitest';
import { formatYuan, parseYuan } from './money';

describe('yuan money helpers', () => {
  it('parses yuan without floating point drift', () => {
    expect(parseYuan('68.00')).toBe(6800);
    expect(parseYuan('0.1')).toBe(10);
  });

  it('rejects values that cannot be stored as integer cents', () => {
    expect(() => parseYuan('1.001')).toThrow('金额最多保留两位小数');
    expect(() => parseYuan('-1')).toThrow('请输入有效金额');
    expect(() => parseYuan('1e3')).toThrow('请输入有效金额');
  });

  it('formats integer cents as CNY', () => {
    expect(formatYuan(6800)).toBe('¥68.00');
    expect(formatYuan(-10)).toBe('-¥0.10');
  });
});
