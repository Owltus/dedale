import { ClipboardList } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

/** Identité de la page Ordres de travail — source unique. */
export const PAGE_META: PageMeta = {
  titre: 'Ordres de travail',
  description:
    'Exécution de la maintenance préventive et réglementaire du site.',
  hint: 'Choisis un site pour voir ses ordres de travail.',
  icone: ClipboardList,
}
