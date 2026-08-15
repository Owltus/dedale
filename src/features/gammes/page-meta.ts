import { Wrench } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

/**
 * Identité de la page Plan de maintenance — source unique.
 *
 * La SECTION s'affiche « Plan de maintenance » ; la fiche unitaire et la base
 * disent « gamme ». C'est un choix d'affichage, pas un renommage SQL.
 */
export const PAGE_META: PageMeta = {
  titre: 'Plan de maintenance',
  description: 'Gammes de maintenance et de contrôle réglementaire du site.',
  hint: 'Choisis un site pour voir son plan de maintenance.',
  icone: Wrench,
}
