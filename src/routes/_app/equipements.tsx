import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'

/**
 * Layout des Équipements. Porte la garde de rôle (`requireNav`) partagée par la
 * route splat enfant qui porte la navigation par CHEMIN lisible
 * (`/equipements/<catégorie>/<sous-catégorie>/<équipement>`, segments slugifiés).
 * Pur layout : sans `component`, TanStack Router rend un `<Outlet/>` par défaut →
 * la route enfant s'affiche. Le chemin nu `/equipements` (splat vide) tombe sur la
 * RACINE (liste des catégories) — voir `equipements/$`.
 */
export const Route = createFileRoute('/_app/equipements')({
  beforeLoad: ({ context }) => requireNav('/equipements', context.queryClient),
})
