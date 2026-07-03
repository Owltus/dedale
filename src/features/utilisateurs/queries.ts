import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { referentielQueryOptions } from '@/lib/referentiel'
import { invokeFunction } from './edge'

export const utilisateursQueries = {
  all: () => ['utilisateurs'] as const,

  /** Profil de l'utilisateur connecté (RLS users_self_select, tous rôles). */
  me: (userId: string) =>
    queryOptions({
      queryKey: [...utilisateursQueries.all(), 'me', userId] as const,
      queryFn: async () => {
        const { data } = await supabase
          .from('users')
          .select('id, nom_complet, roles(code)')
          .eq('id', userId)
          .maybeSingle()
          .throwOnError()
        return data
      },
    }),

  /** Téléphone d'un utilisateur (protégé RGPD : lecture via RPC dédiée). */
  telephone: (userId: string) =>
    queryOptions({
      queryKey: [...utilisateursQueries.all(), 'telephone', userId] as const,
      queryFn: async () => {
        const { data } = await supabase
          .rpc('get_user_telephone', { p_user_id: userId })
          .throwOnError()
        // Le type généré est `string`, mais la RPC peut renvoyer NULL à
        // l'exécution → `||` normalise NULL comme la chaîne vide.
        return data || ''
      },
    }),

  /** Sites attribués à un utilisateur (RLS : admin = tous, manager = ses sites). */
  sitesOf: (userId: string) =>
    queryOptions({
      queryKey: [...utilisateursQueries.all(), 'sites', userId] as const,
      queryFn: async () => {
        const { data } = await supabase
          .from('user_sites')
          .select('site_id, sites(id, nom)')
          .eq('user_id', userId)
          .throwOnError()
        return data
      },
    }),

  /** E-mail d'un utilisateur (vit dans auth.users → lu via Edge Function, admin). */
  email: (userId: string) =>
    queryOptions({
      queryKey: [...utilisateursQueries.all(), 'email', userId] as const,
      queryFn: () =>
        invokeFunction<{ email: string | null }>('update_user_email', {
          user_id: userId,
        }).then((r) => r.email ?? ''),
      staleTime: 5 * 60_000,
    }),

  /** Référentiel des rôles (pour le dropdown de changement de rôle, admin). */
  roles: () => referentielQueryOptions('roles', 'id, code', 'id'),

  /**
   * Liste des utilisateurs visibles par l'appelant (RLS : admin = tous ;
   * manager = ses pairs sur ses sites). Jointure sur `roles` pour le libellé.
   * Pas de filtre deleted_at (la table users n'a pas de soft-delete ; la
   * désactivation se fait via est_actif et l'anonymisation via anonymize_user).
   */
  list: () =>
    queryOptions({
      queryKey: [...utilisateursQueries.all(), 'list'] as const,
      queryFn: async () => {
        const { data } = await supabase
          .from('users')
          .select(
            'id, nom_complet, est_actif, anonymized_at, role_id, created_at, roles(code, description)',
          )
          .order('nom_complet')
          .throwOnError()
        return data
      },
    }),
}
