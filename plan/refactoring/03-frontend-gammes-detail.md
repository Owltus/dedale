# Phase 3 — Refactorer gammes/[id].tsx

## Contexte

Le fichier `src/pages/gammes/[id].tsx` fait **708 lignes** — presque 5× la limite de 150 lignes.

Problèmes identifiés :
- **16 useState** dont 6 pour un formulaire d'édition (violation règle React Hook Form)
- **5 Dialogs** imbriquées dans le même composant
- **8+ mutations** TanStack Query
- Validations manuelles au lieu de Zod (`onSubmitOp()` lignes 134-152)
- Dialog brut au lieu de `CrudDialog` (lignes 519-567)
- Fonctions de filtre dupliquées (lignes 39-49)

## Architecture cible

```
src/pages/gammes/
├── [id].tsx              ← ~150 lignes (orchestrateur + Tabs)
├── GammeEditDialog.tsx   ← Dialog édition gamme (React Hook Form + Zod)
├── OperationSection.tsx  ← Tab opérations (CardList + CRUD)
├── OperationDialog.tsx   ← Dialog création/édition opération (RHF + Zod)
└── EquipementLinkDialog.tsx  ← existe déjà (extraire du fichier principal)
```

## Ordre d'exécution

### 3.1 Créer le schema Zod pour l'édition gamme

Fichier : `src/lib/schemas/gammes.ts`

Ajouter `gammeEditSchema` pour remplacer les 6 useState :
```typescript
export const gammeEditSchema = z.object({
  nom_gamme: z.string().trim().min(1),
  description: optionalText,
  id_periodicite: z.coerce.number().int(),
  id_prestataire: z.coerce.number().int().default(1),
  est_reglementaire: z.coerce.number().min(0).max(1).default(0),
  id_image: z.number().nullable().default(null),
});
```

### 3.2 Créer `GammeEditDialog.tsx`

- Utiliser `CrudDialog` (pas Dialog brut)
- Utiliser `useForm({ resolver: zodResolver(gammeEditSchema) })`
- Props : `open`, `onOpenChange`, `gamme`, `onSubmit`
- Remplace les 6 useState : `editNom`, `editDesc`, `editPeriodicite`, `editPrestataire`, `editReglementaire`, `editImage`

### 3.3 Créer `OperationDialog.tsx`

- Utiliser `CrudDialog`
- Utiliser `useForm({ resolver: zodResolver(operationSchema) })`
- Remplace la validation manuelle des lignes 134-152
- Champs conditionnels seuils/unité selon `necessite_seuils`

### 3.4 Extraire `OperationSection.tsx`

- Contient le TabContent "opérations spécifiques"
- Props : `gammeId`, `operations`, les mutations create/update/delete
- Inclut `CardList` + bouton ajout + `OperationDialog`

### 3.5 Extraire `EquipementLinkDialog.tsx`

- Déjà semi-isolé (lignes 613-708) — le sortir dans son propre fichier
- Props : `gammeId`, `open`, `onOpenChange`, `existingEquipementIds`

### 3.6 Simplifier `[id].tsx`

- Garder : PageHeader + InfoCard + Tabs (orchestrateur)
- Déléguer chaque tab à son composant
- Résultat attendu : ~150 lignes

### 3.7 Supprimer les filtres dupliqués

Les fonctions `filterOperation`, `filterModeleOperation`, `filterEquipement` (lignes 39-49) sont des patterns génériques déjà gérés par `CardList`. Les supprimer si possible, ou les définir au module-level.

## Fichiers impactés

| Couche | Fichiers | Action |
|--------|----------|--------|
| Schemas | `src/lib/schemas/gammes.ts` | Ajouter `gammeEditSchema` |
| Pages | `src/pages/gammes/[id].tsx` | Réduire de 708 → ~150 lignes |
| Pages | `src/pages/gammes/GammeEditDialog.tsx` | Nouveau (~80 lignes) |
| Pages | `src/pages/gammes/OperationDialog.tsx` | Nouveau (~90 lignes) |
| Pages | `src/pages/gammes/OperationSection.tsx` | Nouveau (~100 lignes) |
| Pages | `src/pages/gammes/EquipementLinkDialog.tsx` | Nouveau (~100 lignes) |
| **Total** | **6 fichiers** | 4 nouveaux, 2 modifiés |

## Vérification

1. **Compilation** : `npx tsc --noEmit` sans erreur
2. **Test fonctionnel** : page gamme détail — tous les onglets fonctionnent
3. **Test CRUD opérations** : création, édition, suppression — identique
4. **Test édition gamme** : nom, périodicité, prestataire, réglementaire — identique
5. **Test liaison équipements** : ajout, suppression — identique
6. **Test liaison modèles** : ajout, suppression — identique
