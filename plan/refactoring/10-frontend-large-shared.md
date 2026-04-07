# Phase 10 — Découper composants partagés monolithiques

## Contexte

3 composants partagés dépassent les 200 lignes et mélangent plusieurs responsabilités :

| Composant | Lignes | Problème |
|-----------|--------|----------|
| `ImagePicker.tsx` | 290 | Crop dialog + bibliothèque images + confirmation suppression |
| `Sidebar.tsx` | 305 | Navigation + recherche dropdown + collapse animation |
| `ContratDialogs.tsx` | 208 | 3 dialogs différentes dans 1 fichier |

## Architecture cible

### ImagePicker

```
src/components/shared/
├── ImagePicker.tsx          ← ~100 lignes (orchestrateur)
├── ImageCropDialog.tsx      ← ~80 lignes (recadrage)
└── ImageLibraryDialog.tsx   ← ~80 lignes (bibliothèque avec recherche)
```

### ContratDialogs

```
src/components/shared/
├── ContratEditDialog.tsx    ← ~70 lignes
├── ContratResilierDialog.tsx ← ~70 lignes
└── ContratAvenantDialog.tsx ← ~70 lignes
```

Note : `ContratDialogs.tsx` est supprimé. Les imports dans les pages sont mis à jour.

### Sidebar

```
src/components/layout/
├── Sidebar.tsx              ← ~120 lignes (structure + collapse)
├── SidebarNav.tsx           ← ~80 lignes (sections de navigation)
└── SidebarSearch.tsx        ← ~100 lignes (recherche + dropdown résultats)
```

## Ordre d'exécution

### 10.1 ImagePicker

1. Extraire `ImageCropDialog` (crop area + boutons confirmer/annuler)
2. Extraire `ImageLibraryDialog` (liste images + recherche + sélection)
3. Simplifier `ImagePicker` : bouton principal + preview + 2 dialog composants
4. Vérifier que les pages utilisant `ImagePicker` fonctionnent (gammes, équipements, localisations)

### 10.2 ContratDialogs

1. Créer `ContratEditDialog.tsx` (formulaire édition contrat)
2. Créer `ContratResilierDialog.tsx` (formulaire résiliation)
3. Créer `ContratAvenantDialog.tsx` (formulaire avenant)
4. Supprimer `ContratDialogs.tsx`
5. Mettre à jour les imports dans `src/pages/prestataires/[id].tsx` (ou contrats)

### 10.3 Sidebar

1. Extraire `SidebarNav` (liens de navigation groupés par section)
2. Extraire `SidebarSearch` (input + dropdown résultats + keyboard events)
3. Simplifier `Sidebar` : structure flex + collapse + 2 composants enfants

## Fichiers impactés

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Shared | `ImagePicker.tsx` | `ImageCropDialog.tsx`, `ImageLibraryDialog.tsx` |
| Shared | `ContratDialogs.tsx` (supprimé) | `ContratEditDialog.tsx`, `ContratResilierDialog.tsx`, `ContratAvenantDialog.tsx` |
| Layout | `Sidebar.tsx` | `SidebarNav.tsx`, `SidebarSearch.tsx` |
| Pages | Imports mis à jour | — |
| **Total** | **3 modifiés, 1 supprimé** | **7 nouveaux** |

## Vérification

1. **Compilation** : `npx tsc --noEmit` sans erreur
2. **Test ImagePicker** : upload image, recadrer, bibliothèque — identique
3. **Test ContratDialogs** : édition, résiliation, avenant — identique
4. **Test Sidebar** : navigation, collapse, recherche globale, Ctrl+K — identique
