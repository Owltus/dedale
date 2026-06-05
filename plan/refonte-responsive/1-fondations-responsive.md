# Étape 1 — Fondations réutilisables

## Objectif

Poser les primitives responsive partagées dont dépendent toutes les pages : un
conteneur de page, un helper de grille de cartes, et un `PageHeader` qui se replie
proprement sur mobile. Ces briques permettent de corriger 80 % des écrans en
réutilisant trois éléments au lieu de patcher chaque page à la main.

## Fichier(s) impacté(s)

- `src/components/common/page-container.tsx` (nouveau)
- `src/lib/responsive.ts` (nouveau)
- `src/components/common/page-header.tsx` (modifié)

## Travail à réaliser

1. Créer `PageContainer` : conteneur racine d'une page, padding mobile-first et
   largeur max optionnelle.

   ```tsx
   import type { ReactNode } from 'react'
   import { cn } from '@/lib/utils'

   export function PageContainer({
     children,
     className,
   }: {
     children: ReactNode
     className?: string
   }) {
     return (
       <div className={cn('px-4 py-6 sm:px-6 lg:px-8', className)}>
         {children}
       </div>
     )
   }
   ```

2. Créer `src/lib/responsive.ts` avec un helper de grille de cartes à breakpoints
   explicites, paramétrable par densité (combien de colonnes au maximum) :

   ```ts
   // Grilles de cartes : 1 colonne sur mobile, montée progressive.
   export const cardGrid = {
     // listes denses (sites, localisations, prestataires)
     compact:
       'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
     // listes standard (gammes, equipements, OT, demandes, chantiers...)
     default: 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
     // listes larges (cartes riches)
     wide: 'grid gap-4 grid-cols-1 lg:grid-cols-2',
   } as const
   ```

3. Rendre `PageHeader` responsive : passer le conteneur titre/action en colonne
   sur mobile, en ligne à partir de `sm`, pour que le bouton d'action ne soit
   plus compressé contre un titre long.

   ```tsx
   // avant : flex items-start justify-between gap-4
   // après :
   <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
   ```

   Conserver l'API existante du composant (props `title`, `description`,
   `action`) : seuls les classes changent.

## Critère de validation

- `npx tsc -b` passe.
- `npx eslint .` passe (classes non triées à la main ; lancer `npm run format`).
- `PageContainer` et `cardGrid` sont importables via l'alias `@/`.
- Sur un écran < 640px, le `PageHeader` empile titre puis action ; à partir de
  `sm`, ils sont sur la même ligne.
