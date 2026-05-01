import { useEffect, useRef, useState } from "react";

/// Mesure la largeur d'un élément DOM via `ResizeObserver` et retourne `[ref, width]`.
/// Le state n'est mis à jour que si la largeur a varié de plus de 1 pixel — évite
/// les re-renders infinis sur les fluctuations sub-pixel et les boucles `ResizeObserver`.
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(
  initial = 0,
): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setWidth((prev) => (Math.abs(prev - w) < 2 ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
