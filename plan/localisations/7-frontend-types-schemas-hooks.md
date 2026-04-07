# Étape 7 — Frontend types, schemas, hooks

## Objectif
Mettre à jour les types TS, schemas Zod, et hooks TanStack Query.

## Fichiers impactés
- `src/lib/types/localisations.ts`
- `src/lib/schemas/localisations.ts`
- `src/hooks/use-localisations.ts`
- `src/lib/types/gammes.ts` (id_localisation → id_local)
- `src/lib/types/equipements.ts` (id_localisation → id_local)
- `src/lib/schemas/gammes.ts` (id_localisation → id_local)
- `src/lib/schemas/equipements.ts` (id_localisation → id_local)

## Types (`types/localisations.ts`)

### Supprimer
- `Localisation`, `LocalisationNode`

### Créer
```typescript
export interface Batiment {
  id_batiment: number; nom: string; description: string | null;
  date_creation: string | null; date_modification: string | null;
}
export interface Niveau {
  id_niveau: number; nom: string; description: string | null; id_batiment: number;
  date_creation: string | null; date_modification: string | null;
}
export interface Local {
  id_local: number; nom: string; description: string | null; id_niveau: number;
  date_creation: string | null; date_modification: string | null;
}
export interface LocalisationTreeNode {
  id_local: number; nom_local: string; nom_niveau: string; nom_batiment: string; label: string;
}
```

## Schemas (`schemas/localisations.ts`)
```typescript
batimentSchema: { nom, description? }
niveauSchema: { nom, description?, id_batiment }
localSchema: { nom, description?, id_niveau }
```

## Hooks (`hooks/use-localisations.ts`)
- CRUD Bâtiments (5 hooks)
- CRUD Niveaux (5 hooks)
- CRUD Locaux (5 hooks)
- `useLocalisationsTree()` — pour les dropdowns (retourne `LocalisationTreeNode[]`)

## Types/schemas gammes et équipements
- `id_localisation` → `id_local` partout

## Critère de validation
- `npx tsc --noEmit` (erreurs attendues dans les pages → étape 8)
