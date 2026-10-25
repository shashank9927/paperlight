import { useCallback, useEffect, useRef } from 'react';

// Pointer events may arrive faster than frames. Keep the final coordinates and
// expose an explicit flush for pointer-up, while keyboard actions stay immediate.
export function useFrameUpdate<T extends unknown[]>(callback: (...values: T) => void) {
  const latest = useRef(callback);
  latest.current = callback;
  const pending = useRef<T | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const cancel = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    pending.current = undefined;
  }, []);
  const flush = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    const values = pending.current;
    pending.current = undefined;
    if (values) latest.current(...values);
  }, []);
  const update = useCallback(
    (...values: T) => {
      pending.current = values;
      if (frame.current === undefined) frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );
  useEffect(() => cancel, [cancel]);
  return { update, flush, cancel };
}
