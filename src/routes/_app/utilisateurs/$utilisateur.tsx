import { createFileRoute } from '@tanstack/react-router'
import { UtilisateurEcran } from '@/features/utilisateurs/components/utilisateur-ecran'

export const Route = createFileRoute('/_app/utilisateurs/$utilisateur')({
  component: UtilisateurEcran,
})
