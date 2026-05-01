// Types relevés — visualisation transverse des opérations mesure

export interface RelevesGammeListItem {
  id_gamme: number;
  nom_gamme: string;
  nom_famille: string | null;
  nom_domaine: string | null;
  id_image: number | null;
  jours_periodicite: number;
  nb_operations_mesure: number;
  nb_releves_12m: number;
  date_dernier_releve: string | null;
}

export interface RelevePoint {
  id_ordre_travail: number;
  date_releve: string;
  valeur_mesuree: number;
  est_conforme: number | null;
}

export interface OperationReleves {
  id_type_source: number;
  id_source: number;
  nom_operation: string;
  unite_symbole: string | null;
  seuil_minimum: number | null;
  seuil_maximum: number | null;
  points: RelevePoint[];
}
