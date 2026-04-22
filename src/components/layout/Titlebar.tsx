import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

const appWindow = getCurrentWindow();

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    appWindow.isMaximized().then((v) => {
      if (!cancelled) setMaximized(v);
    });

    appWindow.onResized(() => {
      appWindow.isMaximized().then((v) => {
        if (!cancelled) setMaximized(v);
      });
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex h-8 shrink-0 items-center justify-between border-b bg-background select-none"
    >
      <div data-tauri-drag-region className="flex-1" />
      <div className="flex h-full">
        <TitlebarButton onClick={() => appWindow.minimize()} ariaLabel="Réduire">
          <Minus className="size-3.5" />
        </TitlebarButton>
        <TitlebarButton
          onClick={() => appWindow.toggleMaximize()}
          ariaLabel={maximized ? "Restaurer" : "Agrandir"}
        >
          {maximized ? <Copy className="size-3 -scale-x-100" /> : <Square className="size-3" />}
        </TitlebarButton>
        <TitlebarButton onClick={() => appWindow.close()} ariaLabel="Fermer" variant="close">
          <X className="size-3.5" />
        </TitlebarButton>
      </div>
    </div>
  );
}

interface TitlebarButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel: string;
  variant?: "default" | "close";
}

function TitlebarButton({ onClick, children, ariaLabel, variant = "default" }: TitlebarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-full w-11 items-center justify-center text-muted-foreground transition-colors",
        variant === "close"
          ? "hover:bg-destructive hover:text-destructive-foreground"
          : "hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {children}
    </button>
  );
}
