# Plan — Champs typés des équipements (sur JSONB, sans EAV)

## Contexte

Aujourd'hui les caractéristiques techniques d'un modèle d'équipement sont des paires clé/valeur libres (tout en texte) stockées dans la colonne JSONB `specifications`. L'objectif est d'introduire des **champs typés** — texte, nombre, date, oui-non, liste — avec un widget de saisie adapté à chaque type et un formatage à la lecture, comme décrit dans la note de conception « Champs typés des équipements ».

Cette note décrivait une implémentation EAV (tables `champs_modele` + `valeurs_equipements`) issue de l'ancienne app SQLite/Tauri. Ce modèle a été **volontairement supprimé** lors de la migration vers Supabase au profit du JSONB `specifications` (cf. `schema_complete.sql` l.6128). On reste donc sur le JSONB : on ne réintroduit pas l'EAV.

Contrainte forte validée par la reconnaissance : **aucun changement SQL n'est nécessaire**. La colonne `specifications` (JSONB libre, CHECK object + anti-pollution + taille < 10 ko) et la fonction `instancier_equipement` (qui copie les specs du modèle vers l'équipement, snapshot) acceptent déjà une structure typée.

## Décisions (tranchées)

- **D1 — Zéro SQL.** On structure le contenu du JSONB ; la colonne, le CHECK et `instancier_equipement` restent inchangés.
- **D2 — Pas d'EAV.** La table `champs_modele` reste supprimée.
- **D3 — Structure JSON.** `specifications = { "champs": [ { cle, type, unite?, options?, requis, defaut, valeur? } ] }`. Le **modèle** porte les définitions (avec `defaut`) ; l'**équipement** en garde un snapshot et remplit `valeur` par champ.
- **D4 — 5 types.** `texte` → string · `nombre` → number · `date` → string ISO `YYYY-MM-DD` · `oui-non` → boolean · `liste` → string choisie parmi `options`.
- **D5 — Composants partagés.** Un `ChampValeurInput` (type → widget de saisie) et un util `formatChampValeur` (lecture), conformes à la règle « pattern dans 3+ fichiers → extraire ».
- **D6 — Validation Zod** au submit (`champDefinitionSchema`) ; le CHECK 10 ko reste le garde-fou final.
- **D7 — Compat legacy.** Les anciens specs plats `{ cle: valeur }` sont lus comme des champs `texte`, sans migration forcée.

## Angles tranchés

- **A1 — Snapshot.** L'équipement copie définitions + valeurs, indépendant du modèle (0 SQL, aligné sur l'instanciation actuelle).
- **A2 — Périmètre complet.** Étapes 1 à 6 (modèles + équipements).
- **A3 — Requis bloquant.** Un champ requis vide empêche l'enregistrement de l'équipement (Zod, cf. étape 5).
- **A4 — Type verrouillé.** Le type d'un champ existant ne se modifie plus ; pour changer, supprimer puis recréer (cf. étape 3).

## Phases

| #   | Fichier                                                            | Phase                                               | Dépend de     | Priorité | Effort | Livrable                                | Critique |
| --- | ------------------------------------------------------------------ | --------------------------------------------------- | ------------- | -------- | ------ | --------------------------------------- | -------- |
| 1   | [1-fondations-types-zod.md](./1-fondations-types-zod.md)           | Fondations (types, Zod, sérialisation)              | —             | P0       | S      | Schéma typé + helpers serialize/parse   |          |
| 2   | [2-composants-saisie-typee.md](./2-composants-saisie-typee.md)     | Composants `ChampValeurInput` + `formatChampValeur` | 1             | P0       | M      | Widgets par type + formateur lecture    |          |
| 3   | [3-definition-champs-modele.md](./3-definition-champs-modele.md)   | Définition des champs sur le modèle                 | 2             | P0       | M      | Éditeur typé câblé au form modèle       |          |
| 4   | [4-lecture-caracteristiques.md](./4-lecture-caracteristiques.md)   | Lecture typée des caractéristiques                  | 2             | P1       | S      | Affichage formaté par type              |          |
| 5   | [5-saisie-valeurs-equipement.md](./5-saisie-valeurs-equipement.md) | Saisie des valeurs sur l'équipement                 | 2, 3          | P1       | L      | Édition des specs d'équipement          |          |
| 6   | [6-compat-legacy-validation.md](./6-compat-legacy-validation.md)   | Compat legacy + validation globale                  | 1, 2, 3, 4, 5 | P1       | S      | Anciens specs lus en texte + build vert | ⚠        |

## Ordre d'exécution (sprints)

- **Sprint A — Fondations** : étapes 1 puis 2 (débloquent tout le reste).
- **Sprint B — Côté modèle** : étape 3. Point d'arrêt naturel si « modèles d'abord » (A2).
- **Sprint C — Côté équipement** : étapes 4 et 5.
- **Sprint D — Clôture** : étape 6 (critique, validation globale).

## Architecture cible

```jsonc
// specifications (modèle ET équipement) — JSONB, 0 SQL
{
  "champs": [
    {
      "cle": "Puissance",
      "type": "nombre",
      "unite": "kW",
      "requis": true,
      "defaut": 0,
      "valeur": 42.5,
    },
    {
      "cle": "Installé le",
      "type": "date",
      "requis": false,
      "defaut": null,
      "valeur": "2024-03-15",
    },
    {
      "cle": "État",
      "type": "liste",
      "options": ["Marche", "Arrêt", "Maintenance"],
      "valeur": "Marche",
    },
  ],
}
// modèle : `defaut` rempli, `valeur` absente · équipement : snapshot + `valeur` saisie
```

```
ChampValeurInput(type)              formatChampValeur(champ)
  texte    → TextField                texte  → la chaîne
  nombre   → NumberField (+ unité)    nombre → valeur + unité
  date     → input date               date   → formatDate(valeur)
  oui-non  → CheckboxField            oui-non→ Oui / Non
  liste    → SelectField(options)     liste  → la chaîne
```

## Fichiers impactés (résumé)

| Couche                 | Fichiers modifiés                                                                                                    | Fichiers nouveaux                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Données / types        | `features/modeles-equipements/schemas.ts`, `.../mutations.ts`, `features/equipements/schemas.ts`, `.../mutations.ts` | `lib/champs.ts` (types + serialize/parse + format)                               |
| Composants partagés    | `components/common/checkbox-field.tsx` (si absent)                                                                   | `components/common/champ-valeur-input.tsx`, `components/common/number-field.tsx` |
| Modèles (Bibliothèque) | `.../components/specifications-editor.tsx`, `.../components/modele-equipement-form-dialog.tsx`                       | —                                                                                |
| Équipements            | `routes/_app/equipements.tsx`, `features/equipements/components/equipement-form-dialog.tsx`                          | —                                                                                |
| **Total**              | **~10 modifiés**                                                                                                     | **3 nouveaux**                                                                   |
