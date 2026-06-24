import { useEffect, useRef } from 'react'

/**
 * Capte Ctrl + S (Windows/Linux) et ⌘ + S (Mac) au niveau document et appelle
 * `onSave`, en neutralisant la sauvegarde de page du navigateur. Inactif quand
 * `enabled` est faux (aucun listener attaché). `onSave` est lu via une ref interne
 * pour ne pas ré-attacher le listener à chaque rendu.
 */
export function useSaveShortcut(onSave: () => void, enabled: boolean): void {
  const onSaveRef = useRef(onSave)
  // Maj de la ref dans un effet (pas pendant le rendu) → le handler lit toujours
  // le dernier `onSave` sans ré-attacher le listener.
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      // Maintien de touche → un seul déclenchement.
      if (e.repeat) return
      // Ctrl/⌘ + S strict : on exclut Shift (Ctrl+Shift+S = « enregistrer sous »)
      // et Alt (AltGr = Ctrl+Alt sur clavier AZERTY français → faux positifs).
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 's'
      ) {
        e.preventDefault()
        onSaveRef.current()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [enabled])
}
