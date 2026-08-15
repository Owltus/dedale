import { HardHat } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

/** Identité de la page Travaux — source unique (en-tête, garde de site, détail). */
export const PAGE_META: PageMeta = {
  titre: 'Travaux',
  description: 'Travaux ponctuels du site.',
  hint: 'Choisis un site pour voir ses travaux.',
  icone: HardHat,
}
