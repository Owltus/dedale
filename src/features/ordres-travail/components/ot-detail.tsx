import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  FileText,
  ListChecks,
  Paperclip,
  RotateCcw,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'
import { ordresTravailQueries } from '../queries'
import { estVerrouille } from '../schemas'
import {
  useChangerStatutOt,
  useReouvrirOt,
  useUpdateOperationExecution,
} from '../mutations'
import {
  OperationRow,
  estCompteur,
  estMesureExecution,
  type OperationEdit,
} from './operation-row'
import { MotifDialog } from './motif-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useAuth } from '@/auth'
import { useSaveShortcut } from '@/hooks/use-save-shortcut'
import { useMediaQuery } from '@/hooks/use-media-query'
import { todayLocal } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { SubTabs } from '@/components/common/sub-tabs'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DocumentsTab } from '@/components/common/documents-tab'

interface OtDetailProps {
  otId: string
  canManage: boolean
}

type Onglet = 'operations' | 'documents'

export function OtDetail({ otId, canManage }: OtDetailProps) {
  const { session } = useAuth()
  const {
    data: ot,
    isPending,
    isError,
    refetch,
  } = useQuery(ordresTravailQueries.detail(otId))
  const operationsQuery = useQuery(ordresTravailQueries.operations(otId))
  // Focus auto réservé aux pointeurs fins (desktop) : sur tactile, un focus
  // programmatique ouvrirait le clavier virtuel sans valeur ajoutée (pas de Tab).
  const isFinePointer = useMediaQuery('(hover: hover) and (pointer: fine)')

  const changerStatut = useChangerStatutOt()
  const reouvrir = useReouvrirOt()
  const updateOp = useUpdateOperationExecution()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  const [onglet, setOnglet] = useState<Onglet>('operations')
  const [annulerOpen, setAnnulerOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
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

  // Garde-fou : prévient avant de quitter la page s'il reste des saisies non
  // enregistrées — navigation interne ET retour/fermeture du navigateur
  // (beforeUnload natif). `withResolver` → on affiche notre propre modale.
  const blocker = useBlocker({
    shouldBlockFn: () => dirtyOps.length > 0,
    enableBeforeUnload: () => dirtyOps.length > 0,
    withResolver: true,
  })

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
        <PageHeader title="Ordre de travail" />
        <Skeleton className="h-96" />
      </PageContainer>
    )
  }
  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Ordre de travail" />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }
  if (!ot) {
    return (
      <PageContainer>
        <PageHeader title="OT introuvable" />
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
  const gammeMiniatureId = ot.gammes?.miniature_id ?? null
  const statutActif =
    ot.statut === 'planifie' ||
    ot.statut === 'en_cours' ||
    ot.statut === 'reouvert'

  const canEditOps = canManage && !verrouille && Boolean(session)

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
      const aRempl =
        e.indexDepose.trim() !== '' && e.indexPose.trim() !== ''
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
      const toutesTerminales = operations.every((op) => {
        const s = edits[op.id]?.statut ?? op.statut
        return s !== 'en_attente' && s !== 'en_cours'
      })
      toast.success(
        dirtyOps.length > 1
          ? `${String(dirtyOps.length)} opérations enregistrées`
          : 'Opération enregistrée',
      )
      setEdits({})
      if (ot?.statut === 'reouvert' && aucunStatutChange && toutesTerminales) {
        changerStatut.mutate(
          { id: otId, statut: 'cloture' },
          {
            onSuccess: () => toast.success('OT clôturé'),
            onError: (e) => toast.error(writeErrorMessage(e)),
          },
        )
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
  // « Clôturer » en même temps). `toutesTerminalesApres` = une fois les saisies
  // enregistrées, toutes les opérations seraient-elles terminales → l'enregistrement
  // clôturera l'OT.
  const estReouvert = ot.statut === 'reouvert'
  const toutesTerminalesApres = operations.every((op) => {
    const s = edits[op.id]?.statut ?? op.statut
    return s !== 'en_attente' && s !== 'en_cours'
  })

  // Top bar : actions en boutons ICÔNE + tooltip (TooltipIconButton, outline).
  // Onglet Opérations → un bouton de finition adaptatif. Annuler / Réouvrir /
  // Réactiver = transitions manuelles restantes (la clôture initiale est auto).
  const headerActions = canManage ? (
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
          onClick={() => setUploadOpen(true)}
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
    </>
  ) : undefined

  return (
    // `no-scrollbar` : seule la zone de contenu (2e enfant) défile, barre masquée.
    // L'en-tête (1er enfant : top bar + carte + onglets) reste FIXE.
    <PageContainer className="no-scrollbar">
      <div>
        <PageHeader title={ot.nom_gamme} action={headerActions} />

        {/* Carte de l'ordre — vignette de la gamme liée (autres infos plus tard). */}
        <div className="bg-card mb-4 flex h-20 items-stretch overflow-hidden rounded-lg border">
          <div className="aspect-square h-full shrink-0">
            <MiniatureThumb
              url={urlOf(gammeMiniatureId)}
              fallback={<ClipboardList className="size-10" />}
              alt=""
              onError={refreshMiniatures}
              className="size-full rounded-none"
            />
          </div>
        </div>

        <SubTabs
          ariaLabel="Sections de l’ordre de travail"
          variant="segmented"
          value={onglet}
          onValueChange={setOnglet}
          items={[
            {
              id: 'operations',
              label: 'Opérations',
              icon: <ListChecks className="size-4" />,
            },
            {
              id: 'documents',
              label: 'Documents',
              icon: <FileText className="size-4" />,
            },
          ]}
        />
      </div>

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
          <EmptyState icon={ListChecks} title="Aucune opération" />
        ) : (
          <div className="flex flex-col gap-3">
            {operations.map((op) => (
              <OperationRow
                key={op.id}
                operation={op}
                value={opEdit(op)}
                onChange={(v) => setEdits((prev) => ({ ...prev, [op.id]: v }))}
                readOnly={opsReadOnly}
                previousValue={
                  previousReadingsQuery.data?.[
                    `${String(op.source_type)}:${op.source_id}`
                  ] ?? null
                }
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
          onUploadOpenChange={setUploadOpen}
        />
      )}

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
