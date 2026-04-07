// Types dashboard et planning — Phase 10

export interface ContratAlerte {
  id_contrat: number;
  nom_prestataire: string;
  date_fin: string;
}

export interface GammeAlerte {
  id_gamme: number;
  nom_gamme: string;
  nom_famille: string;
}

export interface OtAlerte {
  id_ordre_travail: number;
  nom_gamme: string;
  date_debut: string | null;
}

export interface OtDashboardItem {
  id_ordre_travail: number;
  nom_gamme: string;
  date_prevue: string;
  id_statut_ot: number;
  id_priorite: number;
  nom_prestataire: string | null;
}

export interface DiDashboardItem {
  id_di: number;
  libelle_constat: string;
  date_constat: string;
  id_statut_di: number;
}

export interface DashboardData {
  nb_ot_en_retard: number;
  nb_ot_cette_semaine: number;
  nb_di_ouvertes: number;
  nb_contrats_a_risque: number;
  contrats_expirant_30j: ContratAlerte[];
  gammes_regl_sans_ot: GammeAlerte[];
  ot_stagnants: OtAlerte[];
  prochains_ot: OtDashboardItem[];
  dernieres_di: DiDashboardItem[];
  ot_en_retard: OtDashboardItem[];
  has_etablissement: boolean;
  has_localisations: boolean;
  has_equipements: boolean;
  has_prestataires: boolean;
  has_contrats: boolean;
  has_gammes: boolean;
  has_ot: boolean;
}

export interface PlanningEvent {
  id_ordre_travail: number;
  id_gamme: number;
  nom_gamme: string;
  nom_famille: string | null;
  date_prevue: string;
  id_statut_ot: number;
  id_priorite: number;
  est_reglementaire: number;
  nom_prestataire: string | null;
}
