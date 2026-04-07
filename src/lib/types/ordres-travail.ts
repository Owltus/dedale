// Types ordres de travail — Phase 7

export interface OrdreTravail {
  id_ordre_travail: number;
  nom_gamme: string;
  description_gamme: string | null;
  est_reglementaire: number;
  nom_localisation: string | null;
  nom_famille: string | null;
  nom_prestataire: string | null;
  id_gamme: number;
  id_prestataire: number;
  id_statut_ot: number;
  id_priorite: number;
  libelle_periodicite: string;
  jours_periodicite: number;
  periodicite_jours_valides: number;
  id_image: number | null;
  date_prevue: string;
  est_automatique: number;
  date_debut: string | null;
  date_cloture: string | null;
  commentaires: string | null;
  id_di: number | null;
  id_technicien: number | null;
  nom_technicien: string | null;
  nom_poste: string | null;
  nom_equipement: string | null;
  date_creation: string | null;
  date_modification: string | null;
}

export interface OtListItem {
  id_ordre_travail: number;
  nom_gamme: string;
  description_gamme: string | null;
  date_prevue: string;
  date_cloture: string | null;
  id_statut_ot: number;
  id_priorite: number;
  nom_prestataire: string | null;
  est_reglementaire: number;
  nom_localisation: string | null;
  est_automatique: number;
  jours_periodicite: number;
  progression: number;
  est_en_retard: number;
  nb_documents: number;
  id_image: number | null;
}

export interface OperationExecution {
  id_operation_execution: number;
  id_ordre_travail: number;
  id_type_source: number;
  id_source: number;
  nom_operation: string;
  description_operation: string | null;
  type_operation: string;
  seuil_minimum: number | null;
  seuil_maximum: number | null;
  unite_nom: string | null;
  unite_symbole: string | null;
  id_statut_operation: number;
  valeur_mesuree: number | null;
  est_conforme: number | null;
  date_execution: string | null;
  commentaires: string | null;
}

export interface OtSuivant {
  id_ordre_travail: number;
  date_prevue: string;
}

export interface OrdreDetailComplet {
  ordre_travail: OrdreTravail;
  operations: OperationExecution[];
  ot_suivant: OtSuivant | null;
}
