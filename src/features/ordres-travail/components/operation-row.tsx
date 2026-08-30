import { useState } from 'react'
import { Replace } from 'lucide-react'
import {
  LIBELLES_STATUT_OP,
  STATUTS_OP_SAISISSABLES,
  consoOperation,
  statutOperationTone,
} from '../schemas'
import {
  conformiteLocale,
  estCompteur,
  estMesureExecution,
  placeholderRange,
  type OperationExecution,
} from '../operation-predicats'
import { ChampNombreUnite } from './champ-nombre-unite'
import { ChangementCompteurPanel } from './changement-compteur-panel'
import { StatusBadge, type StatusTone } from '@/components/common/status-badge'
import { cn } from '@/lib/utils'
import { useLongPress } from '@/hooks/use-long-press'
import { formatDate } from '@/lib/date'
import { DateField } from '@/components/ui/date-field'
import {
  SelectDropdown,
  type SelectOption,
} from '@/components/ui/select-dropdown'

// Prédicats métier exposés au module (déplacés dans ./operation-predicats) —
// ré-exportés à l'identique pour les consommateurs existants (ex. ot-detail).
export {
  estMesureExecution,
  estCompteur,
  estCompteurCumulatif,
} from '../operation-predicats'

/** Valeurs éditables d'une opération d'exécution (état CONTRÔLÉ par le parent). */
export interface OperationEdit {
  statut: string
  valeur: string
  dateExec: string
  // Remplacement de compteur (manuel) — chaînes vides hors remplacement.
  indexDepose: string
  indexPose: string
  dateRemplacement: string
}

// Liseré de carte (bord gauche) par tonalité — même code couleur que `ListRow` /
// `StatusBadge` (tokens de thème).
const TONE_BORDER: Record<StatusTone, string> = {
  neutral: 'border-l-muted-foreground/30',
  success: 'border-l-success',
  warning: 'border-l-warning',
  destructive: 'border-l-destructive',
  info: 'border-l-info',
  violet: 'border-l-violet',
  yellow: 'border-l-yellow',
}

interface OperationRowProps {
  operation: OperationExecution
  /** Valeurs courantes (contrôlées par le parent, qui porte le bouton d'enregistrement). */
  value: OperationEdit
  onChange: (value: OperationEdit) => void
  /** OT clôturé/annulé ou rôle sans droit → champs en lecture seule (preuve légale). */
  readOnly: boolean
  /** Dernier relevé connu (compteurs uniquement) → rappel « précédent : … » sous la valeur. */
  previousValue?: number | null
}

/**
 * Carte d'une opération d'exécution d'un OT : une LIGNE (hauteur standard) avec, à
 * gauche le nom + la description, à droite les champs inline (valeur mesurée, date
 * d'exécution, statut). Composant CONTRÔLÉ : l'état et l'enregistrement (un SEUL
 * bouton pour tout l'OT) sont portés par le parent. Champs désactivés quand l'OT
 * est clôturé/annulé (preuve légale).
 */
export function OperationRow({
  operation,
  value,
  onChange,
  readOnly,
  previousValue,
}: OperationRowProps) {
  const mesure = estMesureExecution(operation)
  const unite = operation.unite_symbole ?? operation.unite_nom ?? ''
  // Liseré de carte selon le statut LIVE (en attente=gris, en cours=bleu,
  // terminée=vert, non applicable=rouge) → réagit à la saisie / au double-clic.
  const tone = statutOperationTone(value.statut)
  // Mesure « Non applicable » : aucune valeur à relever → champ valeur désactivé.
  const valeurDisabled = readOnly || value.statut === 'non_applicable'
  // Couleur de conformité calculée EN DIRECT depuis la valeur saisie → réagit dès
  // la frappe (avant enregistrement). Appliquée à la police de la valeur + unité.
  const conforme = conformiteLocale(value.valeur, operation)
  const conformiteClass =
    conforme === true
      ? 'text-success'
      : conforme === false
        ? 'text-destructive'
        : ''
  // Repère de conformité NON visuel (a11y / WCAG 1.4.1 « use of color ») : porté
  // par l'aria-label + le title, en plus de la couleur — pour lecteurs d'écran.
  const conformiteLabel =
    conforme === true ? 'conforme' : conforme === false ? 'hors seuils' : null
  const courant = value.valeur.trim() === '' ? null : Number(value.valeur)
  // Remplacement de compteur (manuel) : index dépose/pose saisis (number ou null).
  const depose =
    value.indexDepose.trim() === '' ? null : Number(value.indexDepose)
  const pose = value.indexPose.trim() === '' ? null : Number(value.indexPose)
  const aRemplacement =
    depose !== null &&
    !Number.isNaN(depose) &&
    pose !== null &&
    !Number.isNaN(pose)
  // Consommation (helper UNIQUE, replacement-aware) : (dépose − précédent) +
  // (courant − pose), ou courant − précédent hors remplacement. Pour les compteurs.
  const conso = consoOperation({
    precedent: previousValue ?? null,
    courant,
    depose: aRemplacement ? depose : null,
    pose: aRemplacement ? pose : null,
  })
  // Affichage LECTURE SEULE (OT clôturé) : valeur enregistrée formatée (« — » si vide).
  const valeurAffichee =
    courant !== null && !Number.isNaN(courant)
      ? courant.toLocaleString('fr-FR')
      : '—'
  const statutLabel = LIBELLES_STATUT_OP[value.statut] ?? value.statut

  // Options du statut : les statuts saisissables + l'éventuel statut « système »
  // courant (ex. « annulee ») pour qu'il reste affiché.
  const statutOptions: SelectOption[] = [
    ...(!STATUTS_OP_SAISISSABLES.includes(
      value.statut as (typeof STATUTS_OP_SAISISSABLES)[number],
    )
      ? [
          {
            value: value.statut,
            label: LIBELLES_STATUT_OP[value.statut] ?? value.statut,
          },
        ]
      : []),
    ...STATUTS_OP_SAISISSABLES.map((s) => ({
      value: s,
      label: LIBELLES_STATUT_OP[s] ?? s,
    })),
  ]

  // Mode « changement de compteur » (manuel) : révèle les champs dépose/pose.
  // Initialisé d'après un remplacement déjà saisi sur l'opération.
  const [showReplacement, setShowReplacement] = useState(
    value.indexPose.trim() !== '' || value.indexDepose.trim() !== '',
  )

  // Bascule du statut hors champs — au double-clic (desktop) ou à l'appui long
  // (tactile) : non-mesure → Terminée ↔ En attente ; mesure → réinitialise (on ne
  // peut pas « terminer » une mesure sans valeur).
  function toggleStatut() {
    if (readOnly) return
    if (mesure) {
      // Réinitialise la mesure ET un éventuel remplacement de compteur.
      onChange({
        ...value,
        valeur: '',
        statut: 'en_attente',
        indexDepose: '',
        indexPose: '',
        dateRemplacement: '',
      })
      setShowReplacement(false)
    } else {
      onChange({
        ...value,
        statut: value.statut === 'terminee' ? 'en_attente' : 'terminee',
      })
    }
    // Évite la sélection de texte déclenchée par le double-clic / l'appui long.
    window.getSelection()?.removeAllRanges()
  }
  // Appui long tactile = même bascule (la souris conserve le double-clic).
  const longPress = useLongPress(toggleStatut, !readOnly)
  // Active/désactive le mode remplacement. À l'extinction, vide les 3 champs.
  // À l'activation, on NE pré-remplit RIEN : pré-remplir la date rendrait l'op
  // « modifiée » à tort (blocage de navigation + tentative d'enregistrement d'une
  // date sans index → violation du CHECK tout-ou-rien). La date est posée à
  // l'enregistrement, par défaut au jour du relevé, dès que les 2 index sont saisis.
  function toggleRemplacement() {
    const next = !showReplacement
    setShowReplacement(next)
    if (!next) {
      onChange({
        ...value,
        indexDepose: '',
        indexPose: '',
        dateRemplacement: '',
      })
    }
  }

  // Largeur du champ valeur : compacte dans la ligne par défaut, élargie (alignée
  // sur les index) quand il descend dans le panneau de remplacement. Comme il n'y
  // est rendu QUE dans l'un des deux contextes, dériver de showReplacement suffit.
  const valeurWidth = showReplacement ? 'w-32' : 'w-25'
  // Champ « valeur mesurée » (cadre + unité accolée). Réutilisé tel quel : dans la
  // ligne par défaut, ou — en mode remplacement — DANS le panneau après les index.
  const valeurField = mesure && (
    <ChampNombreUnite
      value={value.valeur}
      onValueChange={(valeur) => {
        // Renseigner une valeur (champ VIDE → rempli) bascule l'opération en
        // « Terminée ». Uniquement à la 1re saisie → on n'écrase pas un statut
        // réajusté ensuite à la main, et la frappe ne le force pas.
        const passeTerminee = value.valeur.trim() === '' && valeur.trim() !== ''
        onChange({
          ...value,
          valeur,
          statut: passeTerminee ? 'terminee' : value.statut,
        })
      }}
      ariaLabel={`Valeur mesurée${unite ? ` (${unite})` : ''}${conformiteLabel ? ` — ${conformiteLabel}` : ''}`}
      title={conformiteLabel ?? undefined}
      placeholder={placeholderRange(operation)}
      unite={unite}
      widthClassName={valeurWidth}
      disabled={valeurDisabled}
      emphaseClassName={conformiteClass}
      bold={conformiteClass !== ''}
      dataOpValue
      // Tab/Shift+Tab navigue UNIQUEMENT entre les champs valeur (saisie en série),
      // en bouclant (dernier → premier). Date/statut s'atteignent au clic.
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return
        const inputs = Array.from(
          document.querySelectorAll<HTMLInputElement>(
            'input[data-op-value]:not([disabled])',
          ),
        )
        const i = inputs.indexOf(e.currentTarget)
        if (i === -1 || inputs.length < 2) return
        e.preventDefault()
        const dir = e.shiftKey ? -1 : 1
        const next = inputs[(i + dir + inputs.length) % inputs.length]
        next?.focus()
        next?.select()
      }}
    />
  )

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-l-4 bg-card p-3',
        TONE_BORDER[tone],
      )}
      // Bascule du statut (logique factorisée dans toggleStatut) hors champs
      // interactifs : double-clic (desktop) ou appui long (tactile).
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('input, button, select')) return
        toggleStatut()
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('input, button, select')) return
        longPress.onPointerDown(e)
      }}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerLeave}
      onPointerCancel={longPress.onPointerCancel}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1 select-none">
          <p className="truncate text-sm font-medium">{operation.nom}</p>
          {operation.description?.trim() && (
            <p className="truncate text-xs text-muted-foreground">
              {operation.description}
            </p>
          )}
        </div>

        {readOnly ? (
          // ── LECTURE SEULE (OT clôturé) : 2 colonnes À POSITION FIXE, contenu centré ──
          //    [ valeur / consommation ]   [ date / statut ]
          //    Les deux colonnes ont une largeur fixe et sont TOUJOURS présentes (la
          //    1re reste vide pour une non-mesure) → alignement stable d'une ligne à l'autre.
          <div className="flex w-full items-center justify-end gap-4 sm:w-auto">
            {/* Colonne valeur : 1 à 2 lignes (valeur + consommation), centrée H+V.
                Largeur fixe et TOUJOURS présente (vide pour une non-mesure) → cartes
                alignées. En cas de remplacement, on n'affiche PAS « remplacé : … » :
                juste l'index récent + la conso (qui intègre déjà le changement). */}
            <div className="flex w-28 flex-col items-center justify-center text-center leading-tight">
              {mesure && (
                <>
                  <span
                    className={cn(
                      'text-sm font-medium tabular-nums',
                      conformiteClass,
                    )}
                  >
                    {valeurAffichee}
                    {valeurAffichee !== '—' && unite ? ` ${unite}` : ''}
                  </span>
                  {estCompteur(operation) && conso != null && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {conso > 0 ? '+' : ''}
                      {conso.toLocaleString('fr-FR')}
                      {unite ? ` ${unite}` : ''}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex w-28 flex-col items-center justify-center gap-1 text-center leading-tight">
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDate(operation.date_execution)}
              </span>
              <StatusBadge tone={tone}>{statutLabel}</StatusBadge>
            </div>
          </div>
        ) : (
          // ── ÉDITABLE (OT en cours) : formulaire inline ─────────────────────
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
            {/* En mode remplacement, la valeur descend dans le panneau (après les index). */}
            {!showReplacement && valeurField}

            <DateField
              className="h-9 w-[7.25rem] pointer-coarse:h-10"
              ariaLabel="Date d'exécution"
              value={value.dateExec}
              disabled={readOnly}
              onValueChange={(v) => onChange({ ...value, dateExec: v })}
            />

            <SelectDropdown
              ariaLabel="Statut"
              className="h-9 w-36 px-2 pointer-coarse:h-10"
              value={value.statut}
              disabled={readOnly}
              onValueChange={(v) =>
                onChange({
                  ...value,
                  statut: v,
                  // « Non applicable » → aucune valeur attendue → on vide le champ.
                  valeur: v === 'non_applicable' ? '' : value.valeur,
                })
              }
              options={statutOptions}
            />

            {estCompteur(operation) && (
              <button
                type="button"
                onClick={toggleRemplacement}
                title="Changement de compteur"
                aria-pressed={showReplacement}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors pointer-coarse:h-10 pointer-coarse:w-10',
                  showReplacement
                    ? 'border-info bg-info/10 text-info'
                    : 'border-input text-muted-foreground hover:bg-muted',
                )}
              >
                <Replace className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {!readOnly && estCompteur(operation) && showReplacement && (
        <ChangementCompteurPanel
          value={value}
          onChange={onChange}
          unite={unite}
          previousValue={previousValue}
          conso={conso}
          valeurField={valeurField}
        />
      )}
    </div>
  )
}
