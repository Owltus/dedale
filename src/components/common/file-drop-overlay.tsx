import { cn } from '@/lib/utils'

interface FileDropOverlayProps {
  /** Affiche la surcouche (typiquement `dragging` de `useFileDrop`). */
  show: boolean
  className?: string
}

/**
 * Surcouche de glisser-déposer SOBRE, à poser dans un conteneur `relative` (la
 * zone de dépôt). Pendant le survol d'un fichier : un simple voile léger cerné
 * d'un fin liseré pointillé, sans texte. Purement visuelle :
 * `pointer-events-none` pour ne pas gêner le drop capté en amont (par
 * `useFileDrop` sur la fenêtre), aucune logique. Effet volontairement discret —
 * un simple indice, rien d'ostentatoire.
 */
export function FileDropOverlay({ show, className }: FileDropOverlayProps) {
  if (!show) return null
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-20 animate-in rounded-lg border border-dashed border-primary/40 bg-primary/5 duration-100 fade-in-0',
        className,
      )}
    />
  )
}
