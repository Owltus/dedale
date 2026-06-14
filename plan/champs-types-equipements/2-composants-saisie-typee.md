# Étape 2 — Composants de saisie et de lecture typés

## Objectif

Fournir les deux briques réutilisables manipulées partout : `ChampValeurInput` (un widget de saisie qui s'adapte au type) et `formatChampValeur` (formatage à la lecture). Plus les champs de base manquants.

## Contexte

Le projet a déjà `TextField`, `SelectField`, `TextareaField` (signature commune `{ label, value, onChange, error?, required? }`, `useId()`). Il manque `NumberField` et `CheckboxField`. `ChampValeurInput` s'appuie dessus pour ne pas dupliquer la logique de rendu par type (règle des 3+ fichiers).

## Fichier(s) impacté(s)

- `src/components/common/number-field.tsx` (nouveau)
- `src/components/common/checkbox-field.tsx` (nouveau, si absent)
- `src/components/common/champ-valeur-input.tsx` (nouveau)
- `src/lib/champs.ts` (modifié — ajout de `formatChampValeur`)

## Travail à réaliser

### 1. `NumberField` et `CheckboxField`

Calqués sur `text-field.tsx` (même signature, `useId()`, `aria-invalid`, `cn()`). `NumberField` : `<input type="number" step="any">`, `value: number | ''`, `onChange(number | null)`, prop `unite?` affichée en suffixe.

### 2. `ChampValeurInput`

```tsx
interface ChampValeurInputProps {
  champ: ChampDefinition // type, unite, options, requis...
  value: ChampValeur
  onChange: (v: ChampValeur) => void
  error?: string
}
// switch sur champ.type :
//  texte   -> TextField
//  nombre  -> NumberField (unite = champ.unite)
//  date    -> TextField type="date"
//  oui-non -> CheckboxField
//  liste   -> SelectField peuplé par champ.options
```

Le label affiché = `champ.cle` (+ `*` si `champ.requis`).

### 3. `formatChampValeur` (lecture) dans `lib/champs.ts`

```ts
export function formatChampValeur(
  champ: ChampDefinition,
  valeur: ChampValeur,
): string {
  if (valeur === null || valeur === '') return '—'
  if (champ.type === 'oui-non') return valeur ? 'Oui' : 'Non'
  if (champ.type === 'date') return formatDate(String(valeur)) ?? '—'
  if (champ.type === 'nombre')
    return champ.unite ? `${valeur} ${champ.unite}` : String(valeur)
  return String(valeur) // texte, liste
}
```

Réutiliser le `formatDate` existant du projet (ne pas en réécrire un).

## Ordre d'exécution

1. `NumberField`, `CheckboxField`.
2. `ChampValeurInput`.
3. `formatChampValeur`.

## Critère de validation

- `npm run typecheck` + `npm run lint` verts.
- Les composants suivent la signature commune des `*-field` existants.
