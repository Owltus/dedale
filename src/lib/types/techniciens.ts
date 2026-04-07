// Types techniciens — Phase 4
// Poste est défini dans referentiels.ts

export interface Technicien {
  id_technicien: number;
  nom: string;
  prenom: string;
  telephone: string | null;
  email: string | null;
  id_poste: number | null;
  est_actif: number;
  id_image: number | null;
  date_creation: string | null;
}
