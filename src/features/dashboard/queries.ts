import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'

/**
 * Requêtes propres au tableau de bord (agrégats du site actif).
 *
 * Le tableau de bord consomme une requête OT UNIFIÉE (`ordresTravail`) qui
 * alimente à elle seule le donut, les barres et le sunburst (mêmes colonnes que
 * `planningQueries.fenetre`, row shape compatible `PlanningOt`). Ce module couvre
 * aussi les données que le tableau de bord est seul à agréger : contrats (frise des
 * reconductions), counts d'onboarding et justificatifs manquants.
 */
export const dashboardQueries = {
  all: () => ['dashboard'] as const,

  /**
   * OT du site (tous statuts, non filtrés par date) — requête UNIFIÉE du tableau
   * de bord. Le `select` reprend EXACTEMENT les colonnes de `planningQueries.fenetre`
   * → le row shape est compatible avec `PlanningOt` (`planning/grille`) et se prête
   * donc à `dateSemaineOt`, `statutPlanningOt`, `OtCard`… pour donut/barres/sunburst.
   *
   * Clé rangée sous le namespace `ordres_travail` (et non `dashboard`) : les
   * écritures d'OT et le realtime `ordres_travail` invalident déjà `ordresTravailQueries.all()`
   * → la donnée du dashboard se rafraîchit sans câblage supplémentaire.
   */
  ordresTravail: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...ordresTravailQueries.all(),
        'dashboard-unifie',
        siteId,
      ] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          .select(
            'id, statut, origine, tolerance_jours, gamme_id, nom_gamme, nature_gamme, nom_prestataire, nom_equipement, description_gamme, nom_categorie, libelle_periodicite, date_prevue, date_debut, date_cloture, miniature_id',
          )
          .eq('site_id', siteId!)
          .order('date_prevue', { ascending: true })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Booléens « existe ≥ 1 » par entité pour le guide « Premiers pas » (une seule
   * requête groupée via `count:'exact', head:true` — on ne rapatrie aucune ligne).
   * `prestataires` n'est PAS filtré par site : la RLS borne déjà sa visibilité
   * (pas de colonne `site_id` sur la table). Les autres entités sont scopées au site.
   */
  onboarding: (siteId: string | null) =>
    queryOptions({
      queryKey: [...dashboardQueries.all(), 'onboarding', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const site = siteId!
        const [batiments, equipements, prestataires, contrats, gammes, ots] =
          await Promise.all([
            supabase
              .from('batiments')
              .select('id', { count: 'exact', head: true })
              .eq('site_id', site)
              .abortSignal(signal)
              .throwOnError(),
            supabase
              .from('v_equipements_complet')
              .select('id', { count: 'exact', head: true })
              .eq('site_id', site)
              .abortSignal(signal)
              .throwOnError(),
            supabase
              .from('prestataires')
              .select('id', { count: 'exact', head: true })
              .abortSignal(signal)
              .throwOnError(),
            supabase
              .from('contrats')
              .select('id', { count: 'exact', head: true })
              .eq('site_id', site)
              .abortSignal(signal)
              .throwOnError(),
            supabase
              .from('gammes')
              .select('id', { count: 'exact', head: true })
              .eq('site_id', site)
              .abortSignal(signal)
              .throwOnError(),
            supabase
              .from('ordres_travail')
              .select('id', { count: 'exact', head: true })
              .eq('site_id', site)
              .abortSignal(signal)
              .throwOnError(),
          ])
        return {
          aBatiment: (batiments.count ?? 0) > 0,
          aEquipement: (equipements.count ?? 0) > 0,
          aPrestataire: (prestataires.count ?? 0) > 0,
          aContrat: (contrats.count ?? 0) > 0,
          aGamme: (gammes.count ?? 0) > 0,
          aOt: (ots.count ?? 0) > 0,
        }
      },
    }),

  /**
   * OT réglementaires clôturés SANS justificatif : PostgREST ne fait pas d'anti-jointe,
   * on rapatrie donc (1) les OT `controle_reglementaire` + `cloture` du site et
   * (2) les `ordre_travail_id` liés dans `documents_ordres_travail` BORNÉS AU SITE
   * (`ordres_travail!inner(site_id)` + filtre — patron `documentsViaOt` : la jointure
   * ne sert qu'au filtre, on ne rapatrie plus toutes les liaisons visibles), puis on
   * diffuse le diff côté front → OT sans preuve.
   */
  justificatifsManquants: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...dashboardQueries.all(),
        'justificatifs-manquants',
        siteId,
      ] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data: otsReglementaires } = await supabase
          .from('ordres_travail')
          .select('id, nom_gamme, nom_equipement, date_cloture')
          .eq('site_id', siteId!)
          .eq('nature_gamme', 'controle_reglementaire')
          .eq('statut', 'cloture')
          .order('date_cloture', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        if (otsReglementaires.length === 0) return []
        const { data: liaisons } = await supabase
          .from('documents_ordres_travail')
          .select('ordre_travail_id, ordres_travail!inner(site_id)')
          .eq('ordres_travail.site_id', siteId!)
          .abortSignal(signal)
          .throwOnError()
        const avecPreuve = new Set(liaisons.map((l) => l.ordre_travail_id))
        return otsReglementaires.filter((ot) => !avecPreuve.has(ot.id))
      },
    }),

  /**
   * TOUS les contrats NON archivés du site, avec l'intégralité des champs de
   * reconduction (dates, préavis, cycle, fenêtre de résiliation) + le libellé du
   * prestataire — pour la frise chronologique « Reconductions » (étape 7).
   *
   * `est_archive = false` est OBLIGATOIRE : sans ce filtre, chaque avenant
   * (version archivée) réapparaîtrait et dupliquerait les événements sur la frise.
   * On ne filtre PAS `date_fin` (les contrats tacites/indéterminés n'en ont pas) :
   * la frise dérive elle-même les échéances.
   */
  contratsFrise: (siteId: string | null) =>
    queryOptions({
      queryKey: [...dashboardQueries.all(), 'contrats-frise', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('contrats')
          // Select sur UNE seule ligne : l'inférence de type supabase ne parse pas
          // un littéral concaténé (`+`) → elle renverrait un `GenericStringError`.
          .select(
            'id, prestataire_id, type_contrat_id, date_debut, date_fin, date_signature, date_resiliation, date_notification, delai_preavis_jours, duree_cycle_mois, fenetre_resiliation_jours, prestataires(id, libelle)',
          )
          .eq('site_id', siteId!)
          .eq('est_archive', false)
          .order('date_debut', { ascending: true })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}
