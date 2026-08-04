export type AppPage = 'home' | 'transactions' | 'entry' | 'statistics' | 'profile';

export const navigationItems = [
  { id: 'home', label: '首页' },
  { id: 'transactions', label: '流水' },
  { id: 'entry', label: '记账' },
  { id: 'statistics', label: '统计' },
  { id: 'profile', label: '我的' },
] as const satisfies ReadonlyArray<{ id: AppPage; label: string }>;
