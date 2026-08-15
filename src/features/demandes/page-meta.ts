import { ClipboardList } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

/** Identité de la page Demandes d'intervention — source unique. */
export const PAGE_META: PageMeta = {
  titre: "Demandes d'intervention",
  description: 'Signalements curatifs du site (constat, suivi, résolution).',
  hint: "Choisis un site pour voir ses demandes d'intervention.",
  icone: ClipboardList,
}
