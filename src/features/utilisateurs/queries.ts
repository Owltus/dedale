import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const utilisateursQueries = {
  all: () => ['utilisateurs'] as const,

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
