# Phase 9 — Supprimer code mort frontend

## Contexte

3 composants partagés sont exportés mais **jamais importés** dans aucune page :

| Composant | Fichier | Lignes | Dernier usage |
|-----------|---------|--------|---------------|
| `TreeView` | `src/components/shared/TreeView.tsx` | 110 | Aucun |
| `FilterSelect` | `src/components/shared/FilterSelect.tsx` | 43 | Aucun |
| `FilterToggle` | `src/components/shared/FilterToggle.tsx` | 23 | Aucun |

## Ordre d'exécution

1. Vérifier avec grep qu'aucun import n'existe (confirmation) :
   ```bash
   grep -r "TreeView" src/pages/ src/components/
   grep -r "FilterSelect" src/pages/ src/components/
   grep -r "FilterToggle" src/pages/ src/components/
   ```
2. Supprimer les 3 fichiers
3. Retirer les exports de `src/components/shared/index.ts`
4. `npx tsc --noEmit` — 0 erreur

## Fichiers impactés

| Couche | Fichiers | Action |
|--------|----------|--------|
| Shared | `TreeView.tsx` | Supprimer |
| Shared | `FilterSelect.tsx` | Supprimer |
| Shared | `FilterToggle.tsx` | Supprimer |
| Shared | `index.ts` | Retirer 3 exports |
| **Total** | **4 fichiers** | 3 supprimés, 1 modifié |

## Vérification

1. **Compilation** : `npx tsc --noEmit` sans erreur
2. **Pas de régression** : ces composants n'étaient utilisés nulle part
