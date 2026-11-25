import { queryOptions, skipToken } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { LIGNES_ACTIVITE, enListe, ouvertsPuisRecents } from '@/lib/apercu'
import { demandesQueries, lieuxDesDemandes } from '@/features/demandes/queries'
import { travauxQueries } from '@/features/travaux/queries'
import { STATUTS_TRAVAUX_TERMINAUX } from '@/features/travaux/etat'
import { evenementsQueries } from '@/features/evenements/queries'
import { STATUTS_EVENEMENTS_TERMINAUX } from '@/features/evenements/etat'
import { documentsQueries } from '@/features/documents/queries'

/** Documents chargés pour la colonne « Documents » (une quinzaine affichés). */
export const LIGNES_DOCUMENTS = 20

/**
 * Requêtes BORNÉES du tableau de bord. Les clés vivent SOUS celles des features
 * (`[...xxxQueries.all(), 'tableau-de-bord', site]`) : les mutations et le temps
 * réel qui invalident une feature rafraîchissent aussi ces aperçus.
 */
export const activiteQueries = {
  /** Aperçu des DI : vit dans `demandesQueries.apercu` (la fiche DI le relit). */
  demandes: (siteId: string | null) => demandesQueries.apercu(siteId),

  /** Lieu(x) des SEULES demandes affichées (di_id → « Chambre 214, Chambre 109 »). */
  lieuxDemandes: (siteId: string | null, ids: readonly string[]) =>
    queryOptions({
      queryKey: [
        ...demandesQueries.all(),
        'tableau-de-bord-lieux',
        siteId,
        ids,
      ] as const,
      enabled: siteId !== null && ids.length > 0,
      queryFn: ({ signal }) => lieuxDesDemandes(ids, signal),
    }),

  travaux: (siteId: string) =>
    queryOptions({
      queryKey: [...travauxQueries.all(), 'tableau-de-bord', siteId] as const,
      queryFn: async ({ signal }) => {
        const base = () =>
          supabase
            .from('interventions_travaux')
            .select('*')
            .eq('site_id', siteId)
        const [ouverts, termines] = await Promise.all([
          base()
            .not('statut_travaux_id', 'in', enListe(STATUTS_TRAVAUX_TERMINAUX))
            .order('date_demande', { ascending: false })
            .order('id')
            .limit(LIGNES_ACTIVITE)
            .abortSignal(signal)
            .throwOnError(),
          base()
            .in('statut_travaux_id', [...STATUTS_TRAVAUX_TERMINAUX])
            .order('date_demande', { ascending: false })
            .order('id')
            .limit(LIGNES_ACTIVITE)
            .abortSignal(signal)
            .throwOnError(),
        ])
        return ouvertsPuisRecents(ouverts.data, termines.data)
      },
    }),

  evenements: (siteId: string) =>
    queryOptions({
      queryKey: [
        ...evenementsQueries.all(),
        'tableau-de-bord',
        siteId,
      ] as const,
      queryFn: async ({ signal }) => {
        const base = () =>
          supabase.from('evenements').select('*').eq('site_id', siteId)
        const [ouverts, termines] = await Promise.all([
          base()
            .not(
              'statut_evenement_id',
              'in',
              enListe(STATUTS_EVENEMENTS_TERMINAUX),
            )
            .order('date_evenement', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id')
            .limit(LIGNES_ACTIVITE)
            .abortSignal(signal)
            .throwOnError(),
          base()
            .in('statut_evenement_id', [...STATUTS_EVENEMENTS_TERMINAUX])
            .order('date_evenement', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id')
            .limit(LIGNES_ACTIVITE)
            .abortSignal(signal)
            .throwOnError(),
        ])
        return ouvertsPuisRecents(ouverts.data, termines.data)
      },
    }),

  /** Derniers fichiers du site, mêmes colonnes et même tri que `documentsQueries.list`. */
  documents: (siteId: string | null) =>
    queryOptions({
      queryKey: [...documentsQueries.all(), 'tableau-de-bord', siteId] as const,
      queryFn:
        siteId === null
          ? skipToken
          : async ({ signal }) => {
              const { data } = await supabase
                .from('documents')
                .select(
                  'id, nom_original, mime_type, taille_octets, type_document_id, storage_path, uploaded_at',
                )
                .eq('site_id', siteId)
                .order('uploaded_at', { ascending: false })
                .limit(LIGNES_DOCUMENTS)
                .abortSignal(signal)
                .throwOnError()
              return data
            },
    }),
}
