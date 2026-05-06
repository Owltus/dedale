// Types documents — Phase 9

export interface Document {
  id_document: number;
  nom_original: string;
  hash_sha256: string;
  nom_fichier: string;
  taille_octets: number;
  id_type_document: number;
  date_upload: string | null;
}

export interface DocumentListItem {
  id_document: number;
  nom_original: string;
  taille_octets: number;
  id_type_document: number;
  nom_type: string;
  date_upload: string | null;
  nb_liaisons: number;
}

export interface DocumentLie {
  id_document: number;
  nom_original: string;
  taille_octets: number;
  id_type_document: number;
  nom_type: string;
  date_upload: string | null;
  date_liaison: string | null;
  commentaire: string | null;
  source: string | null;
}

export type DocumentEntityType =
  | "prestataires"
  | "ordres_travail"
  | "gammes"
  | "contrats"
  | "di"
  | "localisations"
  | "equipements"
  | "techniciens";

/// Une liaison d'un document vers une entité (vue inverse de DocumentLie)
export interface DocumentLiaison {
  entity_type: DocumentEntityType;
  entity_id: number;
  label: string;
  sublabel: string | null;
  /// Pour les contrats : id_prestataire (cible de navigation)
  parent_id: number | null;
  date_liaison: string;
}
