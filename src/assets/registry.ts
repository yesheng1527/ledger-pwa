import authSeaside from './illustrations/auth-seaside.svg?url';
import homeSeaside from './illustrations/home-seaside.svg?url';
import emptyLedger from './illustrations/empty-ledger.svg?url';
import profileSeaside from './illustrations/profile-seaside.svg?url';
import shell from './icons/brand/shell.svg?url';
import food from './icons/categories/food.svg?url';
import transport from './icons/categories/transport.svg?url';
import shopping from './icons/categories/shopping.svg?url';
import housing from './icons/categories/housing.svg?url';
import entertainment from './icons/categories/entertainment.svg?url';
import daily from './icons/categories/daily.svg?url';
import study from './icons/categories/study.svg?url';
import medical from './icons/categories/medical.svg?url';
import travel from './icons/categories/travel.svg?url';
import income from './icons/categories/income.svg?url';
import other from './icons/categories/other.svg?url';
import home from './icons/navigation/home.svg?url';
import ledger from './icons/navigation/ledger.svg?url';
import entry from './icons/navigation/entry.svg?url';
import statistics from './icons/navigation/statistics.svg?url';
import profile from './icons/navigation/profile.svg?url';
import search from './icons/actions/search.svg?url';
import calendar from './icons/actions/calendar.svg?url';
import actionReminder from './icons/actions/reminder.svg?url';
import close from './icons/actions/close.svg?url';
import more from './icons/actions/more.svg?url';
import budget from './icons/management/budget.svg?url';
import account from './icons/management/account.svg?url';
import managementReminder from './icons/management/reminder.svg?url';
import backup from './icons/management/backup.svg?url';
import theme from './icons/management/theme.svg?url';
import preferences from './icons/management/preferences.svg?url';
import about from './icons/management/about.svg?url';
import sync from './icons/management/sync.svg?url';

export const assetRegistry = {
  'brand:shell': shell,
  'illustration:auth-seaside': authSeaside,
  'illustration:home-seaside': homeSeaside,
  'illustration:empty-ledger': emptyLedger,
  'illustration:profile-seaside': profileSeaside,
  'nav:home': home,
  'nav:ledger': ledger,
  'nav:entry': entry,
  'nav:statistics': statistics,
  'nav:profile': profile,
  'category:food': food,
  'category:transport': transport,
  'category:shopping': shopping,
  'category:housing': housing,
  'category:entertainment': entertainment,
  'category:daily': daily,
  'category:study': study,
  'category:medical': medical,
  'category:travel': travel,
  'category:income': income,
  'category:other': other,
  'action:search': search,
  'action:calendar': calendar,
  'action:reminder': actionReminder,
  'action:close': close,
  'action:more': more,
  'management:budget': budget,
  'management:account': account,
  'management:reminder': managementReminder,
  'management:backup': backup,
  'management:theme': theme,
  'management:preferences': preferences,
  'management:about': about,
  'management:sync': sync,
} as const;

Object.freeze(assetRegistry);

export type AssetKey = keyof typeof assetRegistry;
