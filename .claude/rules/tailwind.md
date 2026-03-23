---
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
---

# Règles Tailwind CSS

## Classes

- Utiliser `cn()` (tailwind-merge + clsx) pour merger les classes — ne jamais concaténer des strings
- Ordre des classes : layout → box model → typographie → visuel → états
  ```
  flex items-center gap-4 w-full px-4 py-2 text-sm font-medium text-gray-900 bg-white border rounded-lg shadow-sm hover:bg-gray-50
  ```
- Utiliser `gap-*` pour l'espacement entre enfants flex/grid — pas `space-x-*`
- Utiliser `size-*` quand width = height (ex: `size-8` au lieu de `w-8 h-8`)

## Design

- Mobile-first : styles de base pour mobile, puis `sm:`, `md:`, `lg:` pour les écrans plus grands
- Ordre des variantes : responsive → dark → état (`md:dark:hover:text-white`)
- Utiliser les CSS variables du thème shadcn/ui (`--primary`, `--background`, etc.) — pas de couleurs hardcodées
- Utiliser `ring-*` pour les indicateurs de focus (pas `border` qui affecte le layout)
- Utiliser `truncate` ou `line-clamp-*` pour le débordement de texte

## Bonnes pratiques

- Ne pas mélanger les utilitaires Tailwind avec `style={{}}` sauf pour les valeurs dynamiques runtime
- Ne pas abuser de `@apply` — préférer l'extraction en composants React
- Utiliser des noms de groupes sémantiques : `group/sidebar`, `peer/email`
- Les composants partagés acceptent `className` en prop et le mergent en dernier position
- Utiliser les couleurs sémantiques du design system, pas les couleurs brutes de Tailwind :
  - `text-primary` au lieu de `text-blue-600`
  - `bg-destructive` au lieu de `bg-red-500`
  - `text-muted-foreground` au lieu de `text-gray-500`
