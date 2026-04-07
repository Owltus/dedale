# Gantt Annuel — Vue unique année

## Contexte
Remplacer la vue semaine par un Gantt annuel (52 semaines). Style intégré au thème Mantis.

## Layout
```
PageHeader "Planning" + [Année < 2026 >]

     Jan          Fév          Mar          ...          Déc
  S1 S2 S3 S4  S5 S6 S7 S8  S9...                     ...S52
─────────────────────────────────────────────────────────────
▼ Sécurité incendie (3 retards / 12 total)
  Extincteurs     ██        ██        ██        ██
  BAES hebdo      █ █ █ █ █ █ █ █ █ █ █ █ █ █ █ █ █...
  Colonnes sèches          ██████████

► CVC (replié — mini-barres visibles)
─────────────────────────────────────────────────────────────
Charge  ▇ ▃ ▅ ▇ ▃ ▅ ▇ ▃ ▅ ▇ ▃ ▅ ...
```

## Données
- `usePlanningMois(year, month)` pour chaque mois → ou mieux : créer une commande `get_planning_annee(annee)` côté Rust
- Alternative : utiliser `useOrdresTravail()` (tous les OT) et filtrer côté frontend par année
- Gammes via `useGammes()` pour le regroupement famille

## Éléments visuels
- Cellule = 1 semaine, largeur fixe (~20-24px)
- Entête sticky : mois (merged) + S1-S52
- Ligne verticale semaine courante (bg-primary)
- Barres OT : rounded, couleur statut, hover → tooltip
- Familles : expand/collapse, mini-barres en mode replié
- Barre de charge : heatmap en bas
- Scroll horizontal (52 semaines dépassent l'écran)

## Backend
- Ajouter `get_planning_annee(annee)` qui retourne TOUS les OT de l'année
- Ou réutiliser `useOrdresTravail()` avec filtre frontend

## Fichiers
- `src/pages/planning/index.tsx` — réécriture complète
- `src-tauri/src/commands/planning.rs` — nouveau endpoint (optionnel)
