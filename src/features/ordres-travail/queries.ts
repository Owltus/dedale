import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ReleveLigne } from './releves'
import { cleNom, cleProvenance, type IndexPrecedents } from './correlation'
import type { DocumentMeta } from '@/features/documents/format'

export const ordresTravailQueries = {
  all: () => ['ordres_travail'] as const,

  /** OT du site actif (non supprimés), pour les cartes de la liste. */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...ordresTravailQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          .select(
            'id, statut, origine, tolerance_jours, nom_gamme, nom_prestataire, nom_equipement, description_gamme, nature_gamme, date_prevue, date_cloture, libelle_periodicite, miniature_id',
          )
          .eq('site_id', siteId!)
          .order('date_prevue', { ascending: true })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * OT du site rattachés à une liste de gammes (panneau bas du Plan de
   * maintenance, au palier sous-catégorie). TOUS statuts confondus, triés par
   * date prévue (plus récent d'abord). Un OT à `gamme_id` NULL (gamme supprimée,
   * `ON DELETE SET NULL`) n'est plus rattachable → exclu naturellement par le
   * filtre `.in(...)`. queryKey STABLE : ids triés + joints (un tableau brut
   * change de référence à chaque rendu et casserait le cache).
   */
  byGammes: (siteId: string | null, gammeIds: string[]) =>
    queryOptions({
      queryKey: [
        ...ordresTravailQueries.all(),
        'by-gammes',
        siteId,
        [...gammeIds].sort().join(','),
      ] as const,
      enabled: siteId !== null && gammeIds.length > 0,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          .select(
            'id, statut, origine, tolerance_jours, nom_gamme, nom_prestataire, nom_equipement, description_gamme, date_prevue, date_cloture, gamme_id, miniature_id',
          )
          .eq('site_id', siteId!)
          .in('gamme_id', gammeIds)
          .order('date_prevue', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Relevés des compteurs CUMULATIFS du site, pour calculer le « relevé » des
   * cartes de la liste OT — MÊME règle que la fiche détail (somme par unité
   * présente ≥ 2 fois, cf. `calculerRelevesParOt`). UNE seule requête groupée
   * (≠ N+1) : tous les relevés cumulatifs valués du site, avec gamme + date prévue
   * de leur OT (`!inner`) pour retrouver le relevé PRÉCÉDENT. Le filtre
   * `unite_est_cumulatif` + seuils nuls reflète `estCompteurCumulatif`.
   */
  relevesListe: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...ordresTravailQueries.all(),
        'releves-liste',
        siteId,
      ] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('operations_execution')
          .select(
            // `nom` sert la corrélation de repli de l'ADR 0012 (cf. correlation.ts) :
            // sans lui, une opération supprimée du modèle casse la série de relevés.
            'ordre_travail_id, source_type, source_id, nom, valeur_mesuree, index_depose, index_pose, statut, date_execution, created_at, unite_symbole, ordres_travail!inner(gamme_id, date_prevue)',
          )
          .eq('ordres_travail.site_id', siteId!)
          .eq('unite_est_cumulatif', true)
          .is('seuil_minimum', null)
          .is('seuil_maximum', null)
          .not('valeur_mesuree', 'is', null)
          .abortSignal(signal)
          .throwOnError()
          .overrideTypes<ReleveLigne[], { merge: false }>()
        return data
      },
    }),

  /**
   * Documents rattachés aux OT d'un site, groupés par `ordre_travail_id` — UNE
   * seule requête pour tout le conteneur affiché (≠ N+1 par carte), filtrée par
   * SITE (comme `relevesListe`) et non par liste d'ids : un `.in()` sur des
   * centaines d'OT (filtre « Tous les statuts ») produisait une URL de plusieurs
   * dizaines de milliers de caractères → 400 Bad Request silencieux côté
   * PostgREST, qui vidait l'icône documents de TOUTE la page (pas seulement des
   * OT en trop). Filtrer par site élimine la limite de taille d'URL.
   */
  documentsParOt: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...ordresTravailQueries.all(),
        'documents-par-ot',
        siteId,
      ] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('documents_ordres_travail')
          .select(
            'ordre_travail_id, documents:document_id (id, nom_original, mime_type, taille_octets, type_document_id, storage_path, uploaded_at), ordres_travail!inner(site_id)',
          )
          .eq('ordres_travail.site_id', siteId!)
          .abortSignal(signal)
          .throwOnError()
        const rows = data as unknown as {
          ordre_travail_id: string
          documents: DocumentMeta | null
        }[]
        const map = new Map<string, DocumentMeta[]>()
        for (const row of rows) {
          if (row.documents == null) continue
          const liste = map.get(row.ordre_travail_id) ?? []
          liste.push(row.documents)
          map.set(row.ordre_travail_id, liste)
        }
        return map
      },
    }),

  /** Un OT précis (détail en page). */
  detail: (id: string, siteId: string) =>
    queryOptions({
      queryKey: [...ordresTravailQueries.all(), 'detail', id, siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          // `*` inclut miniature_id : l'image ESTHÉTIQUE PROPRE de l'OT (snapshot
          // souple hérité de la gamme à la création — migration 067). On ne joint
          // plus l'image VIVANTE de la gamme : un OT terminal garde la sienne.
          .select('*')
          .eq('id', id)
          // Cloisonnement site REDONDANT avec la RLS : un identifiant d'OT deviné
          // ou collé depuis un autre site ne résout plus, au lieu de dépendre de
          // la seule RLS. `maybeSingle` → l'absence est un cas normal.
          .eq('site_id', siteId)
          .abortSignal(signal)
          .maybeSingle()
          .throwOnError()
        return data
      },
    }),

  /** Opérations d'exécution (snapshot) d'un OT, ordonnées. */
  operations: (otId: string) =>
    queryOptions({
      queryKey: [...ordresTravailQueries.all(), 'operations', otId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('operations_execution')
          .select('*')
          .eq('ordre_travail_id', otId)
          .order('ordre', { ascending: true })
          // `ordre` est un entier libre, sans contrainte d'unicité : neuf OT
          // réels portent deux opérations au MÊME rang. À rang égal, PostgreSQL
          // ne promet aucun ordre — la liste peut donc se réordonner d'un
          // affichage à l'autre, sur une fiche que le technicien parcourt de
          // haut en bas. Clés secondaires stables, comme pour les opérations de
          // gamme ci-dessus.
          //
          // Le correctif est ICI et non en base : `operations_execution.ordre`
          // est un snapshot GELÉ (protect_opex_snapshots), et sur un OT clôturé
          // toute écriture est refusée (protection_operations_ot_terminaux).
          // Renuméroter aurait exigé de détourner deux portes de sortie prévues
          // pour autre chose, sur des archives, pour un rang d'affichage.
          .order('created_at')
          .order('id')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 30_000,
    }),

  /**
   * Dernier relevé connu (avec valeur) des opérations COMPTEUR visées, pris sur
   * les OT STRICTEMENT ANTÉRIEURS (date_prevue < celle du courant) de la MÊME gamme
   * → rappel « précédent : X ». Le 1er relevé d'un compteur n'a donc PAS de précédent.
   *
   * On relie « la même opération récurrente » d'un OT à l'autre en DEUX TEMPS
   * (ADR 0012) : `(source_type, source_id)` d'abord — la provenance, insensible au
   * renommage — puis, seulement si elle ne rattache rien, `(gamme, nom normalisé)`.
   *
   * Pourquoi le repli existe : la base autorise explicitement la suppression d'une
   * opération de gamme référencée par des exécutions (aucune clé étrangère sur
   * source_id, cf. ADR 0010). Quand cela arrive après un import, chaque exécution
   * peut se retrouver avec un source_id qui n'appartient qu'à elle — 53 lignes dans
   * ce cas en production, soit deux opérations récurrentes relevées 27 et 26 fois,
   * dont l'historique s'affichait vide comme s'il s'agissait d'une première mesure.
   *
   * Pourquoi on ne filtre plus par `source_id` côté serveur : le repli se joue sur
   * le NOM, qu'aucun filtre serveur ne sait normaliser. On ramène donc les relevés
   * valués de la gamme sur la fenêtre antérieure — volume borné par une gamme — et
   * on corrèle en mémoire. La jointure `ordres_travail!inner` et la RLS
   * (opex_site_scoped_select + politique site) cloisonnent toujours par site.
   *
   * Retour : les DEUX index, à interroger dans l'ordre via `valeurPrecedente`.
   */
  previousReadings: (
    otId: string,
    gammeId: string | null,
    currentDatePrevue: string | null,
    aCorreler: boolean,
  ) =>
    queryOptions({
      queryKey: [
        ...ordresTravailQueries.all(),
        'previous-readings',
        otId,
        gammeId,
        currentDatePrevue,
      ] as const,
      enabled: gammeId !== null && currentDatePrevue !== null && aCorreler,
      queryFn: async ({ signal }): Promise<IndexPrecedents> => {
        const parProvenance: Record<string, number> = {}
        const parNom: Record<string, number> = {}
        const { data } = await supabase
          .from('operations_execution')
          .select(
            'source_type, source_id, nom, valeur_mesuree, ordres_travail!inner(gamme_id, date_prevue)',
          )
          .eq('ordres_travail.gamme_id', gammeId!)
          // STRICTEMENT antérieurs : uniquement les OT planifiés AVANT le courant →
          // le 1er relevé d'un compteur n'a pas de « précédent » (rien à afficher).
          .lt('ordres_travail.date_prevue', currentDatePrevue!)
          .neq('ordre_travail_id', otId)
          .eq('statut', 'terminee')
          .not('valeur_mesuree', 'is', null)
          // date_execution est NULLABLE (OT historiques importés : un relevé peut
          // avoir une valeur sans date). On NE les exclut PAS — NULLS LAST pour que le
          // 1er par source (boucle) soit le relevé daté le plus récent quand il existe.
          // created_at départage deux relevés du même jour (date à midi UTC = égale).
          .order('date_execution', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        for (const r of data) {
          // `valeur_mesuree` est non nulle par construction (filtre `.not(… is null)`
          // ci-dessus), et le type l'exprime — pas de garde redondante ici.
          // Liste triée par date DESC → le 1er rencontré par clé est le plus récent.
          const provenance = cleProvenance(r)
          if (provenance !== null && !(provenance in parProvenance)) {
            parProvenance[provenance] = r.valeur_mesuree
          }
          const nom = cleNom(gammeId, r)
          if (nom !== null && !(nom in parNom)) parNom[nom] = r.valeur_mesuree
        }
        return { parProvenance, parNom }
      },
    }),
}

/** Gammes du site sélectionnables pour créer un OT (actives, non supprimées). */
export const gammesPourOtQueries = {
  // Clé sous le namespace `gammes` (table réellement lue), non `ordres_travail` :
  // un changement de gamme reçu en Realtime invalide bien ce cache (convention D4).
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: ['gammes', 'creables-ot', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('gammes')
          .select('id, nom, nature, prestataire_id, periodicites(libelle)')
          .eq('site_id', siteId!)
          .eq('est_active', true)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}
