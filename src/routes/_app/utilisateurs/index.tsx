import { createFileRoute } from '@tanstack/react-router'
import { UtilisateursListe } from '@/features/utilisateurs/components/utilisateurs-liste'

export const Route = createFileRoute('/_app/utilisateurs/')({
  component: UtilisateursListe,
})
