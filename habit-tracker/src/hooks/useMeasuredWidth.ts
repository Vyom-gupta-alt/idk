import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/** Width of a container, for charts that need an explicit pixel width. */
export function useMeasuredWidth(initial = 0) {
  const [width, setWidth] = useState(initial);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
  }, []);
  return { width, onLayout };
}
