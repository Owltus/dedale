---
name: Dédale
description: GMAO pour Établissements Recevant du Public — sobre, neutre, la couleur ne sert qu'à signaler un état.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.145 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.97 0 0)"
  secondary-foreground: "oklch(0.205 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  accent: "oklch(0.97 0 0)"
  accent-foreground: "oklch(0.205 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  info: "oklch(0.55 0.2 255)"
  success: "oklch(0.52 0.15 150)"
  warning: "oklch(0.55 0.13 65)"
  violet: "oklch(0.52 0.2 300)"
  yellow: "oklch(0.55 0.12 95)"
  border: "oklch(0.922 0 0)"
  ring: "oklch(0.708 0 0)"
typography:
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.2
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.2
  micro:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card-surface:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
  list-row:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  status-badge-neutral:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.sm}"
---

# Design System: Dédale

## Overview

**Creative North Star: "Le tableau de bord de l'instrument"**

Dédale ne cherche jamais à séduire — il cherche à ne jamais gêner. L'écran par défaut est presque entièrement gris (fond, texte, bordures, surfaces) : aucune teinte n'apparaît sans raison fonctionnelle. La couleur n'est jamais décorative ; elle est réservée, exclusivement, à **signaler un état** (un statut, une alerte, une action destructrice) — exactement comme les cadrans colorés d'un tableau de bord technique au milieu d'un habitacle neutre. Le résultat doit se lire d'un coup d'œil, debout, sur un téléphone, entre deux interventions : c'est un outil de travail pour un technicien de terrain, pas une vitrine.

`docs/conventions/ui.md` (doctrine du projet) pose déjà cette direction en une phrase : « Minimaliste, moderne, maîtrisé, classique. Pas d'excentricité. » Ce DESIGN.md documente comment cette phrase se traduit concrètement dans le code existant.

**Key Characteristics:**
- Palette quasi monochrome — même l'accent principal (`primary`) est un gris pur (chroma 0), jamais une couleur de marque.
- Six teintes sémantiques strictement réservées aux **états** (succès, alerte, danger, info, violet, jaune) — jamais utilisées pour décorer une interface autrement neutre.
- Coins arrondis modérés et cohérents (jamais carrés, jamais en pilule) ; profondeur portée par le rayon et la bordure, presque jamais par l'ombre.
- Clair/sombre automatiques : chaque token existe dans les deux thèmes, aucun composant ne code une couleur en dur.

## Colors

Le système est presque entièrement neutre ; la couleur est un signal, pas une décoration.

### Primary
- **Graphite** (`oklch(0.205 0 0)` clair / `oklch(0.922 0 0)` sombre) : action principale (boutons, liens). Volontairement un gris pur — aucune teinte de marque. L'instrument reste neutre ; seuls ses cadrans (les tonalités d'état ci-dessous) ont de la couleur.

### Neutral
- **Toile** (`background`, `oklch(1 0 0)` clair / `oklch(0.145 0 0)` sombre) : fond de page.
- **Encre** (`foreground`, inverse de Toile) : texte principal.
- **Surface élevée** (`card`, identique à Toile en clair, `oklch(0.205 0 0)` en sombre — légèrement plus claire que le fond) : cartes, popovers, menus.
- **Gris discret** (`muted` / `accent` / `secondary`, `oklch(0.97 0 0)` clair / `oklch(0.269 0 0)` sombre) : surfaces secondaires, survol, texte atténué.
- **Bordure** (`oklch(0.922 0 0)` clair / blanc à 10 % sombre) : séparateurs, contours de champ.

### État (jamais décoratif)
- **Rouge Alerte** (`destructive`, `oklch(0.577 0.245 27.325)`) : suppression, échec, urgence critique.
- **Bleu Instrument** (`info`, `oklch(0.55 0.2 255)`) : information neutre, statut « programmé ».
- **Vert Cadran** (`success`, `oklch(0.52 0.15 150)`) : favorable, réalisé, conforme.
- **Ambre Prudence** (`warning`, `oklch(0.55 0.13 65)`) : défavorable sans être critique, à surveiller.
- **Violet Signal** (`violet`, `oklch(0.52 0.2 300)`) : origine humaine d'une action (ex. planification manuelle, par opposition à l'automatique).
- **Jaune Marqueur** (`yellow`, `oklch(0.55 0.12 95)`) : distinction secondaire, cas rares.

### Named Rules
**La Règle du Cadran.** Une couleur n'apparaît jamais sans porter un sens d'état précis, mappé depuis `StatusTone` (`status-badge.tsx`) — jamais choisie à l'œil dans un composant. Si une teinte ne répond pas à « quel état signale-t-elle ? », elle n'a rien à faire à l'écran.

**La Règle Teinte/Solide.** Chaque couleur d'état a deux emplois distincts et non interchangeables : **teinté** (fond à 10 %, texte plein — `bg-destructive/10 text-destructive`) pour un état constaté (badge de statut), **solide** (fond plein, texte inverse) réservé à une action que l'utilisateur déclenche (bouton de suppression). Un badge ne s'affiche jamais en solide ; un bouton destructeur ne s'affiche jamais en teinté.

## Typography

**Body Font:** pile système (`ui-sans-serif, system-ui, sans-serif` — aucune police web chargée)

**Character:** Utilitaire et sans affirmation stylistique. Le système ne charge aucune police personnalisée : la hiérarchie se construit par le poids et la taille, pas par le choix typographique. C'est cohérent avec le North Star — l'instrument ne signe pas son style, il transmet l'information.

### Hierarchy
- **Title** (500, 0.875rem / `text-sm font-medium`, 1.2) : titre de ligne de liste, titre de carte.
- **Body** (400, 0.875rem, 1.5) : texte courant, description.
- **Label** (400, 0.75rem / `text-xs`, 1.2) : sous-titre atténué, métadonnée, légende de champ.
- **Micro** (500-600, 0.625rem–0.6875rem / `text-[10px]`–`text-[11px]`, `leading-none`) : réservé aux deux écrans les plus denses de l'app — l'en-tête compact multi-champs (`DetailHeaderCard`) et la grille murale du planning (`planning-grille.tsx`). Toujours en `font-medium` ou `font-semibold` (jamais 400) pour rester lisible à cette taille ; jamais utilisé hors de ces contextes de densité extrême.

### Named Rules
**La Règle Sans Empreinte.** Aucune police web n'est chargée. La pile système suffit : elle rend l'app instantanément lisible sur n'importe quel appareil sans coût de chargement, cohérent avec un outil utilisé sur le terrain en conditions réseau incertaines.

**La Règle du Dernier Recours.** Le palier Micro n'est pas une échappatoire pour serrer un écran mal agencé — c'est une exception réservée aux grilles réellement denses (planning, en-têtes multi-champs), toujours accompagnée d'un poids de police renforcé pour compenser la taille. Un nouvel usage de Micro ailleurs doit d'abord se demander si Label (12px) suffit.

## Layout

Mobile-first strict : toute page part du mobile, puis s'agrandit (`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536, valeurs Tailwind par défaut). Racine de page systématique : `PageContainer` (jamais un `div` nu) — 1er enfant fixe (en-tête), reste défilant ; le document lui-même ne défile jamais, seules les zones internes défilent. Grilles de cartes via l'utilitaire `cardGrid` (jamais `grid-cols-N` fixe sans repli mobile). Navigation : sidebar fixe à partir de `lg`, tiroir (`Sheet`) en dessous. Colonnes secondaires d'une ligne de liste (badges, métadonnées) masquées sous `sm`, avec un repli explicite (`mobileMeta`/`mobileBadge`) pour ne jamais perdre l'information qui compte sur petit écran.

## Elevation & Depth

Le système est **quasiment plat** : les boutons portent `shadow-xs`, les cartes `shadow-sm` — les deux niveaux d'ombre les plus discrets de l'échelle Tailwind, à la limite du visible. La profondeur ne vient presque jamais de l'ombre : elle vient du **rayon** et de la **bordure**. Une carte se distingue du fond par son contour et son léger changement de surface (`card` vs `background`), pas par un halo.

### Named Rules
**La Règle du Presque-Plat.** L'ombre marque une existence, jamais une élévation dramatique. Si une ombre se voit avant la bordure, elle est trop appuyée pour ce système.

## Shapes

Rayons modérés et cohérents, jamais nuls, jamais en pilule : `rounded-md` (8px) pour les contrôles interactifs (boutons, champs), `rounded-lg` (10px) pour les lignes de liste, `rounded-xl` (14px) pour les cartes conteneurs plus grandes. Un accent de statut, quand il existe, prend la forme d'un **liseré de 4px au bord gauche** de la carte (`border-l-4`) — jamais un cadre entier coloré, jamais un fond teinté sur toute la carte.

## Components

### Buttons
- **Shape:** `rounded-md` (8px), hauteur `h-9` par défaut (`h-8` compact, `h-10` large).
- **Primary:** fond Graphite, texte inverse, `shadow-xs`, survol assombri à 90 %.
- **Destructive:** fond Rouge Alerte plein, texte blanc — réservé aux actions de suppression, jamais aux badges d'état (voir Règle Teinte/Solide).
- **Outline / Secondary / Ghost / Link:** dégradent l'affirmation visuelle dans cet ordre — `outline` (bordure + fond neutre), `secondary` (fond gris discret), `ghost` (transparent jusqu'au survol), `link` (texte souligné au survol seulement). Le choix de variante encode la hiérarchie d'importance de l'action, pas le goût.

### Cards / Containers
- **Corner Style:** `rounded-xl` (14px).
- **Background:** Surface élevée (`card`), bordure fine, `shadow-sm`.
- **Internal Padding:** 24px (`py-6`, sections internes `px-6`).

### List Row (composant signature)
La brique la plus reproduite de l'application (`ListRow`, ~9 écrans de liste) — une « carte-ligne » pleine largeur qui remplace le tableau classique.
- **Shape:** `rounded-lg` (10px), hauteur calibrée par densité (`h-11` à `h-24` selon le contexte, jamais improvisée).
- **Accent d'état:** liseré de 4px au bord gauche, coloré selon `StatusTone` — le même code couleur que le badge de statut de la ligne, pour que l'œil relie les deux instantanément.
- **Interaction:** toute la ligne est cliquable (overlay `<button>` en absolute inset, jamais un `onClick` sur le conteneur `div`) — accessible clavier, focus visible sur toute la ligne.
- **Actions:** révélées au survol/focus uniquement (`opacity-0` → `100` au survol), jamais un bouton permanent qui alourdit la ligne au repos. Sur les listes récentes, les actions passent par un **menu contextuel** (clic droit / appui long) sans aucun déclencheur visible en permanence — pas de kebab.

### Status Badge (composant signature)
- **Style:** pastille **teintée** — fond à 10 % d'opacité de la couleur d'état, texte plein de la même couleur, liseré à 20 % d'opacité. Jamais un badge à fond plein (réservé aux boutons d'action, voir Règle Teinte/Solide).
- **Shape:** `rounded-sm`, forme `Badge` shadcn standard.

### Inputs / Fields
- **Style:** bordure fine (`border-input`), fond transparent, `rounded-md`, `shadow-xs`, hauteur `h-9`.
- **Focus:** anneau de 3px en `ring/50` + bordure pleine — pas de glow, pas de changement de fond.
- **Error:** bordure et anneau basculent sur Rouge Alerte (`aria-invalid`).

### Navigation
- Sidebar : surface légèrement distincte du fond, item actif en fond `accent`, jamais en couleur de marque (il n'y en a pas). Repli automatique en tiroir sous `lg`, aucune adaptation à faire dans les pages.

## Do's and Don'ts

### Do:
- **Do** utiliser exclusivement les tokens sémantiques (`bg-primary`, `text-muted-foreground`…) — jamais une couleur Tailwind brute ou un hex en dur.
- **Do** réserver la couleur à un signal d'état précis (Règle du Cadran).
- **Do** garder les ombres au niveau `xs`/`sm` — la profondeur vient du rayon et de la bordure, pas du halo.
- **Do** utiliser `cardGrid` pour toute grille de cartes, jamais un `grid-cols-N` fixe sans repli mobile.

### Don't:
- **Don't** coder une couleur en dur (`bg-blue-600`, `text-[#1a1a1a]`) — toujours passer par `index.css`.
- **Don't** afficher un badge de statut en fond plein, ni un bouton destructeur en teinté — les deux usages de la couleur d'état ne s'échangent pas.
- **Don't** ouvrir une page sur un conteneur nu (`<div className="p-6">`) au lieu de `PageContainer`.
- **Don't** ajouter un bouton d'action permanent sur une ligne de liste — les actions se révèlent au survol/focus ou passent par le menu contextuel.
- **Don't** charger une police web : la pile système est un choix délibéré, pas un oubli.
