// Types contrats — Phase 5
export interface Contrat {
  id_contrat: number;
  id_prestataire: number;
  id_type_contrat: number;
  id_contrat_parent: number | null;
  est_archive: number;
  objet_avenant: string | null;
  reference: string;
  date_signature: string | null;
  date_debut: string;
  date_fin: string | null;
  date_resiliation: string | null;
  date_notification: string | null;
  duree_cycle_mois: number | null;
  delai_preavis_jours: number | null;
  fenetre_resiliation_jours: number | null;
  commentaires: string | null;
  date_creation: string | null;
  date_modification: string | null;
  statut: string;
}

export interface ContratListItem {
  id_contrat: number;
  id_prestataire: number;
  nom_prestataire: string;
  id_type_contrat: number;
  libelle_type: string;
  est_archive: number;
  reference: string;
  date_debut: string;
  date_fin: string | null;
  date_resiliation: string | null;
  date_signature: string | null;
  duree_cycle_mois: number | null;
  delai_preavis_jours: number | null;
  fenetre_resiliation_jours: number | null;
  commentaires: string | null;
  objet_avenant: string | null;
  date_notification: string | null;
  nb_avenants: number;
  statut: string;
}

export interface ContratVersion {
  id_contrat: number;
  id_contrat_parent: number | null;
  est_archive: number;
  objet_avenant: string | null;
  reference: string;
  date_debut: string;
  date_fin: string | null;
  date_creation: string | null;
  statut: string;
}
