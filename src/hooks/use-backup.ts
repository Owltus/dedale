import { useInvokeMutation, useInvokeQuery } from "./useInvoke";
import type {
  BackupManifest,
  LocalPreRestoreBackup,
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

/// Date ISO de la dernière sauvegarde manuelle réussie (null si jamais)
export function useDerniereSauvegarde() {
  return useInvokeQuery<string | null>("get_derniere_sauvegarde");
}

/// Liste des sauvegardes pré-restore locales (filets créés avant chaque swap)
export function usePreRestoreBackups() {
  return useInvokeQuery<LocalPreRestoreBackup[]>("list_pre_restore_backups");
}

/// Restaure une sauvegarde pré-restore identifiée par son horodatage — l'app redémarre
export function useRestorePreRestore() {
  return useInvokeMutation<void, { stamp: string }>("restore_pre_restore");
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
