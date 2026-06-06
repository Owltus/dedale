# Étape 2 — Migration des `<select>`

## Objectif

Remplacer les 32 `<select>` natifs (5 variantes de classes divergentes) par la
primitive `Select` ou le wrapper `SelectField`, en préservant strictement chaque
comportement (validation, cascades, actions au change, états désactivés).

## Contexte

Deux cas d'usage :

- **Dans un formulaire** (label + champ + erreur) → `SelectField`.
- **Inline / sans label** (sélecteur de site, filtres, édition en ligne) →
  primitive `Select` seule (avec `className` ponctuel si besoin).

Les constantes locales `SELECT_CLASS` / `selectClass` / `selectClasses` doivent
disparaître.

## Fichier(s) impacté(s)

Dialogs de formulaire (→ `SelectField`) :

- `src/features/utilisateurs/components/invite-user-dialog.tsx` (rôle)
- `src/features/observations/components/observation-form-dialog.tsx` (source, gravité, OT conditionnel)
- `src/features/gammes/components/gamme-form-dialog.tsx` (nature, périodicité, prestataire)
- `src/features/gammes/components/operation-form-dialog.tsx` (type, unité)
- `src/features/equipements/components/equipement-form-dialog.tsx` (catégorie, local)
- `src/features/equipements/components/instancier-dialog.tsx` (local)
- `src/features/demandes/components/di-form-dialog.tsx` (modèle cascade, local, équipement, prestataire)
- `src/features/investissements/components/investissement-form-dialog.tsx` (statut)
- `src/features/documents/components/upload-document-dialog.tsx` (type)
- `src/features/prestataires/components/contrat-form-dialog.tsx` (type contrat)
- `src/features/localisations/components/local-form-dialog.tsx` (type local)
- `src/features/ordres-travail/components/ot-create-dialog.tsx` (gamme)
- `src/features/chantiers/components/chantier-form-dialog.tsx` (prestataire)

Inline (→ primitive `Select`) :

- `src/components/common/site-switcher.tsx` (mode étendu, onChange immédiat)
- `src/routes/_app/registre.tsx` (filtres statut + source)
- `src/features/ordres-travail/components/operation-row.tsx` (statut, `disabled`)
- `src/features/utilisateurs/components/utilisateur-detail.tsx` (rôle + ajout de
  site `value="" + pl-8 + icône Plus` ; supprimer `SELECT_CLASS`)

## Travail à réaliser

### 1. Cas formulaire standard

Remplacer le bloc `div.grid > Label + select + error` par `<SelectField>` :

```tsx
<SelectField
  label="Nature"
  required
  value={values.nature}
  onChange={(v) => setValues((s) => ({ ...s, nature: v }))}
  error={errors.nature}
>
  <option value="">Choisir…</option>
  {options.map((o) => (
    <option key={o.id} value={o.id}>
      {o.nom}
    </option>
  ))}
</SelectField>
```

### 2. Cas inline / sans label

Utiliser la primitive `Select` directement, en conservant le comportement :

- `site-switcher` : `onChange` déclenche `setActiveSiteId` immédiatement — garder.
- `operation-row` : conserver `disabled={readOnly}`.
- `registre` filtres : `Select` simple, pas d'`aria-invalid`.
- `utilisateur-detail` ajout de site : conserver `value=""`, le reset, l'action
  `handleAdd`, l'icône `Plus` en overlay et la classe `pl-8` (passée en
  `className` à `Select`).

### 3. Cascades et conditions à préserver

- `di-form-dialog` : le select « modèle » pré-remplit d'autres champs au change.
- `observation-form-dialog` : le select « OT » n'apparaît que si
  `source === 'controle_reglementaire'`.

### 4. Nettoyage

Supprimer toutes les constantes `SELECT_CLASS` / `selectClass(es)` locales
devenues inutiles.

## Critère de validation

- `npx tsc -b`, `npx eslint .`, `npx vite build` passent.
- Plus aucun `<select>` natif ni constante `*SELECT_CLASS*` dans le code
  (vérifier par recherche).
- Comportements préservés : validation Zod (mêmes messages), cascade modèle DI,
  OT conditionnel, switch de site immédiat, statut d'opération désactivé en
  lecture seule, ajout de site avec reset.
- Aucune régression visuelle notable (hauteur/focus identiques à `Input`).
