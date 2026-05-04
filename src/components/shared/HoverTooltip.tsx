import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface HoverTooltipProps {
  cx: number;
  cy: number;
  children: ReactNode;
  className?: string;
}

const MARGIN = 8;
const POINTER_OFFSET = 16;

/// Tooltip flottant ancré au pointeur, avec flip automatique si proche du bord viewport.
/// Rendu dans document.body via portal pour éviter tout clipping par un parent.
export function HoverTooltip({ cx, cy, children, className }: HoverTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({ left: 0, top: 0, ready: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();

    // Position préférée : à droite du pointeur, juste au-dessus
    let left = cx + POINTER_OFFSET;
    let top = cy - height - MARGIN;

    // Flip horizontal si débordement à droite
    if (left + width + MARGIN > window.innerWidth) {
      left = cx - width - POINTER_OFFSET;
    }
    // Clamp à gauche si flip insuffisant (pointeur très à gauche après flip)
    if (left < MARGIN) left = MARGIN;

    // Bascule en dessous si débordement en haut
    if (top < MARGIN) top = cy + POINTER_OFFSET;

    // Clamp en bas
    if (top + height + MARGIN > window.innerHeight) {
      top = window.innerHeight - height - MARGIN;
    }

    // Pattern measure-then-position : setState après mesure DOM est inhérent ici.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPos({ left, top, ready: true });
  }, [cx, cy]);

  return createPortal(
    <div
      ref={ref}
      className={cn(
        "fixed pointer-events-none z-50 rounded border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md",
        !pos.ready && "opacity-0",
        className,
      )}
      style={{ left: pos.left, top: pos.top }}
    >
      {children}
    </div>,
    document.body,
  );
}
