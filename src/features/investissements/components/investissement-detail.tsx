import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Pencil, Undo2 } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { toast } from 'sonner'
import {
  decisionsCapexQueries,
  statutsCapexQueries,
  type Devis,
  type Projet,
} from '@/features/investissements/queries'
import {
  annulationReport,
  datesCapex,
  estConfirmeOuPlus,
  estPrevalideOuPlus,
  ID_REALISE,
  ID_REFUSE,
  ID_DEMANDE,
  ID_PREVALIDE,
  ID_VALIDE,
  montantRetenu,
  schemaCapex,
  type ActionCapex,
  toneProjet,
} from '@/features/investissements/etat'
import {
  useChangeStatutCapex,
  useModifierDateValidation,
  useRetenirDevis,
  type NiveauAccord,
  useSupprimerDevis,
} from '@/features/investissements/mutations'
import { formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from './investissement-form-dialog'
import { ClotureInvestissementDialog } from './cloture-investissement-dialog'
import { ValidationInvestissementDialog } from './validation-investissement-dialog'
import { SchemaCapex } from './schema-capex'
import { ColonneDevis, rangeesColonneDevis } from './colonne-devis'
import { DevisDialog, type PieceDevis } from './devis-dialog'
import {
  documentsQueries,
  typesDocumentsQueries,
} from '@/features/documents/queries'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import type { DocumentMeta } from '@/features/documents/format'
import { PAGE_META } from '@/features/investissements/page-meta'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmAction } from '@/hooks/use-confirm-action'
import { formatDate, isoLocale } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'
import { useAuth } from '@/auth'
import { writeErrorMessage } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { RefusInvestissementDialog } from './refus-investissement-dialog'
import { Card, CardContent } from '@/components/ui/card'

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
  // Fenêtre de refus : à quel niveau (1 = proposition, 2 = confirmation,
  // 150), ou fermée.
  const [refus, setRefus] = useState<1 | 2 | null>(null)
  // Fenêtre de correction de la date d'un accord (150) : lequel, ou aucune.
  const [dateAccord, setDateAccord] = useState<NiveauAccord | null>(null)
  const modifierDateValidation = useModifierDateValidation()
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
  const ouvrirDevis = (devis: Devis | undefined, piece: PieceDevis | null) =>
    setFenetreDevis({ devis, piece })
  const noms = new Map(statuts.map((s) => [s.id, s.nom]))
  const annee = inv.annee_budget
  // Refusé au 2e niveau (150) : il garde sa date de prévalidation.
  const refusNiveau2 =
    inv.statut_capex_id === ID_REFUSE && inv.date_prevalidation !== null
  const schema = schemaCapex(inv.statut_capex_id, annee, noms, refusNiveau2)
  const realise = inv.statut_capex_id === ID_REALISE
  const refuse = inv.statut_capex_id === ID_REFUSE

  const dates = datesCapex(inv, decisions)
  // Le projet arrive d'un report : on peut le défaire (demande PO du
  // 12/11/2026).
  const retourReport = annulationReport(inv, decisions)

  /** Fiche du projet dans une année de budget (elle le suit). */
  const allerAnnee = (a: number) =>
    void navigate({
      to: '/investissements/$annee/$investissement',
      params: {
        annee: String(a),
        investissement: segOfUnique({ nom: inv.libelle, id: inv.id }, [
          { nom: inv.libelle, id: inv.id },
        ]),
      },
      replace: true,
    })

  /**
   * ANNULER LE REPORT : retour dans l'année d'avant, avec le statut et les
   * dates d'accord d'avant le report.
   */
  function annulerReport(r: NonNullable<typeof retourReport>) {
    const jourDe = (ts: string | null) =>
      ts === null ? undefined : isoLocale(new Date(ts))
    const aujourdhui = isoLocale(new Date())
    change.mutate(
      {
        id: inv.id,
        statutId: r.statutId,
        annee: r.annee,
        // Projet d'avant les deux niveaux (150) : sa confirmation tient lieu
        // de prévalidation.
        datePrevalidation:
          jourDe(r.prevalidationLe) ??
          (r.prevalidationLe === null && inv.date_prevalidation === null
            ? (jourDe(r.validationLe) ?? aujourdhui)
            : undefined),
        dateValidation: jourDe(r.validationLe),
      },
      {
        onSuccess: () => {
          toast.success(`Report annulé : retour au budget ${String(r.annee)}`)
          allerAnnee(r.annee)
        },
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }
  // Devis retenus, réunis dans la pastille du schéma.
  const retenus = inv.devis.filter((d) => d.retenu)
  const selection =
    retenus.length === 0
      ? null
      : { nb: retenus.length, montant: formatEuros(montantRetenu(inv)) }

  /**
   * Devis retenus au moment d'un accord (147) : un devis unique non coché est
   * retenu d'office ; plusieurs sans aucun coché → `false`, il faut en cocher.
   */
  function devisPourAccord(): { devisRetenus?: string[] } | false {
    const unSeul = inv.devis.length === 1 ? inv.devis[0] : undefined
    if (inv.devis.length > 1 && retenus.length === 0) {
      toast.error('Coche au moins un devis avant de valider.')
      return false
    }
    return unSeul && !unSeul.retenu ? { devisRetenus: [unSeul.id] } : {}
  }

  /**
   * PRÉVALIDER d'un clic (1er accord, 150) : à la date du jour, avec les
   * devis cochés dans le schéma.
   */
  function prevalider() {
    const devis = devisPourAccord()
    if (devis === false) return
    change.mutate(
      {
        id: inv.id,
        statutId: ID_PREVALIDE,
        annee,
        datePrevalidation: isoLocale(new Date()),
        ...devis,
      },
      {
        // « Annuler » quelques secondes : rattraper un clic de travers.
        onSuccess: () =>
          toast.success('Projet prévalidé', {
            action: { label: 'Annuler', onClick: deprevalider },
          }),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  /** RETIRER la prévalidation : retour en proposition, sa date s'efface. */
  function deprevalider() {
    change.mutate(
      { id: inv.id, statutId: ID_DEMANDE, annee },
      {
        onSuccess: () => toast.success('Prévalidation retirée'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  /**
   * CONFIRMER d'un clic (2e accord, 150) : seulement depuis « Prévalidé », à
   * la date du jour ; les devis cochés font foi.
   */
  function confirmer() {
    const devis = devisPourAccord()
    if (devis === false) return
    change.mutate(
      {
        id: inv.id,
        statutId: ID_VALIDE,
        annee,
        dateValidation: isoLocale(new Date()),
        ...devis,
      },
      {
        onSuccess: () =>
          toast.success('Projet confirmé', {
            action: { label: 'Annuler', onClick: deconfirmer },
          }),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  /**
   * RETIRER la confirmation (interrupteur, demande PO du 12/11/2026) : retour
   * en « Prévalidé », qui garde sa date ; les devis cochés restent cochés.
   */
  function deconfirmer() {
    change.mutate(
      { id: inv.id, statutId: ID_PREVALIDE, annee },
      {
        onSuccess: () => toast.success('Confirmation retirée'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  function agir(a: ActionCapex) {
    // Refuser : date du refus et motif facultatif (145).
    if (a.cle === 'refuser' || a.cle === 'refuser2') {
      setRefus(a.cle === 'refuser2' ? 2 : 1)
      return
    }
    // Les deux accords (150) : chacun se donne et se retire d'un clic.
    if (a.cle === 'prevalider') {
      prevalider()
      return
    }
    if (a.cle === 'deprevalider') {
      deprevalider()
      return
    }
    if (a.cle === 'valider') {
      confirmer()
      return
    }
    if (a.cle === 'devalider') {
      deconfirmer()
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
        description:
          a.statutId === ID_PREVALIDE
            ? `Le projet quitte le budget ${String(annee)} et attend sa confirmation dans celui de ${String(a.annee)}, toujours prévalidé.`
            : `Le projet quitte le budget ${String(annee)} et repart en « Proposition » dans celui de ${String(a.annee)}.`,
        confirmLabel: `Reporter à ${String(a.annee)}`,
        run: () =>
          change.mutateAsync({
            id: inv.id,
            statutId: a.statutId,
            annee: a.annee,
            report: true,
          }),
        // La fiche suit le projet dans sa nouvelle année ; « Annuler »
        // quelques secondes rattrape un report de travers.
        onSuccess: () => {
          const retour = {
            annee,
            // Réalisé / refusé : bilan et motif sont effacés par le
            // report, on ne les « remet » pas (cf. annulationReport).
            statutId: realise || refuse ? a.statutId : inv.statut_capex_id,
            prevalidationLe: inv.date_prevalidation,
            validationLe: inv.date_validation,
          }
          toast.success(`Reporté au budget ${String(a.annee)}`, {
            action: {
              label: 'Annuler',
              onClick: () => annulerReport(retour),
            },
          })
          allerAnnee(a.annee)
        },
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
  // refaire ce qu'un simple clic fait déjà (changer d'étape). Réalisé et
  // Refusé : leur clic ouvre déjà leur fenêtre de correction.
  const prevalideOuPlus = estPrevalideOuPlus(inv.statut_capex_id)
  const confirmeOuPlus = estConfirmeOuPlus(inv.statut_capex_id)
  const menus: Partial<Record<string, RowAction[]>> | undefined = canManage
    ? {
        demande: [
          {
            label: 'Modifier la proposition',
            icon: Pencil,
            onSelect: () => edit.openEdit(inv),
          },
        ],
        // Le clic sur la case d'un accord le retire ou y fait revenir : sa
        // date se corrige donc ici (150).
        ...(prevalideOuPlus && {
          prevalide: [
            {
              label: 'Modifier la date de prévalidation',
              icon: Pencil,
              onSelect: () => setDateAccord('prevalidation'),
            },
          ],
        }),
        // Annuler le report : sur la case où il s'affiche.
        ...(retourReport && {
          [prevalideOuPlus || refusNiveau2 ? 'reporte2' : 'reporte']: [
            {
              label: `Annuler le report (revenir en ${String(retourReport.annee)})`,
              icon: Undo2,
              onSelect: () => annulerReport(retourReport),
            },
          ],
        }),
        ...(confirmeOuPlus && {
          valide: [
            {
              label: 'Modifier la date de confirmation',
              icon: Pencil,
              onSelect: () => setDateAccord('validation'),
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
                icon={<Pencil />}
                label="Modifier le projet"
                variant="outline"
                onClick={() => edit.openEdit(inv)}
              />
            </>
          ) : undefined
        }
      />

      {/* SCHÉMA (138, 147, demandes PO) : la proposition et son texte, ses
          devis (case ronde = retenu), la sélection, puis Refusé /
          Prévalidé / Reporter, Confirmé et Réalisé. La case colorée = où en est le projet ; un clic
          sur une autre case y fait passer le projet. */}
      {/* Le schéma EST la fiche (demande PO) : il prend toute la hauteur
          disponible, et la page défile s'il lui en faut plus. */}
      <Card className="flex flex-1 flex-col overflow-hidden py-0">
        <CardContent className="flex flex-1 flex-col p-0">
          <SchemaCapex
            schema={schema}
            ton={toneProjet(inv)}
            menus={menus}
            devis={inv.devis}
            rangeesDevis={rangeesColonneDevis(inv.devis.length, canManage)}
            selection={selection}
            textes={{
              demande: inv.description,
              refuse: refuse && !refusNiveau2 ? inv.motif_arret : null,
              refuse2: refusNiveau2 ? inv.motif_arret : null,
              realise: realise ? inv.bilan : null,
            }}
            renderDevis={(mode) => (
              <ColonneDevis
                mode={mode}
                devis={inv.devis}
                nomsPdf={nomsPdf}
                canManage={canManage}
                choixFait={prevalideOuPlus}
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
            // Dates de chaque étape, quand elles existent (demande PO).
            dates={{
              demande: jour(dates.demande),
              prevalide: jour(dates.prevalide),
              valide: jour(dates.valide),
              realise: jour(dates.realise),
              refuse: refusNiveau2 ? undefined : jour(dates.refuse),
              refuse2: refusNiveau2 ? jour(dates.refuse) : undefined,
              // Le report s'affiche au niveau où le projet en est.
              [prevalideOuPlus || refusNiveau2 ? 'reporte2' : 'reporte']:
                dates.reporte
                  ? `reporté de ${String(dates.reporte.depuis)} · ${formatDate(dates.reporte.date)}`
                  : undefined,
            }}
            onAction={canManage ? agir : undefined}
            disabled={change.isPending}
          />
        </CardContent>
      </Card>

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
          {/* Corriger la date d'un accord, sans toucher au statut. */}
          <ValidationInvestissementDialog
            key={dateAccord ?? 'ferme'}
            open={dateAccord !== null}
            onOpenChange={(o) => !o && setDateAccord(null)}
            pending={modifierDateValidation.isPending}
            niveau={dateAccord ?? 'validation'}
            dateValidation={
              dateAccord === 'prevalidation'
                ? (inv.date_prevalidation ?? dates.prevalide)
                : (inv.date_validation ?? dates.valide)
            }
            onConfirm={({ date_validation }) =>
              dateAccord &&
              modifierDateValidation.mutate(
                { id: inv.id, niveau: dateAccord, date: date_validation },
                {
                  onSuccess: () => {
                    toast.success(
                      dateAccord === 'prevalidation'
                        ? 'Date de prévalidation modifiée'
                        : 'Date de confirmation modifiée',
                    )
                    setDateAccord(null)
                  },
                  onError: (e) => toast.error(writeErrorMessage(e)),
                },
              )
            }
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
        key={refus ? `refus-${String(refus)}` : 'refus'}
        open={refus !== null}
        onOpenChange={(o) => !o && setRefus(null)}
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
              // Refus à la confirmation : la prévalidation reste visible.
              garderPrevalidation: refus === 2,
            },
            {
              onSuccess: () => {
                setRefus(null)
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

/** La date seule (« 10/11/2026 », demande PO), ou rien si elle manque. */
function jour(date: string | null): string | undefined {
  return date ? formatDate(date) : undefined
}
