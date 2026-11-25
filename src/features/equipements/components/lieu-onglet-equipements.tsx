import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { equipementsQueries } from '../queries'
import {
  nomAfficheTexte,
  secondaireAffiche,
  tertiaireAffiche,
  titreAffiche,
} from '../format'
import { EquipementBadges } from './equipement-badges'
import { DeploiementDialog } from './deploiement-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import type { OngletLieuProps } from '@/features/localisations/fiche-lieu'
import { ONGLET_ETAT_VIDE } from '@/components/common/detail-tabs-shell'
import { EmptyState } from '@/components/common/empty-state'
import { ListRow } from '@/components/common/list-row'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { OngletPagine } from '@/components/common/onglet-pagine'
import { useTabAddAction } from '@/components/common/tab-actions'
import { useCurrentRole } from '@/hooks/use-current-role'
import * as perm from '@/lib/permissions'

/**
 * Onglet « Équipements » de la fiche d'un lieu, en lecture : les équipements
 * posés dans ce lieu, 50 à la fois (même ligne que l'explorateur : vignette,
 * titre, catégorie, badges secondaire / tertiaire). Pas de filtre de statut :
 * un équipement n'en a pas. Le bouton + de l'en-tête ouvre le déploiement en
 * masse, ce lieu pré-coché (admin, manager, technicien ; la base arbitre le
 * site). Injecté dans la fiche par la route.
 */
export function LieuOngletEquipements({
  localId,
  siteId,
  total,
}: OngletLieuProps) {
  const query = useInfiniteQuery(
    equipementsQueries.duLieu(total === 0 ? null : localId),
  )
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const { data: role } = useCurrentRole()
  const canDeployer = perm.canDeployerEquipements(role)
  const [deploiementOpen, setDeploiementOpen] = useState(false)
  useTabAddAction(
    canDeployer ? () => setDeploiementOpen(true) : null,
    'Ajouter des équipements',
  )

  return (
    <>
      <OngletPagine
        query={query}
        total={total}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={Package}
            title="Aucun équipement"
            description="Aucun équipement n’est posé dans ce lieu."
            className={ONGLET_ETAT_VIDE}
          />
        }
        searchPlaceholder="Rechercher un équipement…"
        texteRecherche={(eq) => [nomAfficheTexte(eq), eq.code_inventaire]}
        emptySearchDescription="Aucun équipement ne correspond à cette recherche."
        getKey={(eq) => eq.id ?? ''}
        renderItem={(eq) => {
          const secondaire = secondaireAffiche(eq)
          const tertiaire = tertiaireAffiche(eq)
          return (
            <ListRow
              media={
                <MiniatureThumb
                  url={urlOf(eq.miniature_id)}
                  fallback={<Package className="size-10" />}
                  alt=""
                  onError={refreshMiniatures}
                  className="size-full rounded-none"
                />
              }
              title={titreAffiche(eq)}
              subtitle={eq.code_inventaire ?? undefined}
              badges={
                secondaire || tertiaire ? (
                  <EquipementBadges
                    secondaire={secondaire}
                    tertiaire={tertiaire}
                  />
                ) : undefined
              }
            />
          )
        }}
      />
      {canDeployer && (
        <DeploiementDialog
          open={deploiementOpen}
          onOpenChange={setDeploiementOpen}
          siteId={siteId}
          localIdsParDefaut={[localId]}
        />
      )}
    </>
  )
}
