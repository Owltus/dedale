import { queryOptions } from '@tanstack/react-query'
import { toutesLesLignes } from '@/lib/pagination'
import { supabase } from '@/lib/supabase'
import { modelesDiQueries as modelesDiCatalogueQueries } from '@/features/modeles-di/queries'

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
            // Auteur Dmbook tel qu'écrit et numéro du ticket, si la DI vient de Dmbook (D16, D21).
            .select('*, dmbook_liens(numero, auteur)')
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
   * Lieu(x) de chaque DI du site (di_id → « Chambre 214, Chambre 109 »), pour
   * titrer les cartes SANS une requête par carte. Converti en Map par
   * `lieuxParDi` (`select`).
   */
  locauxParDi: (siteId: string | null) =>
    queryOptions({
      queryKey: [...demandesQueries.all(), 'locaux-par-di', siteId] as const,
      enabled: siteId !== null,
      // Même fraîcheur que la liste (cf. `list`).
      staleTime: 5 * 60_000,
      // UN appel (168) : la base vérifie l'accès au site une fois et renvoie
      // { di_id: "Lieu 1, Lieu 2" }. L'ancienne lecture de `di_localisations`
      // par pages réévaluait la RLS de trois tables ligne par ligne : ~4 s.
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .rpc('lieux_di_du_site', { p_site_id: siteId! })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
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
