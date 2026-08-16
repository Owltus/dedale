import { Check, Circle } from 'lucide-react'
import { PASSWORD_REGLES } from '@/features/utilisateurs/schemas'
import { cn } from '@/lib/utils'

interface PasswordRulesProps {
  /** Valeur courante du champ, pour cocher les règles au fil de la frappe. */
  value: string
  className?: string
}

/**
 * Consignes de mot de passe, cochées en direct.
 *
 * Elles sont rendues depuis `PASSWORD_REGLES` — la liste qui sert AUSSI à la
 * validation. Une consigne affichée à la main finirait par promettre autre chose
 * que ce que le formulaire accepte.
 *
 * **Aucune règle n'est marquée en erreur tant que le champ est vide** : une
 * liste entièrement rouge à l'ouverture du formulaire se lit comme un reproche
 * adressé avant la première frappe. État neutre à vide, satisfait ensuite.
 *
 * L'état de chaque règle est porté par du texte (`sr-only`) et non par la seule
 * couleur de l'icône : une pastille verte n'est une information ni pour un
 * lecteur d'écran, ni pour qui ne distingue pas les couleurs.
 */
export function PasswordRules({ value, className }: PasswordRulesProps) {
  const vide = value.length === 0

  return (
    <ul className={cn('flex flex-col gap-1 text-xs', className)}>
      {PASSWORD_REGLES.map((regle) => {
        const ok = regle.test(value)
        return (
          <li
            key={regle.libelle}
            className={cn(
              'flex items-center gap-1.5',
              ok ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {ok ? (
              <Check className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <Circle className="size-3.5 shrink-0" aria-hidden />
            )}
            <span>{regle.libelle}</span>
            {!vide && (
              <span className="sr-only">
                {ok ? ' — respecté' : ' — non respecté'}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
