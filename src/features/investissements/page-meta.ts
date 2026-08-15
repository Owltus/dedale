import { Wallet } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

/** Identité de la page Investissements (CapEx) — source unique. */
export const PAGE_META: PageMeta = {
  titre: 'Investissements (CapEx)',
  description:
    'Suivi budgétaire des investissements du site (montant demandé, prévu, réel).',
  hint: 'Choisis un site pour voir ses investissements.',
  icone: Wallet,
}
