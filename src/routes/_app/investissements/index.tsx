import { createFileRoute } from '@tanstack/react-router'
import { PAGE_META } from '@/features/investissements/page-meta'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { BudgetsListe } from '@/features/investissements/components/budgets-liste'

export const Route = createFileRoute('/_app/investissements/')({
  component: BudgetsPage,
})

/**
 * Page Budget, PREMIER niveau (138, demande PO du 10/11/2026) : les années de
 * budget, chacune avec ses totaux. Un clic ouvre les investissements de
 * l'année.
 *
 * Les budgets se créent SEULS (demande PO) : celui de l'an prochain est
 * toujours là, et passe à l'année suivante au 1er janvier ; un autre n'apparaît
 * qu'avec des dossiers (un report). Rien à créer ici : on ajoute un
 * investissement DANS un budget.
 */
function BudgetsPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId }) => <BudgetsListe siteId={siteId} />}
    </SiteScopedRoute>
  )
}
