# Plan — Modèles d'opération à parité avec les modèles d'équipement

## Contexte

L'onglet « Modèles d'opérations » de la Bibliothèque est aujourd'hui une **liste à plat**
(cartes `Card`, navigation à un seul niveau via `useBiblioDrill`, sans catégories), alors que
l'onglet « Modèles d'équipement » offre une **navigation par catégories** (cartes `ListRow`,
descente catégorie → modèle via `useBiblioTreeDrill`, `categorie_id NOT NULL`, copie
commun → site). Côté SQL, `modeles_operations` n'a **pas** de `categorie_id` : juste
`site_id` (commun/site), `nom`, `description`, `image_path`.

Objectif : rendre les modèles d'opération **identiques aux modèles d'équipement**, côté
**SQL** comme **interface** — pouvoir créer des catégories (à **un seul niveau**) et y ranger
ses modèles d'opération, avec copie commun → site. Le backend porte la règle, le front
présente. Le chantier réplique EXACTEMENT le pattern de l'infra équipement existante
(migrations 009/010/011 + triggers/RPC de `schema_complete.sql`).

Découverte clé de la reconnaissance : la couche est **déjà largement outillée**. La feature
`categories` est générique (un simple ajout de la valeur `'operation'` au scope suffit), les
composants partagés (`ListRow`, `useBiblioTreeDrill`, `ExporterVersSiteDialog`, `ScopeSelect`,
`TitleBreadcrumb`, `CategoryFormDialog`) sont réutilisables tels quels, et l'éditeur d'items
(`OperationItemsEditor`) reste la vue détail. Le gros du travail est **3 migrations SQL** +
la **réécriture du panneau** en miroir de l'équipement.

---

## Décisions tranchées

- **D1 — Parité stricte avec l'équipement (validé).** Catégories à **1 seul niveau**,
  `modeles_operations.categorie_id` **NOT NULL** (`ON DELETE RESTRICT`), backfill des modèles
  existants dans une catégorie de repli « Non classé (opérations) », trigger de cohérence de
  scope + site. Calque de `modeles_equipements`.
- **D2 — Copie commun → site (validé).** RPC `copier_modele_operation(p_source_modele_id,
  p_site_cible)` SECURITY DEFINER (copie le modèle + ses items + matérialise la catégorie de
  site via `copier_categorie_noeud`, repli « Non classé (opérations) »), bouton « Copier vers
  un site » (`ExporterVersSiteDialog`). Calque de `copier_modele_equipement`.
- **D3 — Nouveau scope `'operation'`** ajouté à l'ENUM `categorie_scope` : catégorie
  **racine-only** (1 niveau), comme `'equipement'`.
- **D4 — Réutilisation maximale.** Zéro nouveau composant de catégorie : on réutilise la
  feature `categories` (`CategoryFormDialog`, `useDeleteCategorie`, `categoriesQueries`) et les
  primitives partagées. La vue détail reste `OperationItemsEditor`.
- **D5 — Routing inchangé.** Le slug d'onglet reste `'gammes-types'` (URL
  `/bibliotheque/gammes-types/...`), libellé « Modèles d'opérations ». Le `useBiblioTreeDrill`
  est instancié avec ce slug.
- **D6 — Migrations appliquées par l'utilisateur.** Fichiers numérotés `014`+ dans
  `contexte/migrations/` ; `schema_complete.sql` synchronisé après chaque migration ; types
  régénérés via `npm run gen:types` une fois les migrations en prod.

---

## Angles à clarifier

- **A1 — Catégories `'mixte'` pour les opérations ?** Aujourd'hui `'mixte'` est partagé
  équipement ↔ gamme. L'équipement accepte une catégorie `'equipement'` OU `'mixte'`. **Défaut
  retenu : scope `'operation'` STRICT** (le trigger refuse `'gamme'`/`'equipement'`/`'mixte'`,
  le filtre front ne garde que `'operation'`) — aligné sur la doctrine de cloisonnement par
  famille de la refonte « Bibliothèque de templates ». Si tu veux la parité exacte avec
  l'équipement (accepter aussi `'mixte'`), on élargit le trigger + le filtre front d'une ligne.
- **A2 — `ALTER TYPE … ADD VALUE` non transactionnel (Postgres).** La valeur `'operation'`
  doit être ajoutée dans une migration **isolée** (014), exécutée et committée **avant** toute
  migration qui l'emploie (015+). Rollback impossible une fois l'ADD VALUE passé.
- **A3 — Divergence agents (tranchée).** L'agent UI proposait de nouvelles mutations
  `useCreate/Update/DeleteOperationCategory` ; l'agent données montre que la feature
  `categories` est générique → on **réutilise** `useDeleteCategorie` + `CategoryFormDialog`
  (comme le panneau équipement). Pas de mutations de catégorie dédiées aux opérations.

---

## Phases

| #   | Fichier                                                                  | Lot                                                                                                   | Dépend de | Effort | Livrable                                                                              | Critique |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- | ------ | ------------------------------------------------------------------------------------- | -------- |
| 1   | [1-fondations-sql-scope.md](./1-fondations-sql-scope.md)                 | Scope `'operation'` (enum) + garde-fous catégories racine-only + catégorie de repli                  | —         | M      | Migrations 014 + 015 : `categorie_scope` étendu, catégories `'operation'` 1 niveau     | ⚠        |
| 2   | [2-categorie-id-modeles-operations.md](./2-categorie-id-modeles-operations.md) | `modeles_operations.categorie_id` (colonne + backfill + NOT NULL + index + trigger + reclassement legacy) | 1         | L      | Migration 016 : chaque modèle d'opération rattaché à une catégorie, cohérence garantie | ⚠        |
| 3   | [3-rpc-copier-modele-operation.md](./3-rpc-copier-modele-operation.md)   | RPC `copier_modele_operation` (commun → site)                                                         | 2         | M      | Migration 017 : copie par valeur d'un modèle d'opération vers un site                  | ⚠        |
| 4   | [4-couche-donnees-front.md](./4-couche-donnees-front.md)                 | Types regénérés + queries/schemas/mutations opérations + scope Zod `'operation'`                      | 3         | M      | `categorie_id` câblé côté données, `useCopierModeleOperation`, scope front à jour       |          |
| 5   | [5-reecriture-panneau-ui.md](./5-reecriture-panneau-ui.md)              | Réécriture du panneau en miroir de l'équipement (catégories, `ListRow`, export, détail)               | 4         | L      | Onglet « Modèles d'opérations » navigable par catégories, à parité de l'équipement     |          |
| 6   | [6-recette-validation.md](./6-recette-validation.md)                     | Recette complète + typecheck/lint/build + contrôle rôles/périmètres                                   | 4, 5      | S      | Parcours bout-en-bout vert, parité confirmée                                           | ⚠        |

---

## Ordre d'exécution

Séquentiel, avec **point d'attente humain** entre le bloc SQL et le bloc front :

- **Bloc SQL (étapes 1 → 2 → 3)** : produit les migrations `014`-`017`. L'utilisateur les
  applique en prod (single-tenant, backend déployé), synchronise `schema_complete.sql`, puis
  lance `npm run gen:types`.
- **Bloc front (étapes 4 → 5)** : démarre une fois les types régénérés (sinon `categorie_id`
  et `copier_modele_operation` n'existent pas encore dans `database.types.ts`).
- **Recette (étape 6)** : après tout le reste.

---

## Architecture cible

```
BIBLIOTHÈQUE › onglet « Modèles d'opérations » (slug gammes-types, commun + site)
├─ Racine (depth 0)        → catégories scope 'operation' (1 niveau, ListRow)   ┐
│     CRUD via CategoryFormDialog (scope 'operation') + useDeleteCategorie       │ useBiblioTreeDrill
├─ Catégorie ouverte       → modèles d'opération de la catégorie (ListRow)       │ ('gammes-types', operationCats)
│     CRUD via GammeTypeFormDialog (+ categorie_id) ; « Copier vers un site »    ┘
└─ Modèle ouvert (feuille) → OperationItemsEditor (items du modèle, inchangé)

SQL  modeles_operations.categorie_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT
     trigger check_modele_operation_categorie  (scope 'operation' + cohérence site)
     RPC copier_modele_operation(p_source_modele_id, p_site_cible)  (calque copier_modele_equipement)
     categorie_scope += 'operation'  (catégorie racine-only, comme 'equipement')
```

---

## Fichiers impactés (résumé)

| Couche                | Fichiers modifiés                                                                                                                                                                                 | Fichiers nouveaux                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL / migrations      | `contexte/schema_complete.sql` (synchro)                                                                                                                                                          | `contexte/migrations/014_categorie_scope_operation.sql`, `015_categories_garde_fous_operation.sql`, `016_modeles_operations_categorie.sql`, `017_copier_modele_operation.sql`                     |
| Types                 | `src/lib/database.types.ts` (regénéré)                                                                                                                                                            | —                                                                                                                                                                                                |
| Données — opérations  | `src/features/modeles-operations/{queries,schemas,mutations}.ts`                                                                                                                                  | —                                                                                                                                                                                                |
| Données — catégories  | `src/features/categories/schemas.ts` (+ scope `'operation'`)                                                                                                                                      | —                                                                                                                                                                                                |
| Composants            | `src/features/modeles-operations/components/{gammes-types-panel,gamme-type-form-dialog}.tsx`                                                                                                       | — (réutilise `OperationItemsEditor`, `CategoryFormDialog`, primitives partagées)                                                                                                                 |
| **Total**             | **~8 modifiés**                                                                                                                                                                                   | **4 nouveaux (migrations)**                                                                                                                                                                      |
