/**
 * Navigation clavier du pattern WAI-ARIA Tabs, partagée par `<SubTabs>` et
 * `<Tabs>` : flèches gauche/droite (en boucle) + Début/Fin, roving focus.
 */

/** Index de l'onglet visé par la touche, ou `null` si la touche n'est pas gérée. */
export function indexSuivant(
  key: string,
  courant: number,
  n: number,
): number | null {
  if (key === 'ArrowRight') return (courant + 1) % n
  if (key === 'ArrowLeft') return (courant - 1 + n) % n
  if (key === 'Home') return 0
  if (key === 'End') return n - 1
  return null
}

/** Donne le focus au i-ème `[role="tab"]` de la barre. */
export function focusOnglet(liste: HTMLElement | null, i: number) {
  liste?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[i]?.focus()
}
