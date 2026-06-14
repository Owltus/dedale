# Étape 1 — Fondations : types, Zod et sérialisation

## Objectif

Poser le socle partagé des champs typés : les types TypeScript, le schéma Zod d'une définition de champ, et les helpers de conversion entre la structure d'édition (front) et le JSONB stocké. Aucune UI, aucun SQL.

## Contexte

Tout le reste (composants, éditeur, lecture) dépend de ce vocabulaire commun. On le centralise dans un module `lib/champs.ts` pour éviter la duplication entre modèles et équipements.

## Fichier(s) impacté(s)

- `src/lib/champs.ts` (nouveau)
- `src/features/modeles-equipements/schemas.ts` (modifié — référence le nouveau schéma)

## Travail à réaliser

### 1. Types et constantes (`lib/champs.ts`)

```ts
export const CHAMP_TYPES = [
  { value: 'texte', label: 'Texte' },
  { value: 'nombre', label: 'Nombre' },
  { value: 'date', label: 'Date' },
  { value: 'oui-non', label: 'Oui / Non' },
  { value: 'liste', label: 'Liste' },
] as const
export type ChampType = (typeof CHAMP_TYPES)[number]['value']

// Valeur JSON d'un champ selon le type (string | number | boolean | null)
export type ChampValeur = string | number | boolean | null
```

### 2. Schéma Zod d'une définition de champ

```ts
import { z } from 'zod'
export const champDefinitionSchema = z.object({
  cle: z.string().trim().min(1, 'Le nom du champ est obligatoire').max(60),
  type: z.enum(['texte', 'nombre', 'date', 'oui-non', 'liste']),
  unite: z.string().trim().max(20).optional(), // pertinent si type = nombre
  options: z.array(z.string().trim().min(1)).optional(), // requis si type = liste
  requis: z.boolean(),
  defaut: z.union([z.string(), z.number(), z.boolean(), z.null()]),
})
export type ChampDefinition = z.infer<typeof champDefinitionSchema>
```

### 3. Sérialisation JSONB <-> édition

```ts
// JSONB { champs: [...] } -> tableau éditable (tolère l'ancien format plat)
export function parseChamps(specifications: unknown): ChampDefinition[]
// tableau éditable -> objet JSONB { champs: [...] } prêt pour l'insert
export function serializeChamps(champs: ChampDefinition[]): {
  champs: ChampDefinition[]
}
```

`parseChamps` doit gérer la **compat legacy** : si `specifications` est un objet plat `{ cle: valeur }` (pas de `champs`), le convertir en champs `texte` (cf. étape 6 pour le détail).

### 4. Brancher dans `modeles-equipements/schemas.ts`

Remplacer le champ `specifications: z.array(z.object({ cle, valeur }))` par `specifications: z.array(champDefinitionSchema)` ; mettre à jour `emptyModeleEquipement.specifications = []`.

## Ordre d'exécution

1. Créer `lib/champs.ts` (types, schéma, helpers).
2. Brancher le schéma dans `modeles-equipements/schemas.ts`.

## Critère de validation

- `npm run typecheck` vert.
- (Optionnel) un test unitaire sur `parseChamps` / `serializeChamps` (round-trip + cas legacy plat).
- Aucune régression de build : `npm run build`.
