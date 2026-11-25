import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, DoorOpen } from 'lucide-react'
import { localisationsQueries } from '../queries'
import { correspondRecherche } from '@/lib/recherche'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckRow } from '@/components/common/checklist-dialog'
import { CheckboxList } from '@/components/common/checkbox-list'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import {
  FILTRE_TOUS,
  ListFilterBar,
  matchTypeFilter,
  typeFilterOptions,
} from '@/components/common/list-filter-bar'

interface SelecteurLieuxProps {
  siteId: string
  /** Ids des lieux cochés. */
  value: readonly string[]
  onChange: (ids: string[]) => void
  className?: string
}

/** Lieu affichable : son id, son nom et le libellé de son type. */
interface LieuVisible {
  id: string
  nom: string
  type: string | null
}

/** État d'une case de groupe : tout, rien ou une partie de ses lieux cochés. */
function etatGroupe(
  ids: readonly string[],
  coches: ReadonlySet<string>,
): boolean | 'indeterminate' {
  const n = ids.filter((id) => coches.has(id)).length
  if (n === 0) return false
  return n === ids.length ? true : 'indeterminate'
}

function nbLieux(n: number): string {
  return `${String(n)} lieu${n > 1 ? 'x' : ''}`
}

/**
 * Sélection MULTIPLE des lieux d'un site, en arbre bâtiment → niveau → lieu à
 * cases. Cocher un bâtiment ou un niveau coche tous ses lieux AFFICHÉS : avec
 * le filtre « Chambre », cocher un niveau coche ses chambres seulement. La
 * recherche (nom du lieu, du niveau, du bâtiment ou du type) déplie l'arbre ;
 * sinon chaque groupe se déplie à la demande (bouton au clavier,
 * `aria-expanded`). Les lieux cochés masqués par un filtre restent cochés : le
 * compteur dit le total. Lecture : `localisationsQueries.arbre` (paginée).
 *
 * Brique réutilisable (déploiement en masse ; d'autres gestes « sur plusieurs
 * lieux » pourront s'y brancher) : elle ne connaît que des ids de lieux.
 */
export function SelecteurLieux({
  siteId,
  value,
  onChange,
  className,
}: SelecteurLieuxProps) {
  const arbreQuery = useQuery(localisationsQueries.arbre(siteId))
  const { data: types = [] } = useQuery(localisationsQueries.typesLocaux())
  const [recherche, setRecherche] = useState('')
  const [filtreType, setFiltreType] = useState(FILTRE_TOUS)
  // Groupes dépliés : au départ, ceux des lieux déjà cochés (lieu pré-coché
  // depuis sa fiche) — calculé une fois, quand l'arbre est là.
  const [ouverts, setOuverts] = useState<ReadonlySet<string> | null>(null)
  const arbre = arbreQuery.data
  if (arbre && ouverts === null) {
    const initiaux = new Set<string>()
    for (const l of arbre.locaux) {
      if (!value.includes(l.id)) continue
      initiaux.add(l.niveau_id)
      const n = arbre.niveaux.find((x) => x.id === l.niveau_id)
      if (n) initiaux.add(n.batiment_id)
    }
    setOuverts(initiaux)
  }

  const coches = new Set(value)
  const libelleType = new Map(types.map((t) => [t.id, t.libelle]))

  if (arbreQuery.isPending)
    return (
      <div className={cn('space-y-2', className)}>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (arbreQuery.isError)
    return (
      <ErrorState
        message="Impossible de charger les lieux du site."
        onRetry={() => void arbreQuery.refetch()}
        className={className}
      />
    )
  const { batiments, niveaux, locaux } = arbreQuery.data
  if (locaux.length === 0)
    return (
      <EmptyState
        icon={DoorOpen}
        title="Aucun lieu"
        description="Ce site n’a encore aucun lieu : crée-les dans Localisations."
        className={className}
      />
    )

  // Arbre FILTRÉ : seuls les groupes qui gardent au moins un lieu affiché.
  const enRecherche = recherche.trim() !== ''
  const groupes = batiments
    .map((b) => ({
      batiment: b,
      niveaux: niveaux
        .filter((n) => n.batiment_id === b.id)
        .map((n) => ({
          niveau: n,
          lieux: locaux
            .filter((l) => l.niveau_id === n.id)
            .filter((l) =>
              filtreType === FILTRE_TOUS
                ? true
                : l.type_local_id !== null &&
                  matchTypeFilter(l.type_local_id, filtreType),
            )
            .map(
              (l): LieuVisible => ({
                id: l.id,
                nom: l.nom,
                type:
                  l.type_local_id === null
                    ? null
                    : (libelleType.get(l.type_local_id) ?? null),
              }),
            )
            .filter((l) =>
              correspondRecherche(recherche, l.nom, l.type, n.nom, b.nom),
            ),
        }))
        .filter((g) => g.lieux.length > 0),
    }))
    .filter((g) => g.niveaux.length > 0)
  const visibles = groupes.flatMap((g) =>
    g.niveaux.flatMap((n) => n.lieux.map((l) => l.id)),
  )

  const estOuvert = (id: string) => enRecherche || (ouverts?.has(id) ?? false)
  const basculerOuvert = (id: string) => {
    const suivant = new Set(ouverts)
    if (suivant.has(id)) suivant.delete(id)
    else suivant.add(id)
    setOuverts(suivant)
  }
  /** Coche tout le groupe, ou le décoche s'il l'était déjà entièrement. */
  const basculerGroupe = (ids: readonly string[]) => {
    const suivant = new Set(coches)
    if (ids.every((id) => suivant.has(id)))
      for (const id of ids) suivant.delete(id)
    else for (const id of ids) suivant.add(id)
    onChange([...suivant])
  }
  const basculerLieu = (id: string) => basculerGroupe([id])

  const deplier = (id: string, nom: string) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      aria-expanded={estOuvert(id)}
      aria-label={`${estOuvert(id) ? 'Replier' : 'Déplier'} ${nom}`}
      disabled={enRecherche}
      onClick={() => basculerOuvert(id)}
    >
      <ChevronRight
        className={cn('transition-transform', estOuvert(id) && 'rotate-90')}
      />
    </Button>
  )

  return (
    <div className={cn('space-y-3', className)}>
      <ListFilterBar
        search={recherche}
        onSearchChange={setRecherche}
        searchPlaceholder="Rechercher un lieu, un niveau, un bâtiment…"
        filterValue={filtreType}
        onFilterChange={setFiltreType}
        options={typeFilterOptions(
          types.map((t) => ({ id: t.id, nom: t.libelle })),
          'Tous les types de lieu',
        )}
        filterLabel="Filtrer par type de lieu"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {coches.size === 0
            ? 'Aucun lieu sélectionné'
            : `${nbLieux(coches.size)} sélectionné${coches.size > 1 ? 's' : ''}`}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={visibles.length === 0}
            onClick={() => onChange([...new Set([...coches, ...visibles])])}
          >
            Cocher les {nbLieux(visibles.length)} affichés
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={coches.size === 0}
            onClick={() => onChange([])}
          >
            Tout décocher
          </Button>
        </div>
      </div>
      {groupes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucun lieu ne correspond à ces critères.
        </p>
      ) : (
        <CheckboxList bordered className="max-h-[45vh] p-1" aria-label="Lieux">
          {groupes.map(({ batiment, niveaux: nivs }) => {
            const idsBatiment = nivs.flatMap((n) => n.lieux.map((l) => l.id))
            return (
              <div key={batiment.id} role="group" aria-label={batiment.nom}>
                <div className="flex items-center">
                  {deplier(batiment.id, batiment.nom)}
                  <CheckRow
                    className="flex-1"
                    titre={batiment.nom}
                    sousTitre={nbLieux(idsBatiment.length)}
                    checked={etatGroupe(idsBatiment, coches)}
                    onToggle={() => basculerGroupe(idsBatiment)}
                  />
                </div>
                {estOuvert(batiment.id) &&
                  nivs.map(({ niveau, lieux }) => {
                    const idsNiveau = lieux.map((l) => l.id)
                    return (
                      <div
                        key={niveau.id}
                        role="group"
                        aria-label={`${batiment.nom} — ${niveau.nom}`}
                        className="pl-6"
                      >
                        <div className="flex items-center">
                          {deplier(niveau.id, niveau.nom)}
                          <CheckRow
                            className="flex-1"
                            titre={niveau.nom}
                            sousTitre={nbLieux(idsNiveau.length)}
                            checked={etatGroupe(idsNiveau, coches)}
                            onToggle={() => basculerGroupe(idsNiveau)}
                          />
                        </div>
                        {estOuvert(niveau.id) &&
                          lieux.map((l) => (
                            <CheckRow
                              key={l.id}
                              className="pl-11"
                              titre={l.nom}
                              sousTitre={l.type ?? undefined}
                              checked={coches.has(l.id)}
                              onToggle={() => basculerLieu(l.id)}
                            />
                          ))}
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </CheckboxList>
      )}
    </div>
  )
}
