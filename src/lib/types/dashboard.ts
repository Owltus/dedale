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
  id_image: number | null;
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
  id_image_prestataire: number | null;
}

export type ContratEventType = "debut" | "fenetre" | "reconduction" | "echeance" | "resiliation";

export interface ContratTimelineEvent {
  id_contrat: number;
  id_prestataire: number;
  reference: string;
  nom_prestataire: string;
  type_evenement: ContratEventType;
  date_evenement: string;
  jours_restants: number;
  description: string;
  duree_jours: number | null;
}

export interface DocumentDashboardItem {
  id_document: number;
  nom_original: string;
  nom_type: string;
  date_upload: string;
}

export interface OtParStatut {
  id_statut: number;
  nombre: number;
}

export interface DashboardData {
  nb_ot_en_retard: number;
  ot_cette_semaine: OtParStatut[];
  nb_ot_en_cours: number;
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
  ot_regl_sans_doc: OtDashboardItem[];
  has_etablissement: boolean;
  has_localisations: boolean;
  has_equipements: boolean;
  has_prestataires: boolean;
  has_contrats: boolean;
  has_gammes: boolean;
  has_ot: boolean;
}

export interface SunburstGamme {
  id_domaine_gamme: number;
  nom_domaine: string;
  id_famille_gamme: number;
  nom_famille: string;
  id_gamme: number;
  nom_gamme: string;
  est_active: number;
  est_reglementaire: number;
  nb_ot_total: number;
  nb_ot_en_retard: number;
  nb_ot_reouvert: number;
  nb_ot_en_cours: number;
  prochaine_date: string | null;
  jours_periodicite: number;
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
  est_automatique: number;
  nom_domaine: string;
  id_famille_gamme: number | null;
}
