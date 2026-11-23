import { useEffect, type RefObject } from 'react'

/**
 * Clic hors du composant → on referme. Tant que `open` est vrai, un `mousedown`
 * ailleurs que dans `boxRef` appelle `setOpen(false)`. Utilisé par les combobox
 * maison (sélecteur de lieu, sélecteur de problème courant).
 */
export function useClicExterieur(
  boxRef: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: (open: boolean) => void,
): void {
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // Dépendances volontairement limitées à `open` (comportement d'origine) :
    // la ref est stable et le setter d'un useState aussi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
