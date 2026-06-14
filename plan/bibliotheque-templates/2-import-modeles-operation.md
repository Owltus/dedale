# Étape 2 — Import d'un modèle d'opération dans une gamme

## Objectif

Brancher la liaison **`gamme_modeles`** (aujourd'hui jamais touchée côté front) : depuis le
détail d'une gamme (template ou réelle), pouvoir **importer un ou plusieurs modèles
d'opération** (catalogue « Modèles d'opération »), les afficher, et les détacher. C'est le
pont manquant entre le catalogue de briques réutilisables et les gammes.

## Contexte (acquis)

- `gamme_modeles` (N-N) : `gamme_id` (CASCADE), `modele_operation_id` (**RESTRICT**),
  PK composite. Un modèle d'opération peut être lié à **plusieurs** gammes (réutilisable).
- La génération d'OT (`generate_operations_execution`) lit déjà `operations` (spécifiques) +
  `modeles_operations_items` via `gamme_modeles` → l'import a un **vrai effet métier**.
- Côté front, `gamme_modeles` n'est **jamais** requêté/écrit (seulement typé dans
  `database.types.ts`). Tout est à créer.

## Fichier(s) impacté(s)

- **NOUVEAU** `src/features/gammes/queries.ts` — query des modèles d'opération liés à une gamme (jointure `gamme_modeles → modeles_operations`).
- **NOUVEAU** mutations `useLierModeleOperation` / `useDelierModeleOperation` (INSERT/DELETE `gamme_modeles`).
- **NOUVEAU** `src/features/gammes/components/import-modele-operation-dialog.tsx` — sélecteur multi des modèles d'opération disponibles (commun + site), filtré sur ceux non déjà liés.
- `src/routes/_app/gammes.tsx` (onglet « Opérations » de la gamme) **et** le détail de la gamme-template (étape 1) — ajouter la section « Modèles d'opération liés » + bouton « Importer ».
- _(Backend, à confirmer)_ RLS `gamme_modeles` pour INSERT/DELETE par manager/technicien sur leur scope — voir Angle A2.

## Travail à réaliser

### 1. Lecture des liens

Query : pour une `gamme_id`, lister les `modeles_operations` liés (via `gamme_modeles`), avec
leur origine (commun/site) et le nombre d'items.

### 2. Section « Modèles d'opération liés »

Dans le détail d'une gamme (réelle ET template), à côté des opérations spécifiques : afficher
les modèles liés (carte/liste), avec action **Détacher** (DELETE `gamme_modeles`).

### 3. Dialog d'import

Bouton « Importer un modèle d'opération » → liste des modèles d'opération **accessibles** non
encore liés (multi-sélection) → INSERT des lignes `gamme_modeles`. Respecter le périmètre
(une gamme de site peut lier un modèle commun OU de son site).

### 4. Vérifier la RLS (Angle A2)

Tester un INSERT/DELETE `gamme_modeles` en manager et en technicien sur leur scope. Si refus
`42501` injustifié → policy à ajouter côté backend (livré comme note SQL séparée à l'utilisateur).

## Ordre d'exécution

1. Query liens. 2. Mutations lier/délier. 3. Dialog d'import. 4. Section dans le détail gamme
   (réelle + template). 5. Test RLS.

## Critère de validation

- Depuis une gamme : importer 2 modèles d'opération, les voir listés, en détacher 1.
- La réutilisation est effective : le même modèle reste liable à une autre gamme.
- `npm run typecheck` · `lint` · `build` verts.

## Contrôle (étape critique — touche une liaison + RLS potentielle)

- Confirmer qu'un **double import** du même modèle est empêché proprement (PK composite → géré
  côté front en filtrant les déjà-liés ; l'erreur 23505 ne doit pas remonter brute).
- Vérifier que **détacher** un modèle ne supprime jamais le modèle lui-même (juste la ligne de
  liaison) — la FK est RESTRICT côté modèle, CASCADE côté gamme.
