import { useState } from 'react'
import { Pencil, Plus, Truck } from 'lucide-react'
import type { ContratRow } from '../queries'
import { useDeleteContrat } from '../mutations'
import { PrestataireFormDialog } from './prestataire-form-dialog'
import { ContratFormDialog } from './contrat-form-dialog'
import { ContratAvenantDialog } from './contrat-avenant-dialog'
import { ContratResilierDialog } from './contrat-resilier-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import type { Database } from '@/lib/database.types'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
import { DetailTabsShell } from '@/components/common/detail-tabs-shell'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Badge } from '@/components/ui/badge'
import { ContratsPanel } from './prestataire-onglet-contrats'
import { OtDocumentsPanel } from './prestataire-onglet-documents'
import { GammesPanel } from './prestataire-onglet-gammes'
import { OtPanel } from './prestataire-onglet-ot'
import type { Onglet } from './prestataire-onglets'

type Prestataire = Database['public']['Tables']['prestataires']['Row']

/**
 * Fiche Prestataire détail, calquée sur les fiches Gamme / OT : page autonome
 * (porte sa `PageHeader`), carte d'en-tête `DetailHeaderCard`, barre `SubTabs`
 * (Contrats / Gammes / Ordres de travail / Documents) et zone de contenu défilante.
 * Tout ce qui est rattaché au prestataire, BORNÉ AU SITE ACTIF (décision PO) :
 * contrats (CRUD inline), gammes couvertes par ses contrats (lecture), ses OT
 * (lecture), ses documents. Le front présente ; la base (RLS) cloisonne par site
 * (résultat vide hors scope, jamais d'erreur).
 */
export function PrestataireDetail({
  prestataire,
  siteId,
  canManage,
  onBack,
}: {
  prestataire: Prestataire
  siteId: string
  canManage: boolean
  onBack: () => void
}) {
  const [onglet, setOnglet] = useState<Onglet>('contrats')
  const [editPrestataire, setEditPrestataire] = useState(false)
  const contratDialog = useEntityDialog<ContratRow>()
  const avenantDialog = useEntityDialog<ContratRow>()
  const resilierDialog = useEntityDialog<ContratRow>()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const delContrat = useDeleteContrat()
  const suppressionContrat = useConfirmDelete<ContratRow>({
    onDelete: (c) => delContrat.mutateAsync(c.id),
    successMessage: 'Contrat supprimé',
  })

  // Top bar : action « + » contextuelle à l'onglet (Nouveau contrat), suivie de
  // « Modifier le prestataire », toujours présente. Boutons icône + tooltip
  // (convention PageHeader), réservés aux gestionnaires. L'onglet Documents est en
  // lecture seule (documents des OT) : pas d'action de rattachement ici.
  const headerAction = canManage ? (
    <>
      {onglet === 'contrats' && (
        <TooltipIconButton
          icon={<Plus />}
          label="Nouveau contrat"
          variant="outline"
          onClick={contratDialog.openCreate}
        />
      )}
      <TooltipIconButton
        icon={<Pencil />}
        label="Modifier le prestataire"
        variant="outline"
        onClick={() => setEditPrestataire(true)}
      />
    </>
  ) : undefined

  return (
    // Mode `fill` OBLIGATOIRE : `DetailTabsShell` porte sa PROPRE zone défilante.
    // Sans `fill`, PageContainer traite son 1er enfant — ici la fiche ENTIÈRE —
    // comme en-tête FIXE `shrink-0` : le corps cesse de défiler et se fait
    // clipper par le `main`. Gouttières reprises de `FillHeader`/`ScrollBody`.
    <PageContainer fill>
      {/* Géométrie portée par DetailTabsShell — la MÊME que la fiche gamme et la
          fiche OT. Ce montage était auparavant réassemblé à la main ici, et
          avait déjà divergé de la brique (état vide, wrapper de corps). */}
      <DetailTabsShell
        className="px-4 pt-6 pb-6 sm:px-6 lg:px-8"
        tabsAriaLabel="Sections du prestataire"
        value={onglet}
        onValueChange={setOnglet}
        items={[
          { id: 'contrats', label: 'Contrats' },
          { id: 'gammes', label: 'Gammes' },
          { id: 'ot', label: 'Ordres de travail' },
          { id: 'documents', label: 'Documents' },
        ]}
        header={
          <PageHeader
            title={prestataire.libelle}
            breadcrumb={[{ label: 'Prestataires', onClick: onBack }]}
            titleBadges={
              <Badge
                variant={prestataire.est_interne ? 'default' : 'secondary'}
              >
                {prestataire.est_interne ? 'Interne' : 'Externe'}
              </Badge>
            }
            action={headerAction}
          />
        }
        headerCard={
          <DetailHeaderCard
            thumbnail={
              <MiniatureThumb
                url={urlOf(prestataire.miniature_id)}
                fallback={<Truck className="size-10" />}
                alt=""
                onError={refreshMiniatures}
                className="size-full rounded-none"
              />
            }
            fields={[
              prestataire.metier
                ? { label: 'Métier', value: prestataire.metier }
                : null,
              prestataire.ville
                ? { label: 'Ville', value: prestataire.ville }
                : null,
              prestataire.telephone
                ? { label: 'Téléphone', value: prestataire.telephone }
                : null,
              prestataire.email
                ? { label: 'E-mail', value: prestataire.email }
                : null,
            ]}
            columns={2}
          />
        }
      >
        {(actif) => (
          <>
            {actif === 'contrats' && (
              <ContratsPanel
                siteId={siteId}
                prestataireId={prestataire.id}
                prestataireNom={prestataire.libelle}
                canManage={canManage}
                onNew={contratDialog.openCreate}
                onEdit={contratDialog.openEdit}
                onDelete={suppressionContrat.demander}
                onAvenant={avenantDialog.openEdit}
                onResilier={resilierDialog.openEdit}
              />
            )}
            {actif === 'gammes' && (
              <GammesPanel
                prestataireId={prestataire.id}
                siteId={siteId}
                urlOf={urlOf}
                refreshMiniatures={refreshMiniatures}
              />
            )}
            {actif === 'ot' && (
              <OtPanel
                prestataireId={prestataire.id}
                siteId={siteId}
                urlOf={urlOf}
                refreshMiniatures={refreshMiniatures}
              />
            )}
            {actif === 'documents' && (
              <OtDocumentsPanel
                prestataireId={prestataire.id}
                siteId={siteId}
                canDelete={canManage}
              />
            )}
          </>
        )}
      </DetailTabsShell>

      {canManage && (
        <>
          <PrestataireFormDialog
            key={prestataire.id}
            open={editPrestataire}
            onOpenChange={setEditPrestataire}
            siteId={siteId}
            prestataire={prestataire}
          />
          <ContratFormDialog
            key={contratDialog.dialogKey}
            open={contratDialog.open}
            onOpenChange={contratDialog.onOpenChange}
            siteId={siteId}
            prestataireId={prestataire.id}
            contrat={contratDialog.entity}
          />
          {avenantDialog.entity && (
            <ContratAvenantDialog
              key={avenantDialog.dialogKey}
              open={avenantDialog.open}
              onOpenChange={avenantDialog.onOpenChange}
              siteId={siteId}
              prestataireId={prestataire.id}
              parent={avenantDialog.entity}
            />
          )}
          {resilierDialog.entity && (
            <ContratResilierDialog
              key={resilierDialog.dialogKey}
              open={resilierDialog.open}
              onOpenChange={resilierDialog.onOpenChange}
              contrat={resilierDialog.entity}
            />
          )}
          <ConfirmDeleteDialog
            {...suppressionContrat.dialogProps}
            entityLabel={
              suppressionContrat.toDelete
                ? `le contrat « ${suppressionContrat.toDelete.reference} »`
                : 'le contrat'
            }
            warning="Cette suppression est définitive."
          />
        </>
      )}
    </PageContainer>
  )
}
