import authSeaside from './illustrations/auth-seaside.svg?url';
import shell from './icons/brand/shell.svg?url';
import home from './icons/navigation/home.svg?url';
import ledger from './icons/navigation/ledger.svg?url';
import entry from './icons/navigation/entry.svg?url';
import statistics from './icons/navigation/statistics.svg?url';
import profile from './icons/navigation/profile.svg?url';

export const assetRegistry = {
  'brand:shell': shell,
  'illustration:auth-seaside': authSeaside,
  'nav:home': home,
  'nav:ledger': ledger,
  'nav:entry': entry,
  'nav:statistics': statistics,
  'nav:profile': profile,
} as const;

export type AssetKey = keyof typeof assetRegistry;
