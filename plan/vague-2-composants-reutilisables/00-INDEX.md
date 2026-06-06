# Plan — Vague 2 : composants de champ réutilisables & helpers partagés

## Contexte

L'audit DRY a montré que les mêmes briques sont recopiées partout, avec des
variantes silencieuses qui dérivent : **32 `<select>` natifs** (5 variantes de
classes : px-2 vs px-3, avec/sans `shadow-xs`, avec/sans `aria-invalid`), **8
`<textarea>` natifs** (4 variantes, dont un conflit `h-9 h-auto` dans
`chantier-form-dialog`), la **garde « Sélectionnez un site »** recopiée sur **13
pages**, et les **permissions par rôle écrites en dur** dans ~12 écrans (avec un
nommage hétérogène `canManage`/`canEdit`).

Objectif : extraire des primitives et helpers réutilisables — un seul endroit à
maintenir — et migrer les usages **sans changer le comportement** (mêmes rendus,
mêmes validations Zod, mêmes droits). On s'aligne sur l'existant shadcn
(`Input`, `Label`, `TextField`) pour rester cohérent.

Contraintes : tokens sémantiques uniquement ; TS strict ; ESLint strict +
Prettier (ne pas trier les classes à la main) ; tout en français ; « le front
présente, la base valide » (on ne duplique pas la sécurité RLS, on ne fait que
refléter le rôle).

---

## Décisions (tranchées)

- **Style canonique des champs** : on aligne `Select`/`Textarea` sur la primitive
  `Input` existante → `px-3`, `shadow-xs`, `aria-invalid:ring-destructive/20
aria-invalid:border-destructive`, `focus-visible:ring-[3px]`. Les variantes
  px-2 / sans shadow étaient des dérives non intentionnelles : on unifie.
- **Approche** : primitives dans `src/components/ui/` (`Select`, `Textarea`,
  exportant aussi des sous-éléments si utile) + wrappers `src/components/common/`
  (`SelectField`, `TextareaField`) calqués sur `TextField` (label + champ +
  message d'erreur). Pas de simple classe partagée.
- **Selects natifs conservés** (pas custom Radix) : on garde `<select>` natif
  (léger, accessible, déjà en place) ; on ne fait que centraliser le style et le
  wrapper.
- **Permissions** : module `src/lib/permissions.ts` de **fonctions pures**
  (`canManageMetier`, `canManageAdmin`, `isAdmin`, `canCreateDemande`,
  `canResolveDemande`, `canEditUser`) + un hook fin `usePermissions()` qui lit
  `useCurrentRole()` et expose ces booléens. Les fonctions pures restent
  testables et utilisables hors hook.
- **`NoSiteSelected`** : composant de page (`PageContainer` + `PageHeader` +
  `EmptyState`) paramétré par `title`/`description`/`icon`. Le cas
  `documents-tab` (EmptyState seul, dans une fiche) garde sa garde locale (autre
  contexte) — hors périmètre.

## Angles à clarifier

- **Padding des champs** : la décision ci-dessus retient `px-3` (cohérent avec
  `Input`). À confirmer : OK pour passer les ~14 selects actuellement en `px-2`
  à `px-3` (léger élargissement visuel, homogène) ?
- **Hauteur des textareas** : unifier sur `min-h-16` + `rows` paramétrable
  (défaut 4) ? Les deux DI étaient en `min-h-20` ; les autres en `rows` seul.
- **Permissions — granularité** : valider les 6 fonctions proposées et leurs noms
  (notamment renommer les `canEdit` métier en `canManageMetier` pour lever
  l'ambiguïté avec le `canEdit` hiérarchique de `utilisateur-detail`).

---

## Phases

| #   | Fichier                                                | Phase                          | Dépend de | Priorité | Effort | Livrable                                                                                   | Critique |
| --- | ------------------------------------------------------ | ------------------------------ | --------- | -------- | ------ | ------------------------------------------------------------------------------------------ | -------- |
| 1   | [1-primitives-champs.md](./1-primitives-champs.md)     | Primitives & wrappers de champ | —         | P0       | M      | `ui/select.tsx`, `ui/textarea.tsx`, `common/select-field.tsx`, `common/textarea-field.tsx` |          |
| 2   | [2-migration-selects.md](./2-migration-selects.md)     | Migration des `<select>`       | 1         | P1       | L      | 32 selects migrés vers `Select`/`SelectField`                                              | ⚠        |
| 3   | [3-migration-textareas.md](./3-migration-textareas.md) | Migration des `<textarea>`     | 1         | P1       | M      | 8 textareas migrés (+ fix conflit `h-9 h-auto`)                                            |          |
| 4   | [4-no-site-selected.md](./4-no-site-selected.md)       | Garde « site » factorisée      | —         | P1       | M      | `common/no-site-selected.tsx` + 12 pages migrées                                           | ⚠        |
| 5   | [5-permissions.md](./5-permissions.md)                 | Permissions centralisées       | —         | P1       | M      | `lib/permissions.ts` + `usePermissions()` + ~12 écrans migrés                              | ⚠        |
| 6   | [6-validation-globale.md](./6-validation-globale.md)   | Validation & revue             | toutes    | P0       | M      | tsc/lint/build verts, revue `/code-review`, commits par étape                              | ⚠        |

---

## Ordre d'exécution (sprints)

- **Sprint A — Socle** : étape 1 (primitives + wrappers), prérequis des migrations
  de champ.
- **Sprint B — Migrations** : étapes 2, 3, 4, 5 (indépendantes entre elles une fois
  le socle posé ; 4 et 5 ne dépendent même pas de l'étape 1). Commit par étape.
- **Sprint C — Recette** : étape 6 (validation aux écrans clés + audit).

---

## Architecture cible

```
src/components/ui/
  select.tsx      <- <select> natif stylé (canonique, aligné Input)
  textarea.tsx    <- <textarea> natif stylé (min-h, resize-none)
src/components/common/
  select-field.tsx    <- Label + Select + erreur (modèle TextField)
  textarea-field.tsx  <- Label + Textarea + erreur
  no-site-selected.tsx<- PageContainer + PageHeader + EmptyState (title/desc/icon)
src/lib/
  permissions.ts  <- fonctions pures de droits par rôle
src/hooks/
  use-permissions.ts  <- usePermissions() = useCurrentRole() + permissions
```

---

## Fichiers impactés (résumé)

| Couche      | Fichiers modifiés                                                          | Fichiers nouveaux                                                                          |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Primitives  | —                                                                          | `ui/select.tsx`, `ui/textarea.tsx`, `common/select-field.tsx`, `common/textarea-field.tsx` |
| Champs      | ~20 dialogs/écrans contenant `<select>` ; 8 dialogs contenant `<textarea>` | —                                                                                          |
| Garde site  | 12 routes `_app/*.tsx`                                                     | `common/no-site-selected.tsx`                                                              |
| Permissions | ~12 écrans (`routes/_app/*`, `documents-tab`, `utilisateur-detail`)        | `lib/permissions.ts`, `hooks/use-permissions.ts`                                           |
