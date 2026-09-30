import type { IconName } from '@/components/ui';

/** Single source of truth for primary destinations (sidebar + bottom bar). */
export const TABS: { name: string; title: string; icon: IconName; iconActive: IconName; shortcut: string }[] = [
  { name: '(home)', title: 'Dashboard', icon: 'grid-outline', iconActive: 'grid', shortcut: '1' },
  { name: 'analytics', title: 'Analytics', icon: 'stats-chart-outline', iconActive: 'stats-chart', shortcut: '2' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline', iconActive: 'settings', shortcut: '3' },
];
