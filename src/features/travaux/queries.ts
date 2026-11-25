import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
} from '@tanstack/react-query'
import { LIGNES_PAR_ONGLET, decalageSuivant } from '@/lib/pagination'
import { supabase } from '@/lib/supabase'
import { referentielQueryOptions } from '@/lib/referentiel'
import type { DocumentMeta } from '@/features/documents/format'

export const travauxQueries = {
  all: () => ['travaux'] as const,

  /**
   * Travaux du site actif. 098 : jointure locaux/équipements pour afficher le
   * lieu principal — sert à la fois la liste et la fiche détail (résolue
   * depuis ce même résultat via `SlugDetailRoute`).
   */
  list: (siteId: string) =>
    queryOptions({
      queryKey: [...travauxQueries.all(), 'list', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('interventions_travaux')
          .select('*, locaux(id, nom), equipements(id, categories(nom))')
          .eq('site_id', siteId)
          .order('date_demande', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Travaux d'un LIEU (`travaux_du_lieu`, 183), 50 à la fois : lieu principal
   * (le lieu ou un de ses équipements) ∪ tâches posées dessus. `ouverts` = non
   * terminés. Même forme de ligne que `list` (lieu principal joint).
   */
  duLieu: (localId: string | null, ouverts: boolean) =>
    infiniteQueryOptions({
      queryKey: [...travauxQueries.all(), 'du-lieu', localId, ouverts] as const,
      initialPageParam: 0,
      // Lieu absent (onglet vide d’après le compteur) → aucune lecture.
      queryFn:
        localId === null
          ? skipToken
          : async ({ pageParam, signal }) => {
              const { data } = await supabase
                .rpc('travaux_du_lieu', {
                  p_local_id: localId,
                  p_ouverts_seulement: ouverts,
                  p_limite: LIGNES_PAR_ONGLET,
                  p_decalage: pageParam,
                })
                .select('*, locaux(id, nom), equipements(id, categories(nom))')
                .abortSignal(signal)
                .throwOnError()
              return data
            },
      getNextPageParam: decalageSuivant,
    }),

  /** Tâches d'un travail : libellé (identité), lieu facultatif, statut (090). */
  taches: (travauxId: string | null) =>
    queryOptions({
      queryKey: [...travauxQueries.all(), 'taches', travauxId] as const,
      queryFn:
        travauxId === null
          ? skipToken
          : async ({ signal }) => {
              const { data } = await supabase
                .from('travaux_taches')
                .select(
                  'id, libelle, statut, ordre, local_id, equipement_id, commentaire, date_tache, created_at, locaux(id, nom), equipements(id)',
                )
                .eq('travaux_id', travauxId)
                .order('ordre')
                .order('created_at')
                .abortSignal(signal)
                .throwOnError()
              return data
            },
    }),

  /**
   * Documents rattachés aux travaux du site, en UNE requête groupée filtrée
   * par site (pas par liste d'ids : un `.in()` sur des centaines de travaux
   * dépasse la taille d'URL autorisée) → map `travaux_id → DocumentMeta[]`.
   * TOUS les documents remontent, qu'ils soient rattachés au niveau fiche OU
   * à une tâche précise (`tache_id` non filtré) — même logique que la carte
   * OT (`ordresTravailQueries.documentsParOt`), qui sert de patron ici.
   */
  documentsParTravaux: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...travauxQueries.all(),
        'documents-par-travaux',
        siteId,
      ] as const,
      queryFn:
        siteId === null
          ? skipToken
          : async ({ signal }) => {
              const { data } = await supabase
                .from('documents_interventions_travaux')
                .select(
                  'travaux_id, documents:document_id (id, nom_original, mime_type, taille_octets, type_document_id, storage_path, uploaded_at), interventions_travaux!inner(site_id)',
                )
                .eq('interventions_travaux.site_id', siteId)
                .abortSignal(signal)
                .throwOnError()
              // Typé par la sélection (jointure documents:document_id) : aucune conversion.
              const rows: {
                travaux_id: string
                documents: DocumentMeta | null
              }[] = data
              const map = new Map<string, DocumentMeta[]>()
              for (const row of rows) {
                if (row.documents == null) continue
                const liste = map.get(row.travaux_id) ?? []
                liste.push(row.documents)
                map.set(row.travaux_id, liste)
              }
              return map
            },
    }),
}

export const statutsTravauxQueries = {
  /** Référentiel des statuts (machine à états, IDs stables). */
  list: () =>
    referentielQueryOptions('statuts_travaux', 'id, nom, description', 'id'),
}
