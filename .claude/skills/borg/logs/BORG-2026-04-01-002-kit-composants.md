# BORG-2026-04-01-002 — Kit composants réutilisables

> Projet : Mantis — Tauri v2 + React + TypeScript + SQLite
> Drones déployés : 3 (listes simples, pages complexes, CrudTab)
> Mode : EXÉCUTION

## Actions exécutées

### Composants créés (3)
- `src/components/shared/InlineTable.tsx` — Table inline générique (columns, data, getKey, onRowClick, actions, emptyTitle/Description)
- `src/components/shared/ActionButtons.tsx` — Boutons edit/delete standardisés avec stopPropagation
- `src/components/shared/EmptyState.tsx` — Existait déjà, réutilisé

### Pages migrées (20)
| Page | InlineTable | ActionButtons |
|------|------------|---------------|
| gammes/index.tsx | ✓ | — |
| gammes/domaines/[idDomaine].tsx | ✓ | — |
| gammes/familles/[idFamille].tsx | ✓ (×2 tables) | — |
| gammes/[id].tsx | ✓ (×4 onglets) | ✓ |
| gammes-types/index.tsx | ✓ | — |
| gammes-types/[id].tsx | ✓ | ✓ |
| equipements/index.tsx | ✓ | ✓ |
| equipements/domaines/[idDomaine].tsx | ✓ | ✓ |
| equipements/familles/[idFamille].tsx | ✓ | ✓ |
| equipements/[id].tsx | ✓ (×2 tables) | — |
| localisations/index.tsx | ✓ | ✓ |
| localisations/batiments/[idBatiment].tsx | ✓ | ✓ |
| localisations/niveaux/[idNiveau].tsx | ✓ | ✓ |
| ordres-travail/index.tsx | ✓ | — |
| demandes/index.tsx | ✓ | — |
| prestataires/index.tsx | ✓ | — |
| prestataires/[id].tsx | ✓ | ✓ |
| techniciens/index.tsx | ✓ | ✓ |
| documents/index.tsx | ✓ | ✓ |
| parametres/CrudTab.tsx | ✓ | ✓ |

### Vérification
- `npx tsc --noEmit` : 0 erreur
