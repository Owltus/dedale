import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'

interface DocumentsFicheDropZoneProps {
  children: React.ReactNode
}

/**
 * Zone de dépôt pour DÉTACHER un document d'une tâche (091, étape 6) : le
 * déposer ici le fait revenir au niveau fiche (`tache_id` remis à NULL, cf.
 * `TachesDndContext`, `data.type === 'documents-fiche'`). Enveloppe la carte
 * "Documents" des fiches Travaux/Événements — doit vivre à l'intérieur du
 * même `TachesDndContext` que les tâches et les documents glissables.
 */
export function DocumentsFicheDropZone({
  children,
}: DocumentsFicheDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'documents-fiche',
    data: { type: 'documents-fiche' },
  })
  return (
    <div
      ref={setNodeRef}
      className={cn('rounded-lg', isOver && 'ring-2 ring-primary')}
    >
      {children}
    </div>
  )
}
