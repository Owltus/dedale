import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

interface TachesDndContextProps {
  /** Ids des tâches, dans leur ordre d'affichage actuel. */
  tacheIds: string[]
  /** Nouvel ordre des ids, à appliquer (optimiste) puis à persister. */
  onReorder: (nextIds: string[]) => void
  /** Un document est déposé SUR une tâche → le rattache à cette tâche (091, étape 6). */
  onDropDocumentOnTache?: (documentId: string, tacheId: string) => void
  /** Un document est déposé sur la carte "Documents" → le détache, retour fiche (091, étape 6). */
  onDropDocumentOnFiche?: (documentId: string) => void
  children: React.ReactNode
}

/**
 * Contexte de glisser-déposer partagé de la liste de tâches. Gère DEUX
 * interactions distinctes, différenciées par `data.type`, sans jamais se
 * mélanger :
 * - `'tache'` déposée sur `'tache'` → réordonnancement (`onReorder`).
 * - `'document'` déposé sur `'tache'` ou `'documents-fiche'` → rattache/
 *   détache ce document (091, étape 6).
 */
export function TachesDndContext({
  tacheIds,
  onReorder,
  onDropDocumentOnTache,
  onDropDocumentOnFiche,
  children,
}: TachesDndContextProps) {
  // `distance: 4` : un simple clic (sans déplacement) ne déclenche pas de
  // glisser — sans quoi le clic sur la poignée serait toujours interprété
  // comme un début de drag, même immobile.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const activeType = active.data.current?.type as string | undefined
    const overType = over.data.current?.type as string | undefined

    if (activeType === 'tache') {
      if (overType !== 'tache' || active.id === over.id) return
      const oldIndex = tacheIds.indexOf(String(active.id))
      const newIndex = tacheIds.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return
      onReorder(arrayMove(tacheIds, oldIndex, newIndex))
      return
    }

    if (activeType === 'document') {
      const documentId = active.data.current?.documentId as string
      if (overType === 'tache') {
        const tacheId = over.data.current?.tacheId as string
        onDropDocumentOnTache?.(documentId, tacheId)
      } else if (overType === 'documents-fiche') {
        onDropDocumentOnFiche?.(documentId)
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={tacheIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}
