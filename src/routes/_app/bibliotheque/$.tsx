import type { ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ScopeProvider } from '@/components/common/scope-provider'
import { PageContainer } from '@/components/common/page-container'
import { Tabs, type TabItem } from '@/components/common/tabs'
import { ModelesEquipementsPanel } from '@/features/modeles-equipements/components/modeles-equipements-panel'
import { GammesTypesPanel } from '@/features/modeles-operations/components/gammes-types-panel'
import { GammesBiblioPanel } from '@/features/gammes/components/gammes-biblio-panel'
import { ModelesDiPanel } from '@/features/modeles-di/components/modeles-di-panel'
import { MiniaturesPanel } from '@/features/miniatures/components/miniatures-panel'

// Ids des onglets = source unique. Ce SONT déjà des slugs : ils servent à la fois
// de 1er segment du chemin (`/bibliotheque/<onglet>/…`) ET à typer le tableau
// d'onglets rendu (constat #3 : plus aucun cast `as OngletId`).
export const ONGLET_IDS = [
  'modeles-equipements',
  'gammes-types',
  'gammes',
  'modeles-di',
  'vignettes',
] as const

export type OngletId = (typeof ONGLET_IDS)[number]

/** Garde de type : `seg` est-il un id d'onglet connu ? (sans cast non vérifié). */
function isOngletId(seg: string | undefined): seg is OngletId {
  return seg !== undefined && (ONGLET_IDS as readonly string[]).includes(seg)
}

/**
 * Bibliothèque : page unique du catalogue, divisée en onglets. La navigation vit
 * dans le CHEMIN d'URL en NOMS slugifiés (route splat `$`) :
 * `/bibliotheque/<onglet>/<catégorie>/<sous-catégorie>/<gamme>`, profondeur 0 à 4.
 * Le 1er segment porte l'onglet (résolu ici) ; la descente catégorie → sous-
 * catégorie → gamme est lue et résolue par le panneau Gammes (via `getRouteApi`).
 * Catalogue partagé entreprise/site, visible aux rôles métier (la RLS arbitre).
 */
export const Route = createFileRoute('/_app/bibliotheque/$')({
  component: BibliothequePage,
})

function BibliothequePage() {
  const { _splat } = Route.useParams()
  const navigate = Route.useNavigate()

  // 1er segment du chemin = onglet actif. Invalide/absent (lien cassé) → défaut
  // (le premier onglet). Les segments suivants (cat/sous/gamme) sont l'affaire du
  // panneau Gammes ; ils n'influent pas sur le choix d'onglet.
  const ongletSeg = (_splat ?? '').split('/').find(Boolean)
  const onglet: OngletId = isOngletId(ongletSeg) ? ongletSeg : ONGLET_IDS[0]

  // Définition par id : un `Record<OngletId, …>` impose l'EXHAUSTIVITÉ à la
  // compilation (ajout/retrait d'un onglet dans ONGLET_IDS casse ici si désync).
  // L'ordre d'affichage reste celui d'ONGLET_IDS via le `.map` ci-dessous.
  const tabsById: Record<OngletId, { label: ReactNode; content: ReactNode }> = {
    'modeles-equipements': {
      label: 'Modèles d’équipements',
      content: <ModelesEquipementsPanel />,
    },
    'gammes-types': {
      label: 'Modèles d’opérations',
      content: <GammesTypesPanel />,
    },
    gammes: {
      label: 'Gammes',
      content: <GammesBiblioPanel />,
    },
    'modeles-di': {
      label: 'Modèles de DI',
      content: <ModelesDiPanel />,
    },
    vignettes: {
      label: 'Vignettes',
      content: <MiniaturesPanel />,
    },
  }

  // `id` typé `OngletId` (constat #3) → assignable à `TabItem[]` sans cast.
  const tabs: TabItem[] = ONGLET_IDS.map((id) => ({ id, ...tabsById[id] }))

  return (
    <PageContainer fill>
      <ScopeProvider>
        <Tabs
          items={tabs}
          value={onglet}
          // Changer d'onglet → chemin réduit à `/bibliotheque/<onglet>` (PUSH) :
          // la descente cat/sous/gamme disparaît (reset). Le bouton retour du
          // navigateur revient à l'onglet précédent. L'id vient de nos propres
          // onglets, `_splat` est une simple chaîne → aucun cast nécessaire.
          onValueChange={(id) =>
            void navigate({ to: '/bibliotheque/$', params: { _splat: id } })
          }
        />
      </ScopeProvider>
    </PageContainer>
  )
}
