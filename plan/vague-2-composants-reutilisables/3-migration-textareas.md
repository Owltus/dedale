# Étape 3 — Migration des `<textarea>`

## Objectif

Remplacer les 8 `<textarea>` natifs par le wrapper `TextareaField` (ou la
primitive `Textarea` si sans label), corriger au passage le conflit de classes
`h-9 h-auto` de `chantier-form-dialog`, et préserver le comportement (validation,
`rows`, champs requis/optionnels).

## Fichier(s) impacté(s)

- `src/features/observations/components/observation-lever-dialog.tsx` (commentaire, rows 3)
- `src/features/ordres-travail/components/motif-dialog.tsx` (motif requis, rows 4)
- `src/features/demandes/components/di-resolve-dialog.tsx` (résolution requise, rows 4)
- `src/features/demandes/components/di-form-dialog.tsx` (constat requis, rows 4)
- `src/features/chantiers/components/cloture-dialog.tsx` (compte-rendu requis, rows 5)
- `src/features/chantiers/components/chantier-form-dialog.tsx` (description, rows 3 — corriger `h-9 h-auto`)
- `src/features/gammes/components/gamme-form-dialog.tsx` (description, rows 3)
- `src/features/gammes/components/operation-form-dialog.tsx` (description, rows 2)

## Travail à réaliser

### 1. Remplacement standard

```tsx
<TextareaField
  label="Compte-rendu"
  required
  rows={5}
  value={values.compte_rendu}
  onChange={(v) => setValues((s) => ({ ...s, compte_rendu: v }))}
  error={errors.compte_rendu}
/>
```

Conserver le `rows` d'origine de chaque champ (3, 4, 5, 2…).

### 2. Cas `chantier-form-dialog`

Le textarea réutilisait `selectClass + ' h-auto py-2'` → conflit `h-9 h-auto`.
Le remplacer par `TextareaField` règle le problème (plus de `h-9`).

### 3. Champs optionnels vs requis

`gamme`/`operation`/`chantier` descriptions sont optionnels (pas d'`error`
attendu) ; `TextareaField` gère l'absence d'`error` proprement (pas
d'`aria-invalid`). Les requis passent `error={errors.x}`.

## Critère de validation

- `npx tsc -b`, `npx eslint .`, `npx vite build` passent.
- Plus aucun `<textarea>` natif dans le code (vérifier par recherche).
- Plus de conflit `h-9 h-auto`.
- `rows` et caractère requis/optionnel préservés ; validations Zod inchangées.
