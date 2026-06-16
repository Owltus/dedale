import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'

/**
 * Layout des Localisations. Porte la garde de rôle (`requireNav`) ; la navigation
 * vit dans la route splat enfant (`/localisations/<bâtiment>/<niveau>`, segments
 * slugifiés). Pur layout : sans `component`, TanStack rend un `<Outlet/>`. Le
 * chemin nu `/localisations` (splat vide) tombe sur la racine (liste des bâtiments).
 */
export const Route = createFileRoute('/_app/localisations')({
  beforeLoad: ({ context }) =>
    requireNav('/localisations', context.queryClient),
})
