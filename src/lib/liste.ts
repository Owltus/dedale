const LISTE_FR = new Intl.ListFormat('fr', { type: 'conjunction' })

/** Énumération française : `[]` → « », `[a]` → « a », `[a, b, c]` → « a, b et c ». */
export const listeFr = (parts: string[]): string => LISTE_FR.format(parts)
