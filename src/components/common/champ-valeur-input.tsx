import type { Champ, ChampValeur } from '@/lib/champs'
import { TextField } from './text-field'
import { NumberField } from './number-field'
import { CheckboxField } from './checkbox-field'
import { SelectField } from './select-field'

interface ChampValeurInputProps {
  champ: Champ
  value: ChampValeur
  onChange: (value: ChampValeur) => void
  error?: string
}

/**
 * Saisie d'une valeur de champ, avec le widget adapté à son `type`
 * (texte / nombre / date / oui-non / liste). Le libellé = `champ.cle`.
 */
export function ChampValeurInput({
  champ,
  value,
  onChange,
  error,
}: ChampValeurInputProps) {
  const label = champ.cle
  switch (champ.type) {
    case 'nombre':
      return (
        <NumberField
          label={label}
          required={champ.requis}
          unite={champ.unite}
          value={typeof value === 'number' ? value : null}
          onChange={(v) => onChange(v)}
          error={error}
        />
      )
    case 'date':
      return (
        <TextField
          label={label}
          required={champ.requis}
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => onChange(v || null)}
          error={error}
        />
      )
    case 'oui-non':
      return (
        <CheckboxField
          label={label}
          value={value === true}
          onChange={(v) => onChange(v)}
          error={error}
        />
      )
    case 'liste':
      return (
        <SelectField
          label={label}
          required={champ.requis}
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => onChange(v || null)}
          error={error}
        >
          <option value="">— Choisir —</option>
          {(champ.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </SelectField>
      )
    default:
      return (
        <TextField
          label={label}
          required={champ.requis}
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => onChange(v || null)}
          error={error}
        />
      )
  }
}
