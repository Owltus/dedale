import { FileText } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

/** Identité de la page Documents — source unique. */
export const PAGE_META: PageMeta = {
  titre: 'Documents',
  description:
    'Bibliothèque documentaire du site (PDF, attestations, rapports…).',
  hint: 'Choisis un site pour voir sa bibliothèque documentaire.',
  icone: FileText,
}
