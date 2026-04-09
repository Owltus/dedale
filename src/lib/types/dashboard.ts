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

export interface ContratDashboardItem {
  id_contrat: number;
  reference: string;
  nom_prestataire: string;
  date_debut: string;
  date_fin: string | null;
  duree_cycle_mois: number | null;
  statut: string;
}

export interface DocumentDashboardItem {
  id_document: number;
  nom_original: string;
  nom_type: string;
  date_upload: string;
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
  contrats_dashboard: ContratDashboardItem[];
  derniers_documents: DocumentDashboardItem[];
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
  date_debut: string | null;
  date_cloture: string | null;
  id_statut_ot: number;
  id_priorite: number;
  est_reglementaire: number;
  nom_prestataire: string | null;
  jours_periodicite: number;
}
