# Étape 1 — Primitives & wrappers de champ

## Objectif

Créer les briques réutilisables manquantes, calquées sur l'existant
(`ui/input.tsx`, `common/text-field.tsx`) : une primitive `Select` et une
primitive `Textarea` (style canonique unique), plus leurs wrappers `SelectField`
et `TextareaField` (label + champ + message d'erreur). Aucune migration à cette
étape : on pose seulement le socle.

## Fichier(s) impacté(s)

- `src/components/ui/select.tsx` (nouveau)
- `src/components/ui/textarea.tsx` (nouveau)
- `src/components/common/select-field.tsx` (nouveau)
- `src/components/common/textarea-field.tsx` (nouveau)

## Travail à réaliser

### 1. `ui/select.tsx`

`<select>` natif stylé, style aligné sur `Input` (px-3, shadow-xs, focus ring,
aria-invalid). Accepte tous les props natifs (`value`, `onChange`, `disabled`,
`aria-invalid`, `className`…) et fusionne `className` via `cn`.

```tsx
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Select }
```

### 2. `ui/textarea.tsx`

```tsx
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input bg-background placeholder:text-muted-foreground min-h-16 w-full resize-none rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
```

### 3. `common/select-field.tsx`

Wrapper calqué sur `TextField` : `label`, `value`, `onChange(value)`, `error?`,
`required?`, plus les props natifs (`disabled`, `id`, `children` pour les
`<option>`).

```tsx
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
  const fieldId = id ?? label
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
```

### 4. `common/textarea-field.tsx`

Même schéma, avec `rows` (défaut 4).

```tsx
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
  const fieldId = id ?? label
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
```

## Critère de validation

- `npx tsc -b` et `npx eslint .` passent.
- Les 4 composants sont importables via l'alias `@/`.
- Le style du `Select`/`Textarea` est visuellement cohérent avec `Input`
  (même hauteur, focus, état d'erreur).
