import { useEffect, useRef, useState } from 'react'

interface UseFileDropOptions {
  /**
   * Active l'écoute. À false (ex. lecture seule), aucun écouteur n'est posé et
   * le navigateur reprend son comportement par défaut.
   */
  enabled?: boolean
  /** Appelé avec TOUS les fichiers déposés n'importe où sur la fenêtre. */
  onFiles: (files: File[]) => void
}

/**
 * Glisser-déposer de fichier sur TOUTE la fenêtre (pas de zone cible) : tant que
 * ce hook est monté et `enabled`, déposer un fichier où que ce soit appelle
 * `onFile` avec le premier fichier. `dragging` vaut true pendant le survol
 * (compteur de profondeur pour ignorer les `dragleave` des éléments enfants) →
 * l'appelant peut afficher une surcouche visuelle. Les écouteurs sont posés sur
 * `window` : la portée est donc la durée de vie du composant hôte.
 */
export function useFileDrop({ enabled = true, onFiles }: UseFileDropOptions): {
  dragging: boolean
} {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  // Ref pour garder le dernier `onFiles` sans réabonner les écouteurs à chaque
  // rendu (mise à jour en effet : interdit de muter une ref pendant le rendu).
  const onFilesRef = useRef(onFiles)
  useEffect(() => {
    onFilesRef.current = onFiles
  }, [onFiles])

  useEffect(() => {
    if (!enabled) return

    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files')

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      setDragging(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault() // indispensable pour autoriser le drop
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : []
      if (files.length) onFilesRef.current(files)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
      depth.current = 0
    }
  }, [enabled])

  return { dragging }
}
