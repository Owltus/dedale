import { createFileRoute, redirect } from '@tanstack/react-router'
import { identifiantOAuthValide } from '@/lib/identifiant-oauth'
import { ConnexionEcran } from '@/features/connexion/components/connexion-ecran'

export const Route = createFileRoute('/login')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { autorisation?: string } => {
    const autorisation = identifiantOAuthValide(search.autorisation)
    return autorisation ? { autorisation } : {}
  },
  beforeLoad: ({ context, search }) => {
    // Déjà connecté → pas de raison de voir la page de login.
    if (context.auth.session) {
      const autorisation = identifiantOAuthValide(search.autorisation)
      if (autorisation)
        throw redirect({
          to: '/oauth/consent',
          search: { authorization_id: autorisation },
        })
      throw redirect({ to: '/' })
    }
  },
  component: ConnexionEcran,
})
