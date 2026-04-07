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

export interface DocumentAggrege {
  id_document: number;
  nom_original: string;
  taille_octets: number;
  nom_type: string;
  date_upload: string | null;
  source: string;
}

export interface DocumentLie {
  id_document: number;
  nom_original: string;
  taille_octets: number;
  nom_type: string;
  date_upload: string | null;
  date_liaison: string | null;
  commentaire: string | null;
  source: string | null;
}
