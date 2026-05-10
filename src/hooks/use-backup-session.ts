import { createContext, useContext } from "react";
import type { BackupInfo, BackupProgress } from "@/lib/types/backup";

export type BackupSessionResult =
  | { kind: "success"; info: BackupInfo; at: number }
  | { kind: "error"; message: string; at: number };

export interface BackupSession {
  progress: BackupProgress | null;
  isPending: boolean;
  lastResult: BackupSessionResult | null;
  start: () => Promise<BackupInfo>;
  dismissResult: () => void;
}

export const BackupSessionContext = createContext<BackupSession | null>(null);

export function useBackupSession(): BackupSession {
  const ctx = useContext(BackupSessionContext);
  if (!ctx) {
    throw new Error("useBackupSession doit être utilisé dans un BackupSessionProvider");
  }
  return ctx;
}
