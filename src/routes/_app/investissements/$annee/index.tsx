import { createFileRoute, Navigate } from '@tanstack/react-router'
import { anneeDeParam } from '@/features/investissements/annee'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/investissements/page-meta'
import { InvestissementsListe } from '@/features/investissements/components/investissements-liste'

export const Route = createFileRoute('/_app/investissements/$annee/')({
  component: BudgetAnneePage,
})

/** Les investissements d'UNE année de budget (138). */
function BudgetAnneePage() {
  const annee = anneeDeParam(Route.useParams().annee)
  // Ancien lien (/investissements/<dossier>) ou année invalide → la liste des années.
  if (annee === null) return <Navigate to="/investissements" replace />
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        // Investissements = écran MÉTIER (cf. RLS) : manager/technicien
        // créent/éditent ET SUPPRIMENT sur leurs sites (migration 053),
        // lecteur consulte.
        <InvestissementsListe
          annee={annee}
          siteId={siteId}
          canManage={canManage}
          canDelete={canManage}
        />
      )}
    </SiteScopedRoute>
  )
}
