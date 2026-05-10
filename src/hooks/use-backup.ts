import { useInvokeMutation, useInvokeQuery } from "./useInvoke";
import type {
  BackupManifest,
  LocalBackup,
  RestoreInfo,
} from "@/lib/types/backup";

// Note : la création de backup vit dans `BackupSessionProvider` (état global,
// persiste à travers les navigations). Pas de hook `useBackupCreate` ici.

/// Lit le manifest d'une archive sans toucher à la base courante
export function useBackupInspect() {
  return useInvokeMutation<BackupManifest, { zipPath: string }>("backup_inspect");
}

/// Restaure une archive — l'application redémarre, ce hook ne renvoie jamais
export function useBackupRestore() {
  return useInvokeMutation<void, { zipPath: string }>("backup_restore");
}

/// Liste les sauvegardes locales (.zip) — au plus `LOCAL_BACKUP_KEEP` (3) entrées.
/// staleTime infini : la liste est invalidée explicitement après chaque création
/// dans `BackupSessionProvider`, inutile de re-lire les zips à chaque mount.
export function useLocalBackups() {
  return useInvokeQuery<LocalBackup[]>("list_local_backups", undefined, {
    staleTime: Infinity,
  });
}

/// Lit et consomme le marqueur de restauration au boot — appelé une seule fois.
/// onError est silencieux : un échec ne doit pas polluer l'écran de l'utilisateur
/// au démarrage avec un toast erreur pour quelque chose d'invisible.
export function useConsumeRestoreFlag() {
  return useInvokeMutation<RestoreInfo | null, Record<string, never>>("consume_restore_flag", {
    onError: () => {},
  });
}

/// Ouvre le dossier app_data_dir dans l'explorateur du système
export function useOpenAppDataDir() {
  return useInvokeMutation<void, Record<string, never>>("open_app_data_dir");
}
