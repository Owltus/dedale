import { LayoutDashboard } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

/**
 * Identité de la page Tableau de bord.
 *
 * Seule page à NE PAS passer par `SiteScopedRoute` : son en-tête reste affiché
 * sans site actif (la brique, elle, remplace tout l'écran), et sa description
 * est dynamique — elle nomme le site courant. Elle consomme donc `PAGE_META`
 * champ par champ, pour rester alignée sans forcer la brique.
 */
export const PAGE_META: PageMeta = {
  titre: 'Tableau de bord',
  description: "Vue d'ensemble de la maintenance.",
  hint: 'Choisis un site pour afficher son tableau de bord.',
  icone: LayoutDashboard,
}
