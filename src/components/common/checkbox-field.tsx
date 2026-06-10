import { useId } from 'react'
import { Label } from '@/components/ui/label'

interface CheckboxFieldProps {
  label: string
  value: boolean
  onChange: (value: boolean) => void
  error?: string
}

/** Case à cocher avec libellé (type oui/non). */
export function CheckboxField({
  label,
  value,
  onChange,
  error,
}: CheckboxFieldProps) {
  const fieldId = useId()
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <input
          id={fieldId}
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-primary size-4 cursor-pointer"
        />
        <Label htmlFor={fieldId} className="cursor-pointer">
          {label}
        </Label>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
