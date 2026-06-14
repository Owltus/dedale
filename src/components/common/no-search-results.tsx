import { SearchX } from 'lucide-react'
import { EmptyState } from './empty-state'

interface NoSearchResultsProps {
  /**
   * Description spécifique à l'entité (ex. « Aucun équipement ne correspond à ta
   * recherche. »). Défaut : message générique.
   */
  description?: string
}

/**
 * État « aucun résultat » d'un FILTRAGE/recherche — à distinguer du `empty` de
 * `QueryState`, qui ne couvre que les données réellement vides (rien à filtrer).
 * Source UNIQUE, à rendre quand la liste filtrée est vide alors que des données
 * existent. Voir `SearchInput`.
 */
export function NoSearchResults({
  description = 'Aucun élément ne correspond à ta recherche.',
}: NoSearchResultsProps) {
  return (
    <EmptyState
      icon={SearchX}
      title="Aucun résultat"
      description={description}
    />
  )
}
