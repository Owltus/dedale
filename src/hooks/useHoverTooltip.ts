import { useCallback, useState, type MouseEvent } from "react";

/// Encapsule le state + handlers de hover pour piloter `<HoverTooltip />`.
/// Le payload `data` est typé librement par le caller.
export function useHoverTooltip<T>() {
  const [state, setState] = useState<{ data: T; cx: number; cy: number } | null>(null);

  const show = useCallback((data: T) => (e: MouseEvent) => {
    setState({ data, cx: e.clientX, cy: e.clientY });
  }, []);

  const move = useCallback((e: MouseEvent) => {
    setState((prev) => (prev ? { ...prev, cx: e.clientX, cy: e.clientY } : null));
  }, []);

  const hide = useCallback(() => setState(null), []);

  return { tooltip: state, show, move, hide };
}
