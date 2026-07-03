import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { referentielQueryOptions } from '@/lib/referentiel'

export const demandesQueries = {
  all: () => ['demandes_intervention'] as const,

  /**
   * DI du site actif (non supprimées). La RLS restreint déjà la visibilité :
   * le rôle `demandeur` ne voit que ses propres DI → aucun filtre client à ajouter.
   */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('demandes_intervention')
          .select('*')
          .eq('site_id', siteId!)
          .order('date_constat', { ascending: false })
          .order('created_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Nom du local lié à chaque DI VISIBLE (di_id → local), pour l'afficher en
   * liste SANS une requête par carte. On BORNE au site actif via une jointure
   * `!inner` sur la DI (les liaisons ne portent pas `site_id`) : la RLS suffirait
   * à cloisonner, mais ce filtre évite de rapatrier les liaisons des autres sites
   * et scope la clé de cache au site. On récupère juste le nom du local.
   */
  locauxParDi: (siteId: string | null) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'locaux-par-di', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('di_localisations')
          // `demandes_intervention!inner` ne sert qu'au FILTRE (site actif).
          .select('di_id, locaux(nom), demandes_intervention!inner(site_id)')
          .eq('demandes_intervention.site_id', siteId!)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Locaux liés à une DI (avec leur chemin lisible). */
  localisations: (diId: string) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'localisations', diId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('di_localisations')
          .select('local_id, locaux(id, nom)')
          .eq('di_id', diId)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /** Équipements liés à une DI. */
  equipements: (diId: string) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'equipements', diId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('di_equipements')
          .select('equipement_id, equipements(id, nom)')
          .eq('di_id', diId)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}

export const statutsDiQueries = {
  all: () => ['statuts_di'] as const,

  /** Référentiel des statuts DI (1 Ouvert, 2 En cours, 3 Clôturé). */
  list: () => referentielQueryOptions('statuts_di', 'id, nom', 'id'),
}

export const modelesDiQueries = {
  all: () => ['modeles_di'] as const,

  /**
   * Modèles actifs DU SITE actif, pour la suggestion « souci courant » à la
   * création d'une DI. On EXCLUT les modèles communs (Bibliothèque entreprise,
   * site_id NULL) : seuls les modèles réellement présents sur le site sont
   * proposés au demandeur (sinon la liste mélange des templates non déployés).
   */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...modelesDiQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_di')
          .select('id, libelle, constat_modele, miniature_id')
          .eq('site_id', siteId!)
          .eq('est_actif', true)
          .order('libelle')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}
