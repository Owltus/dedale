import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'

/**
 * Layout de la Bibliothèque. Porte la garde de rôle (`requireNav`) partagée par
 * l'accueil (`index` → redirige vers l'onglet par défaut) et la route splat qui
 * porte la navigation par CHEMIN lisible
 * (`/bibliotheque/<onglet>/<catégorie>/<sous-catégorie>/<gamme>`, segments
 * slugifiés). Pur layout : sans `component`, TanStack Router rend un `<Outlet/>`
 * par défaut → la route enfant s'affiche.
 */
export const Route = createFileRoute('/_app/bibliotheque')({
  beforeLoad: ({ context }) => requireNav('/bibliotheque', context.queryClient),
})
