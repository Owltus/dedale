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
  refusAuNiveau2,
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

/**
 * Durée des messages qui portent « Annuler » : le temps de lire et de
 * cliquer (le défaut, ~4 s, disparaissait avant le clic).
 */
const DUREE_ANNULER = 10_000

/**
 * UN SEUL message « Annuler » à la fois : chaque nouveau remplace le
 * précédent — un vieux « Annuler » ne ramènerait pas là où l'on croit.
 */
const TOAST_ANNULER = 'capex-annuler'

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
  // Refusé au 2e niveau, à la confirmation (150, 152).
  const refusNiveau2 = refusAuNiveau2(inv)
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

  const aujourdhui = () => isoLocale(new Date())

  // Devis retenus, réunis dans la pastille du schéma.
  const retenus = inv.devis.filter((d) => d.retenu)
  const selection =
    retenus.length === 0
      ? null
      : { nb: retenus.length, montant: formatEuros(montantRetenu(inv)) }

  type Changement = Parameters<typeof change.mutate>[0]

  /**
   * Où en est le projet MAINTENANT : de quoi l'y remettre tel quel. Rien ne
   * s'efface en changeant d'étape (152) — dates, refus, bilan restent en
   * mémoire —, il suffit de rendre le statut, l'année et les devis cochés.
   */
  const ici = {
    statutId: inv.statut_capex_id,
    annee,
    devisRetenus: retenus.map((d) => d.id),
  }

  /** « Annuler » : remet le projet où il était (`ici` au moment du clic). */
  function revenir(r: typeof ici, anneeQuittee: number) {
    change.mutate(
      { id: inv.id, ...r },
      {
        onSuccess: () => {
          toast.success('Annulé : le projet est revenu où il était', {
            id: TOAST_ANNULER,
          })
          if (r.annee !== anneeQuittee) allerAnnee(r.annee)
        },
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  /**
   * CHANGER D'ÉTAPE d'un clic, avec « Annuler » quelques secondes pour
   * rattraper un clic de travers (demandes PO du 12/11/2026).
   */
  function passer(
    vers: Omit<Changement, 'id'>,
    message: string,
    options: { description?: string } = {},
  ) {
    const retour = ici
    change.mutate(
      { id: inv.id, ...vers },
      {
        onSuccess: () =>
          toast.success(message, {
            id: TOAST_ANNULER,
            description: options.description,
            action: {
              label: 'Annuler',
              onClick: () => revenir(retour, vers.annee),
            },
            duration: DUREE_ANNULER,
          }),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  /** Toast de succès avec « Annuler » (retour à `retour`). */
  const avecAnnuler = (retour: typeof ici, anneeQuittee: number) => ({
    id: TOAST_ANNULER,
    action: {
      label: 'Annuler',
      onClick: () => revenir(retour, anneeQuittee),
    },
    duration: DUREE_ANNULER,
  })

  /**
   * ANNULER LE REPORT (clic droit) : retour dans l'année d'avant, avec le
   * statut et les dates d'accord d'avant le report.
   */
  function annulerReport(r: NonNullable<typeof retourReport>) {
    const jourDe = (ts: string | null) =>
      ts === null ? undefined : isoLocale(new Date(ts))
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
            ? (jourDe(r.validationLe) ?? aujourdhui())
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

  /**
   * Devis retenus au moment d'un accord (147) : un devis unique non coché est
   * retenu d'office ; plusieurs sans aucun coché → `false`, il faut en cocher.
   */
  function devisPourAccord(
    geste: 'prévalider' | 'confirmer',
  ): { devisRetenus?: string[] } | false {
    const unSeul = inv.devis.length === 1 ? inv.devis[0] : undefined
    // Pas d'accord sans devis (demande PO du 12/11/2026) : c'est le devis
    // qu'on présente aux responsables.
    if (inv.devis.length === 0) {
      toast.error(`Ajoute au moins un devis avant de ${geste}.`)
      return false
    }
    if (inv.devis.length > 1 && retenus.length === 0) {
      toast.error(`Coche au moins un devis avant de ${geste}.`)
      return false
    }
    return unSeul && !unSeul.retenu ? { devisRetenus: [unSeul.id] } : {}
  }

  /**
   * PRÉVALIDER d'un clic (1er accord, 150) : à la date déjà connue (mémoire,
   * 152), sinon du jour ; avec les devis cochés dans le schéma.
   */
  function prevalider() {
    const devis = devisPourAccord('prévalider')
    if (devis === false) return
    passer(
      {
        statutId: ID_PREVALIDE,
        annee,
        datePrevalidation: inv.date_prevalidation ?? aujourdhui(),
        ...devis,
      },
      refuse ? 'Refus levé : projet prévalidé' : 'Projet prévalidé',
    )
  }

  /**
   * CONFIRMER d'un clic (2e accord, 150) : depuis « Prévalidé », ou depuis
   * « Refusé » pour rattraper un refus de travers — les deux accords sont
   * alors donnés. Dates déjà connues (152), sinon du jour.
   */
  function confirmer() {
    const devis = devisPourAccord('confirmer')
    if (devis === false) return
    passer(
      {
        statutId: ID_VALIDE,
        annee,
        datePrevalidation: inv.date_prevalidation ?? aujourdhui(),
        dateValidation: inv.date_validation ?? aujourdhui(),
        ...devis,
      },
      refuse ? 'Refus levé : projet confirmé' : 'Projet confirmé',
    )
  }

  /**
   * DÉCOCHER LE DERNIER DEVIS RETENU (demande PO du 12/11/2026) : la boucle
   * repart du début, en « Proposition » — les dates restent en mémoire et
   * reviendront avec les accords.
   */
  const reinitialise = (d: Devis) =>
    inv.statut_capex_id !== ID_DEMANDE &&
    d.retenu &&
    retenus.every((r) => r.id === d.id)

  function retenirDevis(d: Devis, retenu: boolean) {
    if (!retenu && reinitialise(d)) {
      passer(
        { statutId: ID_DEMANDE, annee, devisRetenus: [] },
        'Plus aucun devis retenu : retour en « Proposition »',
        { description: 'Les dates sont gardées pour la suite.' },
      )
      return
    }
    retenir.mutate(
      { id: d.id, retenu },
      {
        onSuccess: () =>
          toast.success(retenu ? 'Devis retenu' : 'Devis plus retenu'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  const MESSAGES: Partial<Record<ActionCapex['cle'], string>> = {
    deprevalider: 'Prévalidation retirée',
    devalider: 'Confirmation retirée',
    relancer: 'Retour en « Proposition »',
    rouvrir: 'Projet rouvert',
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
    if (a.cle === 'valider') {
      confirmer()
      return
    }
    // Marquer réalisé : date et bilan.
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
          }),
        // La fiche suit le projet dans sa nouvelle année ; « Annuler »
        // quelques secondes rattrape un report de travers.
        onSuccess: () => {
          toast.success(
            `Reporté au budget ${String(a.annee)}`,
            avecAnnuler(ici, a.annee),
          )
          allerAnnee(a.annee)
        },
      })
      return
    }
    // Retirer un accord, revenir en arrière, rouvrir : rien ne s'efface
    // (mémoire, 152), un clic suffit — « Annuler » rattrape l'erreur.
    passer(
      { statutId: a.statutId, annee: a.annee },
      MESSAGES[a.cle] ?? 'Étape modifiée',
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
        ...((prevalideOuPlus || refusNiveau2) && {
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
                onRetenir={retenirDevis}
                onSupprimer={(d) =>
                  confirmAction.demander({
                    title: 'Supprimer ce devis ?',
                    description: `Le devis ${d.fournisseur} (${formatEuros(d.montant_ht)} HT) est retiré du projet. Son PDF reste dans les documents.${reinitialise(d) ? ' C’était le dernier devis retenu : le projet repart en « Proposition » (les dates sont gardées).' : ''}`,
                    confirmLabel: 'Supprimer',
                    destructive: true,
                    run: async () => {
                      const repart = reinitialise(d)
                      await supprimerDevis.mutateAsync(d.id)
                      if (repart)
                        await change.mutateAsync({
                          id: inv.id,
                          statutId: ID_DEMANDE,
                          annee,
                        })
                    },
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
            // Déjà réalisé → correction ; sinon pré-rempli par ce qui est
            // gardé en mémoire (152), rien à retaper.
            correction={realise}
            initial={
              inv.date_cloture !== null || inv.bilan !== null
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
                      realise ? undefined : avecAnnuler(ici, annee),
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
        niveau={refus ?? 1}
        pending={change.isPending}
        // Déjà refusé → correction ; sinon pré-rempli par le refus gardé en
        // mémoire (152) : se tromper puis revenir ne fait rien retaper.
        correction={refuse}
        initial={
          inv.date_arret !== null || inv.motif_arret !== null
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
              // À quel niveau (152) : à la confirmation, la prévalidation
              // reste visible.
              refusNiveau: refus ?? 1,
            },
            {
              onSuccess: () => {
                setRefus(null)
                toast.success(
                  refuse ? 'Refus modifié' : 'Projet refusé',
                  refuse ? undefined : avecAnnuler(ici, annee),
                )
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
