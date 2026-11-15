import { useId } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { niveauAccesClaude, type NiveauAccesClaude } from '../acces-claude'
import { useChangerAccesClaude } from '../mutations'
import type { UserRow } from './utilisateur-types'
import { writeErrorMessage } from '@/lib/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const OPTIONS: {
  value: NiveauAccesClaude
  label: string
  description: string
}[] = [
  {
    value: 'aucun',
    label: 'Désactivé',
    description: 'Claude ne peut rien lire ni modifier au nom de ce compte.',
  },
  {
    value: 'lecture',
    label: 'Lecture',
    description:
      'Claude consulte Dédale avec les droits de ce compte : mêmes sites, même rôle.',
  },
  {
    value: 'ecriture',
    label: 'Lecture et modification',
    description:
      'En plus, Claude enregistre l’avancement des ordres de travail (opérations, mesures, statuts), toujours après un aperçu validé par la personne.',
  },
]

const TOAST: Record<NiveauAccesClaude, string> = {
  aucun: 'Accès Claude fermé',
  lecture: 'Accès Claude en lecture',
  ecriture: 'Accès Claude en lecture et modification',
}

/**
 * « Accès Claude » (153, 156) — admin seul. Ce que Claude peut faire au nom de
 * ce compte, avec SES droits (mêmes sites, même rôle, jamais les fichiers).
 * Désactivé par défaut ; un changement vaut dès l'appel suivant de Claude.
 * Le verrou est tenu par la base (helpers RLS, gestes claude_*), cette carte
 * n'est qu'un levier.
 */
export function AccesClaudeCard({ user }: { user: UserRow }) {
  const changer = useChangerAccesClaude()
  const baseId = useId()
  const niveau = niveauAccesClaude(user)

  function choisir(valeur: string) {
    const cible = OPTIONS.find((o) => o.value === valeur)?.value
    if (!cible || cible === niveau) return
    changer.mutate(
      { id: user.id, niveau: cible },
      {
        onSuccess: () =>
          toast.success(TOAST[cible], {
            description: `« ${user.nom_complet} »`,
          }),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" /> Accès Claude
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Utiliser Dédale depuis Claude. Jamais les fichiers (PDF, images), et
          modifiable à tout moment.
        </p>
        <RadioGroup
          value={niveau}
          onValueChange={choisir}
          disabled={changer.isPending}
        >
          {OPTIONS.map((o) => {
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
                  <p className="text-sm text-muted-foreground">
                    {o.description}
                  </p>
                </div>
              </div>
            )
          })}
        </RadioGroup>
      </CardContent>
    </Card>
  )
}
