import { useId } from 'react'
import type { ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

interface RadioOption {
  value: string
  label: ReactNode
  description?: ReactNode
}

interface RadioFieldProps<T extends FieldValues> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  label: string
  options: RadioOption[]
  required?: boolean
  disabled?: boolean
}

/** Champ à choix unique react-hook-form sur `RadioGroup` shadcn/Radix. */
export function RadioField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  required = false,
  disabled,
}: RadioFieldProps<T>) {
  const baseId = useId()
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required ? ' *' : ''}
          </FormLabel>
          <FormControl>
            <RadioGroup
              value={field.value ?? ''}
              onValueChange={field.onChange}
              disabled={disabled ?? field.disabled}
            >
              {options.map((o) => {
                const itemId = `${baseId}-${o.value}`
                return (
                  <div key={o.value} className="flex items-start gap-2">
                    <RadioGroupItem
                      value={o.value}
                      id={itemId}
                      className="mt-0.5"
                    />
                    <div className="grid gap-0.5">
                      <Label
                        htmlFor={itemId}
                        className="cursor-pointer font-normal"
                      >
                        {o.label}
                      </Label>
                      {o.description != null && (
                        <p className="text-sm text-muted-foreground">
                          {o.description}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
