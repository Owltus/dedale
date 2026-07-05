import {
  Ban,
  CheckCircle2,
  Paperclip,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react'
import type { Database } from '@/lib/database.types'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { OtStatutBadge } from './ot-statut-badge'

type OtRow = Database['public']['Tables']['ordres_travail']['Row']

interface OtDetailActionsProps {
  ot: OtRow
  onglet: 'operations' | 'documents'
  canManage: boolean
  /** Strict inverse de `opsReadOnly` : les opérations sont éditables. */
  canEditOps: boolean
  /** Nombre de saisies d'opérations non enregistrées. */
  dirtyCount: number
  /** Toutes les opérations seraient terminales une fois les saisies appliquées. */
  toutesTerminalesApres: boolean
  savingOps: boolean
  changerStatutPending: boolean
  updateDatePrevuePending: boolean
  reouvrirPending: boolean
  suppressionPending: boolean
  onSave: () => void
  onRecloturer: () => void
  onRattacherDocument: () => void
  onModifierDate: () => void
  onAnnuler: () => void
  onReouvrir: () => void
  onReactiver: () => void
  onSupprimer: () => void
}

/**
 * Bloc d'actions de la barre de titre d'un OT : badge de STATUT (toujours visible,
 * même en lecture seule) suivi des actions en boutons ICÔNE + tooltip (outline).
 * Onglet Opérations → un bouton de finition adaptatif. Annuler / Réouvrir /
 * Réactiver = transitions manuelles restantes (la clôture initiale est auto). Les
 * boutons ne s'affichent que pour un gestionnaire (`canManage`) ; le badge pour tous.
 */
export function OtDetailActions({
  ot,
  onglet,
  canManage,
  canEditOps,
  dirtyCount,
  toutesTerminalesApres,
  savingOps,
  changerStatutPending,
  updateDatePrevuePending,
  reouvrirPending,
  suppressionPending,
  onSave,
  onRecloturer,
  onRattacherDocument,
  onModifierDate,
  onAnnuler,
  onReouvrir,
  onReactiver,
  onSupprimer,
}: OtDetailActionsProps) {
  // OT rouvert : finition via UN SEUL bouton adaptatif (jamais « Enregistrer » +
  // « Clôturer » en même temps), piloté par `toutesTerminalesApres` → l'enregistrement
  // clôturera l'OT si tout devient terminal.
  const estReouvert = ot.statut === 'reouvert'
  const statutActif =
    ot.statut === 'planifie' ||
    ot.statut === 'en_cours' ||
    ot.statut === 'reouvert'

  return (
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
            (estReouvert && dirtyCount === 0 ? (
              // Rouvert, rien à enregistrer → simple « Clôturer » (uniquement si tout est
              // terminal : on ne clôt pas un OT incomplet, sinon aucun bouton ici).
              toutesTerminalesApres && (
                <TooltipIconButton
                  icon={<CheckCircle2 />}
                  label="Clôturer l'OT"
                  variant="outline"
                  disabled={changerStatutPending}
                  onClick={onRecloturer}
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
                disabled={dirtyCount === 0 || savingOps}
                onClick={onSave}
              />
            ))}
          {onglet === 'documents' && (
            <TooltipIconButton
              icon={<Paperclip />}
              label="Rattacher un document"
              variant="outline"
              onClick={onRattacherDocument}
            />
          )}
          {statutActif && (
            <TooltipIconButton
              icon={<Pencil />}
              label="Modifier la date prévue"
              variant="outline"
              disabled={updateDatePrevuePending}
              onClick={onModifierDate}
            />
          )}
          {statutActif && (
            <TooltipIconButton
              icon={<Ban className="text-destructive" />}
              label="Annuler l'OT"
              variant="outline"
              disabled={changerStatutPending}
              onClick={onAnnuler}
            />
          )}
          {ot.statut === 'cloture' && (
            <TooltipIconButton
              icon={<RotateCcw />}
              label="Réouvrir l'OT"
              variant="outline"
              disabled={reouvrirPending}
              onClick={onReouvrir}
            />
          )}
          {ot.statut === 'annule' && (
            <TooltipIconButton
              icon={<RotateCcw />}
              label="Réactiver l'OT"
              variant="outline"
              disabled={changerStatutPending}
              onClick={onReactiver}
            />
          )}
          {/* Suppression définitive — icône rouge, miroir de l'action « Supprimer »
          de la liste (même mutation, même confirmation). Disponible quel que
          soit le statut (réservée aux gestionnaires via canManage). */}
          <TooltipIconButton
            icon={<Trash2 className="text-destructive" />}
            label="Supprimer l'OT"
            variant="outline"
            disabled={suppressionPending}
            onClick={onSupprimer}
          />
        </>
      )}
    </>
  )
}
