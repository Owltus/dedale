# Phase 5 — Refactorer ordres-travail/[id].tsx

## Contexte

Le fichier `src/pages/ordres-travail/[id].tsx` fait **402 lignes** avec :
- **7 useState** pour un formulaire d'édition (violation règle React Hook Form)
- Table HTML brute pour les opérations (lignes 227-323) au lieu d'`InlineTable`
- Dialog brut au lieu de `CrudDialog` (lignes 338-381)

## Architecture cible

```
src/pages/ordres-travail/
├── index.tsx              ← inchangé (21 lignes, délègue à OtList)
├── [id].tsx               ← ~150 lignes (orchestrateur + InfoCard + Tabs)
├── OtEditDialog.tsx       ← CrudDialog édition OT (RHF + Zod)
└── OtOperationsTab.tsx    ← Tab opérations (InlineTable + édition inline)
```

## Ordre d'exécution

### 5.1 Créer le schema Zod pour l'édition OT

Fichier : `src/lib/schemas/ordres-travail.ts` (ajouter)

```typescript
export const otEditSchema = z.object({
  date_prevue: z.string().min(1),
  id_priorite: z.coerce.number().int(),
  id_technicien: z.coerce.number().int().nullable().default(null),
  commentaires: optionalText,
});
```

### 5.2 Créer `OtEditDialog.tsx`

- Utiliser `CrudDialog`
- Utiliser `useForm({ resolver: zodResolver(otEditSchema) })`
- Props : `open`, `onOpenChange`, `ot`, `onSubmit`
- Remplace les useState `editDate`, `editPriorite`, `editTechnicien`, `editCommentaires`

### 5.3 Extraire `OtOperationsTab.tsx`

- Contient la table des opérations d'exécution
- Utiliser `InlineTable` au lieu de `<table>` brut
- Gère l'édition inline (statut, valeur mesurée, conformité, commentaire)
- Props : `operations`, `onUpdate`, `onBulkTerminer`
- ~150 lignes

### 5.4 Simplifier `[id].tsx`

- Garder : PageHeader + InfoCard + Tabs + transitions de statut
- Déléguer : opérations → `OtOperationsTab`, édition → `OtEditDialog`
- Résultat attendu : ~150 lignes

## Fichiers impactés

| Couche | Fichiers | Action |
|--------|----------|--------|
| Schemas | `src/lib/schemas/ordres-travail.ts` | Ajouter `otEditSchema` |
| Pages | `src/pages/ordres-travail/[id].tsx` | Réduire de 402 → ~150 lignes |
| Pages | `src/pages/ordres-travail/OtEditDialog.tsx` | Nouveau (~70 lignes) |
| Pages | `src/pages/ordres-travail/OtOperationsTab.tsx` | Nouveau (~150 lignes) |
| **Total** | **4 fichiers** | 2 nouveaux, 2 modifiés |

## Vérification

1. **Compilation** : `npx tsc --noEmit` sans erreur
2. **Test édition OT** : modifier date, priorité, technicien, commentaires — sauvegarde OK
3. **Test opérations** : changer statut, remplir mesure, cocher conforme — identique
4. **Test bulk terminer** : sélection multiple → tout "Terminé" en une action
5. **Test transitions statut** : Planifié → En cours → Clôturé → Réouvert — cascade OK
