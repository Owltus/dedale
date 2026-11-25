import { createFileRoute, redirect } from '@tanstack/react-router'
import { ConsentementEcran } from '@/features/connecteur/components/consentement-ecran'

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
  component: ConsentementEcran,
})
