import { CalendarRange } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

/** Identité de la page Planning — source unique. */
export const PAGE_META: PageMeta = {
  titre: 'Planning',
  description: 'Charge prévisionnelle par famille de gammes et par semaine.',
  hint: 'Choisis un site pour voir son planning.',
  icone: CalendarRange,
}
