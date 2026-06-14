# Étape 4 — Couche données front (types, queries, schemas, mutations)

## Objectif

Câbler `categorie_id` et la copie commun → site côté front : régénérer les types, ajouter le
scope `'operation'` au schéma Zod des catégories, étendre les queries/schemas/mutations des
modèles d'opération (jointure catégorie, `categorie_id` au payload, `useCopierModeleOperation`).

## Contexte

- Pré-requis : migrations 014-017 **appliquées en prod** par l'utilisateur, puis
  `npm run gen:types` (sinon `database.types.ts` ignore `categorie_id` et la RPC).
- Référence équipement : `src/features/modeles-equipements/{queries,schemas,mutations}.ts`
  (categorie_id dans le schema Zod, `useCopierModeleEquipement`).
- La feature `categories` est générique : seul l'enum Zod de scope manque `'operation'`.

## Fichier(s) impacté(s)

- `src/lib/database.types.ts` — **régénéré** (`npm run gen:types`)
- `src/features/categories/schemas.ts` — scope `'operation'`
- `src/features/modeles-operations/queries.ts`
- `src/features/modeles-operations/schemas.ts`
- `src/features/modeles-operations/mutations.ts`

## Travail à réaliser

### 1. Régénérer les types

```bash
npm run gen:types
```

Vérifier : `Enums.categorie_scope` inclut `"operation"` ; `modeles_operations.Row/Insert/Update`
portent `categorie_id` + la relation FK `modeles_operations_categorie_id_fkey` ; la fonction
`copier_modele_operation` apparaît dans `Functions`.

### 2. `categories/schemas.ts` — scope `'operation'`

```ts
export const CATEGORIE_SCOPES = [
  { value: 'equipement', label: 'Équipement' },
  { value: 'operation', label: 'Opération' },   // ajouté
  { value: 'gamme', label: 'Gamme' },
  { value: 'mixte', label: 'Mixte' },
] as const

// + 'operation' dans l'enum Zod
scope: z.enum(['equipement', 'gamme', 'mixte', 'operation']),
```

### 3. `modeles-operations/queries.ts` — jointure catégorie

- `pool()` : `select('*')` → `select('*, categories(id, nom)')`.
- `list()` : idem si encore consommée.
- `poolImport()` : ajouter `categorie_id` (et la catégorie si utile) au `select`.
- Adapter le type `ModeleOperation` si besoin pour exposer la catégorie jointe (suivre la
  forme retenue côté équipement).

### 4. `modeles-operations/schemas.ts` — `categorie_id`

```ts
export const modeleOperationSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  description: z.string().trim().max(2000),
  categorie_id: z.string().min(1, 'La catégorie est obligatoire'),  // ajouté
  portee: z.enum(['entreprise', 'site']),
})
// emptyModeleOperation : + categorie_id: ''
```

### 5. `modeles-operations/mutations.ts` — payload + RPC copie

- `modelePayload` : ajouter `categorie_id: v.categorie_id`.
- Nouvelle mutation `useCopierModeleOperation` (calque `useCopierModeleEquipement`) :

```ts
export function useCopierModeleOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sourceModeleId, siteCible }: { sourceModeleId: string; siteCible: string }) => {
      const { data } = await supabase
        .rpc('copier_modele_operation', { p_source_modele_id: sourceModeleId, p_site_cible: siteCible })
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: modelesOperationsQueries.all() }),
  })
}
```

- Conserver `useDetacherEtSupprimerModeleOperation` inchangée.

## Ordre d'exécution

1. `npm run gen:types` (après migrations en prod).
2. `categories/schemas.ts`.
3. `queries.ts` → `schemas.ts` → `mutations.ts` des opérations.

## Critère de validation

- `npm run typecheck` vert (les nouveaux champs/RPC sont reconnus).
- Le scope `'operation'` apparaît dans les options de `CategoryFormDialog`.
- Aucune régression de typage sur les consommateurs existants de `modelesOperationsQueries`
  (`features/gammes` import dans une gamme, `poolImport`).
