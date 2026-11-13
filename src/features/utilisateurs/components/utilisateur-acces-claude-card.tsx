import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useToggleAccesIa } from '../mutations'
import type { UserRow } from './utilisateur-types'
import { writeErrorMessage } from '@/lib/form'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * « Accès Claude » (153) — admin seul. Autorise ce compte à utiliser Dédale
 * depuis Claude (connecteur), avec SES droits : mêmes sites, même rôle, jamais
 * les fichiers. Éteint par défaut ; l'éteindre coupe Claude à l'appel suivant.
 * Le verrou est tenu par la base (helpers RLS), cette carte n'est qu'un levier.
 */
export function AccesClaudeCard({ user }: { user: UserRow }) {
  const toggle = useToggleAccesIa()
  const id = `acces-claude-${user.id}`

  function basculer(accesIa: boolean) {
    toggle.mutate(
      { id: user.id, accesIa },
      {
        onSuccess: () =>
          toast.success(
            accesIa ? 'Accès Claude ouvert' : 'Accès Claude fermé',
            {
              description: accesIa
                ? `« ${user.nom_complet} » peut utiliser Dédale depuis Claude, avec ses propres droits.`
                : `Claude ne peut plus rien lire ni modifier au nom de « ${user.nom_complet} ».`,
            },
          ),
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
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={id}>Utiliser Dédale depuis Claude</Label>
            <p className="text-sm text-muted-foreground">
              Avec ses propres droits : les mêmes sites, le même rôle. Jamais
              les fichiers (PDF, images). On peut le retirer à tout moment.
            </p>
          </div>
          <Switch
            id={id}
            checked={user.acces_ia}
            disabled={toggle.isPending}
            onCheckedChange={basculer}
          />
        </div>
      </CardContent>
    </Card>
  )
}
