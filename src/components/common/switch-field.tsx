import { useId } from 'react'
import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface SwitchFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** Texte d'aide sous le libellé (explique l'effet du on/off). */
  description?: ReactNode
  disabled?: boolean
  id?: string
}

/**
 * Champ de formulaire booléen : libellé (+ description) à gauche, interrupteur
 * on/off à droite. Pendant de `SelectField`/`TextField` pour un choix binaire —
 * à préférer à un menu déroulant à deux options.
 */
export function SwitchField({
  label,
  checked,
  onChange,
  description,
  disabled,
  id,
}: SwitchFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="grid gap-1">
        <Label htmlFor={fieldId} className="cursor-pointer">
          {label}
        </Label>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      <Switch
        id={fieldId}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}
