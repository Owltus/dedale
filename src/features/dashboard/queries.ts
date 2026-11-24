import { queryOptions, skipToken } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toutesLesLignes } from '@/lib/pagination'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'

/**
 * Requêtes propres au tableau de bord (agrégats du site actif).
 *
 * Le tableau de bord consomme une requête OT UNIFIÉE (`ordresTravail`) qui
 * alimente à elle seule le donut, les barres et le sunburst (mêmes colonnes que
 * `planningQueries.fenetre`, row shape compatible `PlanningOt`). Ce module couvre
 * aussi les données que le tableau de bord est seul à agréger : contrats (frise des
 * reconductions), counts d'onboarding et documents manquants.
 */
/** Colonnes d'un OT côté tableau de bord (row shape `PlanningOt`). */
const COLONNES_OT =
  'id, statut, origine, tolerance_jours, gamme_id, nom_gamme, nature_gamme, nom_prestataire, nom_equipement, description_gamme, nom_categorie, libelle_periodicite, date_prevue, date_debut, date_cloture, miniature_id'

export const dashboardQueries = {
  all: () => ['dashboard'] as const,

  /**
   * OT du tableau de bord, lus en TROIS morceaux plutôt que tout l'historique
   * (889 OT et en hausse) :
   * - `otOuverts` : tout ce qui n'est ni clôturé ni annulé, quelle que soit la
   *   date (retards, en cours, à venir : jauge, sunburst, frise, barres) ;
   * - `otPeriode` : les OT terminés dont la date effective (clôture, sinon
   *   prévue — `dateSemaineOt`) tombe dans la période affichée ;
   * - `derniersPassages` : la date du dernier OT clôturé de chaque gamme (vue
   *   170), seule donnée d'historique dont la frise a besoin pour estimer.
   * Même colonnes que `planningQueries.fenetre` (row shape `PlanningOt`). Clés
   * sous `ordres_travail` : les écritures et le temps réel des OT les
   * rafraîchissent sans câblage supplémentaire.
   */
  otOuverts: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...ordresTravailQueries.all(),
        'tableau-de-bord-ouverts',
        siteId,
      ] as const,
      queryFn:
        siteId === null
          ? skipToken
          : ({ signal }) =>
              toutesLesLignes((debut, fin) =>
                supabase
                  .from('ordres_travail')
                  .select(COLONNES_OT)
                  .eq('site_id', siteId)
                  .not('statut', 'in', '(cloture,annule)')
                  .order('date_prevue', { ascending: true })
                  .order('id', { ascending: true })
                  .range(debut, fin)
                  .abortSignal(signal)
                  .throwOnError(),
              ),
    }),

  otPeriode: (siteId: string | null, debut: string, fin: string) =>
    queryOptions({
      queryKey: [
        ...ordresTravailQueries.all(),
        'tableau-de-bord-periode',
        siteId,
        debut,
        fin,
      ] as const,
      queryFn:
        siteId === null
          ? skipToken
          : ({ signal }) =>
              toutesLesLignes((de, a) =>
                supabase
                  .from('ordres_travail')
                  .select(COLONNES_OT)
                  .eq('site_id', siteId)
                  .in('statut', ['cloture', 'annule'])
                  // Date effective dans la période : la clôture si elle existe, sinon
                  // la date prévue (même règle que `dateSemaineOt`).
                  .or(
                    `and(date_cloture.gte.${debut},date_cloture.lt.${fin}),and(date_cloture.is.null,date_prevue.gte.${debut},date_prevue.lt.${fin})`,
                  )
                  .order('date_prevue', { ascending: true })
                  .order('id', { ascending: true })
                  .range(de, a)
                  .abortSignal(signal)
                  .throwOnError(),
              ),
    }),

  derniersPassages: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...ordresTravailQueries.all(),
        'tableau-de-bord-derniers-passages',
        siteId,
      ] as const,
      queryFn:
        siteId === null
          ? skipToken
          : async ({ signal }) => {
              const { data } = await supabase
                .from('v_gammes_dernier_passage')
                .select('gamme_id, date_cloture')
                .eq('site_id', siteId)
                .abortSignal(signal)
                .throwOnError()
              const parGamme = new Map<string, string>()
              for (const r of data) {
                if (r.gamme_id && r.date_cloture)
                  parGamme.set(r.gamme_id, r.date_cloture)
              }
              return parGamme
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
      queryFn:
        siteId === null
          ? skipToken
          : async ({ signal }) => {
              const site = siteId
              const [batiments, equipements, prestataires, gammes, ots] =
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
                aGamme: (gammes.count ?? 0) > 0,
                aOt: (ots.count ?? 0) > 0,
              }
            },
    }),

  /**
   * OT clôturés dont le document est REQUIS et absent (132, 134) : la règle
   * vit en base (vue `v_ot_documents_manquants` = interrupteur
   * `document_requis` de la gamme), historique compris.
   */
  documentsManquants: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...dashboardQueries.all(),
        'documents-manquants',
        siteId,
      ] as const,
      // Relue à CHAQUE arrivée sur le tableau de bord (petite lecture) : joindre
      // le document manquant depuis une fiche OT doit faire disparaître l'alerte
      // au retour. La table `documents` n'est pas publiée en temps réel, et les
      // mutations de documents ne connaissent pas les clés du tableau de bord.
      staleTime: 0,
      queryFn:
        siteId === null
          ? skipToken
          : async ({ signal }) => {
              const { data } = await supabase
                .from('v_ot_documents_manquants')
                .select(
                  'id, nom_gamme, nom_equipement, nature_gamme, date_cloture',
                )
                .eq('site_id', siteId)
                .order('date_cloture', { ascending: false })
                .order('id')
                .abortSignal(signal)
                .throwOnError()
              // Une vue expose toutes ses colonnes en nullable : on rétablit les
              // NOT NULL de `ordres_travail` (id, nom_gamme, nature_gamme).
              return data.flatMap((r) =>
                r.id !== null && r.nom_gamme !== null && r.nature_gamme !== null
                  ? [
                      {
                        id: r.id,
                        nom_gamme: r.nom_gamme,
                        nature_gamme: r.nature_gamme,
                        nom_equipement: r.nom_equipement,
                        date_cloture: r.date_cloture,
                      },
                    ]
                  : [],
              )
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
      queryFn:
        siteId === null
          ? skipToken
          : async ({ signal }) => {
              const { data } = await supabase
                .from('contrats')
                // Select sur UNE seule ligne : l'inférence de type supabase ne parse pas
                // un littéral concaténé (`+`) → elle renverrait un `GenericStringError`.
                .select(
                  'id, prestataire_id, type_contrat_id, date_debut, date_fin, date_signature, date_resiliation, date_notification, delai_preavis_jours, duree_cycle_mois, fenetre_resiliation_jours, prestataires(id, libelle)',
                )
                .eq('site_id', siteId)
                .eq('est_archive', false)
                .order('date_debut', { ascending: true })
                .abortSignal(signal)
                .throwOnError()
              return data
            },
    }),
}
