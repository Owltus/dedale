import { useId } from 'react'
import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface NumberFieldProps extends Omit<
  ComponentProps<'input'>,
  'onChange' | 'value' | 'type'
> {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  error?: string
  required?: boolean
  /** Unité affichée en suffixe (ex. kW, bars). */
  unite?: string
}

/** Champ numérique (modèle TextField) : input number + unité optionnelle. */
export function NumberField({
  label,
  value,
  onChange,
  error,
  required = false,
  unite,
  id,
  ...props
}: NumberFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>
        {label}
        {required ? ' *' : ''}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={fieldId}
          type="number"
          step="any"
          value={value ?? ''}
          onChange={(e) => {
            if (e.target.value === '') {
              onChange(null)
              return
            }
            const n = Number(e.target.value)
            onChange(Number.isNaN(n) ? null : n)
          }}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {unite && (
          <span className="text-muted-foreground shrink-0 text-sm">
            {unite}
          </span>
        )}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
