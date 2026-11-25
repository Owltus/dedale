import { createFileRoute } from '@tanstack/react-router'
import { BibliothequeEcran } from '@/features/bibliotheque/components/bibliotheque-ecran'
import { prechargerBibliotheque } from '@/features/bibliotheque/prechargement'

/**
 * Bibliothèque : page unique du catalogue, divisée en onglets. La navigation vit
 * dans le CHEMIN d'URL en NOMS slugifiés (route splat `$`) :
 * `/bibliotheque/<onglet>/<catégorie>/<sous-catégorie>/<gamme>`, profondeur 0 à 4.
 * Le 1er segment porte l'onglet (résolu ici) ; la descente catégorie → sous-
 * catégorie → gamme est lue et résolue par le panneau Gammes (via `getRouteApi`).
 * Catalogue partagé entreprise/site, visible aux rôles métier (la RLS arbitre).
 */
export const Route = createFileRoute('/_app/bibliotheque/$')({
  // Précharge les listes de tous les onglets (best-effort, cf. `prechargerBibliotheque`).
  loader: ({ context }) => prechargerBibliotheque(context.queryClient),
  component: BibliothequeEcran,
})
