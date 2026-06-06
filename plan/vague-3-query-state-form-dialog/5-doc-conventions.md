# Étape 5 — Documentation des patterns

## Objectif

Documenter les deux nouveaux patterns réutilisables pour qu'ils soient adoptés
par défaut sur les futurs écrans, conformément à la doctrine « un seul endroit à
maintenir ».

## Fichier(s) impacté(s)

- `docs/conventions/composants.md`

## Travail à réaliser

### 1. Ajouter une section « États & dialogs factorisés »

Documenter brièvement (style du fichier existant) :

- **`QueryState`** : implémentation de la règle des 4 états. Exemple d'usage
  (render-prop + `pending={<CardSkeletons/>}` + `empty={<EmptyState/>}`). Préciser
  que le conteneur/grille et le « aucun résultat de recherche » restent côté
  appelant. Renvoyer à la règle des 4 états de `ui.md`.
- **`CardSkeletons`** : squelettes de liste (`count`/`height`/`container`).
- **`FormDialog`** : coquille des dialogs de formulaire. Exemple (props
  `title`/`onSubmit`/`submitLabel`/`pending` + champs en children). Préciser que
  l'état, la validation Zod et le reset restent chez l'appelant.

Vérifier la cohérence avec la « règle des 4 états » de `docs/conventions/ui.md`
(ne pas dupliquer la règle, y renvoyer).

## Critère de validation

- La doc reflète les API réellement livrées (étapes 1 et 3).
- Pas de contradiction avec `ui.md` / `CLAUDE.md`.
