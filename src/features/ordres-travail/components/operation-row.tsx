import {
  LIBELLES_STATUT_OP,
  STATUTS_OP_SAISISSABLES,
  statutOperationTone,
} from '../schemas'
import { StatusBadge, type StatusTone } from '@/components/common/status-badge'
import { cn } from '@/lib/utils'
import { useLongPress } from '@/hooks/use-long-press'
import { formatDate } from '@/lib/date'
import { DateField } from '@/components/ui/date-field'
import {
  SelectDropdown,
  type SelectOption,
} from '@/components/ui/select-dropdown'
import type { Database } from '@/lib/database.types'

type OperationExecution =
  Database['public']['Tables']['operations_execution']['Row']

/** Valeurs éditables d'une opération d'exécution (état CONTRÔLÉ par le parent). */
export interface OperationEdit {
  statut: string
  valeur: string
  dateExec: string
}

/**
 * Une opération CAPTE une valeur (type « Mesure ») : a une UNITÉ (compteur,
 * °C, %…), des seuils, ou une valeur déjà relevée. Couvre les relevés de compteur
 * (mesures SANS seuils) et les données historiques.
 */
export function estMesureExecution(op: OperationExecution): boolean {
  return (
    op.unite_symbole !== null ||
    op.unite_nom !== null ||
    op.seuil_minimum !== null ||
    op.seuil_maximum !== null ||
    op.valeur_mesuree !== null
  )
}

/**
 * Un COMPTEUR = une mesure (unité) SANS seuils → relevé d'index cumulatif (eau,
 * électricité, heures…). Aucun flag dédié n'est snapshotté dans operations_execution
 * → on l'infère de l'absence de seuils, comme le distingue le modal de création.
 */
export function estCompteur(op: OperationExecution): boolean {
  return (
    estMesureExecution(op) &&
    op.seuil_minimum === null &&
    op.seuil_maximum === null
  )
}

/** Placeholder = plage de seuils attendue (sans unité : elle est affichée en
 *  suffixe du champ). Vide pour un compteur (pas de seuils). */
function placeholderRange(op: OperationExecution): string | undefined {
  if (op.seuil_minimum !== null && op.seuil_maximum !== null)
    return `${String(op.seuil_minimum)} – ${String(op.seuil_maximum)}`
  if (op.seuil_minimum !== null) return `≥ ${String(op.seuil_minimum)}`
  if (op.seuil_maximum !== null) return `≤ ${String(op.seuil_maximum)}`
  return undefined
}

/**
 * Conformité calculée EN DIRECT (aperçu) depuis la valeur saisie et les seuils :
 * dans la plage → conforme, hors plage → non conforme, sinon (pas de seuils / pas
 * de valeur / valeur invalide) → indéterminé. Le backend recalcule `est_conforme`
 * à l'enregistrement (auto_calcul_conformite) ; ici c'est le retour visuel immédiat.
 */
function conformiteLocale(
  valeur: string,
  op: OperationExecution,
): boolean | null {
  if (op.seuil_minimum === null && op.seuil_maximum === null) return null
  const s = valeur.trim()
  if (s === '') return null
  const v = Number(s)
  if (Number.isNaN(v)) return null
  if (op.seuil_minimum !== null && v < op.seuil_minimum) return false
  if (op.seuil_maximum !== null && v > op.seuil_maximum) return false
  return true
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
  // Écart EN DIRECT (compteurs) : valeur saisie − relevé précédent, affiché dès la
  // frappe. Null avant saisie ou si la valeur courante n'est pas un nombre.
  const courant = value.valeur.trim() === '' ? null : Number(value.valeur)
  const ecart =
    previousValue != null && courant !== null && !Number.isNaN(courant)
      ? courant - previousValue
      : null
  // Affichage LECTURE SEULE (OT clôturé) : valeur enregistrée formatée (« — » si
  // vide) + libellé du statut (pour le badge).
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

  // Bascule du statut hors champs — au double-clic (desktop) ou à l'appui long
  // (tactile) : non-mesure → Terminée ↔ En attente ; mesure → réinitialise (on ne
  // peut pas « terminer » une mesure sans valeur).
  function toggleStatut() {
    if (readOnly) return
    if (mesure) {
      onChange({ ...value, valeur: '', statut: 'en_attente' })
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

  return (
    <div
      className={cn(
        'bg-card flex flex-col gap-2 rounded-lg border border-l-4 p-3',
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
            <p className="text-muted-foreground truncate text-xs">
              {operation.description}
            </p>
          )}
        </div>

        {readOnly ? (
          // ── LECTURE SEULE (OT clôturé) : 2 colonnes À POSITION FIXE, contenu centré ──
          //    [ valeur / consommation ]   [ date / statut ]
          //    Les deux colonnes ont une largeur fixe et sont TOUJOURS présentes (la
          //    1re reste vide pour une non-mesure) → alignement stable d'une ligne à l'autre.
          <div className="flex w-full items-start justify-end gap-4 sm:w-auto">
            <div className="flex w-28 flex-col items-center text-center leading-tight">
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
                  {estCompteur(operation) && ecart != null && (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {ecart > 0 ? '+' : ''}
                      {ecart.toLocaleString('fr-FR')}
                      {unite ? ` ${unite}` : ''}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex w-28 flex-col items-center gap-1 text-center leading-tight">
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatDate(operation.date_execution)}
              </span>
              <StatusBadge tone={tone}>{statutLabel}</StatusBadge>
            </div>
          </div>
        ) : (
          // ── ÉDITABLE (OT en cours) : formulaire inline ─────────────────────
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
            {mesure && (
              // Champ valeur (largeur fixe) : nombre aligné à DROITE + unité accolée
              // en suffixe, dans un seul cadre aux tokens de `Input`.
              <div
                className={cn(
                  'border-input bg-background flex h-8 w-25 items-center gap-1 rounded-md border px-2 shadow-xs transition-[color,box-shadow] pointer-coarse:h-10',
                  'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
                  valeurDisabled && 'pointer-events-none opacity-50',
                )}
              >
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  // Nombre aligné à DROITE → il vient coller l'unité (qui le suit
                  // immédiatement) ; « nombre unité » forment un bloc aligné à droite.
                  className={cn(
                    'no-spinner placeholder:text-muted-foreground w-full min-w-0 border-0 bg-transparent p-0 text-right text-sm outline-none',
                    conformiteClass,
                    conformiteClass !== '' && 'font-medium',
                  )}
                  placeholder={placeholderRange(operation)}
                  aria-label={`Valeur mesurée${unite ? ` (${unite})` : ''}${conformiteLabel ? ` — ${conformiteLabel}` : ''}`}
                  title={conformiteLabel ?? undefined}
                  value={value.valeur}
                  disabled={valeurDisabled}
                  // Tab/Shift+Tab navigue UNIQUEMENT entre les champs valeur (saisie en
                  // série), en bouclant (dernier → premier). Date/statut s'atteignent au clic.
                  data-op-value=""
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
                    const next =
                      inputs[(i + dir + inputs.length) % inputs.length]
                    next?.focus()
                    next?.select()
                  }}
                  onChange={(e) => {
                    const valeur = e.target.value
                    // Renseigner une valeur (champ VIDE → rempli) bascule l'opération
                    // en « Terminée ». Uniquement à la 1re saisie → on n'écrase pas un
                    // statut réajusté ensuite à la main, et la frappe ne le force pas.
                    const passeTerminee =
                      value.valeur.trim() === '' && valeur.trim() !== ''
                    onChange({
                      ...value,
                      valeur,
                      statut: passeTerminee ? 'terminee' : value.statut,
                    })
                  }}
                />
                {unite && (
                  <span
                    className={cn(
                      'text-muted-foreground shrink-0 text-xs',
                      conformiteClass,
                    )}
                  >
                    {unite}
                  </span>
                )}
              </div>
            )}

            <DateField
              className="h-8 w-[7.25rem] pointer-coarse:h-10"
              ariaLabel="Date d'exécution"
              value={value.dateExec}
              disabled={readOnly}
              onValueChange={(v) => onChange({ ...value, dateExec: v })}
            />

            <SelectDropdown
              ariaLabel="Statut"
              className="h-8 w-36 px-2 pointer-coarse:h-10"
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
          </div>
        )}
      </div>
    </div>
  )
}
