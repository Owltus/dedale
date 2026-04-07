// Types transversaux — Phase 11

export interface SearchResult {
  entity_type: string;
  entity_id: number;
  label: string;
  sublabel: string | null;
  route: string;
}

export interface OtExportData {
  id_ordre_travail: number;
  nom_gamme: string;
  date_prevue: string;
  id_statut_ot: number;
  nom_prestataire: string | null;
  nom_localisation: string | null;
  nom_famille: string | null;
  nom_technicien: string | null;
  commentaires: string | null;
}
