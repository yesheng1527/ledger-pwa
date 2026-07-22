import type { AssetKey } from '../assets/registry';

export type RegularTabId = 'home' | 'transactions' | 'statistics' | 'settings';

export type AppNavigationItem =
  | { kind: 'tab'; id: RegularTabId; label: string; icon: AssetKey }
  | { kind: 'entry'; id: 'entry'; label: '记账'; icon: 'nav:entry' };

export const navigationItems = [
  { kind: 'tab', id: 'home', label: '首页', icon: 'nav:home' },
  { kind: 'tab', id: 'transactions', label: '流水', icon: 'nav:ledger' },
  { kind: 'entry', id: 'entry', label: '记账', icon: 'nav:entry' },
  { kind: 'tab', id: 'statistics', label: '统计', icon: 'nav:statistics' },
  { kind: 'tab', id: 'settings', label: '我的', icon: 'nav:profile' },
] as const satisfies readonly AppNavigationItem[];
