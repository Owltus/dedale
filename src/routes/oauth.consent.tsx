import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/form'
import { useAuth } from '@/auth'
import {
  lieuDeRetour,
  retourDeConfiance,
} from '@/features/connecteur/confiance'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/**
 * Écran de consentement du connecteur Claude (serveur OAuth 2.1 de Supabase
 * Auth). Supabase y envoie la personne avec `authorization_id` ; elle autorise
 * ou refuse, et Supabase la renvoie vers Claude.
 *
 * Sécurité : cet écran n'est qu'une QUESTION posée à la personne. Le verrou
 * réel est en base (153) : sans « Accès Claude », un jeton accordé ici ne voit
 * rien et ne peut rien faire. On ne suit que l'adresse de retour renvoyée par
 * Supabase (jamais une adresse lue dans l'URL).
 */
const IDENTIFIANT = /^[A-Za-z0-9_-]{1,128}$/

export const Route = createFileRoute('/oauth/consent')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { authorization_id?: string } =>
    typeof search.authorization_id === 'string' &&
    IDENTIFIANT.test(search.authorization_id)
      ? { authorization_id: search.authorization_id }
      : {},
  beforeLoad: ({ context, search }) => {
    // Pas connecté : on passe par la connexion, qui ramène ici ensuite.
    if (!context.auth.session) {
      throw redirect({
        to: '/login',
        search: search.authorization_id
          ? { autorisation: search.authorization_id }
          : {},
      })
    }
  },
  component: ConsentPage,
})

/** La demande telle que Supabase la décrit, et les droits de la personne. */
function useDemande(authorizationId: string | undefined, userId: string) {
  return useQuery({
    queryKey: ['oauth-consent', authorizationId, userId],
    enabled: authorizationId !== undefined,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(
        authorizationId ?? '',
      )
      if (error) throw error
      // Déjà autorisé auparavant : Supabase renvoie directement le retour.
      // On ne suit ce retour que s'il mène bien à Claude (154).
      if (!('authorization_id' in data)) {
        if (!retourDeConfiance(data.redirect_url))
          throw new Error('Adresse de retour non reconnue')
        return { retour: data.redirect_url } as const
      }
      const { data: moi } = await supabase
        .from('users')
        .select('acces_ia, est_actif')
        .eq('id', userId)
        .maybeSingle()
        .throwOnError()
      return {
        retour: null,
        client: data.client.name || 'Application inconnue',
        email: data.user.email,
        autorise: moi?.acces_ia === true && moi.est_actif,
        confiance: retourDeConfiance(data.redirect_uri),
        lieu: lieuDeRetour(data.redirect_uri),
      } as const
    },
  })
}

function ConsentPage() {
  useDocumentTitle('Autoriser Claude')
  const { authorization_id: authorizationId } = Route.useSearch()
  const { session } = useAuth()
  const demande = useDemande(authorizationId, session?.user.id ?? '')
  const [envoi, setEnvoi] = useState<'oui' | 'non' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [refusee, setRefusee] = useState(false)

  if (demande.data?.retour) window.location.assign(demande.data.retour)

  async function repondre(oui: boolean) {
    if (!authorizationId) return
    setErreur(null)
    setEnvoi(oui ? 'oui' : 'non')
    // Application non reconnue : on n'autorise jamais, et on ne renvoie pas
    // la personne vers son adresse (celle de l'escroc) après le refus.
    const confiance = demande.data?.confiance === true
    if (oui && !confiance) return
    // Sinon supabase-js redirige lui-même vers l'adresse renvoyée (Claude).
    const { error } = oui
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: !confiance,
        })
    if (error) {
      setErreur(errorMessage(error))
      setEnvoi(null)
    } else if (!oui && !confiance) setRefusee(true)
  }

  return (
    <div className="h-full overflow-y-auto bg-muted/40">
      <div className="flex min-h-full items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img
              src="/logo.svg"
              alt="Logo Dédale"
              className="mx-auto mb-2 size-16 shrink-0 dark:invert"
            />
            <CardTitle className="text-lg">
              Brancher Claude sur Dédale
            </CardTitle>
            <CardDescription>
              Une application demande à utiliser Dédale avec ton compte.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!authorizationId ? (
              <p className="text-sm text-muted-foreground">
                Cette page s’ouvre depuis Claude, au moment d’ajouter le
                connecteur Dédale. Le lien utilisé est incomplet : recommence
                depuis Claude.
              </p>
            ) : demande.isPending || demande.data?.retour ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : demande.isError ? (
              <p className="text-sm text-destructive">
                Cette demande n’est plus valable (elle expire au bout de
                quelques minutes). Recommence depuis Claude.
              </p>
            ) : (
              <>
                <div className="rounded-md border p-3 text-sm">
                  <p>
                    <strong>{demande.data.client}</strong> pourra agir au nom de{' '}
                    <strong>{demande.data.email}</strong> :
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    <li>avec tes droits : les mêmes sites, le même rôle ;</li>
                    <li>
                      lire tes données et, si tu le confirmes, en modifier ;
                    </li>
                    <li>jamais les fichiers (PDF, images) ;</li>
                    <li>tu pourras retirer l’accès à tout moment.</li>
                  </ul>
                </div>

                <p className="text-sm text-muted-foreground">
                  Après ta réponse, tu seras renvoyé vers{' '}
                  <strong>{demande.data.lieu}</strong>.
                </p>

                {!demande.data.confiance ? (
                  <p className="flex items-start gap-2 text-sm text-destructive">
                    <ShieldOff className="mt-0.5 size-4 shrink-0" />
                    Cette application ne renvoie pas vers Claude : ce n’est pas
                    le connecteur officiel. Ne l’autorise pas. Si tu n’as rien
                    demandé, préviens ton administrateur.
                  </p>
                ) : demande.data.autorise ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="size-4 shrink-0" />
                    Ton administrateur t’a ouvert l’accès Claude.
                  </p>
                ) : (
                  <p className="flex items-start gap-2 text-sm text-warning">
                    <ShieldOff className="mt-0.5 size-4 shrink-0" />
                    Ton administrateur ne t’a pas ouvert l’accès Claude : tu
                    peux seulement refuser. Demande-lui de l’activer sur ta
                    fiche utilisateur.
                  </p>
                )}

                {erreur && <p className="text-sm text-destructive">{erreur}</p>}
                {refusee && (
                  <p className="text-sm text-muted-foreground">
                    Demande refusée. Tu peux fermer cette page.
                  </p>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="outline"
                    disabled={envoi !== null || refusee}
                    onClick={() => void repondre(false)}
                  >
                    {envoi === 'non' ? 'Refus…' : 'Refuser'}
                  </Button>
                  {demande.data.autorise && demande.data.confiance && (
                    <Button
                      disabled={envoi !== null}
                      onClick={() => void repondre(true)}
                    >
                      {envoi === 'oui' ? 'Autorisation…' : 'Autoriser'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
