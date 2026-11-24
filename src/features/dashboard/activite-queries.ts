import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { demandesQueries } from '@/features/demandes/queries'
import { STATUTS_DI_TERMINAUX } from '@/features/demandes/etat'
import { travauxQueries } from '@/features/travaux/queries'
import { STATUTS_TRAVAUX_TERMINAUX } from '@/features/travaux/etat'
import { evenementsQueries } from '@/features/evenements/queries'
import { STATUTS_EVENEMENTS_TERMINAUX } from '@/features/evenements/etat'
import { documentsQueries } from '@/features/documents/queries'

/**
 * Lignes chargées par journal du tableau de bord. La carte en affiche une
 * vingtaine au plus (calage à la hauteur) : charger l'historique entier (4 071
 * demandes) pour en montrer 15 n'avait aucun sens.
 */
export const LIGNES_ACTIVITE = 30

/** Documents chargés pour la colonne « Documents » (une quinzaine affichés). */
export const LIGNES_DOCUMENTS = 20

/**
 * Ce qu'il reste à traiter d'abord, puis le plus récent : MÊME ordre que
 * l'ancienne normalisation sur la liste complète (non terminés en tête, récence
 * à l'intérieur de chaque groupe), mais sur deux lectures bornées.
 */
function ouvertsPuisRecents<T>(ouverts: T[], termines: T[]): T[] {
  return [...ouverts, ...termines].slice(0, LIGNES_ACTIVITE)
}

const enListe = (ids: readonly number[]) => `(${ids.join(',')})`

/** Le seul statut terminal d'une DI (Clôturé). */
const [STATUT_DI_CLOTURE] = STATUTS_DI_TERMINAUX

/**
 * Requêtes BORNÉES du tableau de bord. Les clés vivent SOUS celles des features
 * (`[...xxxQueries.all(), 'tableau-de-bord', site]`) : les mutations et le temps
 * réel qui invalident une feature rafraîchissent aussi ces aperçus.
 */
export const activiteQueries = {
  demandes: (siteId: string | null) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'tableau-de-bord', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const base = () =>
          supabase
            .from('demandes_intervention')
            .select('*')
            .eq('site_id', siteId!)
        const [ouverts, termines] = await Promise.all([
          base()
            .not('statut_di_id', 'in', enListe(STATUTS_DI_TERMINAUX))
            .order('date_constat', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id')
            .limit(LIGNES_ACTIVITE)
            .abortSignal(signal)
            .throwOnError(),
          base()
            // `eq` et non `in` : avec `in` (= ANY), PostgreSQL ne lit pas l'index
            // 169 dans l'ordre et trie les ~4 000 DI clôturées (RLS comprise)
            // avant d'en garder 30 : 220 ms → 3 ms (plan vérifié le 24/11/2026).
            .eq('statut_di_id', STATUT_DI_CLOTURE)
            .order('date_constat', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id')
            .limit(LIGNES_ACTIVITE)
            .abortSignal(signal)
            .throwOnError(),
        ])
        return ouvertsPuisRecents(ouverts.data, termines.data)
      },
    }),

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
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('di_localisations')
          .select('di_id, local_id, locaux(nom)')
          .in('di_id', [...ids])
          .order('di_id')
          .order('local_id')
          .abortSignal(signal)
          .throwOnError()
        // Même texte que `lieux_di_du_site` (168) : noms dans l'ordre des
        // locaux, sans doublon ni nom vide.
        const noms = new Map<string, string[]>()
        for (const r of data) {
          const nom = r.locaux.nom
          if (!nom) continue
          const liste = noms.get(r.di_id) ?? []
          if (!liste.includes(nom)) liste.push(nom)
          noms.set(r.di_id, liste)
        }
        return new Map([...noms].map(([id, l]) => [id, l.join(', ')]))
      },
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
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('documents')
          .select(
            'id, nom_original, mime_type, taille_octets, type_document_id, storage_path, uploaded_at',
          )
          .eq('site_id', siteId!)
          .order('uploaded_at', { ascending: false })
          .limit(LIGNES_DOCUMENTS)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}
