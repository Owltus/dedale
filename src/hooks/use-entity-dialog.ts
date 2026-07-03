import { useState } from 'react'

/**
 * État d'un dialog de formulaire création/édition, générique sur l'entité :
 * factorise le duo `useState<{ open, entity }>` + ouverture création (`entity`
 * null) / édition (`entity` fournie) recopié sur chaque page liste.
 *
 * - `onOpenChange` ne touche QUE `open` : l'entité reste en place pendant
 *   l'animation de fermeture (pas de flash du titre « Nouveau X »).
 * - `dialogKey` est la clé de REMONTAGE anti-état-rassis (id de l'entité ou
 *   `'new'`, combinée à `open`) : à poser en `key` sur le dialog pour que le
 *   formulaire reparte des valeurs initiales à chaque ouverture (cf.
 *   docs/conventions/donnees.md — pas de `useEffect` de reset).
 *
 * Usage :
 * ```tsx
 * const dialog = useEntityDialog<Site>()
 * <Button onClick={dialog.openCreate}>Nouveau site</Button>
 * // dans la liste : onSelect: () => dialog.openEdit(site)
 * <SiteFormDialog
 *   key={dialog.dialogKey}
 *   open={dialog.open}
 *   onOpenChange={dialog.onOpenChange}
 *   site={dialog.entity}
 * />
 * ```
 */
export function useEntityDialog<T extends { id: string | number }>(): {
  /** Vrai si le dialog est ouvert. */
  open: boolean
  /** Entité en cours d'édition (null = création). */
  entity: T | null
  /** Vrai en mode édition (une entité est chargée). */
  isEdit: boolean
  /** Ouvre le dialog en mode création (entité remise à null). */
  openCreate: () => void
  /** Ouvre le dialog en édition de cette entité. */
  openEdit: (entity: T) => void
  /** À brancher tel quel sur le dialog (ne modifie que `open`). */
  onOpenChange: (open: boolean) => void
  /** Ferme le dialog (raccourci de `onOpenChange(false)`). */
  close: () => void
  /** Clé de remontage à poser en `key` sur le dialog. */
  dialogKey: string
} {
  const [state, setState] = useState<{ open: boolean; entity: T | null }>({
    open: false,
    entity: null,
  })

  return {
    open: state.open,
    entity: state.entity,
    isEdit: state.entity !== null,
    openCreate: () => setState({ open: true, entity: null }),
    openEdit: (entity) => setState({ open: true, entity }),
    onOpenChange: (open) => setState((s) => ({ ...s, open })),
    close: () => setState((s) => ({ ...s, open: false })),
    dialogKey: `${String(state.entity?.id ?? 'new')}-${String(state.open)}`,
  }
}
