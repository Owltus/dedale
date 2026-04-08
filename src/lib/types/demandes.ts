// Types demandes d'intervention — Phase 8

export interface DemandeIntervention {
  id_di: number;
  id_statut_di: number;
  id_prestataire: number | null;
  libelle_constat: string;
  description_constat: string;
  date_constat: string;
  description_resolution: string | null;
  date_resolution: string | null;
  description_resolution_suggeree: string | null;
  date_creation: string | null;
  date_modification: string | null;
}

export interface DiListItem {
  id_di: number;
  id_statut_di: number;
  libelle_constat: string;
  date_constat: string;
  date_resolution: string | null;
}

export interface DiEquipementInfo {
  id_equipement: number;
  nom_affichage: string;
  localisation_label: string | null;
}
