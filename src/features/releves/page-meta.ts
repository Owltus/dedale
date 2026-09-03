import { Gauge } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

export const PAGE_META: PageMeta = {
  titre: 'Relevés',
  description:
    'Historique des mesures et compteurs relevés lors des ordres de travail.',
  hint: 'Choisis un site pour voir ses relevés.',
  icone: Gauge,
}
