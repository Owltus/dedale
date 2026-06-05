# Plan — Refonte responsive

## Contexte

L'application Dédale a été construite en pensant « bureau » : la coquille place une
sidebar de largeur fixe (`w-60`) à côté du contenu, et chaque page ouvre sur un
`<div className="p-6">` sans aucun breakpoint. Sur mobile et tablette, la sidebar
occupe tout l'espace, les grilles de cartes débordent et les écrans denses
(planning, documents) deviennent inutilisables.

L'objectif est de rendre toute l'application utilisable sur mobile, tablette et
bureau, en suivant une approche mobile-first et les bonnes pratiques Tailwind 4,
sans toucher à la logique métier ni casser l'existant. Le chantier doit aussi
graver les conventions responsive dans la doc du projet pour que les futures pages
soient adaptatives par défaut.

Contraintes : stack Vite + React 19 + TanStack + Tailwind 4 + shadcn/ui ; tokens
sémantiques uniquement (pas de couleur en dur) ; ESLint strict + Prettier (ne pas
trier les classes à la main, relancer `npm run format`) ; le front présente, la
base valide.

---

## Décisions (tranchées)

Arbitrages pris par défaut (modifiables au point de validation) :

- **Conteneur de page** : on crée un composant réutilisable `PageContainer`
  (`px-4 py-6 sm:px-6 lg:px-8`) plutôt que de répéter un pattern. Garantit le
  responsive par défaut des futures pages — objectif explicite du chantier.
- **Grilles de cartes** : on centralise un helper de classes `cardGrid` à
  breakpoints explicites (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ...`). Plus
  prévisible que `auto-fill minmax()` sous 360px. On conserve les grilles déjà
  sûres du dashboard (`minmax(min(20rem,100%),1fr)`).
- **Sidebar mobile** : on construit un composant `Sheet` à partir de
  `@radix-ui/react-dialog` (déjà installé) — pas de nouvelle dépendance. La
  sidebar devient un drawer sous `lg` (mobile + tablette) et reste fixe à partir
  de `lg` (1024px). Une barre supérieure mobile porte le burger + le logo.
- **Planning** : scroll horizontal amélioré (colonne « Gamme » sticky réduite sur
  mobile + indicateur de défilement), pas de refonte en accordéon.
- **Doc** : on étend `docs/conventions/ui.md` avec une section « Responsive
  design » (pas de nouveau fichier), + rappel dans `CLAUDE.md` et le skill
  `nouvelle-page`.

---

## Phases

| #   | Fichier                                                    | Phase                         | Dépend de | Priorité | Effort | Livrable                                                              | Critique |
| --- | ---------------------------------------------------------- | ----------------------------- | --------- | -------- | ------ | --------------------------------------------------------------------- | -------- |
| 1   | [1-fondations-responsive.md](./1-fondations-responsive.md) | Fondations réutilisables      | —         | P0       | M      | `PageContainer`, helper `cardGrid`, `PageHeader` responsive           |          |
| 2   | [2-sidebar-et-coquille.md](./2-sidebar-et-coquille.md)     | Sidebar + coquille responsive | 1         | P0       | L      | `Sheet`, drawer mobile + barre sup., coquille `_app` adaptative       | ⚠        |
| 3   | [3-conventions-et-doc.md](./3-conventions-et-doc.md)       | Conventions gravées           | 1, 2      | P0       | S      | Section responsive dans `ui.md`, rappel `CLAUDE.md` + skill           |          |
| 4   | [4-balayage-pages.md](./4-balayage-pages.md)               | Balayage des pages standard   | 1, 3      | P1       | L      | Toutes les pages liste+détail passées en `PageContainer` + `cardGrid` | ⚠        |
| 5   | [5-ecrans-denses.md](./5-ecrans-denses.md)                 | Écrans denses & composants    | 1         | P1       | M      | Planning, `documents-tab`, dialogs, charts adaptés mobile             |          |
| 6   | [6-pages-hors-coquille.md](./6-pages-hors-coquille.md)     | Pages hors coquille           | 1         | P2       | S      | `login`, `definir-mot-de-passe`, `profil` vérifiés/ajustés            |          |
| 7   | [7-validation-globale.md](./7-validation-globale.md)       | Validation responsive globale | toutes    | P0       | M      | Revue aux 3 breakpoints, build/tsc/lint verts, audit `/code-review`   | ⚠        |

---

## Ordre d'exécution (sprints)

- **Sprint A — Socle** : étapes 1 puis 2 (les primitives et la coquille
  conditionnent tout le reste). Étape 3 dans la foulée pour figer les patterns.
- **Sprint B — Diffusion** : étapes 4, 5 et 6, parallélisables entre elles une
  fois le socle posé (elles ne se touchent pas).
- **Sprint C — Recette** : étape 7, validation finale aux trois tailles d'écran.

---

## Architecture cible

```
Mobile / Tablette (< lg)                 Bureau (>= lg)
┌───────────────────────────┐           ┌──────────┬────────────────────┐
│ ☰  [logo] Dédale          │ <- barre  │ Sidebar  │  PageContainer     │
├───────────────────────────┤    sup.   │  fixe    │   PageHeader       │
│                           │           │  w-60    │   cardGrid /       │
│   PageContainer (px-4)    │           │          │   contenu          │
│   PageHeader (col)        │           │          │                    │
│   cardGrid 1 col          │           │          │                    │
│                           │           │          │                    │
└───────────────────────────┘           └──────────┴────────────────────┘
  Sidebar = Sheet (drawer overlay          Sidebar visible en permanence,
  ouvert via le burger)                    pas de barre supérieure
```

---

## Fichiers impactés (résumé)

| Couche                | Fichiers modifiés                                                                                                        | Fichiers nouveaux                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Coquille / navigation | `src/routes/_app.tsx`, `src/components/common/app-sidebar.tsx`                                                           | `src/components/ui/sheet.tsx`, `src/components/common/mobile-header.tsx` |
| Primitives UI         | `src/components/common/page-header.tsx`                                                                                  | `src/components/common/page-container.tsx`, `src/lib/responsive.ts`      |
| Pages                 | toutes `src/routes/_app/*.tsx` (~16), `src/routes/login.tsx`, `src/routes/definir-mot-de-passe.tsx`                      | —                                                                        |
| Composants denses     | `src/features/planning/components/planning-grille.tsx`, `src/components/common/documents-tab.tsx`, dialogs si nécessaire | —                                                                        |
| Doc / conventions     | `docs/conventions/ui.md`, `CLAUDE.md`, `.claude/skills/nouvelle-page/SKILL.md`                                           | éventuellement `docs/decisions/0005-responsive.md`                       |
