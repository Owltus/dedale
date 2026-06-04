# 0003 — Design system & conventions modulaires

- **Date** : 2026-06-04
- **Statut** : accepté

## Contexte

Garantir la cohérence visuelle et structurelle dans le temps, et permettre de créer une page
sans repartir de zéro — tout en gardant `CLAUDE.md` léger (chargé à chaque session). Recherche
web sourcée (shadcn/ui + Tailwind 4, modals, CVA, tokens ; mécanique Claude Code skills/docs).

## Décision

**Design system**

- **shadcn/ui** (composants copiés dans `src/components/ui`, possédés) sur **Tailwind 4**, base
  **neutre**, style classique « new-york ». Direction visuelle : minimaliste, moderne, maîtrisé.
- **Tokens sémantiques** dans `src/index.css` (`:root` clair + `.dark` sombre, `@theme inline`).
  Mode **clair + sombre** via `ThemeProvider` + `<ModeToggle />`. Jamais de couleur en dur.
- Variantes typées via **CVA** ; utilitaire `cn()` (clsx + tailwind-merge).
- **Règle des 4 états** sur chaque liste : `EmptyState` / `ErrorState` (dans `components/common`),
  Skeleton, données. Toasts via **Sonner**.
- **Modals : « simple d'abord »** — `Dialog` shadcn + state local + composant métier dédié.
  Gestionnaire global / pilotage URL repoussés tant que le volume ne le justifie pas.
- Setup fait **manuellement** (la CLI shadcn _latest_ a un bug d'alias `@/` sur ce projet) ; le
  code des composants reste le code canonique shadcn.

**Organisation des conventions (CLAUDE.md léger)**

- `CLAUDE.md` (~70 lignes) = noyau toujours actif + **table de renvoi**.
- Détails dans `docs/conventions/{architecture,donnees,ui,composants}.md`, lus **à la demande**
  (les imports `@fichier` de CLAUDE.md étant chargés en permanence, on les évite pour le détail).
- **Skill `/nouvelle-page`** (`.claude/skills/nouvelle-page/SKILL.md`) : scaffolde une page dans le moule.

## Conséquences

- Créer une page = lire la convention concernée + remplir un squelette connu.
- Structure cible **feature-based** (`src/features/<domaine>/`) ; les routes restent minces.
- Dépendances ajoutées : shadcn/Radix (dialog, label, slot), lucide-react, sonner, cva, clsx,
  tailwind-merge, tw-animate-css.
- Bundle principal > 500 ko (Supabase + TanStack) : code-splitting à envisager plus tard.
