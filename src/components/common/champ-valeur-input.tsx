import { useId } from 'react'
import type { Champ, ChampValeur } from '@/lib/champs'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { SelectDropdown } from '@/components/ui/select-dropdown'

interface ChampValeurInputProps {
  champ: Champ
  value: ChampValeur
  onChange: (value: ChampValeur) => void
  error?: string
}

/** Libellé + widget + message d'erreur, gabarit commun aux cinq types. */
function Enveloppe({
  fieldId,
  label,
  required,
  error,
  children,
}: {
  fieldId: string
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
      {error != null && error !== '' && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}

/**
 * Saisie d'une valeur de champ, avec le widget adapté à son `type`
 * (texte / nombre / date / oui-non / liste). Le libellé = `champ.cle`.
 *
 * API IMPÉRATIVE (`value`/`onChange`) et non react-hook-form : le type du champ
 * n'est connu qu'à l'exécution, et l'hôte est un éditeur de liste qui gère
 * lui-même son état. Les champs de `common/fields/` (branchés sur
 * `control`+`name`) ne conviennent donc pas ici — on compose directement sur
 * les primitives `ui/`, plutôt que de maintenir en vie une seconde génération
 * de composants de champ pour ce seul cas.
 */
export function ChampValeurInput({
  champ,
  value,
  onChange,
  error,
}: ChampValeurInputProps) {
  const fieldId = useId()
  const label = champ.cle

  switch (champ.type) {
    case 'nombre':
      return (
        <Enveloppe
          fieldId={fieldId}
          label={label}
          required={champ.requis}
          error={error}
        >
          <div className="flex items-center gap-2">
            <Input
              id={fieldId}
              type="number"
              step="any"
              value={typeof value === 'number' ? value : ''}
              onChange={(e) => {
                if (e.target.value === '') {
                  onChange(null)
                  return
                }
                const n = Number(e.target.value)
                onChange(Number.isNaN(n) ? null : n)
              }}
              aria-invalid={error != null && error !== ''}
            />
            {champ.unite != null && champ.unite !== '' && (
              <span className="shrink-0 text-sm text-muted-foreground">
                {champ.unite}
              </span>
            )}
          </div>
        </Enveloppe>
      )

    case 'date':
      return (
        <DateField
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => onChange(v || null)}
          ariaLabel={label}
          className="w-full"
        />
      )

    case 'oui-non':
      return (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={fieldId}
              checked={value === true}
              onCheckedChange={(c) => onChange(c === true)}
            />
            <Label htmlFor={fieldId} className="font-normal">
              {label}
            </Label>
          </div>
          {error != null && error !== '' && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      )

    case 'liste':
      return (
        <Enveloppe
          fieldId={fieldId}
          label={label}
          required={champ.requis}
          error={error}
        >
          <SelectDropdown
            value={typeof value === 'string' ? value : ''}
            onValueChange={(v) => onChange(v || null)}
            options={(champ.options ?? []).map((o) => ({
              value: o,
              label: o,
            }))}
            placeholder="— Choisir —"
            ariaLabel={label}
          />
        </Enveloppe>
      )

    default:
      return (
        <Enveloppe
          fieldId={fieldId}
          label={label}
          required={champ.requis}
          error={error}
        >
          <Input
            id={fieldId}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value || null)}
            aria-invalid={error != null && error !== ''}
          />
        </Enveloppe>
      )
  }
}
