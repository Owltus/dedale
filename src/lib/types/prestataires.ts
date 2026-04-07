// Types prestataires — Phase 5
export interface Prestataire {
  id_prestataire: number;
  libelle: string;
  description: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  id_image: number | null;
}
