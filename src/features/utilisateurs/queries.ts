import { queryOptions, skipToken } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { referentielQueryOptions } from '@/lib/referentiel'
import { invokeFunction } from '@/lib/edge'

/**
 * Options de requête du rôle de l'utilisateur connecté (code texte), via la RPC
 * public.current_role(). Partagées entre le hook (composants) et les gardes de
 * route (`requireNav`), pour une seule source et un cache commun.
 *
 * `current_role()` lit le rôle en DB à chaque appel (pas de claim JWT) : un simple
 * refetch reflète donc un changement de rôle à chaud. `refetchOnWindowFocus:
 * 'always'` revérifie le rôle dès qu'on revient sur l'onglet (le `staleTime`
 * garde la navigation en cache sans spammer la RPC).
 */
export const currentRoleQueryOptions = queryOptions({
  queryKey: ['current_role'],
  queryFn: async () => {
    const res = await supabase.rpc('current_role')
    if (res.error) throw res.error
    return res.data
  },
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: 'always',
})

export const utilisateursQueries = {
  all: () => ['utilisateurs'] as const,

  /** Profil de l'utilisateur connecté (RLS users_self_select, tous rôles). */
  me: (userId: string | null) =>
    queryOptions({
      queryKey: [...utilisateursQueries.all(), 'me', userId] as const,
      queryFn:
        userId === null
          ? skipToken
          : async () => {
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
  telephone: (userId: string | null) =>
    queryOptions({
      queryKey: [...utilisateursQueries.all(), 'telephone', userId] as const,
      queryFn:
        userId === null
          ? skipToken
          : async () => {
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
            'id, nom_complet, est_actif, acces_ia, acces_ia_ecriture, anonymized_at, role_id, created_at, roles(code, description)',
          )
          .order('nom_complet')
          .throwOnError()
        return data
      },
    }),
}
