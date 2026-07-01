# 0005 — Graphiques du tableau de bord en SVG maison

- **Date** : 2026-07-01
- **Statut** : accepté

## Contexte

La refonte du tableau de bord (plan `plan/refonte-tableau-de-bord/`) introduit de la
dataviz : un donut « Ordres de travail », des barres empilées « Charge par semaine »,
un sunburst à trois anneaux « Complétion des gammes » et une frise chronologique
« Reconductions de contrats ». Aucune librairie de graphiques n'était installée (ni
`recharts`, ni `d3`, ni `nivo`), et le repo faisait déjà du SVG/`div` à la main
(`PdfFileIcon`, `StatusStepper`, la grille du planning).

Les exigences produit se plient mal à une librairie générique : coloration par
**tokens sémantiques** du thème (jamais de couleur en dur), opacité modulée par la
santé d'une gamme, **hachures** pour les gammes réglementaires, **clignotement doux**
(respectant `prefers-reduced-motion`), sunburst 3 niveaux, et une frise dont la
navigation temporelle doit être **synchronisée au clavier** avec les barres.

## Décision

**Graphiques en SVG maison**, factorisés dans `src/components/common/charts/` :

- `donut.tsx` (`Donut`) — anneau de parts, trou central libre (`centre`).
- `barres-empilees.tsx` (`BarresEmpilees`) — histogramme empilé, filigrane, colonne
  « en cours » accentuée.
- `sunburst.tsx` (`Sunburst`) — anneaux domaine → famille → gamme, `opacite` /
  `hachures` / `blink` par feuille.
- `chart-legend.tsx` (`ChartLegend`) + le contrat partagé `ChartSegment`, la table
  `TONE_VAR`/`toneToken` (tonalité → variable CSS) et le helper `onKeyActivate`.

La **couleur** ne passe QUE par `StatusTone` → `toneToken()` → variable CSS
(`--success`, `--warning`, `--destructive`, `--info`, `--violet`, `--yellow`,
`--muted-foreground`), définies dans `src/index.css`. Aucun code couleur en dur nulle
part dans les charts ni les cadrans.

La **navigation temporelle** est isolée dans le hook `useFenetreTemporelle`
(`src/features/planning/`), factorisé depuis le planning et réutilisé par le tableau
de bord. Il installe **un seul** listener clavier (`keydown` sur `window`) et expose un
`centre` glissant. Règle : l'orchestrateur (`dashboard.tsx`) monte le hook **une fois**
et passe la `FenetreTemporelle` en props aux barres (zone 1) ET à la frise (zone 2) →
les flèches ← → déplacent les deux de la même période, sans double bond. Un cadran
n'instancie sa propre fenêtre (mode autonome) que s'il n'en reçoit pas.

## Conséquences

- **Bundle inchangé** (aucune dépendance ajoutée) et **homogénéité totale** avec le
  thème : dark mode, tokens, `prefers-reduced-motion` gérés nativement.
- Les primitives sont **réutilisables** (catalogue `SKILL.md` §5) et découplées des
  données : elles reçoivent des `ChartSegment[]` / `SunburstNode[]`, la dérivation
  métier vit dans les cadrans (`src/features/dashboard/components/`).
- Le sunburst 3 niveaux + hachures + blink est le morceau le plus exigeant ; c'est
  précisément ce qu'une librairie générique ne fait pas nativement — le SVG maîtrisé
  l'emporte ici.
- Contrepartie assumée : pas d'axes/échelles/légendes « gratuits » d'une librairie ;
  ils sont écrits à la main (mais restent simples et sur mesure).
- Si un futur besoin réclamait des graphiques riches et interactifs à grande échelle
  (zoom, brushing, séries nombreuses), cette décision serait à réévaluer — mais pour la
  dataviz de synthèse du tableau de bord, le SVG maison est le bon niveau d'effort.
