import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import type { BackupInfo, BackupProgress } from "@/lib/types/backup";
import { formatBytes } from "@/lib/utils/format";

export type BackupSessionResult =
  | { kind: "success"; info: BackupInfo; at: number }
  | { kind: "error"; message: string; at: number };

interface BackupSession {
  progress: BackupProgress | null;
  isPending: boolean;
  lastResult: BackupSessionResult | null;
  start: (destinationPath: string) => Promise<BackupInfo>;
  dismissResult: () => void;
}

const Context = createContext<BackupSession | null>(null);

/// Provider qui orchestre la session de backup au niveau de l'app entière.
/// Monté dans `RootLayout`, il vit indépendamment des navigations entre pages —
/// la barre de progression ne se réinitialise pas quand on quitte la page
/// Paramètres et qu'on y revient, et le toast final est garanti d'apparaître
/// même si l'utilisateur a navigué ailleurs entre-temps.
export function BackupSessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [lastResult, setLastResult] = useState<BackupSessionResult | null>(null);

  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Incrémenté par `start()` ; le timer "done → null" est gaté dessus pour ne
  // pas effacer une session relancée dans la fenêtre de 800 ms post-fin.
  const sessionIdRef = useRef(0);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let cancelled = false;

    listen<BackupProgress>("backup:progress", (event) => {
      const payload = event.payload;
      if (payload.phase === "idle") {
        setProgress(null);
        return;
      }
      setProgress((prev) => {
        if (
          prev &&
          prev.phase === payload.phase &&
          prev.current === payload.current &&
          prev.total === payload.total
        ) {
          return prev;
        }
        return payload;
      });
      if (payload.phase === "done") {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        const sessionAtSchedule = sessionIdRef.current;
        resetTimerRef.current = setTimeout(() => {
          if (sessionIdRef.current !== sessionAtSchedule) return;
          setProgress((current) => (current?.phase === "done" ? null : current));
        }, 800);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    });

    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const start = useCallback(
    async (destinationPath: string): Promise<BackupInfo> => {
      sessionIdRef.current += 1;
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      setIsPending(true);
      setLastResult(null);
      setProgress(null);
      try {
        const info = await invoke<BackupInfo>("backup_create", { destinationPath });
        setLastResult({ kind: "success", info, at: Date.now() });
        toast.success(
          `Sauvegarde créée (${formatBytes(info.size_bytes)} — ${info.manifest.documents_count} document${info.manifest.documents_count > 1 ? "s" : ""})`,
        );
        qc.invalidateQueries({ queryKey: ["get_derniere_sauvegarde"] });
        qc.invalidateQueries({ queryKey: ["list_pre_restore_backups"] });
        return info;
      } catch (err) {
        const message = String(err);
        setLastResult({ kind: "error", message, at: Date.now() });
        toast.error(`Création de la sauvegarde échouée : ${message}`);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [qc],
  );

  const dismissResult = useCallback(() => setLastResult(null), []);

  const value = useMemo<BackupSession>(
    () => ({ progress, isPending, lastResult, start, dismissResult }),
    [progress, isPending, lastResult, start, dismissResult],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBackupSession(): BackupSession {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useBackupSession doit être utilisé dans un BackupSessionProvider");
  }
  return ctx;
}
