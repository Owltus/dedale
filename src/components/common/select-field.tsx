import { useId } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

interface SelectFieldProps extends Omit<ComponentProps<'select'>, 'onChange'> {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  children: ReactNode
}

/** Champ de formulaire : libellé + Select + message d'erreur (modèle TextField). */
export function SelectField({
  label,
  value,
  onChange,
  error,
  required = false,
  id,
  children,
  ...props
}: SelectFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>
        {label}
        {required ? ' *' : ''}
      </Label>
      <Select
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {children}
      </Select>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
