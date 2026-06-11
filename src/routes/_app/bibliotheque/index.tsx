import { createFileRoute, redirect } from '@tanstack/react-router'
import { ONGLET_IDS } from './$'

/**
 * Accueil `/bibliotheque` : pas de vue propre. On redirige (REPLACE → pas
 * d'entrée d'historique parasite) vers l'onglet par défaut (le premier),
 * désormais porté par la route splat (`/bibliotheque/<onglet>`).
 */
export const Route = createFileRoute('/_app/bibliotheque/')({
  beforeLoad: () => {
    throw redirect({
      to: '/bibliotheque/$',
      params: { _splat: ONGLET_IDS[0] },
      replace: true,
    })
  },
})
