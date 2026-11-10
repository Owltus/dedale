import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Paperclip, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import {
  decisionsCapexQueries,
  statutsCapexQueries,
} from '@/features/investissements/queries'
import {
  datesCapex,
  ID_REALISE,
  ID_REFUSE,
  nomStatutCapex,
  schemaCapex,
  statutCapexTone,
  type ActionCapex,
} from '@/features/investissements/etat'
import { useChangeStatutCapex } from '@/features/investissements/mutations'
import { ecartCapex, formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from './investissement-form-dialog'
import { ClotureInvestissementDialog } from './cloture-investissement-dialog'
import { SchemaCapex } from './schema-capex'
import { MIME_PDF } from '@/features/documents/upload'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmAction } from '@/hooks/use-confirm-action'
import { formatDate, isoLocale } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'
import { useAuth } from '@/auth'
import { writeErrorMessage } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { StatusBadge } from '@/components/common/status-badge'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { MotifDialog } from '@/components/common/motif-dialog'
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
  // Upload + glisser-déposer pleine page (réservé aux rôles pouvant rattacher).
  const upload = useUploadDrop({ enabled: canManage })
  const { data: statuts = [] } = useQuery(statutsCapexQueries.list())
  const { data: decisions = [] } = useQuery(decisionsCapexQueries.list(inv.id))
  const change = useChangeStatutCapex()
  const noms = new Map(statuts.map((s) => [s.id, s.nom]))
  const annee = inv.annee_budget
  const schema = schemaCapex(inv.statut_capex_id, annee, noms)
  const realise = inv.statut_capex_id === ID_REALISE
  const refuse = inv.statut_capex_id === ID_REFUSE

  const { label, depassement } = ecartCapex(inv)
  const dates = datesCapex(inv, decisions)

  function agir(a: ActionCapex) {
    // Refuser : un motif est exigé (la base le refuse sinon).
    if (a.cle === 'refuser') {
      setRefus(true)
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
        description: `Le dossier quitte le budget ${String(annee)} et repart en « Demandé » dans celui de ${String(a.annee)}.`,
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
            a.cle === 'valider'
              ? 'Investissement validé'
              : a.cle === 'rouvrir'
                ? 'Investissement rouvert'
                : 'Demande relancée',
          ),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  return (
    <PageContainer className="flex flex-col">
      <PageHeader
        title={inv.libelle}
        breadcrumb={[
          {
            label: 'Investissements (CapEx)',
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
        titleBadges={
          <StatusBadge tone={statutCapexTone(inv.statut_capex_id)}>
            {nomStatutCapex(inv.statut_capex_id, noms)}
          </StatusBadge>
        }
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

      {/* SCHÉMA (138, demande PO) : Demandé, puis Refusé / Validé / Reporter,
          puis Réalisé — avec les montants dans les cases (demandé, prévu,
          réel, écart). La case colorée = où en est le dossier ; un clic sur
          une autre case y fait passer le dossier. */}
      <Card className="mb-4 shrink-0 overflow-hidden py-0">
        <CardContent className="p-0">
          <SchemaCapex
            schema={schema}
            // Un montant vide n'est pas affiché : un « — » seul, sans
            // légende, ne dirait rien.
            chiffres={{
              demande: montant(inv.montant_demande),
              valide: montant(inv.montant_prevu),
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

      {/* LES DEUX BOUTS DU DOSSIER, CÔTE À CÔTE : la demande à gauche, ce qu'il
          en est advenu à droite (réalisation, ou refus et son motif). */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <DetailNoteCard
          label={`Demandé le ${formatDate(inv.date_demande)}`}
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
        {refuse ? (
          <DetailNoteCard
            label={`Refusé${inv.date_arret ? ` le ${formatDate(inv.date_arret)}` : ''}`}
            text={inv.motif_arret}
            emptyText="Aucun motif."
            action={
              canManage && (
                <TooltipIconButton
                  icon={<Pencil />}
                  label="Modifier le motif"
                  variant="ghost"
                  onClick={() => setRefus(true)}
                />
              )
            }
          />
        ) : (
          <DetailNoteCard
            label={
              realise
                ? `Réalisé${inv.date_cloture ? ` le ${formatDate(inv.date_cloture)}` : ''}`
                : 'Réalisation'
            }
            text={realise ? inv.bilan : null}
            emptyText={realise ? 'Aucun bilan.' : 'Pas encore réalisé.'}
            action={
              canManage &&
              realise && (
                <TooltipIconButton
                  icon={<Pencil />}
                  label="Modifier la réalisation"
                  variant="ghost"
                  onClick={() => realisation.openEdit(inv)}
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
            uploadDefaultTypeNom="Devis"
          />
        </CardContent>
        <FileDropOverlay show={upload.dragging} />
      </Card>

      {canManage && (
        <>
          <InvestissementFormDialog
            key={edit.dialogKey}
            open={edit.open}
            onOpenChange={edit.onOpenChange}
            siteId={siteId}
            investissement={inv}
          />
          <ClotureInvestissementDialog
            key={realisation.dialogKey}
            open={realisation.open}
            onOpenChange={realisation.onOpenChange}
            pending={change.isPending}
            dateDemande={inv.date_demande}
            // Déjà réalisé → le dialogue s'ouvre pré-rempli, en correction.
            initial={
              realise
                ? { date_cloture: inv.date_cloture, bilan: inv.bilan }
                : undefined
            }
            onConfirm={({ date_cloture, bilan }) => {
              change.mutate(
                {
                  id: inv.id,
                  statutId: ID_REALISE,
                  annee,
                  bilan,
                  dateCloture: date_cloture,
                  clotureBy: session?.user.id,
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

      <MotifDialog
        open={refus}
        onOpenChange={(o) => !o && setRefus(false)}
        title={refuse ? 'Modifier le motif du refus' : 'Refuser la demande ?'}
        description="Dites pourquoi la demande est refusée : c’est ce qui restera pour comprendre la décision plus tard."
        label="Motif"
        confirmLabel={refuse ? 'Enregistrer' : 'Refuser'}
        destructive={!refuse}
        pending={change.isPending}
        onConfirm={(motif) => {
          change.mutate(
            {
              id: inv.id,
              statutId: ID_REFUSE,
              annee,
              motifArret: motif,
              // Date NUE (`isoLocale`) et jamais `toISOString()` (23514 des OT).
              dateArret: inv.date_arret ?? isoLocale(new Date()),
              arreteBy: session?.user.id,
            },
            {
              onSuccess: () => {
                setRefus(false)
                toast.success(refuse ? 'Motif modifié' : 'Demande refusée')
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
