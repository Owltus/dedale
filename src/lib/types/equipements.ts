// Types équipements — Phase 4

export interface CategorieModele {
  id_categorie: number;
  nom_categorie: string;
  description: string | null;
}

export interface ModeleEquipement {
  id_modele_equipement: number;
  nom_modele: string;
  description: string | null;
  id_categorie: number | null;
  nom_categorie: string | null;
  date_creation: string | null;
  date_modification: string | null;
  nb_champs: number;
  nb_familles: number;
}

export interface ChampModele {
  id_champ: number;
  id_modele_equipement: number;
  nom_champ: string;
  type_champ: "texte" | "nombre" | "date" | "booleen" | "liste";
  unite: string | null;
  est_obligatoire: number;
  ordre: number;
  valeurs_possibles: string | null;
  valeur_defaut: string | null;
  est_archive: number;
}

export interface ValeurChampEquipement {
  id_champ: number;
  nom_champ: string;
  type_champ: "texte" | "nombre" | "date" | "booleen" | "liste";
  unite: string | null;
  est_obligatoire: number;
  ordre: number;
  valeurs_possibles: string | null;
  valeur_defaut: string | null;
  est_archive: number;
  valeur: string | null;
}

export interface Domaine {
  id_domaine: number;
  nom_domaine: string;
  description: string | null;
  id_image: number | null;
}

export interface DomaineEquipListItem {
  id_domaine: number;
  nom_domaine: string;
  description: string | null;
  id_image: number | null;
  nb_familles: number;
  nb_equipements_inactifs: number;
  nb_equipements_total: number;
  nb_ot_en_retard: number;
  nb_ot_reouvert: number;
  nb_ot_en_cours: number;
  prochaine_date: string | null;
  jours_periodicite_min: number | null;
}

export interface Famille {
  id_famille: number;
  nom_famille: string;
  description: string | null;
  id_domaine: number;
  id_image: number | null;
  id_modele_equipement: number;
}

export interface FamilleEquipListItem {
  id_famille: number;
  nom_famille: string;
  description: string | null;
  id_image: number | null;
  nom_modele: string;
  nb_equipements: number;
  nb_equipements_inactifs: number;
  nb_ot_en_retard: number;
  nb_ot_reouvert: number;
  nb_ot_en_cours: number;
  prochaine_date: string | null;
  jours_periodicite_min: number | null;
}

export interface Equipement {
  id_equipement: number;
  nom_affichage: string;
  date_mise_en_service: string | null;
  date_fin_garantie: string | null;
  id_famille: number;
  id_local: number | null;
  est_actif: number;
  commentaires: string | null;
  id_image: number | null;
  date_creation: string | null;
  date_modification: string | null;
}

export interface EquipementListItem {
  id_equipement: number;
  nom_affichage: string;
  description: string | null;
  est_actif: number;
  id_image: number | null;
  nb_ot_en_retard: number;
  nb_ot_reouvert: number;
  nb_ot_en_cours: number;
  prochaine_date: string | null;
  jours_periodicite_min: number | null;
}

export interface EquipementSelectItem {
  id_equipement: number;
  nom_affichage: string;
}
