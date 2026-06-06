import { useId } from 'react'
import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'onChange'> {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
}

/** Champ texte standard : libellé + input + message d'erreur. */
export function TextField({
  label,
  value,
  onChange,
  error,
  required = false,
  id,
  ...props
}: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>
        {label}
        {required ? ' *' : ''}
      </Label>
      <Input
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
