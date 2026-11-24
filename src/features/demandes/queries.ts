import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { toutesLesLignes } from '@/lib/pagination'
import { supabase } from '@/lib/supabase'
import { bornesUuid } from '@/lib/slug'
import {
  FILTRE_NON_TERMINES,
  FILTRE_TOUS,
} from '@/components/common/list-filter-bar'
import { modelesDiQueries as modelesDiCatalogueQueries } from '@/features/modeles-di/queries'

/** Taille d'une page de la liste des demandes (chargée au fil du défilement). */
export const DEMANDES_PAR_PAGE = 50

/** Filtre de statut de la liste → paramètre `p_statut` de `demandes_du_site` (171). */
function statutPourBase(filtre: string): string {
  if (filtre === FILTRE_NON_TERMINES) return 'non_terminees'
  if (filtre === FILTRE_TOUS) return 'toutes'
  return filtre
}

/**
 * Lieu(x) de quelques demandes (di_id → « Chambre 214, Chambre 109 ») : noms
 * dans l'ordre des locaux, sans doublon ni nom vide — même texte que la
 * fonction 168. Pour une page de liste ou un aperçu, jamais tout le site.
 */
export async function lieuxDesDemandes(
  ids: readonly string[],
  signal: AbortSignal,
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase
    .from('di_localisations')
    .select('di_id, local_id, locaux(nom)')
    .in('di_id', [...ids])
    .order('di_id')
    .order('local_id')
    .abortSignal(signal)
    .throwOnError()
  const noms = new Map<string, string[]>()
  for (const r of data) {
    const nom = r.locaux.nom
    if (!nom) continue
    const liste = noms.get(r.di_id) ?? []
    if (!liste.includes(nom)) liste.push(nom)
    noms.set(r.di_id, liste)
  }
  return new Map([...noms].map(([id, l]) => [id, l.join(', ')]))
}

export const demandesQueries = {
  all: () => ['demandes_intervention'] as const,

  /**
   * Liste PAGINÉE de la page Demandes : filtre de statut et recherche (constat
   * OU nom du lieu) faits par la base (`demandes_du_site`, 171), 50 demandes à
   * la fois, chargées au fil du défilement. Chaque page porte les lieux de SES
   * demandes. Par défaut (« non terminées »), une seule petite page suffit.
   */
  page: (siteId: string, filtre: string, recherche: string) =>
    infiniteQueryOptions({
      queryKey: [
        ...demandesQueries.all(),
        'page',
        siteId,
        filtre,
        recherche,
      ] as const,
      initialPageParam: 0,
      queryFn: async ({ pageParam, signal }) => {
        const { data } = await supabase
          .rpc('demandes_du_site', {
            p_site_id: siteId,
            p_statut: statutPourBase(filtre),
            p_recherche: recherche,
            p_limite: DEMANDES_PAR_PAGE,
            p_decalage: pageParam,
          })
          .abortSignal(signal)
          .throwOnError()
        const lieux = await lieuxDesDemandes(
          data.map((d) => d.id),
          signal,
        )
        return { demandes: data, lieux, decalage: pageParam }
      },
      getNextPageParam: (derniere) =>
        derniere.demandes.length < DEMANDES_PAR_PAGE
          ? undefined
          : derniere.decalage + DEMANDES_PAR_PAGE,
      staleTime: 5 * 60_000,
    }),

  /** Le site a-t-il au moins une demande ? (écran vide d'accueil de la page) */
  existe: (siteId: string) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'existe', siteId] as const,
      queryFn: async ({ signal }) => {
        // Une seule ligne lue (un comptage exact parcourait les 4 000+ DI).
        const { data } = await supabase
          .from('demandes_intervention')
          .select('id')
          .eq('site_id', siteId)
          .limit(1)
          .abortSignal(signal)
          .throwOnError()
        return data.length > 0
      },
    }),

  /**
   * Fiche ouverte par son lien `slug~id court` : la (rare) poignée de demandes
   * dont l'id commence par ces 8 caractères — une lecture d'index, jamais la
   * liste du site. Même forme de ligne que `list`.
   */
  parIdCourt: (siteId: string, court: string) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'id-court', siteId, court] as const,
      queryFn: async ({ signal }) => {
        const [de, a] = bornesUuid(court)
        const { data } = await supabase
          .from('demandes_intervention')
          .select('*')
          .eq('site_id', siteId)
          .gte('id', de)
          .lte('id', a)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * DI du site actif (non supprimées). La RLS restreint déjà la visibilité :
   * le rôle `demandeur` ne voit que ses propres DI → aucun filtre client à ajouter.
   */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      // 5 min au lieu de 60 s : 4 000+ lignes à relire à chaque retour sur la page
      // pour rien. Le temps réel (canal `demandes_intervention`, ouvert en
      // permanence par les compteurs de la sidebar) invalide déjà la liste au
      // moindre changement, synchro Dmbook comprise.
      staleTime: 5 * 60_000,
      // Paginé : l'historique Dmbook (4 000+ DI depuis 2021) dépasse le plafond de
      // 1 000 lignes par réponse ; sans ça, seules les plus récentes s'affichaient (cf. pagination.ts).
      queryFn: ({ signal }) =>
        toutesLesLignes((debut, fin) =>
          supabase
            .from('demandes_intervention')
            // Sans la jointure `dmbook_liens` : la liste ne s'en sert pas (la fiche lit
            // `lienDmbook`), et elle doublait le temps de chaque page (0,9 s → 0,4 s).
            .select('*')
            .eq('site_id', siteId!)
            .order('date_constat', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(debut, fin)
            .abortSignal(signal)
            .throwOnError(),
        ),
    }),

  /**
   * Ticket Dmbook lié à une DI (synchro Dmbook, 164-165) : numéro et auteur tel
   * qu'écrit dans Dmbook (D21), jamais rapproché d'un compte Dédale. Null si la DI
   * n'est pas reliée à Dmbook.
   */
  lienDmbook: (diId: string) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'lien-dmbook', diId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('dmbook_liens')
          .select('numero, auteur')
          .eq('di_id', diId)
          .abortSignal(signal)
          .maybeSingle()
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
          .select(
            'equipement_id, equipements(id, specifications, categories(nom, valeur_principale, valeur_secondaire, valeur_tertiaire))',
          )
          .eq('di_id', diId)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}

/**
 * Vue « demandeur » des modèles de DI. Elle coexiste avec celle de la
 * Bibliothèque (`@/features/modeles-di/queries`) : deux objets homonymes sur la
 * MÊME table, dont les clés racines DOIVENT coïncider — sinon une écriture
 * depuis la Bibliothèque n'invaliderait plus la liste proposée à la création
 * d'une DI. La clé est donc DÉRIVÉE du module catalogue, jamais recopiée : un
 * renommage du littéral là-bas se propage ici au lieu de rompre l'invalidation
 * en silence (verrouillé par `fraicheur.test.ts`).
 */
export const modelesDiQueries = {
  all: () => modelesDiCatalogueQueries.all(),

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
