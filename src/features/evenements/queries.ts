import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { referentielQueryOptions } from '@/lib/referentiel'
import type { DocumentMeta } from '@/features/documents/format'

export const evenementsQueries = {
  all: () => ['evenements'] as const,

  /**
   * Événements du site actif, du plus récent au plus ancien — c'est un journal :
   * ce qui vient d'arriver se lit en premier.
   *
   * 086 avait retiré la jointure locaux/équipements (déplacée vers
   * `evenements_lieux`, 0..N, récupérée via `lieux()`) ; 098 la réintroduit
   * ICI pour le lieu PRINCIPAL (facultatif, indépendant des tâches) — sert à
   * la fois la liste et la fiche détail (résolue depuis ce même résultat via
   * `SlugDetailRoute`).
   */
  list: (siteId: string) =>
    queryOptions({
      queryKey: [...evenementsQueries.all(), 'list', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('evenements')
          .select('*, locaux(id, nom), equipements(id, nom)')
          .eq('site_id', siteId)
          .order('date_evenement', { ascending: false })
          .order('created_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Tâches d'un événement : libellé (identité), lieu facultatif, statut
   * d'avancement (088, miroir `travaux_taches` ; généralisées 090).
   */
  lieux: (evenementId: string) =>
    queryOptions({
      queryKey: [...evenementsQueries.all(), 'lieux', evenementId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('evenements_lieux')
          .select(
            'id, libelle, ordre, statut, local_id, equipement_id, commentaire, date_tache, created_at, locaux(id, nom), equipements(id, nom)',
          )
          .eq('evenement_id', evenementId)
          .order('ordre')
          .order('created_at')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Documents rattachés aux événements du site, en UNE requête groupée
   * filtrée par site → map `evenement_id → DocumentMeta[]`. TOUS les
   * documents remontent, qu'ils soient rattachés au niveau fiche OU à une
   * tâche précise (`tache_id` non filtré) — même patron que la carte OT
   * (`ordresTravailQueries.documentsParOt`) / `travauxQueries.documentsParTravaux`.
   */
  documentsParEvenement: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...evenementsQueries.all(),
        'documents-par-evenement',
        siteId,
      ] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('documents_evenements')
          .select(
            'evenement_id, documents:document_id (id, nom_original, mime_type, taille_octets, type_document_id, storage_path, uploaded_at), evenements!inner(site_id)',
          )
          .eq('evenements.site_id', siteId!)
          .abortSignal(signal)
          .throwOnError()
        const rows = data as unknown as {
          evenement_id: string
          documents: DocumentMeta | null
        }[]
        const map = new Map<string, DocumentMeta[]>()
        for (const row of rows) {
          if (row.documents == null) continue
          const liste = map.get(row.evenement_id) ?? []
          liste.push(row.documents)
          map.set(row.evenement_id, liste)
        }
        return map
      },
    }),
}

export const statutsEvenementsQueries = {
  /** Référentiel des statuts (IDs stables, transitions libres). */
  list: () =>
    referentielQueryOptions('statuts_evenements', 'id, nom, description', 'id'),
}
