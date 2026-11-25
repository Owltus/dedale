import { createFileRoute, redirect } from '@tanstack/react-router'
import { ConsentementEcran } from '@/features/connecteur/components/consentement-ecran'
import { identifiantOAuthValide } from '@/lib/identifiant-oauth'

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
export const Route = createFileRoute('/oauth/consent')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { authorization_id?: string } => {
    const id = identifiantOAuthValide(search.authorization_id)
    return id ? { authorization_id: id } : {}
  },
  beforeLoad: ({ context, search }) => {
    // Pas connecté : on passe par la connexion, qui ramène ici ensuite.
    if (!context.auth.session) {
      const id = identifiantOAuthValide(search.authorization_id)
      throw redirect({
        to: '/login',
        search: id ? { autorisation: id } : {},
      })
    }
  },
  component: ConsentementEcran,
})
