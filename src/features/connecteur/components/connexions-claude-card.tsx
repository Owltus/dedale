import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { writeErrorMessage } from '@/lib/erreurs'
import { formatDateAvecSemaineIso } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const CLE = ['connexions-claude'] as const

/**
 * « Connexions Claude » (162) : les applications que la personne a autorisées
 * via l'écran de consentement OAuth, et le moyen de les retirer.
 *
 * Retirer = Supabase Auth révoque le consentement, ferme les sessions de cette
 * application et invalide ses jetons de rafraîchissement. Rien n'est perdu :
 * il suffit de reconnecter Dédale depuis Claude. La carte ne s'affiche que
 * s'il y a au moins une connexion.
 */
export function ConnexionsClaudeCard() {
  const queryClient = useQueryClient()
  const connexions = useQuery({
    queryKey: CLE,
    queryFn: async () => {
      const { data, error } = await supabase.auth.oauth.listGrants()
      if (error) throw error
      return data
    },
  })
  const retirer = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.auth.oauth.revokeGrant({ clientId })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Connexion retirée', {
        description: 'Claude n’a plus accès à Dédale avec ce compte.',
      })
      void queryClient.invalidateQueries({ queryKey: CLE })
    },
    onError: (e) => toast.error(writeErrorMessage(e)),
  })

  // En cours, serveur OAuth indisponible ou aucune connexion : rien à montrer
  // (la plupart des comptes n'en ont pas ; pas de squelette qui disparaît).
  if (!connexions.isSuccess || connexions.data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" /> Connexions Claude
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Les applications que tu as autorisées à utiliser Dédale avec ton
          compte. Retire celles que tu ne reconnais pas ou n’utilises plus.
        </p>
        <ul className="flex flex-col gap-3">
          {connexions.data.map((g) => (
            <li
              key={g.client.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">
                  {g.client.name || 'Application inconnue'}
                </span>
                <span className="text-sm text-muted-foreground">
                  Autorisée le {formatDateAvecSemaineIso(g.granted_at)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={retirer.isPending}
                onClick={() => retirer.mutate(g.client.id)}
              >
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
