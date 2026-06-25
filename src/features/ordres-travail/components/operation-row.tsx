import { useState, type KeyboardEventHandler } from 'react'
import { Replace } from 'lucide-react'
import {
  LIBELLES_STATUT_OP,
  STATUTS_OP_SAISISSABLES,
  consoOperation,
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
  // Remplacement de compteur (manuel) — chaînes vides hors remplacement.
  indexDepose: string
  indexPose: string
  dateRemplacement: string
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

/**
 * Saisie numérique avec l'unité accolée en suffixe, dans un cadre aux tokens d'`Input`
 * (nombre aligné à DROITE, l'unité le suit immédiatement). Brique UNIQUE réutilisée
 * pour la valeur mesurée ET les index de remplacement → unité affichée partout, look
 * homogène. Le champ valeur passe `dataOpValue`/`onKeyDown` (navigation Tab en série)
 * et `emphaseClassName` (couleur de conformité) ; les index s'en passent.
 */
function ChampNombreUnite({
  value,
  onValueChange,
  ariaLabel,
  unite,
  widthClassName = 'w-28',
  disabled,
  placeholder,
  title,
  emphaseClassName,
  bold,
  dataOpValue,
  onKeyDown,
}: {
  value: string
  onValueChange: (v: string) => void
  ariaLabel: string
  unite: string | null
  widthClassName?: string
  disabled?: boolean
  placeholder?: string
  title?: string
  emphaseClassName?: string
  bold?: boolean
  dataOpValue?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
}) {
  return (
    <div
      className={cn(
        'border-input bg-background flex h-8 items-center gap-1 rounded-md border px-2 shadow-xs transition-[color,box-shadow] pointer-coarse:h-10',
        'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        widthClassName,
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className={cn(
          'no-spinner placeholder:text-muted-foreground w-full min-w-0 border-0 bg-transparent p-0 text-right text-sm outline-none',
          emphaseClassName,
          bold && 'font-medium',
        )}
        aria-label={ariaLabel}
        placeholder={placeholder}
        title={title}
        value={value}
        disabled={disabled}
        data-op-value={dataOpValue ? '' : undefined}
        onKeyDown={onKeyDown}
        onChange={(e) => onValueChange(e.target.value)}
      />
      {unite && (
        <span
          className={cn(
            'text-muted-foreground shrink-0 text-xs',
            emphaseClassName,
          )}
        >
          {unite}
        </span>
      )}
    </div>
  )
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
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {conso > 0 ? '+' : ''}
                      {conso.toLocaleString('fr-FR')}
                      {unite ? ` ${unite}` : ''}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex w-28 flex-col items-center justify-center gap-1 text-center leading-tight">
              <span className="text-muted-foreground text-xs tabular-nums">
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

            {estCompteur(operation) && (
              <button
                type="button"
                onClick={toggleRemplacement}
                title="Changement de compteur"
                aria-pressed={showReplacement}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors pointer-coarse:h-10 pointer-coarse:w-10',
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
        // stopPropagation : un double-clic / appui long DANS le panneau (labels,
        // fond) ne doit PAS déclencher la bascule de statut de la carte
        // (qui effacerait la saisie de remplacement en cours).
        <div
          className="bg-muted/40 flex flex-col gap-2 rounded-md border border-dashed p-2 select-none"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {/* Intro = le POURQUOI, en une phrase. Puis un formulaire vertical : à
              gauche le libellé + une explication simple, à droite la saisie (w-32,
              bords droits alignés, lignes espacées régulièrement). */}
          <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
            <Replace className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Le compteur a été changé pendant la période ? Recopiez les chiffres
              ci-dessous : la consommation restera juste malgré le changement.
            </span>
          </p>
          {/* Relevé précédent (lecture seule) : base du calcul, lu automatiquement
              sur l'OT antérieur de la même gamme. Affiché pour que l'écart soit
              transparent ; « — » si l'app n'a trouvé aucun relevé antérieur. */}
          <div className="flex items-center gap-4">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm">Relevé précédent</span>
              <span className="text-muted-foreground text-xs">
                Le dernier index relevé avant le changement (OT précédent). Base du
                calcul de l'écart.
              </span>
            </span>
            <span className="w-32 pr-2 text-right text-sm font-medium tabular-nums">
              {previousValue != null
                ? `${previousValue.toLocaleString('fr-FR')}${unite ? ` ${unite}` : ''}`
                : '—'}
            </span>
          </div>
          <label className="flex items-center gap-4">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm">Ancien compteur à la dépose</span>
              <span className="text-muted-foreground text-xs">
                Le dernier chiffre affiché par l'ancien compteur, juste avant de le
                retirer.
              </span>
            </span>
            <ChampNombreUnite
              ariaLabel="Ancien compteur à la dépose"
              unite={unite}
              widthClassName="w-32"
              value={value.indexDepose}
              onValueChange={(v) => onChange({ ...value, indexDepose: v })}
            />
          </label>
          <label className="flex items-center gap-4">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm">Nouveau compteur à l'installation</span>
              <span className="text-muted-foreground text-xs">
                Le chiffre affiché par le compteur neuf au moment où on le pose
                (souvent 0).
              </span>
            </span>
            <ChampNombreUnite
              ariaLabel="Nouveau compteur à l'installation"
              unite={unite}
              widthClassName="w-32"
              value={value.indexPose}
              onValueChange={(v) => onChange({ ...value, indexPose: v })}
            />
          </label>
          <label className="flex items-center gap-4">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm">Nouvel index</span>
              <span className="text-muted-foreground text-xs">
                Le relevé d'aujourd'hui, lu sur le nouveau compteur.
              </span>
            </span>
            {valeurField}
          </label>
          {conso != null && (
            // Écart = consommation calculée (consciente du remplacement), séparée des
            // saisies par un filet ; même colonne (w-32) et même unité que ci-dessus.
            <div className="flex items-center gap-4 border-t pt-2">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm">Écart</span>
                <span className="text-muted-foreground text-xs">
                  La consommation de la période, calculée pour vous malgré le
                  changement de compteur.
                </span>
              </span>
              <span className="w-32 pr-2 text-right text-sm font-medium tabular-nums">
                {conso > 0 ? '+' : ''}
                {conso.toLocaleString('fr-FR')}
                {unite ? ` ${unite}` : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
