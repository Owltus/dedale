import { useId, useState, type ComponentProps, type ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

interface PasswordFieldProps<T extends FieldValues> extends Omit<
  ComponentProps<'input'>,
  'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'ref' | 'type'
> {
  control: Control<T, unknown, FieldValues>
  name: FieldPath<T>
  label: string
  required?: boolean
  /** Texte d'aide discret sous le champ. */
  hint?: ReactNode
}

/**
 * Champ MOT DE PASSE react-hook-form, avec bascule afficher / masquer.
 *
 * Jumeau de `TextField`, dont il reprend le contrat (`control` + `name`) et la
 * structure `FormItem`. Il existe séparément pour deux raisons : la bascule
 * d'affichage, et le fait que `type` y est verrouillé — un champ de mot de passe
 * dont l'appelant pourrait changer le type se transformerait en champ texte par
 * inadvertance.
 *
 * `autoComplete` reste réglable par appel, et il compte : `new-password` fait
 * proposer un mot de passe fort par le navigateur, `current-password` fait
 * proposer celui déjà enregistré. Les confondre donne l'un pour l'autre.
 */
export function PasswordField<T extends FieldValues>({
  control,
  name,
  label,
  required = false,
  hint,
  className,
  ...inputProps
}: PasswordFieldProps<T>) {
  // L'état visible/masqué est LOCAL au champ : il ne remonte jamais au
  // formulaire, où il n'aurait aucun sens (ce n'est pas une donnée saisie).
  const [visible, setVisible] = useState(false)
  const descriptionId = useId()

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
          <div className="relative">
            <FormControl>
              <Input
                {...inputProps}
                type={visible ? 'text' : 'password'}
                // Place pour le bouton, qui se superpose au champ.
                className={cn('pr-10', className)}
                name={field.name}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                disabled={field.disabled ?? inputProps.disabled}
                aria-describedby={hint != null ? descriptionId : undefined}
              />
            </FormControl>
            <Button
              // `type="button"` IMPÉRATIF : dans un `<form>`, un bouton sans type
              // vaut `submit` — la bascule d'affichage validerait le formulaire.
              type="button"
              variant="ghost"
              size="icon"
              // Le libellé suit l'état : annoncer « Afficher » alors que le mot
              // de passe l'est déjà induit en erreur qui ne voit pas l'écran.
              aria-label={
                visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
              }
              aria-pressed={visible}
              tabIndex={-1}
              className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground"
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          {hint != null && (
            <FormDescription id={descriptionId}>{hint}</FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
