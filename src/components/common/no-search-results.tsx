import { SearchX } from 'lucide-react'
import { EmptyState } from './empty-state'
import { Button } from '@/components/ui/button'

interface NoSearchResultsProps {
  /**
   * Description spécifique à l'entité (ex. « Aucun équipement ne correspond à ta
   * recherche. »). Défaut : message générique.
   */
  description?: string
  /**
   * Proposé quand un FILTRE est actif : bouton « Afficher tout ».
   *
   * Sans lui, une liste dont tout est masqué par le filtre PAR DÉFAUT (« non
   * terminés ») se lit comme une liste vide : l'utilisateur n'a rien filtré
   * lui-même et ne sait donc pas qu'il y a quelque chose à révéler.
   */
  onReset?: () => void
}

/**
 * État « aucun résultat » d'un FILTRAGE/recherche — à distinguer du `empty` de
 * `QueryState`, qui ne couvre que les données réellement vides (rien à filtrer).
 * Source UNIQUE, à rendre quand la liste filtrée est vide alors que des données
 * existent. Voir `SearchInput`.
 */
export function NoSearchResults({
  description = 'Aucun élément ne correspond à ta recherche.',
  onReset,
}: NoSearchResultsProps) {
  return (
    <EmptyState
      icon={SearchX}
      title="Aucun résultat"
      description={description}
      action={
        onReset ? (
          <Button variant="outline" onClick={onReset}>
            Afficher tout
          </Button>
        ) : undefined
      }
    />
  )
}
