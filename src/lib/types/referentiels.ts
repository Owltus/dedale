// Types référentiels — Phase 3

export interface Unite {
  id_unite: number;
  nom: string;
  symbole: string;
  description: string | null;
}

export interface Periodicite {
  id_periodicite: number;
  libelle: string;
  description: string | null;
  jours_periodicite: number;
  jours_valide: number;
  tolerance_jours: number;
}

export interface TypeOperation {
  id_type_operation: number;
  libelle: string;
  description: string | null;
  necessite_seuils: number;
}

export interface TypeDocument {
  id_type_document: number;
  nom: string;
  description: string;
  est_systeme: number;
}

export interface TypeContrat {
  id_type_contrat: number;
  libelle: string;
  description: string | null;
}

export interface StatutOt {
  id_statut_ot: number;
  nom_statut: string;
  description: string | null;
}

export interface StatutDi {
  id_statut_di: number;
  nom_statut: string;
  description: string | null;
}

export interface PrioriteOt {
  id_priorite: number;
  nom_priorite: string;
  niveau: number;
  description: string | null;
}

export interface ModeleDi {
  id_modele_di: number;
  nom_modele: string;
  description: string | null;
  id_famille: number | null;
  id_equipement: number | null;
  constat: string;
  date_creation: string | null;
}

export interface ModeleDiDetail {
  id_modele_di: number;
  nom_modele: string;
  description: string | null;
  id_famille: number | null;
  nom_famille: string | null;
  id_equipement: number | null;
  nom_equipement: string | null;
  constat: string;
  date_creation: string | null;
}
