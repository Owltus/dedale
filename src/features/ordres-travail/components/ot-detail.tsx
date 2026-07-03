import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useBlocker, useNavigate } from '@tanstack/react-router'
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  Paperclip,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { ordresTravailQueries } from '../queries'
import { OT_QUERY_KEYS } from '../query-keys'
import { consoOperation, estVerrouille } from '../schemas'
import { libelleReleve } from '../releves'
import {
  useChangerStatutOt,
  useDeleteOt,
  useReouvrirOt,
  useUpdateDatePrevueOt,
  useUpdateOperationExecution,
} from '../mutations'
import {
  OperationRow,
  estCompteur,
  estCompteurCumulatif,
  estMesureExecution,
  type OperationEdit,
} from './operation-row'
import { MotifDialog } from '@/components/common/motif-dialog'
import { DatePrevueDialog } from './date-prevue-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useAuth } from '@/auth'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useSaveShortcut } from '@/hooks/use-save-shortcut'
import { useFileDrop } from '@/hooks/use-file-drop'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { formatDate, todayLocal } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import type { Database } from '@/lib/database.types'
import { Skeleton } from '@/components/ui/skeleton'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
import { PageContainer } from '@/components/common/page-container'
import {
  PageHeader,
  type PageHeaderCrumb,
} from '@/components/common/page-header'
import { SubTabs } from '@/components/common/sub-tabs'
import { OtStatutBadge } from './ot-statut-badge'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'

interface OtDetailProps {
  otId: string
  canManage: boolean
}

type Onglet = 'operations' | 'documents'

/** Une opération est-elle dans un état TERMINAL (ni à faire, ni en cours) ? */
function statutOpTerminal(statut: string): boolean {
  return statut !== 'en_attente' && statut !== 'en_cours'
}

export function OtDetail({ otId, canManage }: OtDetailProps) {
  const { session } = useAuth()
  const {
    data: ot,
    isPending,
    isError,
    refetch,
  } = useQuery(ordresTravailQueries.detail(otId))
  const operationsQuery = useQuery(ordresTravailQueries.operations(otId))
  // Mise à jour LIVE du détail : changement de l'OT (statut/dates) ou de ses
  // opérations (saisie d'exécution) — ici, autre onglet ou autre utilisateur — sans F5.
  useRealtimeRefresh('ordres_travail', OT_QUERY_KEYS)
  useRealtimeRefresh('operations_execution', ordresTravailQueries.all())
  // Focus auto réservé aux pointeurs fins (desktop) : sur tactile, un focus
  // programmatique ouvrirait le clavier virtuel sans valeur ajoutée (pas de Tab).
  const isFinePointer = useMediaQuery('(hover: hover) and (pointer: fine)')

  const navigate = useNavigate()
  const changerStatut = useChangerStatutOt()
  const reouvrir = useReouvrirOt()
  const supprimer = useDeleteOt()
  const updateDatePrevue = useUpdateDatePrevueOt()
  const updateOp = useUpdateOperationExecution()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  // Suppression définitive (hard-delete) confirmée : état `toDelete` + toasts +
  // fermeture factorisés. Repli navigation vers la liste (l'OT n'existe plus).
  const suppression = useConfirmDelete<string>({
    onDelete: (id) => supprimer.mutateAsync(id),
    successMessage: 'OT supprimé',
    onSuccess: () => void navigate({ to: '/ordres-travail' }),
  })

  const [onglet, setOnglet] = useState<Onglet>('operations')
  const [annulerOpen, setAnnulerOpen] = useState(false)
  const [datePrevueOpen, setDatePrevueOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Fichiers issus d'un glisser-déposer pleine page → pré-remplissent l'upload.
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  // Édition des opérations (clé = id) remontée ICI : un SEUL bouton adaptatif (top
  // bar, onglet Opérations) sauvegarde les opérations modifiées. La clôture d'un OT
  // normal est AUTOMATIQUE côté backend (trigger gestion_statut_ot) quand toutes les
  // opérations passent à un état terminal. Exception : un OT ROUVERT dont les ops sont
  // déjà terminales ne se re-clôt pas seul (le trigger ne part que sur un changement
  // de statut d'op) → le même bouton devient « Enregistrer et clôturer » (s'il reste
  // des saisies) ou « Clôturer » (sinon). Jamais deux boutons concurrents.
  const [edits, setEdits] = useState<Record<string, OperationEdit>>({})
  const [savingOps, setSavingOps] = useState(false)

  // Opérations + détection des saisies non enregistrées — calculées AVANT les
  // retours anticipés (le hook useBlocker doit être appelé inconditionnellement).
  const operations = operationsQuery.data ?? []
  // Valeurs « serveur » d'une opération (baseline + valeur affichée tant qu'elle
  // n'a pas été éditée). Date par défaut = aujourd'hui si non exécutée.
  function baseEdit(op: (typeof operations)[number]): OperationEdit {
    return {
      statut: op.statut,
      valeur: op.valeur_mesuree !== null ? String(op.valeur_mesuree) : '',
      dateExec: op.date_execution
        ? op.date_execution.slice(0, 10)
        : todayLocal(),
      indexDepose: op.index_depose !== null ? String(op.index_depose) : '',
      indexPose: op.index_pose !== null ? String(op.index_pose) : '',
      dateRemplacement: op.date_remplacement
        ? op.date_remplacement.slice(0, 10)
        : '',
    }
  }
  function opEdit(op: (typeof operations)[number]): OperationEdit {
    return edits[op.id] ?? baseEdit(op)
  }
  function isOpDirty(op: (typeof operations)[number]): boolean {
    const e = edits[op.id]
    if (!e) return false
    const b = baseEdit(op)
    return (
      e.statut !== b.statut ||
      e.valeur !== b.valeur ||
      e.dateExec !== b.dateExec ||
      e.indexDepose !== b.indexDepose ||
      e.indexPose !== b.indexPose ||
      e.dateRemplacement !== b.dateRemplacement
    )
  }
  const dirtyOps = operations.filter(isOpDirty)
  // Toutes les opérations seraient-elles terminales une fois les saisies en cours
  // appliquées ? Calculé UNE fois (même rendu) et réutilisé par la re-clôture auto
  // (enregistrement d'un OT rouvert) ET le bouton de finition adaptatif.
  const toutesTerminalesApres = operations.every((op) =>
    statutOpTerminal(edits[op.id]?.statut ?? op.statut),
  )

  // Relevés précédents des compteurs (rappel « précédent : X (+écart) ») : dernier
  // relevé de la même opération (reliée par source_id, stable depuis la migration 063)
  // sur un OT antérieur de la même gamme. La RLS cloisonne par site. Hook appelé AVANT
  // les early-returns (règle des hooks).
  const compteurSourceIds = operations
    .filter((op) => estCompteur(op))
    .map((op) => op.source_id)
  const previousReadingsQuery = useQuery(
    ordresTravailQueries.previousReadings(
      otId,
      ot?.gamme_id ?? null,
      ot?.date_prevue ?? null,
      compteurSourceIds,
    ),
  )
  // Relevé précédent d'une opération compteur (clé `source_type:source_id`, cf.
  // requête previousReadings) — UN seul format de clé pour la carte ET les lignes.
  const relevePrecedentDe = (op: (typeof operations)[number]) =>
    previousReadingsQuery.data?.[`${String(op.source_type)}:${op.source_id}`] ??
    null

  // Garde-fou : prévient avant de quitter la page s'il reste des saisies non
  // enregistrées — navigation interne ET retour/fermeture du navigateur
  // (beforeUnload natif). `withResolver` → on affiche notre propre modale.
  const blocker = useBlocker({
    shouldBlockFn: () => dirtyOps.length > 0,
    enableBeforeUnload: () => dirtyOps.length > 0,
    withResolver: true,
  })

  // Glisser-déposer sur TOUTE la page (réservé aux gestionnaires) : un dépôt
  // bascule sur l'onglet Documents et ouvre l'upload pré-rempli des fichiers.
  const { dragging } = useFileDrop({
    enabled: canManage,
    onFiles: (files) => {
      setDroppedFiles(files)
      setOnglet('documents')
      setUploadOpen(true)
    },
  })
  // Fermeture de l'upload : on oublie les fichiers déposés pour repartir propre.
  const handleUploadOpenChange = (open: boolean) => {
    setUploadOpen(open)
    if (!open) setDroppedFiles([])
  }

  // Ctrl/⌘ + S enregistre les opérations modifiées (équivaut au bouton disquette).
  // Actif UNIQUEMENT s'il y a des saisies à enregistrer → sinon on laisse le
  // Ctrl+S natif du navigateur (et un OT verrouillé n'a jamais de saisies). Hook
  // appelé AVANT les retours anticipés (règle des hooks).
  useSaveShortcut(
    () => void saveAllOps(),
    onglet === 'operations' && !savingOps && dirtyOps.length > 0,
  )

  // À l'ouverture de l'onglet Opérations (données chargées), on place le focus sur
  // le 1er champ valeur VIDE et non désactivé → saisie immédiate sans cliquer (puis
  // Tab enchaîne, déjà géré). Si tout est renseigné, ou OT verrouillé (champs
  // désactivés), on ne vole pas le focus. `requestAnimationFrame` attend le rendu.
  useEffect(() => {
    // `isPending` = query DÉTAIL : tant qu'elle charge, l'onglet affiche le
    // squelette (les OperationRow ne sont pas encore dans le DOM). Sans ce garde,
    // si les opérations résolvent avant le détail, l'effet se déclencherait sur le
    // squelette (focus perdu) sans jamais se rejouer (course détail/opérations).
    if (
      !isFinePointer ||
      onglet !== 'operations' ||
      isPending ||
      !operationsQuery.isSuccess
    )
      return
    const raf = requestAnimationFrame(() => {
      const premierVide = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[data-op-value]:not([disabled])',
        ),
      ).find((i) => i.value.trim() === '')
      premierVide?.focus({ preventScroll: true })
      premierVide?.select()
    })
    return () => cancelAnimationFrame(raf)
    // Déclenché à l'ouverture de l'onglet / fin de chargement / changement d'OT,
    // PAS à chaque frappe (sinon le focus sauterait pendant la saisie).
  }, [isFinePointer, onglet, isPending, operationsQuery.isSuccess, otId])

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader
          title="Ordre de travail"
          onBack={() => void navigate({ to: '/ordres-travail' })}
        />
        <Skeleton className="h-96" />
      </PageContainer>
    )
  }
  if (isError) {
    return (
      <PageContainer>
        <PageHeader
          title="Ordre de travail"
          onBack={() => void navigate({ to: '/ordres-travail' })}
        />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }
  if (!ot) {
    return (
      <PageContainer>
        <PageHeader
          title="OT introuvable"
          onBack={() => void navigate({ to: '/ordres-travail' })}
        />
        <EmptyState
          icon={ClipboardList}
          title="OT introuvable"
          description="Cet ordre de travail n'existe plus ou n'est pas accessible."
        />
      </PageContainer>
    )
  }

  const verrouille = estVerrouille(ot.statut)
  // Lecture seule des opérations dès que l'OT est terminal (cloture/annule)
  // ou sans session valide (executed_by requis à la saisie).
  const opsReadOnly = !canManage || verrouille || !session
  // Image ESTHÉTIQUE PROPRE de l'OT (snapshot souple hérité de la gamme — 067) :
  // un OT terminal garde la sienne même si la gamme change d'image ensuite.
  const otMiniatureId = ot.miniature_id ?? null
  const statutActif =
    ot.statut === 'planifie' ||
    ot.statut === 'en_cours' ||
    ot.statut === 'reouvert'

  // Strict inverse de `opsReadOnly` (cf. ci-dessus) — une seule règle, pas deux
  // expressions en miroir à garder synchrones.
  const canEditOps = !opsReadOnly

  async function saveAllOps() {
    if (dirtyOps.length === 0) return
    // Lecture seule (OT verrouillé, rôle sans droit, ou session expirée) → on ne
    // tente AUCUNE écriture, quel que soit le déclencheur (bouton OU Ctrl+S). Défend
    // la fenêtre transitoire : édits résiduels après une annulation d'OT.
    if (opsReadOnly) return
    // Garde : valeur mesurée / index de remplacement non numériques → on bloque
    // avant tout envoi.
    const numInvalide = (s: string) =>
      s.trim() !== '' && Number.isNaN(Number(s))
    for (const op of dirtyOps) {
      const e = edits[op.id]!
      if (estMesureExecution(op) && numInvalide(e.valeur)) {
        toast.error(`Valeur mesurée invalide : ${op.nom}`)
        return
      }
      if (numInvalide(e.indexDepose) || numInvalide(e.indexPose)) {
        toast.error(`Index de remplacement invalide : ${op.nom}`)
        return
      }
      // Remplacement : les deux index vont ensemble (miroir du CHECK
      // operations_execution_remplacement_coherent). On rejette proprement le
      // remplissage partiel plutôt que de laisser remonter une erreur DB opaque.
      const aDepose = e.indexDepose.trim() !== ''
      const aPose = e.indexPose.trim() !== ''
      if (aDepose !== aPose) {
        toast.error(
          `Remplacement incomplet : renseignez l'ancien ET le nouvel index — ${op.nom}`,
        )
        return
      }
    }
    setSavingOps(true)
    // Écritures SÉRIALISÉES (pas en parallèle) : la clôture auto de l'OT
    // (trigger gestion_statut_ot) teste « toutes les opérations terminées ? ».
    // En parallèle, des transactions concurrentes ne verraient pas les ops
    // sœurs encore non commitées → l'OT resterait « en cours » alors que tout
    // est terminé. En série, le trigger de la dernière op voit les précédentes.
    const errors: unknown[] = []
    for (const op of dirtyOps) {
      const e = edits[op.id]!
      const valeurMesuree =
        estMesureExecution(op) && e.valeur.trim() !== ''
          ? Number(e.valeur)
          : null
      // Remplacement : tout-ou-rien (miroir du CHECK). Le garde ci-dessus a déjà
      // rejeté le remplissage partiel ; ici on neutralise une date orpheline (date
      // sans index) et, si la date n'a pas été saisie, on défausse au jour du relevé.
      const aRempl = e.indexDepose.trim() !== '' && e.indexPose.trim() !== ''
      try {
        await updateOp.mutateAsync({
          id: op.id,
          otId,
          statut: e.statut,
          valeurMesuree,
          // Jour saisi → MIDI UTC : la date UTC stockée == le jour choisi, donc
          // relue à l'identique (slice de l'UTC) et affichée le bon jour en local
          // (évite le décalage J-1 d'un minuit local converti en UTC).
          dateExecution: e.dateExec
            ? new Date(`${e.dateExec}T12:00:00Z`).toISOString()
            : null,
          executedBy: session.user.id,
          commentaires: op.commentaires,
          // Remplacement de compteur (manuel) — tout-ou-rien, null sinon.
          indexDepose: aRempl ? Number(e.indexDepose) : null,
          indexPose: aRempl ? Number(e.indexPose) : null,
          dateRemplacement: aRempl
            ? e.dateRemplacement.trim() !== ''
              ? e.dateRemplacement
              : e.dateExec
            : null,
        })
      } catch (err) {
        errors.push(err)
      }
    }
    setSavingOps(false)
    if (errors.length === 0) {
      // Calculé AVANT de vider edits. Re-clôture auto d'un OT rouvert : si
      // l'enregistrement n'a changé AUCUN statut d'opération, le trigger de clôture
      // auto (gestion_statut_ot, qui ne réagit qu'à un changement de statut) ne s'est
      // pas déclenché → un OT rouvert dont toutes les ops sont terminales resterait
      // bloqué « rouvert ». On le clôture pour matcher « j'enregistre → c'est clôturé ».
      const aucunStatutChange = dirtyOps.every(
        (op) => edits[op.id]?.statut === op.statut,
      )
      toast.success(
        dirtyOps.length > 1
          ? `${String(dirtyOps.length)} opérations enregistrées`
          : 'Opération enregistrée',
      )
      setEdits({})
      // `toutesTerminalesApres` (calculé au rendu, AVANT le vidage des edits) reflète
      // bien l'état post-enregistrement. Même mutation/toasts que la clôture manuelle.
      if (
        ot?.statut === 'reouvert' &&
        aucunStatutChange &&
        toutesTerminalesApres
      ) {
        recloturer()
      }
    } else {
      toast.error(writeErrorMessage(errors[0]))
    }
  }

  function reactiver() {
    // Résurrection annule → planifie (refresh snapshots + régénère ops côté DB).
    changerStatut.mutate(
      { id: otId, statut: 'planifie' },
      {
        onSuccess: () => {
          toast.success('OT réactivé')
          setEdits({})
        },
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  function annuler(motif: string) {
    changerStatut.mutate(
      { id: otId, statut: 'annule', motifAnnulation: motif },
      {
        onSuccess: () => {
          toast.success('OT annulé')
          setAnnulerOpen(false)
        },
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  function recloturer() {
    // Re-clôture manuelle d'un OT rouvert : ses opérations étant déjà toutes
    // terminales, aucun déclencheur de clôture auto ne part (le trigger ne réagit
    // qu'à un changement de STATUT d'opération). La base valide la transition
    // reouvert → cloture et refuse si une opération n'est pas terminée.
    changerStatut.mutate(
      { id: otId, statut: 'cloture' },
      {
        onSuccess: () => toast.success('OT clôturé'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  function confirmDatePrevue(valeurs: {
    datePrevue: string
    origine: Database['public']['Enums']['ot_origine']
  }) {
    if (!ot) return
    // origine envoyée seulement si l'utilisateur l'a changée (sinon on n'arme pas le
    // trigger backend pour un no-op). La base valide la bascule : planifie → programme
    // est ouvert aux rôles métier (migration 070), programme → planifie à tous.
    const origineChange = valeurs.origine !== ot.origine
    updateDatePrevue.mutate(
      {
        id: otId,
        datePrevue: valeurs.datePrevue,
        origine: origineChange ? valeurs.origine : undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            origineChange
              ? 'Ordre de travail mis à jour'
              : 'Date prévue modifiée',
          )
          setDatePrevueOpen(false)
        },
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  function handleReouvrir() {
    // Réouverture en UN clic (pas de modal). Le motif est imposé par la base
    // (CHECK motif_reouverture_oblig_si_reouvert + RPC, valeur juridique NF EN
    // 13306) → on fournit une note générique automatique plutôt que de demander
    // une saisie. Le changement de statut reste tracé dans audit_log.
    reouvrir.mutate(
      { id: otId, motif: 'Réouverture' },
      {
        onSuccess: () => toast.success('OT rouvert'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  // OT rouvert : finition via UN SEUL bouton adaptatif (jamais « Enregistrer » +
  // « Clôturer » en même temps), piloté par `toutesTerminalesApres` (calculé plus
  // haut) → l'enregistrement clôturera l'OT si tout devient terminal.
  const estReouvert = ot.statut === 'reouvert'

  // Top bar : badge de STATUT (toujours visible, même en lecture seule, à côté des
  // boutons) suivi des actions en boutons ICÔNE + tooltip (TooltipIconButton,
  // outline). Onglet Opérations → un bouton de finition adaptatif. Annuler / Réouvrir
  // / Réactiver = transitions manuelles restantes (la clôture initiale est auto). Les
  // boutons ne s'affichent que pour un gestionnaire (canManage) ; le badge reste pour tous.
  const headerActions = (
    <>
      <OtStatutBadge
        statut={ot.statut}
        origine={ot.origine}
        datePrevue={ot.date_prevue}
        toleranceJours={ot.tolerance_jours}
        className="h-9 px-3 text-sm font-medium"
      />
      {canManage && (
        <>
          {onglet === 'operations' &&
            canEditOps &&
            (estReouvert && dirtyOps.length === 0 ? (
              // Rouvert, rien à enregistrer → simple « Clôturer » (uniquement si tout est
              // terminal : on ne clôt pas un OT incomplet, sinon aucun bouton ici).
              toutesTerminalesApres && (
                <TooltipIconButton
                  icon={<CheckCircle2 />}
                  label="Clôturer l'OT"
                  variant="outline"
                  disabled={changerStatut.isPending}
                  onClick={recloturer}
                />
              )
            ) : (
              // Des saisies à enregistrer → « Enregistrer », qui devient « Enregistrer et
              // clôturer » sur un OT rouvert dont l'enregistrement va tout terminer.
              <TooltipIconButton
                icon={<Save />}
                label={
                  estReouvert && toutesTerminalesApres
                    ? 'Enregistrer et clôturer'
                    : 'Enregistrer les opérations'
                }
                variant="outline"
                disabled={dirtyOps.length === 0 || savingOps}
                onClick={() => void saveAllOps()}
              />
            ))}
          {onglet === 'documents' && (
            <TooltipIconButton
              icon={<Paperclip />}
              label="Rattacher un document"
              variant="outline"
              onClick={() => {
                setDroppedFiles([])
                setUploadOpen(true)
              }}
            />
          )}
          {statutActif && (
            <TooltipIconButton
              icon={<Pencil />}
              label="Modifier la date prévue"
              variant="outline"
              disabled={updateDatePrevue.isPending}
              onClick={() => setDatePrevueOpen(true)}
            />
          )}
          {statutActif && (
            <TooltipIconButton
              icon={<Ban className="text-destructive" />}
              label="Annuler l'OT"
              variant="outline"
              disabled={changerStatut.isPending}
              onClick={() => setAnnulerOpen(true)}
            />
          )}
          {ot.statut === 'cloture' && (
            <TooltipIconButton
              icon={<RotateCcw />}
              label="Réouvrir l'OT"
              variant="outline"
              disabled={reouvrir.isPending}
              onClick={handleReouvrir}
            />
          )}
          {ot.statut === 'annule' && (
            <TooltipIconButton
              icon={<RotateCcw />}
              label="Réactiver l'OT"
              variant="outline"
              disabled={changerStatut.isPending}
              onClick={reactiver}
            />
          )}
          {/* Suppression définitive — icône rouge, miroir de l'action « Supprimer »
          de la liste (même mutation, même confirmation). Disponible quel que
          soit le statut (réservée aux gestionnaires via canManage). */}
          <TooltipIconButton
            icon={<Trash2 className="text-destructive" />}
            label="Supprimer l'OT"
            variant="outline"
            disabled={suppression.pending}
            onClick={() => suppression.demander(otId)}
          />
        </>
      )}
    </>
  )

  // Sommes de consommation par unité CUMULATIVE (kVA exclu via estCompteurCumulatif).
  // Réutilise les relevés précédents déjà chargés ; total partiel accepté.
  const toNombre = (s: string) =>
    s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s)
  // Valeur affichée dans la cellule « Relevé » de la carte d'en-tête : MÊME
  // logique exportée que la carte de liste (`libelleReleve`), mais seuil ≥ 2
  // occurrences d'une unité (carte d'en-tête). Vide → « — ».
  const releve =
    libelleReleve(
      operations.filter(estCompteurCumulatif).map((op) => {
        const e = opEdit(op)
        const precedent = relevePrecedentDe(op)
        return {
          symbole: op.unite_symbole ?? '',
          conso: consoOperation({
            precedent,
            courant: toNombre(e.valeur),
            depose: toNombre(e.indexDepose),
            pose: toNombre(e.indexPose),
          }),
        }
      }),
      2,
    ) || null

  // Fil d'Ariane : un OT vient d'une GAMME (décision PO) → on remonte vers le Plan de
  // maintenance et la gamme (ouverte via `?open`, l'explorateur reconstruit le chemin).
  // `Breadcrumb` replie automatiquement la racine en « … » → rendu « … › gamme › [OT] ».
  // OT sans gamme (ad hoc) : repli sur la liste des ordres de travail.
  const gammeId = ot.gamme_id
  const otBreadcrumb: PageHeaderCrumb[] = gammeId
    ? [
        {
          label: 'Plan de maintenance',
          onClick: () =>
            void navigate({ to: '/gammes/$', params: { _splat: '' } }),
        },
        {
          label: ot.nom_gamme,
          onClick: () =>
            void navigate({
              to: '/gammes/$',
              params: { _splat: '' },
              search: { open: gammeId },
            }),
        },
      ]
    : [
        {
          label: 'Ordres de travail',
          onClick: () => void navigate({ to: '/ordres-travail' }),
        },
      ]

  return (
    // `no-scrollbar` : seule la zone de contenu (2e enfant) défile, barre masquée.
    // L'en-tête (1er enfant : top bar + carte + onglets) reste FIXE.
    <PageContainer className="no-scrollbar">
      <div>
        <PageHeader
          title={ot.nom_gamme}
          description={ot.description_gamme ?? undefined}
          breadcrumb={otBreadcrumb}
          action={headerActions}
        />

        {/* Carte d'en-tête (brique partagée DetailHeaderCard) : vignette + infos
            en grille 3 colonnes (l1 prestataire/périodicité/relevé, l2 dates). Le
            relevé est masqué par une cellule vide quand il n'y a aucune somme. */}
        <DetailHeaderCard
          className="mb-4"
          thumbnail={
            <MiniatureThumb
              url={urlOf(otMiniatureId)}
              fallback={<ClipboardList className="size-10" />}
              alt=""
              onError={refreshMiniatures}
              className="size-full rounded-none"
            />
          }
          fields={[
            { label: 'Prestataire', value: ot.nom_prestataire },
            { label: 'Périodicité', value: ot.libelle_periodicite },
            releve ? { label: 'Relevé', value: releve } : null,
            { label: 'Prévue', value: formatDate(ot.date_prevue) },
            {
              label: 'Début',
              value: ot.date_debut ? formatDate(ot.date_debut) : null,
            },
            {
              label: 'Clôture',
              value: ot.date_cloture ? formatDate(ot.date_cloture) : null,
            },
          ]}
        />

        <SubTabs
          ariaLabel="Sections de l’ordre de travail"
          variant="segmented"
          value={onglet}
          onValueChange={setOnglet}
          items={[
            { id: 'operations', label: 'Opérations' },
            { id: 'documents', label: 'Documents' },
          ]}
        />
      </div>

      {/* Zone de contenu défilante : `relative` + `min-h-full` → la surcouche de
          glisser-déposer voile toute la hauteur visible, quel que soit l'onglet
          (le drop est capté sur la fenêtre entière par `useFileDrop`). Colonne
          flex pour que l'onglet Documents occupe toute la zone → son état vide
          « Aucun document » se centre verticalement. */}
      <div className="relative flex min-h-full flex-col">
        {onglet === 'operations' ? (
          operationsQuery.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : operationsQuery.isError ? (
            <ErrorState onRetry={() => void operationsQuery.refetch()} />
          ) : operations.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Aucune opération"
              className="min-h-40 flex-1 justify-center"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {operations.map((op) => (
                <OperationRow
                  key={op.id}
                  operation={op}
                  value={opEdit(op)}
                  onChange={(v) =>
                    setEdits((prev) => ({ ...prev, [op.id]: v }))
                  }
                  readOnly={opsReadOnly}
                  previousValue={relevePrecedentDe(op)}
                />
              ))}
            </div>
          )
        ) : (
          <DocumentsTab
            liaison="documents_ordres_travail"
            parentColumn="ordre_travail_id"
            parentId={otId}
            uploadOpen={uploadOpen}
            onUploadOpenChange={handleUploadOpenChange}
            uploadInitialFiles={droppedFiles}
            className="min-h-0 flex-1"
            namingContext={{
              prestataire: ot.nom_prestataire,
              objet: ot.nom_gamme,
              date: ot.date_prevue,
            }}
          />
        )}
        {canManage && <FileDropOverlay show={dragging} />}
      </div>

      <MotifDialog
        key={annulerOpen ? 'annuler-open' : 'annuler-closed'}
        open={annulerOpen}
        onOpenChange={setAnnulerOpen}
        title="Annuler l'ordre de travail"
        description="Indiquez le motif d'annulation (traçabilité obligatoire)."
        confirmLabel="Annuler l'OT"
        destructive
        pending={changerStatut.isPending}
        onConfirm={annuler}
      />

      {/* Replanification : édition de la date prévue. `key` réinitialise le champ
          à la date courante à chaque ouverture (état interne au dialogue). */}
      <DatePrevueDialog
        key={datePrevueOpen ? 'date-open' : 'date-closed'}
        open={datePrevueOpen}
        onOpenChange={setDatePrevueOpen}
        datePrevue={ot.date_prevue.slice(0, 10)}
        origine={ot.origine}
        pending={updateDatePrevue.isPending}
        onConfirm={confirmDatePrevue}
      />

      {/* Suppression définitive de l'OT — même formulation que la liste. */}
      <ConfirmDialog
        {...suppression.dialogProps}
        title="Supprimer l'ordre de travail ?"
        description={`« ${ot.nom_gamme} » sera supprimé définitivement.`}
        confirmLabel="Supprimer"
        destructive
      />

      {/* Garde-fou navigation : saisies d'opérations non enregistrées. */}
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.()
        }}
        title="Modifications non enregistrées"
        description="Des saisies d'opérations n'ont pas été enregistrées. Si vous quittez cette page, elles seront perdues."
        confirmLabel="Quitter sans enregistrer"
        destructive
        onConfirm={() => blocker.proceed?.()}
      />
    </PageContainer>
  )
}
