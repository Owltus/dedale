# BORG-2026-04-04-003 — Audit complet Select items

> Projet : Mantis — Tauri v2 + Rust + SQLite
> Drones deployes : 3 (Cartographe pages, Conformite shared, Contradicteur)
> Mode : DIAGNOSTIC

## Zone assimilee

Tous les composants `<Select>` du projet (38 instances dans 20 fichiers). Verification que chaque Select possede la prop `items` pour afficher le label lisible au lieu de l'ID brut.

## Mecanisme

Le composant Select custom (`src/components/ui/select.tsx`) utilise un `SelectItemsContext`. Sans la prop `items`, `SelectValue` retourne `String(value)` — l'ID numerique brut. Avec `items`, il retourne `items[strValue]` — le label lisible.

## Rapports des drones

### Trois-de-Cinq (Cartographe — src/pages/)
31 Select scannes dans 18 fichiers pages.
Resultat : 31/31 CONFORMES — tous ont items= present et correct.

### Sept-de-Neuf (Conformite — src/components/shared/ + modeles)
15 Select scannes dans 6 fichiers.
Resultat : 15/15 CONFORMES — tous ont items= present et correct.

### Six-de-Neuf (Contradicteur)
Verification independante de l'integralite des 20 fichiers.
38 instances de Select comptees et verifiees individuellement.
Cas complexes inspectes : Selects conditionnels, dans des maps, items dynamiques, items statiques.
Resultat : **Aucune anomalie detectee sur 38 Select dans 20 fichiers.**

## Corrections appliquees (avant audit)

3 Select corrigees dans cette session (prop items ajoutee) :
1. `src/pages/modeles/DiTab.tsx` ligne 108 — type de DI
2. `src/pages/modeles-di/index.tsx` ligne 117 — type de DI
3. `src/pages/modeles-di/[id].tsx` ligne 110 — type de DI

## Regle ajoutee

Section "Select — OBLIGATOIRE" ajoutee dans `.claude/rules/shadcn-ui.md` pour prevenir la regression.

## Verdict unifie

FAILLES CONFIRMEES : 0 (les 3 failles existantes ont ete corrigees avant l'audit)
- 38/38 Select CONFORMES
- 20/20 fichiers CONFORMES
- Aucun angle mort detecte par le Contradicteur
