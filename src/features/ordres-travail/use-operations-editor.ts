import { useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth'
import { useSaveShortcut } from '@/hooks/use-save-shortcut'
import { todayLocal } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import type { Database } from '@/lib/database.types'
import { estVerrouille } from './schemas'
import { useUpdateOperationExecution } from './mutations'
import {
  estMesureExecution,
  type OperationEdit,
} from './components/operation-row'

type OtRow = Database['public']['Tables']['ordres_travail']['Row']
type OperationExecution =
  Database['public']['Tables']['operations_execution']['Row']

/** Une opération est-elle dans un état TERMINAL (ni à faire, ni en cours) ? */
function statutOpTerminal(statut: string): boolean {
  return statut !== 'en_attente' && statut !== 'en_cours'
}

interface UseOperationsEditorParams {
  /** OT courant (nullable tant que le détail charge). */
  ot: OtRow | null | undefined
  otId: string
  operations: OperationExecution[]
  canManage: boolean
  onglet: 'operations' | 'documents'
  /**
   * Re-clôture d'un OT rouvert : appelée après un enregistrement qui n'a changé
   * AUCUN statut d'opération alors que toutes deviennent terminales (le trigger
   * de clôture auto ne réagit qu'à un changement de statut d'op).
   */
  onRecloturer: () => void
}

/**
 * Moteur d'édition des opérations d'exécution d'un OT : état des saisies (clé =
 * id d'opération), détection des modifications non enregistrées, enregistrement
 * groupé sérialisé, garde-fou de navigation (`useBlocker`) et raccourci Ctrl/⌘+S.
 * Remonté ici pour piloter UN seul bouton de finition adaptatif (cf. `OtDetailActions`).
 */
export function useOperationsEditor({
  ot,
  otId,
  operations,
  canManage,
  onglet,
  onRecloturer,
}: UseOperationsEditorParams) {
  const { session } = useAuth()
  const updateOp = useUpdateOperationExecution()

  // Édition des opérations (clé = id) : un SEUL bouton adaptatif sauvegarde les
  // opérations modifiées. La clôture d'un OT normal est AUTOMATIQUE côté backend
  // (trigger gestion_statut_ot) quand toutes les opérations passent à un état
  // terminal. Exception : un OT ROUVERT dont les ops sont déjà terminales ne se
  // re-clôt pas seul (le trigger ne part que sur un changement de statut d'op).
  const [edits, setEdits] = useState<Record<string, OperationEdit>>({})
  const [savingOps, setSavingOps] = useState(false)

  // Valeurs « serveur » d'une opération (baseline + valeur affichée tant qu'elle
  // n'a pas été éditée). Date par défaut = aujourd'hui si non exécutée.
  function baseEdit(op: OperationExecution): OperationEdit {
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
  function opEdit(op: OperationExecution): OperationEdit {
    return edits[op.id] ?? baseEdit(op)
  }
  function isOpDirty(op: OperationExecution): boolean {
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

  // Lecture seule des opérations dès que l'OT est terminal (cloture/annule), sans
  // droit de gestion, ou sans session valide (executed_by requis à la saisie).
  const verrouille = ot ? estVerrouille(ot.statut) : false
  const opsReadOnly = !canManage || verrouille || !session

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
  // Ctrl+S natif du navigateur (et un OT verrouillé n'a jamais de saisies).
  useSaveShortcut(
    () => void saveAllOps(),
    onglet === 'operations' && !savingOps && dirtyOps.length > 0,
  )

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
        onRecloturer()
      }
    } else {
      toast.error(writeErrorMessage(errors[0]))
    }
  }

  return {
    edits,
    setEdits,
    savingOps,
    opsReadOnly,
    opEdit,
    dirtyOps,
    toutesTerminalesApres,
    saveAllOps,
    blocker,
  }
}
