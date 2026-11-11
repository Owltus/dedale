import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Paperclip, Pencil } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { toast } from 'sonner'
import {
  decisionsCapexQueries,
  statutsCapexQueries,
} from '@/features/investissements/queries'
import {
  datesCapex,
  ID_REALISE,
  ID_REFUSE,
  ID_VALIDE,
  schemaCapex,
  type ActionCapex,
} from '@/features/investissements/etat'
import {
  useChangeStatutCapex,
  useDefinirDevis,
  useModifierDateValidation,
} from '@/features/investissements/mutations'
import { ecartCapex, formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from './investissement-form-dialog'
import { ClotureInvestissementDialog } from './cloture-investissement-dialog'
import { ValidationInvestissementDialog } from './validation-investissement-dialog'
import { parseMontant } from '@/features/investissements/schemas'
import { SchemaCapex } from './schema-capex'
import { CaseDevis, CIBLE_DEVIS, estDansZoneDevis } from './cadre-devis'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { typesDocumentsQueries } from '@/features/documents/queries'
import { PAGE_META } from '@/features/investissements/page-meta'
import { MIME_PDF } from '@/features/documents/upload'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmAction } from '@/hooks/use-confirm-action'
import { formatDate } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'
import { cn } from '@/lib/utils'
import { useAuth } from '@/auth'
import { writeErrorMessage } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { RefusInvestissementDialog } from './refus-investissement-dialog'
import { DetailNoteCard } from '@/components/common/detail-note-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

export function InvestissementDetail({
  investissement: inv,
  siteId,
  canManage,
}: {
  investissement: Investissement
  siteId: string
  canManage: boolean
}) {
  const navigate = useNavigate()
  const edit = useEntityDialog<Investissement>()
  const realisation = useEntityDialog<Investissement>()
  const { session } = useAuth()
  const confirmAction = useConfirmAction()
  const [refus, setRefus] = useState(false)
  const [validation, setValidation] = useState(false)
  const modifierDateValidation = useModifierDateValidation()
  // Upload + glisser-déposer pleine page (réservé aux rôles pouvant rattacher).
  // Un fichier lâché sur le cadre « Devis » y est traité ; ailleurs, il va
  // aux documents (annexes).
  const upload = useUploadDrop({
    enabled: canManage,
    ignorer: estDansZoneDevis,
  })
  const { data: typesDocs = [] } = useQuery(typesDocumentsQueries.list())
  const devisTypeId = typesDocs.find((t) => t.nom === 'Devis')?.id
  const { data: statuts = [] } = useQuery(statutsCapexQueries.list())
  const { data: decisions = [] } = useQuery(decisionsCapexQueries.list(inv.id))
  const change = useChangeStatutCapex()
  const definirDevis = useDefinirDevis()
  // Un petit déplacement avant de « prendre » une ligne : un simple clic
  // garde l'aperçu du document.
  const capteurs = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )
  const noms = new Map(statuts.map((s) => [s.id, s.nom]))
  const annee = inv.annee_budget
  const schema = schemaCapex(inv.statut_capex_id, annee, noms)
  const realise = inv.statut_capex_id === ID_REALISE
  const refuse = inv.statut_capex_id === ID_REFUSE

  const { label, depassement } = ecartCapex(inv)
  const dates = datesCapex(inv, decisions)
  // Seconde carte : seulement si l'issue du dossier porte un texte.
  const issue =
    refuse && inv.motif_arret?.trim()
      ? {
          label: 'Refus',
          texte: inv.motif_arret,
          modifier: 'Modifier le motif',
          ouvrir: () => setRefus(true),
        }
      : realise && inv.bilan?.trim()
        ? {
            label: 'Réalisation',
            texte: inv.bilan,
            modifier: 'Modifier la réalisation',
            ouvrir: () => realisation.openEdit(inv),
          }
        : null

  function agir(a: ActionCapex) {
    // Refuser : date du refus et motif facultatif (145).
    if (a.cle === 'refuser') {
      setRefus(true)
      return
    }
    // Valider (ou corriger la validation) : la date, rien d'autre (146).
    if (a.cle === 'valider') {
      setValidation(true)
      return
    }
    // Marquer réalisé : date, dépense réelle et bilan.
    if (a.cle === 'realiser') {
      realisation.openEdit(inv)
      return
    }
    if (a.cle === 'reporter') {
      confirmAction.demander({
        title: `Reporter au budget ${String(a.annee)} ?`,
        description: `Le dossier quitte le budget ${String(annee)} et repart en « Proposition » dans celui de ${String(a.annee)}.`,
        confirmLabel: `Reporter à ${String(a.annee)}`,
        run: () =>
          change.mutateAsync({
            id: inv.id,
            statutId: a.statutId,
            annee: a.annee,
          }),
        successMessage: `Reporté au budget ${String(a.annee)}`,
        // La fiche suit le dossier dans sa nouvelle année.
        onSuccess: () =>
          void navigate({
            to: '/investissements/$annee/$investissement',
            params: {
              annee: String(a.annee),
              investissement: segOfUnique({ nom: inv.libelle, id: inv.id }, [
                { nom: inv.libelle, id: inv.id },
              ]),
            },
            replace: true,
          }),
      })
      return
    }
    change.mutate(
      { id: inv.id, statutId: a.statutId, annee: a.annee },
      {
        onSuccess: () =>
          toast.success(
            a.cle === 'rouvrir'
              ? 'Investissement rouvert'
              : 'Proposition relancée',
          ),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  // MENUS DU SCHÉMA (clic droit / appui long, demande PO) : SEULEMENT pour
  // modifier des informations (montants, dates, description), jamais pour
  // refaire ce qu'un simple clic fait déjà (changer d'étape). Validé,
  // Réalisé et Refusé : leur clic ouvre déjà leur fenêtre de correction.
  const valideOuPlus = inv.statut_capex_id === ID_VALIDE || realise
  const menus: Partial<Record<string, RowAction[]>> | undefined = canManage
    ? {
        demande: [
          {
            label: 'Modifier la proposition',
            icon: Pencil,
            onSelect: () => edit.openEdit(inv),
          },
        ],
        // Réalisé : le clic sur « Validé » y fait revenir — la date de
        // validation se corrige donc ici.
        ...(realise && {
          valide: [
            {
              label: 'Modifier la date de validation',
              icon: Pencil,
              onSelect: () => setValidation(true),
            },
          ],
        }),
      }
    : undefined

  return (
    <PageContainer className="flex flex-col">
      <PageHeader
        title={inv.libelle}
        breadcrumb={[
          {
            label: PAGE_META.titre,
            onClick: () => void navigate({ to: '/investissements' }),
          },
          {
            label: `Budget ${String(annee)}`,
            onClick: () =>
              void navigate({
                to: '/investissements/$annee',
                params: { annee: String(annee) },
              }),
          },
        ]}
        // Pas de badge de statut (demande PO) : le schéma le dit déjà.
        action={
          canManage ? (
            <>
              <TooltipIconButton
                icon={<Paperclip />}
                label="Rattacher un document"
                variant="outline"
                onClick={upload.openUploadEmpty}
              />
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier l'investissement"
                variant="outline"
                onClick={() => edit.openEdit(inv)}
              />
            </>
          ) : undefined
        }
      />

      {/* Glisser un document de la liste sur la case « Devis » en fait le
          devis du dossier (demande PO). */}
      <DndContext
        sensors={capteurs}
        onDragEnd={({ active, over }) => {
          if (over?.data.current?.type !== CIBLE_DEVIS) return
          if (active.data.current?.type !== 'document') return
          const documentId = String(active.data.current.documentId)
          if (documentId === inv.devis_document_id) return
          definirDevis.mutate(
            { id: inv.id, documentId },
            {
              onSuccess: () => toast.success('Devis retenu'),
              onError: (e) => toast.error(writeErrorMessage(e)),
            },
          )
        }}
      >
        {/* SCHÉMA (138, demande PO) : Demandé, puis Refusé / Validé / Reporter,
          puis Réalisé — avec les montants dans les cases (proposé,
          réel, écart). La case colorée = où en est le dossier ; un clic sur
          une autre case y fait passer le dossier. */}
        <Card className="mb-4 shrink-0 overflow-hidden py-0">
          <CardContent className="p-0">
            <SchemaCapex
              schema={schema}
              menus={menus}
              devis={
                <CaseDevis
                  investissementId={inv.id}
                  devisDocumentId={inv.devis_document_id}
                  fournisseur={inv.fournisseur}
                  devisTypeId={devisTypeId}
                  canManage={canManage}
                  glissement={upload.dragging}
                />
              }
              // Un montant vide n'est pas affiché : un « — » seul, sans
              // légende, ne dirait rien.
              chiffres={{
                // Pas de montant dans « Validé » (demande PO) : il redirait
                // celui de la proposition. L'écart, lui, reste dans Réalisé.
                demande: montant(inv.montant_demande),
                realise: [
                  ...montant(inv.depense_reelle),
                  ...(label
                    ? [{ valeur: label, libelle: 'écart', alerte: depassement }]
                    : []),
                ],
              }}
              // Dates de chaque étape, quand elles existent (demande PO).
              dates={{
                demande: jour(dates.demande),
                valide: jour(dates.valide),
                realise: jour(dates.realise),
                refuse: jour(dates.refuse),
                reporte: dates.reporte
                  ? `reporté de ${String(dates.reporte.depuis)} · ${formatDate(dates.reporte.date)}`
                  : undefined,
              }}
              onAction={canManage ? agir : undefined}
              disabled={change.isPending}
            />
          </CardContent>
        </Card>

        {/* Pas de dates ici : elles sont dans le schéma. Refus / Réalisation
          n'apparaissent que si un motif ou un bilan est écrit. */}
        <div className={cn('mb-4 grid gap-4', issue && 'lg:grid-cols-2')}>
          <DetailNoteCard
            label="Proposition"
            text={inv.description}
            emptyText="Aucune description."
            action={
              canManage && (
                <TooltipIconButton
                  icon={<Pencil />}
                  label="Modifier l'investissement"
                  variant="ghost"
                  onClick={() => edit.openEdit(inv)}
                />
              )
            }
          />
          {issue && (
            <DetailNoteCard
              label={issue.label}
              text={issue.texte}
              emptyText=""
              action={
                canManage && (
                  <TooltipIconButton
                    icon={<Pencil />}
                    label={issue.modifier}
                    variant="ghost"
                    onClick={issue.ouvrir}
                  />
                )
              }
            />
          )}
        </div>

        {/* DOCUMENTS — pleine largeur, même patron que Événement et Travaux. */}
        <Card className="relative gap-3 py-4">
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentsTab
              liaison="documents_investissements"
              parentColumn="investissement_id"
              parentId={inv.id}
              acceptedMimes={MIME_PDF}
              uploadOpen={upload.uploadOpen}
              onUploadOpenChange={upload.onUploadOpenChange}
              uploadInitialFiles={upload.droppedFiles}
              // Tout SAUF le devis retenu, qui a sa case dans le schéma.
              filtre={(d) => d.id !== inv.devis_document_id}
              // Glisser une ligne sur la case « Devis » en fait le devis.
              draggable={canManage}
            />
          </CardContent>
          <FileDropOverlay show={upload.dragging} />
        </Card>
      </DndContext>

      {canManage && (
        <>
          <InvestissementFormDialog
            key={edit.dialogKey}
            open={edit.open}
            onOpenChange={edit.onOpenChange}
            siteId={siteId}
            annee={annee}
            investissement={inv}
          />
          {/* Valider = une date (aujourd'hui par défaut). Déjà validé ou
              réalisé → on corrige la seule date, sans toucher au statut. */}
          <ValidationInvestissementDialog
            key={validation ? 'validation-ouverte' : 'validation'}
            open={validation}
            onOpenChange={setValidation}
            pending={change.isPending || modifierDateValidation.isPending}
            dateValidation={
              valideOuPlus ? (inv.date_validation ?? dates.valide) : undefined
            }
            onConfirm={({ date_validation }) => {
              const fini = {
                onSuccess: () => {
                  toast.success(
                    valideOuPlus
                      ? 'Validation modifiée'
                      : 'Investissement validé',
                  )
                  setValidation(false)
                },
                onError: (e: unknown) => toast.error(writeErrorMessage(e)),
              }
              if (valideOuPlus)
                modifierDateValidation.mutate(
                  { id: inv.id, dateValidation: date_validation },
                  fini,
                )
              else
                change.mutate(
                  {
                    id: inv.id,
                    statutId: ID_VALIDE,
                    annee,
                    dateValidation: date_validation,
                  },
                  fini,
                )
            }}
          />
          <ClotureInvestissementDialog
            key={realisation.dialogKey}
            open={realisation.open}
            onOpenChange={realisation.onOpenChange}
            pending={change.isPending}
            dateDemande={inv.date_demande}
            depenseReelle={inv.depense_reelle ?? inv.montant_prevu}
            // Déjà réalisé → le dialogue s'ouvre pré-rempli, en correction.
            initial={
              realise
                ? { date_cloture: inv.date_cloture, bilan: inv.bilan }
                : undefined
            }
            onConfirm={({ date_cloture, bilan, depense_reelle }) => {
              change.mutate(
                {
                  id: inv.id,
                  statutId: ID_REALISE,
                  annee,
                  bilan,
                  dateCloture: date_cloture,
                  clotureBy: session?.user.id,
                  depenseReelle: parseMontant(depense_reelle),
                },
                {
                  onSuccess: () => {
                    toast.success(
                      realise
                        ? 'Réalisation modifiée'
                        : 'Investissement réalisé',
                    )
                    realisation.onOpenChange(false)
                  },
                  onError: (e) => toast.error(writeErrorMessage(e)),
                },
              )
            }}
          />
        </>
      )}

      {/* Refus (demande PO) : date (aujourd'hui par défaut) + motif
          facultatif ; déjà refusé → pré-rempli, en correction. */}
      <RefusInvestissementDialog
        key={refus ? 'refus-ouvert' : 'refus'}
        open={refus}
        onOpenChange={(o) => !o && setRefus(false)}
        pending={change.isPending}
        initial={
          refuse
            ? { date_arret: inv.date_arret, motif_arret: inv.motif_arret }
            : undefined
        }
        onConfirm={({ date_arret, motif_arret }) => {
          change.mutate(
            {
              id: inv.id,
              statutId: ID_REFUSE,
              annee,
              motifArret: motif_arret,
              dateArret: date_arret,
              arreteBy: session?.user.id,
            },
            {
              onSuccess: () => {
                setRefus(false)
                toast.success(refuse ? 'Refus modifié' : 'Proposition refusée')
              },
              onError: (e) => toast.error(writeErrorMessage(e)),
            },
          )
        }}
      />

      <ConfirmDialog {...confirmAction.dialogProps} />
    </PageContainer>
  )
}

/** Le montant de la case, ou rien s'il n'est pas renseigné. */
function montant(valeur: number | null): { valeur: string }[] {
  return valeur === null ? [] : [{ valeur: formatEuros(valeur) }]
}

/** La date seule (« 10/11/2026 », demande PO), ou rien si elle manque. */
function jour(date: string | null): string | undefined {
  return date ? formatDate(date) : undefined
}
