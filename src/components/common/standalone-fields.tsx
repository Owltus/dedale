import { useId } from 'react'
import type { ComponentProps } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  SelectDropdown,
  type SelectOption,
} from '@/components/ui/select-dropdown'

/**
 * Champs HORS react-hook-form, pilotés par `value` / `onChange`.
 *
 * À utiliser quand l'hôte gère lui-même son état : éditeur de liste, dialog à
 * état local, cascade dont les options dépendent d'un choix précédent, champ
 * dont le type n'est connu qu'à l'exécution. Dans un formulaire react-hook-form,
 * prendre `common/fields/*` (`control` + `name`) : eux seuls branchent la
 * validation Zod et `FormMessage`.
 *
 * Cette famille remplace la génération 1 (`common/{text,select,checkbox,
 * number}-field.tsx`), bâtie sur les primitives NATIVES — c'était le dernier
 * endroit où le panneau d'un menu déroulant ne suivait pas le thème de l'app.
 * Le nom dit explicitement le critère de choix, pour que les deux générations
 * ne se reforment pas : `Standalone*` = état local, `fields/*` = RHF.
 */

/** Libellé + widget + erreur : gabarit commun aux champs autonomes. */
function Enveloppe({
  fieldId,
  label,
  required,
  error,
  hint,
  children,
}: {
  fieldId: string
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  const enErreur = error != null && error !== ''
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
      {hint != null && hint !== '' && !enErreur && (
        <p className="text-sm text-muted-foreground">{hint}</p>
      )}
      {enErreur && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

interface StandaloneSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  hint?: string
  className?: string
}

/** Menu déroulant Radix autonome (libellé + erreur). */
export function StandaloneSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  required = false,
  disabled,
  error,
  hint,
  className,
}: StandaloneSelectProps) {
  const fieldId = useId()
  return (
    <Enveloppe
      fieldId={fieldId}
      label={label}
      required={required}
      error={error}
      hint={hint}
    >
      <SelectDropdown
        value={value}
        onValueChange={onChange}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        ariaLabel={label}
        className={className}
      />
    </Enveloppe>
  )
}

interface StandaloneTextProps extends Omit<
  ComponentProps<'input'>,
  'onChange' | 'value'
> {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  required?: boolean
}

/** Champ texte autonome (libellé + erreur). */
export function StandaloneText({
  label,
  value,
  onChange,
  error,
  hint,
  required = false,
  ...props
}: StandaloneTextProps) {
  const fieldId = useId()
  return (
    <Enveloppe
      fieldId={fieldId}
      label={label}
      required={required}
      error={error}
      hint={hint}
    >
      <Input
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error != null && error !== ''}
        {...props}
      />
    </Enveloppe>
  )
}

/** Case à cocher autonome : libellé À DROITE, lié via `htmlFor`. */
export function StandaloneCheckbox({
  label,
  value,
  onChange,
  error,
  disabled,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
  error?: string
  disabled?: boolean
}) {
  const fieldId = useId()
  const enErreur = error != null && error !== ''
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={fieldId}
          checked={value}
          disabled={disabled}
          onCheckedChange={(c) => {
            onChange(c === true)
          }}
        />
        <Label htmlFor={fieldId} className="font-normal">
          {label}
        </Label>
      </div>
      {enErreur && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
