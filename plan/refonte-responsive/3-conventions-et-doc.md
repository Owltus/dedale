# Étape 3 — Conventions gravées

## Objectif

Documenter les conventions responsive issues des étapes 1 et 2 pour qu'elles
soient toujours appliquées, y compris par les futures pages. Sans cette étape, la
refonte se déliterait au premier nouvel écran.

## Fichier(s) impacté(s)

- `docs/conventions/ui.md` (modifié — nouvelle section)
- `CLAUDE.md` (modifié — rappel + table de renvoi)
- `.claude/skills/nouvelle-page/SKILL.md` (modifié — exigence responsive)

## Travail à réaliser

1. Ajouter dans `docs/conventions/ui.md` (après la section « Cartes en grille »,
   avant « À NE PAS FAIRE ») une section `## Responsive design` qui couvre :
   - approche mobile-first obligatoire ;
   - breakpoints disponibles (`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 ·
     `2xl` 1536, défauts Tailwind) ;
   - usage de `PageContainer` comme racine de chaque page (jamais `p-6` nu) ;
   - usage du helper `cardGrid` pour les grilles de cartes ;
   - `PageHeader` replié en colonne sur mobile (déjà intégré au composant) ;
   - règle des écrans denses : `overflow-x-auto` + colonne sticky réduite ;
   - rappel : ne pas trier les classes à la main (Prettier le fait).
     Respecter le ton sec/impératif existant et la rubrique « À NE PAS FAIRE ».

2. Mettre à jour `CLAUDE.md` :
   - dans la table « Conventions détaillées », élargir la ligne UI :
     « style, couleurs, thème, responsive, monter un écran » ;
   - ajouter une puce dans « Conventions de code (toujours actives) » :
     « Mobile-first : toute page via `PageContainer`, grilles via `cardGrid`
     (cf. `docs/conventions/ui.md`). »

3. Mettre à jour `.claude/skills/nouvelle-page/SKILL.md` :
   - exiger que toute nouvelle page soit responsive et s'ouvre sur
     `PageContainer` ;
   - renvoyer vers la section « Responsive design » de `ui.md` ;
   - ajouter un exemple court de grille responsive (`cardGrid.default`).

4. Optionnel : créer `docs/decisions/0005-responsive.md` pour tracer les
   arbitrages (mobile-first, breakpoints défauts, drawer sous `lg`, primitives
   `PageContainer`/`cardGrid`), dans le format des décisions existantes.

## Critère de validation

- `docs/conventions/ui.md` contient une section « Responsive design » cohérente
  avec les primitives réellement livrées aux étapes 1 et 2.
- `CLAUDE.md` mentionne le responsive dans la table de renvoi et dans les
  conventions toujours actives.
- Le skill `nouvelle-page` impose `PageContainer` et renvoie à la doc.
- Aucune incohérence entre la doc et le code (noms de composants/exports exacts).
