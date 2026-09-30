import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { todayKey } from '@/lib/dates';

/** Today's date key; refreshes at midnight and when the app returns to the foreground. */
export function useToday(): string {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const refresh = () => setToday(todayKey());
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const timer = setTimeout(refresh, midnight - now.getTime() + 1000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [today]);
  return today;
}
