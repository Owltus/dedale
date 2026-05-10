/// Métadonnées embarquées dans une archive de sauvegarde DÉDALE
export interface BackupManifest {
  format_version: number;
  schema_version: number;
  created_at: string;
  app_version: string;
  db_size_bytes: number;
  db_sha256: string;
  documents_count: number;
  ot_count: number;
  gammes_count: number;
  equipements_count: number;
}

/// Résultat de la création d'une sauvegarde
export interface BackupInfo {
  path: string;
  size_bytes: number;
  manifest: BackupManifest;
}

/// Sauvegarde locale stockée dans `app_data_dir/backups/` (rotation des 3
/// dernières). Le `manifest` peut être null si le zip est illisible.
export interface LocalBackup {
  stamp: string;
  zip_path: string;
  size_bytes: number;
  manifest: BackupManifest | null;
}

/// Renvoyé par consume_restore_flag quand une restauration vient d'être appliquée
export interface RestoreInfo {
  created_at: string;
}

/// Phase de progression émise via l'event Tauri `backup:progress`
export type BackupPhase = "idle" | "snapshot" | "documents" | "finalizing" | "done";

export interface BackupProgress {
  phase: BackupPhase;
  current: number;
  total: number;
}
