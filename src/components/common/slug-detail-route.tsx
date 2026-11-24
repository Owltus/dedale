import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { QueryKey, UseQueryOptions } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { useSlugResolved } from '@/hooks/use-slug-resolved'
import {
  partiesAlias,
  resoudreAlias,
  segAlias,
  segOfUnique,
  slugify,
} from '@/lib/slug'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { DetailSkeleton } from '@/components/common/detail-skeleton'
import { Button } from '@/components/ui/button'

interface SlugDetailRouteProps<
  TItem extends { id: string },
  TQueryKey extends QueryKey,
  TCleCourt extends QueryKey = QueryKey,
> {
  /**
   * Options de la query LISTE (cache partagé avec la page liste — pas de query
   * « getOne »). Variantes acceptées : `{ ...xxxQueries.list(), enabled }`.
   */
  options: UseQueryOptions<TItem[], Error, TItem[], TQueryKey>
  /** Slug d'URL à résoudre (param de la route). */
  slug: string
  /**
   * Identité de slug d'un élément (`{ nom, id }` passés à `segOfUnique`). Les
   * frères = TOUTE la liste (après `filterItems`), MÊME ensemble qu'à la
   * génération du lien côté liste — symétrie `segOfUnique`.
   */
  identity: (item: TItem) => { nom: string; id: string }
  /**
   * Restreint les éléments AVANT résolution, en miroir de la liste (ex.
   * Utilisateurs : soi-même exclu des deux côtés). Défaut : liste entière.
   */
  filterItems?: (items: TItem[]) => TItem[]
  /**
   * Resynchronise l'URL quand le slug a changé (renommage de l'entité ouverte) :
   * `navigate({ to: …, params: { x: freshSlug }, replace: true })`.
   */
  onSlugChange: (freshSlug: string) => void
  /** Titre du PageHeader des états chargement/erreur (ex. « Travaux »). */
  title: string
  /** Retour à la liste (chevron du PageHeader en chargement/erreur). */
  onBack: () => void
  /**
   * Écran « introuvable » (entité supprimée, hors périmètre, ou lien périmé). Il
   * doit DIRE ce qui s'est passé : le `title` constate (« Ce travaux n'existe
   * plus »), la `description` donne les causes plausibles. La sortie (chevron +
   * bouton « Retour à la liste ») est fournie par la brique via `onBack`.
   */
  notFound: {
    /** Constat affiché dans l'EmptyState (ex. « Ce travaux n'existe plus »). */
    title: string
    /** Causes plausibles (lien périmé, suppression, autre site). */
    description: string
    icon: LucideIcon
  }
  /** Rendu de la fiche une fois l'entité résolue. */
  children: (item: TItem) => ReactNode
  /**
   * Éléments DÉJÀ en cache ailleurs (ex. l'aperçu du tableau de bord). Si le
   * lien `slug~id` (`segAlias`) en désigne un, la fiche s'affiche tout de suite
   * pendant que la liste complète se charge, au lieu d'un squelette.
   */
  apercu?: readonly TItem[]
  /**
   * Lecture DIRECTE d'une fiche ouverte par un lien `slug~id court`
   * (`segAlias`) : la poignée de lignes dont l'id commence par ces 8
   * caractères, au lieu de toute la liste. Sans elle (ou pour un ancien lien
   * en slug pur), la fiche se résout par la liste, comme avant.
   */
  parIdCourt?: (
    court: string,
  ) => UseQueryOptions<TItem[], Error, TItem[], TCleCourt>
}

/**
 * Coquille des routes DÉTAIL résolues par slug (patron « liste + détail par
 * slug ») : relit la query de LISTE, résout le slug via `useSlugResolved`
 * (repli par id + resynchronisation d'URL au renommage) puis rend les 4 états —
 * chargement (squelettes), erreur (retry), introuvable (EmptyState), sinon la
 * fiche via render-prop. Les gardes rôle et site (`SiteScopedRoute`) restent
 * côté route hôte, AVANT de monter cette brique.
 */
export function SlugDetailRoute<
  TItem extends { id: string },
  TQueryKey extends QueryKey,
  TCleCourt extends QueryKey = QueryKey,
>({
  options,
  slug,
  identity,
  filterItems,
  onSlugChange,
  title,
  onBack,
  notFound,
  children,
  apercu,
  parIdCourt,
}: SlugDetailRouteProps<TItem, TQueryKey, TCleCourt>) {
  // Lien `slug~id court` + lecture directe disponible → on ne lit PAS la liste.
  const alias = parIdCourt ? partiesAlias(slug) : null
  const optionsDirectes = alias && parIdCourt ? parIdCourt(alias.court) : null
  const { data, isPending, isError, refetch } = useQuery({
    ...options,
    enabled: optionsDirectes ? false : options.enabled,
  })
  const directe = useQuery({
    ...(optionsDirectes ??
      (options as unknown as UseQueryOptions<
        TItem[],
        Error,
        TItem[],
        TCleCourt
      >)),
    enabled: optionsDirectes !== null,
  })

  // Résolution slug → entité (MÊMES frères qu'à la génération du lien, symétrie
  // segOfUnique) AVEC repli par id : renommer l'entité ouverte ne l'éjecte plus
  // vers « introuvable », l'URL se resynchronise sur le slug frais. En revanche
  // un AUTRE slug périmé rend « introuvable » (garde-fou de `useSlugResolved`).
  //
  // `segOf` referme sur la fratrie du rendu COURANT : il est donc recréé à chaque
  // rendu, par construction (une identité figée verrait une fratrie périmée et
  // casserait la symétrie). `useSlugResolved` le lit par ref et ne rejoue pas la
  // navigation pour autant — c'est son contrat, cf. sa JSDoc.
  // Mémorisés sur les données : la fratrie garde la MÊME référence d'un rendu à
  // l'autre, donc l'index des slugs (`segOfUnique`) n'est construit qu'une fois
  // par rafraîchissement, pas à chaque rendu de la fiche.
  const items = useMemo(
    () => (filterItems ? filterItems(data ?? []) : (data ?? [])),
    [data, filterItems],
  )
  const sibs = useMemo(() => items.map(identity), [items, identity])
  const item = useSlugResolved(
    items,
    slug,
    (i) => segOfUnique(identity(i), sibs),
    onSlugChange,
  )

  // Lien `slug~id` venu d'un aperçu partiel (`segAlias`) : on retrouve l'entité
  // par son id court, puis on remet l'URL sous sa forme canonique.
  const parAlias = item ? null : resoudreAlias(slug, items, identity)
  const canonique = parAlias ? segOfUnique(identity(parAlias), sibs) : null
  useEffect(() => {
    if (!optionsDirectes && canonique && canonique !== slug)
      onSlugChange(canonique)
  }, [optionsDirectes, canonique, slug, onSlugChange])

  // ── Mode direct (lien `slug~id court`) ──────────────────────────────────────
  // L'id désigne l'entité : si plusieurs ids partagent ces 8 caractères (rare),
  // le slug départage ; un seul → c'est elle, même renommée depuis (l'URL est
  // alors remise à jour vers son nouveau lien).
  const choisir = (rows: readonly TItem[]): TItem | null => {
    if (!alias) return null
    const memeId = rows.filter((r) => identity(r).id.startsWith(alias.court))
    return (
      memeId.find((r) => slugify(identity(r).nom) === alias.base) ??
      (memeId.length === 1 ? memeId[0]! : null)
    )
  }
  const itemDirect = optionsDirectes ? choisir(directe.data ?? []) : null
  const lienFrais = itemDirect ? segAlias(identity(itemDirect)) : null
  useEffect(() => {
    if (lienFrais && lienFrais !== slug) onSlugChange(lienFrais)
  }, [lienFrais, slug, onSlugChange])

  if (optionsDirectes) {
    if (directe.isPending) {
      // Déjà en cache (aperçu du tableau de bord, liste déjà lue) : tout de suite.
      const deja = choisir([...(apercu ?? []), ...(data ?? [])])
      if (deja) return <>{children(deja)}</>
      return (
        <PageContainer>
          <PageHeader title={title} onBack={onBack} />
          <DetailSkeleton />
        </PageContainer>
      )
    }
    if (directe.isError) {
      return (
        <PageContainer>
          <PageHeader title={title} onBack={onBack} />
          <ErrorState onRetry={() => void directe.refetch()} />
        </PageContainer>
      )
    }
    if (itemDirect) return <>{children(itemDirect)}</>
  } else if (isPending) {
    const deja = apercu ? resoudreAlias(slug, apercu, identity) : null
    if (deja) return <>{children(deja)}</>
    return (
      <PageContainer>
        <PageHeader title={title} onBack={onBack} />
        {/* Une FICHE se charge, pas une liste : `ListRowSkeletons` annonçait ici
            des lignes de liste pour une page qui rend des cartes. */}
        <DetailSkeleton />
      </PageContainer>
    )
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title={title} onBack={onBack} />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }

  if (!item && parAlias) return <>{children(parAlias)}</>

  if (!item) {
    return (
      <PageContainer>
        {/* Même en-tête que les états chargement/erreur : on sait où l'on est, et
            le chevron ramène toujours à la liste. Le constat, lui, est dans
            l'EmptyState — un titre de page « X introuvable » n'expliquait rien. */}
        <PageHeader title={title} onBack={onBack} />
        <EmptyState
          icon={notFound.icon}
          title={notFound.title}
          description={notFound.description}
          action={<Button onClick={onBack}>Retour à la liste</Button>}
        />
      </PageContainer>
    )
  }

  return <>{children(item)}</>
}
