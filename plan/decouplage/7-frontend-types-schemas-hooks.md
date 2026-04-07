# Étape 7 — Frontend : Types, Schemas, Hooks

## Objectif
Mettre à jour les types TypeScript, schemas Zod, et hooks TanStack Query pour refléter le nouveau schéma.

## Fichiers impactés
- `src/lib/types/gammes.ts`
- `src/lib/schemas/gammes.ts`
- `src/hooks/use-gammes.ts`
- `src/hooks/use-equipements.ts`

## Travail à réaliser

### 1. Types (`src/lib/types/gammes.ts`)

**Modifier `Gamme` :**
- `id_famille: number` → `id_famille_gamme: number`
- Supprimer `id_equipement: number | null`

**Modifier `GammeListItem` :**
- `nom_famille: string` — inchangé

**Ajouter :**
```typescript
export interface DomaineGamme {
  id_domaine_gamme: number;
  nom_domaine: string;
  description: string | null;
  id_image: number | null;
}

export interface FamilleGamme {
  id_famille_gamme: number;
  nom_famille: string;
  description: string | null;
  id_domaine_gamme: number;
  id_image: number | null;
}

export interface GammeEquipementLink {
  id_gamme_equipement: number;
  id_gamme: number;
  id_equipement: number;
  date_liaison: string | null;
}
```

### 2. Schemas (`src/lib/schemas/gammes.ts`)

**Modifier `gammeSchema` :**
- `id_famille` → `id_famille_gamme`
- Supprimer `id_equipement`

**Ajouter :**
```typescript
export const domaineGammeSchema = z.object({
  nom_domaine: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
});

export const familleGammeSchema = z.object({
  nom_famille: z.string().trim().min(1, "Le nom est requis"),
  description: optionalText,
  id_domaine_gamme: z.coerce.number().int().positive("Le domaine est requis"),
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
});
```

### 3. Hooks (`src/hooks/use-gammes.ts`)

**Modifier les query keys :**
- `list: (idFamille?)` → `list: (idFamilleGamme?)`
- Ajouter clés pour domaines/familles/equipements gammes

**Modifier `useGammes` :**
- Paramètre `idFamille` → `idFamilleGamme`
- Commande invoke : vérifier le nom du paramètre envoyé

**Ajouter ~15 nouveaux hooks :**
- CRUD Domaines gammes (5 hooks)
- CRUD Familles gammes (5 hooks)
- Liaison équipements (4 hooks) : `useGammeEquipements`, `useLinkGammeEquipement`, `useUnlinkGammeEquipement`, `useEquipementGammes`

**Pattern à suivre :** copier la structure des hooks domaines/familles existants dans `use-equipements.ts` et adapter les noms de commandes.

### 4. Hooks (`src/hooks/use-equipements.ts`)

**Modifications mineures :**
- `useOtByEquipement` : inchangé (le backend a changé, pas le frontend)
- Ajouter `useEquipementGammes` ici ou dans `use-gammes.ts` (au choix, mais garder la cohérence)

## Critère de validation
- `npx tsc --noEmit` passe (erreurs attendues dans les pages → étape 8)
- Les types reflètent exactement les structs Rust
- Les noms de commandes invoke matchent les noms Tauri

## Contrôle /borg
Lancer un /borg pour vérifier :
- Cohérence types TS ↔ structs Rust
- Cohérence noms commandes invoke ↔ noms `#[tauri::command]`
- Pas de hook appelant une commande qui n'existe plus
