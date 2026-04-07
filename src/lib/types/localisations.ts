// Types localisations structurées — batiments > niveaux > locaux

export interface Batiment {
  id_batiment: number;
  nom: string;
  description: string | null;
  id_image: number | null;
  date_creation: string | null;
  date_modification: string | null;
  surface_totale: number;
}

export interface Niveau {
  id_niveau: number;
  nom: string;
  description: string | null;
  id_image: number | null;
  id_batiment: number;
  date_creation: string | null;
  date_modification: string | null;
  surface_totale: number;
}

export interface Local {
  id_local: number;
  nom: string;
  description: string | null;
  surface: number | null;
  id_image: number | null;
  id_niveau: number;
  date_creation: string | null;
  date_modification: string | null;
}

export interface LocalisationTreeNode {
  id_local: number;
  nom_local: string;
  nom_niveau: string;
  nom_batiment: string;
  label: string;
}

export interface LocalisationFilter {
  locaux: number[];
  niveaux: number[];
  batiments: number[];
}
