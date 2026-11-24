import { createFileRoute } from '@tanstack/react-router'
import { Profil } from '@/features/utilisateurs/components/profil'

export const Route = createFileRoute('/_app/profil')({
  // Pas de requireNav : « Mon profil » est accessible à tout rôle connecté
  // (menu utilisateur, hors sidebar).
  component: Profil,
})
