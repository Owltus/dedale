# Phase 6 — Centraliser calcul statut

## Contexte

La même logique de calcul de statut (cascade inactif → retard → en cours → proximité → validé) est copiée dans **7 composants de liste** :

| Composant | Fonction | Lignes |
|-----------|----------|--------|
| `DomaineEquipList.tsx` | `getDomaineEquipStatutId()` | 7-20 |
| `DomaineGammeList.tsx` | `getDomaineStatutId()` | 8-22 |
| `FamilleEquipList.tsx` | `getFamilleEquipStatutId()` | 7-20 |
| `FamilleGammeList.tsx` | `getFamilleStatutId()` | 8-22 |
| `EquipementList.tsx` | `getEquipementStatutId()` | 7-19 |
| `GammeList.tsx` | `getGammeStatutId()` | 8-21 |
| `OtList.tsx` | `getEffectiveStatutId()` | 12-34 |

## Architecture cible

Créer `src/lib/utils/statuts-compute.ts` avec des helpers paramétrables.

## Ordre d'exécution

### 6.1 Analyser les variantes

Lire les 7 fonctions pour identifier les champs communs :
- `nb_retard` / `est_en_retard` → indicateur de retard
- `nb_en_cours` → indicateur en cours
- `nb_proximite` / proximité calculée → indicateur proximité
- `est_actif` / `est_active` → indicateur actif/inactif

### 6.2 Créer `src/lib/utils/statuts-compute.ts`

```typescript
interface StatutInput {
  estActif?: boolean;     // gamme.est_active, equipement.est_actif
  nbRetard?: number;      // nb_retard ou est_en_retard converti
  nbEnCours?: number;     // nb_en_cours
  nbProximite?: number;   // nb_proximite
}

export function computeAggregateStatutId(input: StatutInput): number { ... }
```

Retourne un ID de statut pour `StatusBadge`.

### 6.3 Refactorer les 7 composants

Remplacer chaque `getXxxStatutId()` local par `computeAggregateStatutId()` importé.

### 6.4 Exporter dans `src/lib/utils/index.ts`

## Fichiers impactés

| Couche | Fichiers | Action |
|--------|----------|--------|
| Utils | `src/lib/utils/statuts-compute.ts` | Nouveau |
| Utils | `src/lib/utils/index.ts` | Export |
| Shared | `DomaineEquipList.tsx` | Supprimer fonction locale |
| Shared | `DomaineGammeList.tsx` | Supprimer fonction locale |
| Shared | `FamilleEquipList.tsx` | Supprimer fonction locale |
| Shared | `FamilleGammeList.tsx` | Supprimer fonction locale |
| Shared | `EquipementList.tsx` | Supprimer fonction locale |
| Shared | `GammeList.tsx` | Supprimer fonction locale |
| Shared | `OtList.tsx` | Supprimer fonction locale |
| **Total** | **9 fichiers** | 1 nouveau, 8 modifiés |

## Vérification

1. **Compilation** : `npx tsc --noEmit` sans erreur
2. **Test visuel** : vérifier que les badges de statut (vert/orange/rouge) sont identiques sur chaque liste
