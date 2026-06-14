# Étape 5 (transverse) — Fondations SQL

## Objectif

Faire valider par la **base** (et pas seulement le front) les règles du modèle, fidèlement à
la doctrine « le front présente, la base valide ». Issu de l'audit RLS + intégrité.

## Modèle strict (décision utilisateur)

```
Catégorie (niveau 1)  →  Sous-catégorie (niveau 2)  →  Gamme  →  Ordre de travail
```

- **Toute** gamme (template commune ET réelle de site) est rattachée à une **sous-catégorie**
  (catégorie de niveau 2, scope `gamme`). Jamais à une racine, jamais hors catégorie.
- Catégories de gamme = **exactement 2 niveaux**.
- Catégories d'équipement = **1 niveau** (pas de sous-catégorie).

## Résultat d'audit (acquis)

- **Inviolabilité du commun : déjà correcte sur 8 tables /10.** Seules 2 fuites, cause unique
  (`can_access_gamme()` rend le commun accessible) :
  - `gamme_modeles_technicien_all` (L9666-9674) — fuite forte.
  - `contrats_gammes_technicien_all` (L9572-9580) — fuite moindre.
- Pas de contrôle de scope sur `gammes.categorie_id` (le symétrique des checks équipement manque).
- `parent_id` libre pour le scope `equipement` (1 niveau non garanti).
- `categorie_id` NULLABLE sur `gammes` (L2768) et `modeles_equipements` (L1938, FK `ON DELETE SET NULL`).

## Lot de migrations (3 fichiers, non destructifs, `contexte/migrations/`)

### `001_inviolabilite_commun.sql` — Lot A (risque data : nul)

- Helper `public.can_access_gamme_site(uuid)` = `g.site_id IS NOT NULL AND has_site_access(g.site_id)`
  (STABLE, SECURITY DEFINER, `search_path=''`, GRANT + COMMENT comme `can_access_gamme`).
- `DROP`/`CREATE` des policies `gamme_modeles_technicien_all` et `contrats_gammes_technicien_all`
  en remplaçant `can_access_gamme(gamme_id)` par `can_access_gamme_site(gamme_id)`.
  → un technicien ne peut plus écrire sur une gamme **commune**.

### `002_categories_equipement_1_niveau.sql` — Lot C1 (risque data : faible)

- `CHECK (scope <> 'equipement' OR parent_id IS NULL)` sur `categories`.
- Extension de `check_categorie_parent_scope()` : refuse un enfant dont le parent est `scope='equipement'`.
- **Défensif** : avant le CHECK, `UPDATE categories SET parent_id = NULL WHERE scope='equipement' AND parent_id IS NOT NULL`
  (aplatit d'éventuelles sous-catégories d'équipement existantes — à blanc si aucune).

### `003_gammes_arborescence_stricte.sql` — Lots B + C2 + C3 (risque data : contrôlé, backfill)

- **Trigger `check_gamme_categorie()`** (calque de `check_modele_equipement_categorie`, L2045-2093),
  `BEFORE INSERT OR UPDATE OF categorie_id, site_id ON gammes` :
  - catégorie de scope `equipement` **interdite** ;
  - catégorie doit être une **sous-catégorie** (`parent_id IS NOT NULL`) ;
  - cohérence de site (gamme entreprise → catégorie entreprise ; gamme site → entreprise ou même site).
- **2 niveaux pour les gammes** : dans `check_categorie_parent_scope()`, refuser qu'une catégorie
  `scope='gamme'` ait un parent lui-même enfant (profondeur > 2).
- **Backfill** : créer (si absentes) une catégorie commune « Non classé » (scope `gamme`, racine)
  - sa sous-catégorie « Non classé » ; `UPDATE gammes SET categorie_id = <sous-cat> WHERE
categorie_id IS NULL OR categorie_id pointe une catégorie non conforme`.
- `ALTER TABLE gammes ALTER COLUMN categorie_id SET NOT NULL`.

### `004_modeles_equipements_categorie_obligatoire.sql` — Lot C4 (risque data : contrôlé, backfill)

- FK `categorie_id` : `DROP` `ON DELETE SET NULL` → `RECREATE` `ON DELETE RESTRICT`.
- **Backfill** : catégorie commune « Non classé » (scope `equipement`, racine) ; assigner les
  `modeles_equipements` orphelins. `ALTER ... SET NOT NULL`.
- Compléter le garde-fou de purge des catégories (bloc L10163-10171) : ajouter `NOT EXISTS modeles_equipements`.

> Chaque fichier : en-tête (date, but, module `schema_complete.sql` touché, rappel `gen:types`),
> `BEGIN; … COMMIT;`. Et **MAJ de `schema_complete.sql`** au même moment (module concerné).

## Alignement FRONT induit (après application des migrations)

- **Étape 1 (gammes-biblio-panel)** : borner l'arborescence à **2 niveaux** (catégorie →
  sous-catégorie → gammes) ; une gamme ne se crée que dans une **sous-catégorie**.
- **Gammes réelles** (`routes/_app/gammes.tsx` + `gamme-form-dialog`) : **ajouter le champ
  sous-catégorie** (obligatoire) au formulaire ; `gammePayload` pose `categorie_id`.
- Régénérer les types (`npm run gen:types`) après application.

## Critère de validation

- Les 3 (ou 4) migrations s'appliquent sans erreur sur la base déployée.
- Un technicien ne peut plus écrire `gamme_modeles` / `contrats_gammes` d'une gamme commune (test RLS).
- Impossible de créer une sous-catégorie d'équipement ; impossible d'attacher une gamme à une racine
  ou à une catégorie d'équipement.
- `schema_complete.sql` reflète l'état final ; `npm run gen:types` puis front vert.
