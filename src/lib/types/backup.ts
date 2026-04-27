/// Métadonnées embarquées dans une archive de sauvegarde DÉDALE
export interface BackupManifest {
  format_version: number;
  schema_version: number;
  created_at: string;
  app_version: string;
  db_size_bytes: number;
  db_sha256: string;
  documents_count: number;
  /// Nom de l'établissement au moment de la sauvegarde — facultatif sur les
  /// archives anciennes créées avant l'enrichissement du manifest.
  etablissement_nom: string | null;
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

/// Sauvegarde locale automatique (créée avant chaque restore)
export interface LocalPreRestoreBackup {
  stamp: string;
  created_at: string;
  db_path: string;
  db_size_bytes: number;
  has_documents: boolean;
  documents_path: string | null;
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
