import { createFileRoute } from '@tanstack/react-router'
import { LocalisationsExplorer } from '@/features/localisations/components/localisations-explorer'
import type { OngletsDuLieu } from '@/features/localisations/fiche-lieu'
import { LieuOngletEquipements } from '@/features/equipements/components/lieu-onglet-equipements'
import { LieuOngletGammes } from '@/features/gammes/components/lieu-onglet-gammes'
import { LieuOngletOt } from '@/features/ordres-travail/components/lieu-onglet-ot'
import { LieuOngletDemandes } from '@/features/demandes/components/lieu-onglet-demandes'
import { LieuOngletTravaux } from '@/features/travaux/components/lieu-onglet-travaux'
import { LieuOngletEvenements } from '@/features/evenements/components/lieu-onglet-evenements'
import { PageContainer } from '@/components/common/page-container'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/localisations/page-meta'

/**
 * Localisations : navigation par CHEMIN d'URL (route splat `$`) :
 * `/localisations/<bâtiment>/<niveau>/<lieu>`, segments slugifiés. Racine =
 * bâtiments du site → niveaux → locaux → fiche du lieu (3ᵉ segment). Chemin nu
 * `/localisations` (splat vide) → racine. La
 * garde de rôle est portée par le layout parent (`requireNav`).
 */
export const Route = createFileRoute('/_app/localisations/$')({
  component: LocalisationsPage,
})

// Onglets de la fiche d'un lieu, injectés ici : leurs features importent
// localisations (liens de lieu), l'inverse créerait un cycle.
const ONGLETS: OngletsDuLieu = {
  Equipements: LieuOngletEquipements,
  Gammes: LieuOngletGammes,
  Ot: LieuOngletOt,
  Demandes: LieuOngletDemandes,
  Travaux: LieuOngletTravaux,
  Evenements: LieuOngletEvenements,
}

function LocalisationsPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId }) => (
        <PageContainer fill>
          <LocalisationsExplorer siteId={siteId} onglets={ONGLETS} />
        </PageContainer>
      )}
    </SiteScopedRoute>
  )
}
