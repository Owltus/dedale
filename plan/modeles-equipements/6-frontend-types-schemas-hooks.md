# Etape 6 — Frontend : Types, Schemas, Hooks

## Objectif
Creer les types TypeScript, schemas Zod et hooks TanStack Query pour les modeles d'equipement. Modifier les types existants pour la famille.

## Fichiers impactes
- `src/lib/types/equipements.ts` (modifie)
- `src/lib/schemas/equipements.ts` (modifie)
- `src/hooks/use-modeles-equipements.ts` (NOUVEAU)
- `src/hooks/use-equipements.ts` (modifie)

## Travail a realiser

### 6.1 Types (`src/lib/types/equipements.ts`)

**Ajouter :**
```typescript
export interface ModeleEquipement {
  id_modele_equipement: number;
  nom_modele: string;
  description: string | null;
  date_creation: string | null;
  date_modification: string | null;
  nb_champs: number;
  nb_familles: number;
}

export interface ChampModele {
  id_champ: number;
  id_modele_equipement: number;
  nom_champ: string;
  type_champ: "texte" | "nombre" | "date" | "booleen" | "liste";
  unite: string | null;
  est_obligatoire: number;
  ordre: number;
  valeurs_possibles: string | null;
}

export interface ValeurChampEquipement {
  id_champ: number;
  nom_champ: string;
  type_champ: "texte" | "nombre" | "date" | "booleen" | "liste";
  unite: string | null;
  est_obligatoire: number;
  ordre: number;
  valeurs_possibles: string | null;
  valeur: string | null;
}
```

**Modifier `Famille` :**
```typescript
// Ajouter
id_modele_equipement: number | null;
```

**Modifier `FamilleEquipListItem` :**
```typescript
// Ajouter
nom_modele: string | null;
```

### 6.2 Schemas (`src/lib/schemas/equipements.ts`)

**Ajouter :**
```typescript
export const modeleEquipementSchema = z.object({
  nom_modele: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
});

export const champModeleSchema = z.object({
  id_modele_equipement: z.coerce.number().int().positive(),
  nom_champ: z.string().trim().min(1, "Le nom du champ est requis"),
  type_champ: z.enum(["texte", "nombre", "date", "booleen", "liste"]),
  unite: optionalText,
  est_obligatoire: z.coerce.number().int().min(0).max(1).default(0),
  ordre: z.coerce.number().int().min(0).default(0),
  valeurs_possibles: optionalText,
});
```

**Modifier `familleSchema` :**
```typescript
// Ajouter
id_modele_equipement: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
```

### 6.3 Hooks (`src/hooks/use-modeles-equipements.ts`) — NOUVEAU

```typescript
const modeleEquipementKeys = {
  all: ["modeles-equipements"] as const,
  lists: () => [...modeleEquipementKeys.all, "list"] as const,
  detail: (id: number) => [...modeleEquipementKeys.all, "detail", id] as const,
  champs: (id: number) => [...modeleEquipementKeys.all, "champs", id] as const,
  valeurs: (idEquipement: number) => [...modeleEquipementKeys.all, "valeurs", idEquipement] as const,
};
```

**Hooks CRUD modele (5) :**
- `useModelesEquipements()` → query `get_modeles_equipements`
- `useModeleEquipement(id)` → query `get_modele_equipement`
- `useCreateModeleEquipement()` → mutation `create_modele_equipement`, invalide `lists`
- `useUpdateModeleEquipement()` → mutation `update_modele_equipement`, invalide `lists` + `detail`
- `useDeleteModeleEquipement()` → mutation `delete_modele_equipement`, invalide `lists`

**Hooks CRUD champs (5) :**
- `useChampsModele(idModele)` → query `get_champs_modele`
- `useCreateChampModele()` → mutation `create_champ_modele`, invalide `champs` + `lists` (nb_champs change)
- `useUpdateChampModele()` → mutation `update_champ_modele`, invalide `champs`
- `useDeleteChampModele()` → mutation `delete_champ_modele`, invalide `champs` + `lists`
- `useReorderChampsModele()` → mutation `reorder_champs_modele`, invalide `champs`

**Hooks valeurs (2) :**
- `useValeursEquipement(idEquipement)` → query `get_valeurs_equipement`, enabled: `!!idEquipement`
- `useSaveValeursEquipement()` → mutation `save_valeurs_equipement`, invalide `valeurs`

**Pattern a suivre :** copier la structure des hooks dans `use-modeles-operations.ts` — meme pattern `useInvokeQuery` / `useInvokeMutation`.

### 6.4 Modifier `hooks/use-equipements.ts`

**Ajouter `id_modele_equipement` aux invalidations :**
Quand une famille est creee/modifiee/supprimee, invalider aussi les query keys des modeles (car `nb_familles` change).

Ajouter dans les mutations `createFamille`, `updateFamille`, `deleteFamille` :
```typescript
queryClient.invalidateQueries({ queryKey: modeleEquipementKeys.lists() });
```

Importer `modeleEquipementKeys` depuis `use-modeles-equipements.ts`.

## Critere de validation
- `npx tsc --noEmit` passe (erreurs attendues dans les pages → etape 7)
- Les types refletent exactement les structs Rust
- Les noms de commandes invoke matchent les noms `#[tauri::command]`
- Les query keys sont uniques et coherentes

## Controle /borg
- Coherence types TS ↔ structs Rust
- Coherence noms commandes invoke ↔ noms Tauri
- Pas de hook appelant une commande qui n'existe pas
- Invalidations correctes (pas d'oubli, pas de sur-invalidation)
