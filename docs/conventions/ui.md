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

## Retours utilisateur : toasts Sonner

`import { toast } from 'sonner'` → `toast.success(...)`, `toast.error(...)`, `toast.promise(...)`. Le `<Toaster />` est monté une fois dans `main.tsx`. Toast = feedback transitoire ; une **confirmation destructive** se fait avec un Dialog, pas un toast.

## Cartes en grille

Grille auto-responsive sans breakpoints :

```tsx
<div className="grid grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))] gap-4">
  {items.map((i) => (
    <EntityCard key={i.id} className="min-w-0" {...i} />
  ))}
</div>
```

`min-w-0` sur la carte évite que le texte long casse la grille.

## À NE PAS FAIRE

- ❌ Coder une couleur en dur au lieu d'un token sémantique.
- ❌ Oublier `cn()` dans un composant acceptant `className` (les conflits Tailwind ne s'override pas).
- ❌ Trier les classes Tailwind à la main (Prettier le fait).
- ❌ Skeleton générique qui ne ressemble pas au contenu réel.
- ❌ Spinner plein écran pour chaque liste (préférer les skeletons).
