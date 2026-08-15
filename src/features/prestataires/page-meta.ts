import { Truck } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

/** Identité de la page Prestataires — source unique. */
export const PAGE_META: PageMeta = {
  titre: 'Prestataires',
  description: 'Prestataires (externes et régie interne) et leurs contrats.',
  hint: 'Choisis un site pour voir ses prestataires et contrats.',
  icone: Truck,
}
