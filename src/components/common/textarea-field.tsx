import { useId } from 'react'
import type { ComponentProps } from 'react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface TextareaFieldProps extends Omit<
  ComponentProps<'textarea'>,
  'onChange'
> {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
}

/** Champ de formulaire : libellé + Textarea + message d'erreur (modèle TextField). */
export function TextareaField({
  label,
  value,
  onChange,
  error,
  required = false,
  rows = 4,
  id,
  ...props
}: TextareaFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>
        {label}
        {required ? ' *' : ''}
      </Label>
      <Textarea
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
