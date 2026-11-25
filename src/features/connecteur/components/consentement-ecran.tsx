import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/erreurs'
import { useAuth } from '@/auth'
import { connecteurQueries } from '@/features/connecteur/queries'
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

// Via `getRouteApi` pour ne PAS inverser la dépendance features → routes.
const Route = getRouteApi('/oauth/consent')

/** La demande telle que Supabase la décrit, et les droits de la personne. */
function useDemande(authorizationId: string | undefined, userId: string) {
  return useQuery(connecteurQueries.demande(authorizationId, userId))
}

export function ConsentementEcran() {
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
                      {demande.data.modification
                        ? 'lire tes données, enregistrer l’avancement des ordres de travail, créer ou suivre des demandes d’intervention, des travaux et des événements, toujours après t’avoir montré un aperçu à valider ;'
                        : 'lire tes données, sans rien modifier ;'}
                    </li>
                    <li>jamais les fichiers (PDF, images) ;</li>
                    <li>tu pourras retirer l’accès à tout moment.</li>
                  </ul>
                </div>

                <p className="text-sm text-muted-foreground">
                  Après ta réponse, tu seras renvoyé vers{' '}
                  <strong>{demande.data.lieu}</strong>.
                </p>

                <p className="text-sm text-muted-foreground">
                  Si tu n’as pas cliqué toi-même sur « Connecter » dans Claude à
                  l’instant, ou si on t’a envoyé ce lien, refuse.
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
                    Ton administrateur t’a ouvert l’accès Claude
                    {demande.data.modification
                      ? ' en lecture et modification.'
                      : ' en lecture.'}
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
