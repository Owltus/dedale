import { LIBELLES_STATUT_OP, STATUTS_OP_SAISISSABLES } from '../schemas'
import { cn } from '@/lib/utils'
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

/** Placeholder = plage de seuils attendue (sans unité : elle est affichée en
 *  suffixe du champ). Vide pour un compteur (pas de seuils). */
function placeholderRange(op: OperationExecution): string | undefined {
  if (op.seuil_minimum !== null && op.seuil_maximum !== null)
    return `${String(op.seuil_minimum)} – ${String(op.seuil_maximum)}`
  if (op.seuil_minimum !== null) return `≥ ${String(op.seuil_minimum)}`
  if (op.seuil_maximum !== null) return `≤ ${String(op.seuil_maximum)}`
  return undefined
}

interface OperationRowProps {
  operation: OperationExecution
  /** Valeurs courantes (contrôlées par le parent, qui porte le bouton d'enregistrement). */
  value: OperationEdit
  onChange: (value: OperationEdit) => void
  /** OT clôturé/annulé ou rôle sans droit → champs en lecture seule (preuve légale). */
  readOnly: boolean
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
}: OperationRowProps) {
  const mesure = estMesureExecution(operation)
  const unite = operation.unite_symbole ?? operation.unite_nom ?? ''
  // Code couleur de conformité (donnée serveur) appliqué à la police de la valeur.
  const conformiteClass =
    operation.est_conforme === true
      ? 'text-success'
      : operation.est_conforme === false
        ? 'text-destructive'
        : ''

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

  return (
    <div className="bg-card flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{operation.nom}</p>
        {operation.description?.trim() && (
          <p className="text-muted-foreground truncate text-xs">
            {operation.description}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {mesure && (
          // Champ valeur AJUSTÉ AU CONTENU (`field-sizing-content`) : largeur =
          // celle du nombre, bornée [min,max] → « au plus juste ». Unité en
          // suffixe dans le même cadre (tokens de `Input`).
          <div
            className={cn(
              'border-input bg-background flex h-8 w-fit items-center gap-1 rounded-md border px-2 shadow-xs transition-[color,box-shadow]',
              'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
              readOnly && 'pointer-events-none opacity-50',
            )}
          >
            <input
              type="number"
              inputMode="decimal"
              step="any"
              className={cn(
                'no-spinner placeholder:text-muted-foreground field-sizing-content min-w-[3.5rem] max-w-[6rem] border-0 bg-transparent p-0 text-sm outline-none',
                conformiteClass,
                conformiteClass !== '' && 'font-medium',
              )}
              placeholder={placeholderRange(operation)}
              aria-label={`Valeur mesurée${unite ? ` (${unite})` : ''}`}
              value={value.valeur}
              disabled={readOnly}
              onChange={(e) => onChange({ ...value, valeur: e.target.value })}
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
          className="h-8 w-[7.25rem]"
          ariaLabel="Date d'exécution"
          value={value.dateExec}
          disabled={readOnly}
          onValueChange={(v) => onChange({ ...value, dateExec: v })}
        />

        <SelectDropdown
          ariaLabel="Statut"
          className="h-8 w-32 px-2"
          value={value.statut}
          disabled={readOnly}
          onValueChange={(v) => onChange({ ...value, statut: v })}
          options={statutOptions}
        />
      </div>
    </div>
  )
}
