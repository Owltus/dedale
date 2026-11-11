import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Paperclip, Pencil } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { toast } from 'sonner'
import {
  decisionsCapexQueries,
  statutsCapexQueries,
  type Devis,
  type Projet,
} from '@/features/investissements/queries'
import {
  datesCapex,
  ID_REALISE,
  ID_REFUSE,
  ID_VALIDE,
  montantRetenu,
  schemaCapex,
  type ActionCapex,
} from '@/features/investissements/etat'
import {
  useChangeStatutCapex,
  useModifierDateValidation,
  useRetenirDevis,
  useSupprimerDevis,
} from '@/features/investissements/mutations'
import { ecartCapex, formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from './investissement-form-dialog'
import { ClotureInvestissementDialog } from './cloture-investissement-dialog'
import { ValidationInvestissementDialog } from './validation-investissement-dialog'
import { parseMontant } from '@/features/investissements/schemas'
import { SchemaCapex } from './schema-capex'
import {
  ColonneDevis,
  CIBLE_DEVIS,
  estDansZoneDevis,
  rangeesColonneDevis,
} from './colonne-devis'
import { DevisDialog, type PieceDevis } from './devis-dialog'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import {
  documentsQueries,
  typesDocumentsQueries,
} from '@/features/documents/queries'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import type { DocumentMeta } from '@/features/documents/format'
import { PAGE_META } from '@/features/investissements/page-meta'
import { MIME_PDF } from '@/features/documents/upload'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmAction } from '@/hooks/use-confirm-action'
import { formatDate } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'
import { useAuth } from '@/auth'
import { writeErrorMessage } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { RefusInvestissementDialog } from './refus-investissement-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function InvestissementDetail({
  investissement: inv,
  siteId,
  canManage,
}: {
  investissement: Projet
  siteId: string
  canManage: boolean
}) {
  const navigate = useNavigate()
  const edit = useEntityDialog<Projet>()
  const realisation = useEntityDialog<Projet>()
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
  const retenir = useRetenirDevis()
  const supprimerDevis = useSupprimerDevis()
  // Fenêtres des DEVIS (147) : ici, une seule fois — le schéma (et donc la
  // colonne des devis) est rendu deux fois.
  const [fenetreDevis, setFenetreDevis] = useState<{
    devis?: Devis
    piece: PieceDevis | null
  } | null>(null)
  const [apercu, setApercu] = useState<DocumentMeta | null>(null)
  const { data: docs = [] } = useQuery(
    documentsQueries.byEntity(
      'documents_investissements',
      'investissement_id',
      inv.id,
    ),
  )
  const docsParId = new Map(docs.map((d) => [d.id, d]))
  const nomsPdf = new Map(docs.map((d) => [d.id, d.nom_original]))
  const pdfsDevis = new Set(
    inv.devis.flatMap((d) => (d.document_id ? [d.document_id] : [])),
  )
  const ouvrirDevis = (devis: Devis | undefined, piece: PieceDevis | null) =>
    setFenetreDevis({ devis, piece })
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
  // Devis retenus, réunis dans la pastille du schéma.
  const retenus = inv.devis.filter((d) => d.retenu)
  const selection =
    retenus.length === 0
      ? null
      : { nb: retenus.length, montant: formatEuros(montantRetenu(inv)) }

  function agir(a: ActionCapex) {
    // Refuser : date du refus et motif facultatif (145).
    if (a.cle === 'refuser') {
      setRefus(true)
      return
    }
    // Valider (ou corriger la validation) : la date et les devis retenus.
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
        description: `Le projet quitte le budget ${String(annee)} et repart en « Proposition » dans celui de ${String(a.annee)}.`,
        confirmLabel: `Reporter à ${String(a.annee)}`,
        run: () =>
          change.mutateAsync({
            id: inv.id,
            statutId: a.statutId,
            annee: a.annee,
          }),
        successMessage: `Reporté au budget ${String(a.annee)}`,
        // La fiche suit le projet dans sa nouvelle année.
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
            a.cle === 'rouvrir' ? 'Projet rouvert' : 'Proposition relancée',
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
                label="Modifier le projet"
                variant="outline"
                onClick={() => edit.openEdit(inv)}
              />
            </>
          ) : undefined
        }
      />

      {/* Glisser un document de la liste sur la colonne des devis en fait un
          nouveau devis (fenêtre pré-remplie : fournisseur et montant). */}
      <DndContext
        sensors={capteurs}
        onDragEnd={({ active, over }) => {
          if (over?.data.current?.type !== CIBLE_DEVIS) return
          if (active.data.current?.type !== 'document') return
          const id = String(active.data.current.documentId)
          ouvrirDevis(undefined, {
            type: 'document',
            id,
            nom: nomsPdf.get(id) ?? 'PDF',
          })
        }}
      >
        {/* SCHÉMA (138, 147, demandes PO) : la proposition et son texte, ses
          devis (case ronde = retenu), la sélection, puis Refusé / Validé /
          Reporter et Réalisé. La case colorée = où en est le projet ; un clic
          sur une autre case y fait passer le projet. */}
        <Card className="mb-4 shrink-0 overflow-hidden py-0">
          <CardContent className="p-0">
            <SchemaCapex
              schema={schema}
              menus={menus}
              devis={inv.devis}
              rangeesDevis={rangeesColonneDevis(inv.devis.length, canManage)}
              selection={selection}
              textes={{
                demande: inv.description,
                refuse: refuse ? inv.motif_arret : null,
                realise: realise ? inv.bilan : null,
              }}
              renderDevis={(mode) => (
                <ColonneDevis
                  mode={mode}
                  devis={inv.devis}
                  nomsPdf={nomsPdf}
                  canManage={canManage}
                  choixFait={valideOuPlus}
                  glissement={upload.dragging}
                  onApercu={(d) =>
                    setApercu(
                      d.document_id
                        ? (docsParId.get(d.document_id) ?? null)
                        : null,
                    )
                  }
                  onModifier={(d) =>
                    ouvrirDevis(
                      d,
                      d.document_id
                        ? {
                            type: 'document',
                            id: d.document_id,
                            nom: nomsPdf.get(d.document_id) ?? 'PDF',
                          }
                        : null,
                    )
                  }
                  onAjouter={(fichier) =>
                    ouvrirDevis(
                      undefined,
                      fichier ? { type: 'fichier', fichier } : null,
                    )
                  }
                  onRetenir={(d, retenu) =>
                    retenir.mutate(
                      { id: d.id, retenu },
                      {
                        onSuccess: () =>
                          toast.success(
                            retenu ? 'Devis retenu' : 'Devis plus retenu',
                          ),
                        onError: (e) => toast.error(writeErrorMessage(e)),
                      },
                    )
                  }
                  onSupprimer={(d) =>
                    confirmAction.demander({
                      title: 'Supprimer ce devis ?',
                      description: `Le devis ${d.fournisseur} (${formatEuros(d.montant_ht)} HT) est retiré du projet. Son PDF reste dans les documents.`,
                      confirmLabel: 'Supprimer',
                      destructive: true,
                      run: () => supprimerDevis.mutateAsync(d.id),
                      successMessage: 'Devis supprimé',
                    })
                  }
                />
              )}
              // Un montant vide n'est pas affiché : un « — » seul, sans
              // légende, ne dirait rien.
              // Plus de montant dans « Proposition » ni « Validé » (demande
              // PO) : la sélection porte la somme ; Réalisé, le réel et l'écart.
              chiffres={{
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
              // Tout SAUF les PDF des devis : ils sont dans le schéma.
              filtre={(d) => !pdfsDevis.has(d.id)}
              // Glisser une ligne sur la colonne des devis en fait un devis.
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
            devis={inv.devis}
            onConfirm={({ date_validation, devis_retenus }) => {
              const fini = {
                onSuccess: () => {
                  toast.success(
                    valideOuPlus ? 'Validation modifiée' : 'Projet validé',
                  )
                  setValidation(false)
                },
                onError: (e: unknown) => toast.error(writeErrorMessage(e)),
              }
              if (valideOuPlus)
                modifierDateValidation.mutate(
                  {
                    id: inv.id,
                    dateValidation: date_validation,
                    devisRetenus: devis_retenus,
                  },
                  fini,
                )
              else
                change.mutate(
                  {
                    id: inv.id,
                    statutId: ID_VALIDE,
                    annee,
                    dateValidation: date_validation,
                    devisRetenus: devis_retenus,
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
            depenseReelle={inv.depense_reelle ?? montantRetenu(inv)}
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
                      realise ? 'Réalisation modifiée' : 'Projet réalisé',
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
                toast.success(refuse ? 'Refus modifié' : 'Projet refusé')
              },
              onError: (e) => toast.error(writeErrorMessage(e)),
            },
          )
        }}
      />

      {canManage && fenetreDevis && (
        <DevisDialog
          open
          onOpenChange={(o) => !o && setFenetreDevis(null)}
          projetId={inv.id}
          devisTypeId={devisTypeId}
          devis={fenetreDevis.devis}
          piece={fenetreDevis.piece}
        />
      )}
      <DocumentPreviewDialog
        doc={apercu}
        onOpenChange={(o) => {
          if (!o) setApercu(null)
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
