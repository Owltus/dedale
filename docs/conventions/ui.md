# Conventions — UI & style

> Lue quand on touche au style, aux couleurs, au thème ou qu'on monte un écran.

## Direction visuelle

**Minimaliste, moderne, maîtrisé, classique.** Pas d'excentricité : palette neutre (gris), une seule couleur d'accent sobre, coins arrondis, ombres légères. Lisibilité et densité raisonnable avant tout (outil de travail GMAO).

## Couleurs = tokens sémantiques (jamais en dur)

Toutes les couleurs vivent dans `src/index.css` (tokens `:root` clair + `.dark` sombre, mappés via `@theme inline`). Dans les composants, on utilise **uniquement** les utilitaires sémantiques :

- `bg-background` / `text-foreground` — fond et texte de base
- `bg-card` / `text-card-foreground` — surfaces (cartes, popovers)
- `bg-primary` / `text-primary-foreground` — action principale
- `bg-secondary`, `bg-muted` / `text-muted-foreground` — secondaire, atténué
- `bg-destructive` — danger / suppression
- `border`, `border-input`, `ring` — bordures et focus

**Jamais** `bg-blue-600` ni `text-[#1a1a1a]`. Changer la marque/palette = éditer `index.css` uniquement.

## Mode sombre

Clair + sombre gérés via la classe `.dark` sur `<html>`, pilotée par `ThemeProvider` (`src/components/theme.tsx`, persistance `localStorage`, défaut = préférence système). Bascule : `<ModeToggle />`. Comme on n'utilise que des tokens sémantiques, le sombre est automatique.

## Composants

- Génériques : `src/components/ui/*` (shadcn/ui — Button, Card, Dialog, Input, Label, Badge, Skeleton, Toaster). On les possède ; on les modifie avec parcimonie.
- Variantes typées via **CVA** (`Button variant/size`, `Badge variant`). Toujours finir par `cn(...{ className })` pour permettre l'override par l'appelant.
- Icônes : **lucide-react**.

## Règle des 4 états (sur CHAQUE liste/écran de données)

```tsx
if (isPending) return <Skeleton .../>      // squelette calqué sur le vrai contenu
if (error)     return <ErrorState onRetry={refetch} />
if (!data.length) return <EmptyState icon={Inbox} title="Aucun élément" action={<Button>Créer</Button>} />
return <Liste items={data} />
```

`EmptyState` et `ErrorState` sont dans `src/components/common/`.

> Cette règle est factorisée dans `common/query-state.tsx` (`QueryState` + `CardSkeletons`) : l'utiliser **par défaut** (cf. [composants.md](./composants.md)). Le pattern manuel ci-dessus ne subsiste que pour les écrans atypiques (registre table, planning, dashboard).

## Retours utilisateur : toasts Sonner

`import { toast } from 'sonner'` → `toast.success(...)`, `toast.error(...)`, `toast.promise(...)`. Le `<Toaster />` est monté une fois dans `main.tsx`. Toast = feedback transitoire ; une **confirmation destructive** se fait avec un Dialog, pas un toast.

## Cartes en grille

On utilise le helper `cardGrid` (`src/lib/responsive.ts`) plutôt qu'une grille ad hoc :

```tsx
import { cardGrid } from '@/lib/responsive'
;<div className={cardGrid.default}>
  {items.map((i) => (
    <EntityCard key={i.id} className="min-w-0" {...i} />
  ))}
</div>
```

Densités : `cardGrid.compact` (sites, localisations, prestataires) et `cardGrid.default` (cas général). `min-w-0` sur la carte évite que le texte long casse la grille.

## Responsive design

**Mobile-first obligatoire.** On part du mobile, puis on agrandit avec des breakpoints (`sm:`, `md:`, `lg:`…). Breakpoints (défauts Tailwind) : `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536.

- **Racine de page** : toujours `<PageContainer>` (`src/components/common/page-container.tsx`), jamais un `p-6` nu. Il gère le padding mobile-first (`px-4 sm:px-6 lg:px-8`).
- **Grilles de cartes** : via `cardGrid` (cf. ci-dessus), jamais une grille fixe `grid-cols-2/3` sans breakpoint.
- **En-tête** : `PageHeader` se replie déjà en colonne sous `sm` ; pour un en-tête maison, faire pareil (`flex flex-col gap-4 sm:flex-row`).
- **Navigation** : la sidebar est fixe à partir de `lg` et devient un drawer (`Sheet`) sous `lg`, ouvert par la barre supérieure mobile. Rien à faire dans les pages.
- **Écrans denses** (tableaux, planning) : envelopper dans `overflow-x-auto` et réduire les largeurs sticky sur mobile (`min-w-32 sm:min-w-48`).
- **Boutons d'action multiples** : empiler sur mobile (`flex flex-col gap-2 sm:flex-row`).

```tsx
import { PageContainer } from '@/components/common/page-container'
import { cardGrid } from '@/lib/responsive'
;<PageContainer>
  <PageHeader title="Équipements" action={<Button>Nouvel équipement</Button>} />
  <div className={cardGrid.default}>{/* … */}</div>
</PageContainer>
```

## À NE PAS FAIRE

- ❌ Coder une couleur en dur au lieu d'un token sémantique.
- ❌ Oublier `cn()` dans un composant acceptant `className` (les conflits Tailwind ne s'override pas).
- ❌ Trier les classes Tailwind à la main (Prettier le fait).
- ❌ Ouvrir une page sur un `<div className="p-6">` nu au lieu de `<PageContainer>`.
- ❌ Une grille de cartes fixe (`grid-cols-3`) sans breakpoints : utiliser `cardGrid`.
- ❌ Skeleton générique qui ne ressemble pas au contenu réel.
- ❌ Spinner plein écran pour chaque liste (préférer les skeletons).
