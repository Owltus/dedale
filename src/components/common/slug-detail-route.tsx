import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { QueryKey, UseQueryOptions } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { useSlugResolved } from '@/hooks/use-slug-resolved'
import { segOfUnique } from '@/lib/slug'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { DetailSkeleton } from '@/components/common/detail-skeleton'
import { Button } from '@/components/ui/button'

interface SlugDetailRouteProps<
  TItem extends { id: string },
  TQueryKey extends QueryKey,
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
}

/**
 * Coquille des routes DÉTAIL résolues par slug (patron « liste + détail par
 * slug ») : relit la query de LISTE, résout le slug via `useSlugResolved`
 * (repli par id + resynchronisation d'URL au renommage) puis rend les 4 états —
 * chargement (squelettes), erreur (retry), introuvable (EmptyState), sinon la
 * fiche via render-prop. Les gardes rôle et site (`NoSiteSelected`) restent
 * côté route hôte, AVANT de monter cette brique.
 */
export function SlugDetailRoute<
  TItem extends { id: string },
  TQueryKey extends QueryKey,
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
}: SlugDetailRouteProps<TItem, TQueryKey>) {
  const { data, isPending, isError, refetch } = useQuery(options)

  // Résolution slug → entité (MÊMES frères qu'à la génération du lien, symétrie
  // segOfUnique) AVEC repli par id : renommer l'entité ouverte ne l'éjecte plus
  // vers « introuvable », l'URL se resynchronise sur le slug frais. En revanche
  // un AUTRE slug périmé rend « introuvable » (garde-fou de `useSlugResolved`).
  //
  // `segOf` referme sur la fratrie du rendu COURANT : il est donc recréé à chaque
  // rendu, par construction (une identité figée verrait une fratrie périmée et
  // casserait la symétrie). `useSlugResolved` le lit par ref et ne rejoue pas la
  // navigation pour autant — c'est son contrat, cf. sa JSDoc.
  const items = filterItems ? filterItems(data ?? []) : (data ?? [])
  const sibs = items.map(identity)
  const item = useSlugResolved(
    items,
    slug,
    (i) => segOfUnique(identity(i), sibs),
    onSlugChange,
  )

  if (isPending) {
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
