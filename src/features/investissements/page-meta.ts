import { Wallet } from 'lucide-react'
import type { PageMeta } from '@/components/common/site-scoped-route'

/** Identité de la page Investissements — source unique (« CapEx » retiré, demande PO). */
export const PAGE_META: PageMeta = {
  titre: 'Investissements',
  description:
    'Budget des projets d’investissement du site, montants HT : chaque projet regroupe ses devis.',
  hint: 'Choisis un site pour voir ses investissements.',
  icone: Wallet,
}
