import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'compact' | 'medium' | 'expanded';

export const BREAKPOINTS = { medium: 768, expanded: 1200 } as const;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const breakpoint: Breakpoint =
    width >= BREAKPOINTS.expanded ? 'expanded' : width >= BREAKPOINTS.medium ? 'medium' : 'compact';
  return {
    width,
    height,
    breakpoint,
    /** Laptop/desktop/tablet-landscape layout: sidebar + multi-column. */
    isWide: breakpoint !== 'compact',
    /** Number of columns for card grids. */
    columns: breakpoint === 'expanded' ? 3 : breakpoint === 'medium' ? 2 : 1,
  };
}
