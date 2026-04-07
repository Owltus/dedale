// Types gammes de maintenance — découplage gammes/équipements

// ── Domaines et familles gammes (hiérarchie indépendante des équipements) ──

export interface DomaineGamme {
  id_domaine_gamme: number;
  nom_domaine: string;
  description: string | null;
  id_image: number | null;
}

export interface FamilleGamme {
  id_famille_gamme: number;
  nom_famille: string;
  description: string | null;
  id_domaine_gamme: number;
  id_image: number | null;
}

export interface DomaineGammeListItem {
  id_domaine_gamme: number;
  nom_domaine: string;
  description: string | null;
  id_image: number | null;
  nb_familles: number;
  nb_gammes_inactives: number;
  nb_gammes_total: number;
  nb_ot_en_retard: number;
  nb_ot_reouvert: number;
  nb_ot_en_cours: number;
  nb_ot_sans_ot: number;
  prochaine_date: string | null;
  jours_periodicite_min: number | null;
}

export interface FamilleGammeListItem {
  id_famille_gamme: number;
  nom_famille: string;
  description: string | null;
  id_image: number | null;
  nb_gammes: number;
  nb_gammes_inactives: number;
  nb_ot_en_retard: number;
  nb_ot_reouvert: number;
  nb_ot_en_cours: number;
  nb_ot_sans_ot: number;
  prochaine_date: string | null;
  jours_periodicite_min: number | null;
}

// ── Gammes ──

export interface Gamme {
  id_gamme: number;
  nom_gamme: string;
  description: string | null;
  est_reglementaire: number;
  id_periodicite: number;
  id_famille_gamme: number;
  id_prestataire: number;
  id_image: number | null;
  id_batiment_calc: number | null;
  id_niveau_calc: number | null;
  id_local_calc: number | null;
  nom_localisation_calc: string | null;
  date_creation: string | null;
  date_modification: string | null;
  est_active: number;
}

export interface GammeListItem {
  id_gamme: number;
  nom_gamme: string;
  est_reglementaire: number;
  est_active: number;
  nom_famille: string;
  libelle_periodicite: string;
  nom_prestataire: string;
  description: string | null;
  id_image: number | null;
  nb_documents: number;
  nb_ot_total: number;
  nb_ot_en_retard: number;
  nb_ot_reouvert: number;
  nb_ot_en_cours: number;
  prochaine_date: string | null;
  jours_periodicite: number;
}

export interface Operation {
  id_operation: number;
  nom_operation: string;
  description: string | null;
  id_type_operation: number;
  id_gamme: number;
  seuil_minimum: number | null;
  seuil_maximum: number | null;
  id_unite: number | null;
}

export interface ModeleOperation {
  id_modele_operation: number;
  nom_modele: string;
  description: string | null;
  id_image: number | null;
  date_creation: string | null;
}

export interface ModeleOperationItem {
  id_modele_operation_item: number;
  nom_operation: string;
  description: string | null;
  id_type_operation: number;
  id_modele_operation: number;
  seuil_minimum: number | null;
  seuil_maximum: number | null;
  id_unite: number | null;
}
