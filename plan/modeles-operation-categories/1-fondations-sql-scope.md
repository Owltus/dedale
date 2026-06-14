# Étape 1 — Scope `'operation'` + garde-fous catégories racine-only

## Objectif

Introduire le scope `'operation'` dans l'ENUM `categorie_scope` et étendre les garde-fous des
catégories pour qu'une catégorie `'operation'` soit **racine-only** (1 seul niveau, comme
`'equipement'`). Créer la catégorie de repli « Non classé (opérations) » au commun, qui servira
de cible au backfill (étape 2) et de secours à la copie (étape 3).

## Contexte

- ENUM actuel (`schema_complete.sql` l.365-369) : `'equipement'`, `'gamme'`, `'mixte'`.
- `ALTER TYPE … ADD VALUE` n'est **pas transactionnel** (Postgres) → migration **isolée** 014,
  appliquée et committée avant tout usage (015+).
- Garde-fous « 1 niveau » à étendre :
  - CHECK `chk_equipement_categorie_racine` (l.1494) : `scope <> 'equipement' OR parent_id IS NULL`.
  - Fonction `check_categorie_parent_scope()` (l.1567-1681) — SECURITY DEFINER : verrou
    « scope 1 niveau » aux l.1587 et l.1628 (cherche `'equipement'`).
- L'index d'unicité `uq_categories_nom` inclut déjà `scope` (migration 011) → couvre
  `'operation'` automatiquement, aucune action.
- RLS `categories` scope-agnostique (l.8132-8182) → couvre `'operation'`, aucune action.

## Fichier(s) impacté(s)

- **NOUVEAU** `contexte/migrations/014_categorie_scope_operation.sql`
- **NOUVEAU** `contexte/migrations/015_categories_garde_fous_operation.sql`
- `contexte/schema_complete.sql` — synchronisation après application

## Travail à réaliser

### 1. Migration 014 — ENUM (isolée)

```sql
-- 014_categorie_scope_operation.sql
-- ATTENTION : ALTER TYPE ... ADD VALUE n'est PAS transactionnel. Migration isolée,
-- appliquée et committée AVANT 015. Idempotence via IF NOT EXISTS (PG 12+).
ALTER TYPE public.categorie_scope ADD VALUE IF NOT EXISTS 'operation' BEFORE 'mixte';
```

### 2. Migration 015 — garde-fous racine-only + catégorie de repli

```sql
-- 015_categories_garde_fous_operation.sql  (transactionnelle)

-- a) CHECK racine-only étendu à 'operation'
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS chk_equipement_categorie_racine;
ALTER TABLE public.categories
  ADD CONSTRAINT chk_equipement_categorie_racine
  CHECK (scope NOT IN ('equipement', 'operation') OR parent_id IS NULL);

-- b) check_categorie_parent_scope() : 'operation' traité comme 'equipement' (1 niveau)
--    Reprendre le corps EXACT de schema_complete.sql l.1567-1681 et remplacer :
--      l.1587  IF NEW.scope = 'equipement'        -> IF NEW.scope IN ('equipement','operation')
--      l.1628  IF p_scope = 'equipement'          -> IF p_scope IN ('equipement','operation')
--    (mettre à jour les messages d'exception en conséquence).
CREATE OR REPLACE FUNCTION public.check_categorie_parent_scope() ...;

-- c) Catégorie de repli « Non classé (opérations) » : racine commune, scope 'operation'
INSERT INTO public.categories (id, site_id, parent_id, nom, scope, ordre, est_actif)
SELECT gen_random_uuid(), NULL, NULL, 'Non classé (opérations)', 'operation', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
   WHERE site_id IS NULL AND parent_id IS NULL AND scope = 'operation'
     AND lower(nom) = 'non classé (opérations)' AND deleted_at IS NULL
);
```

> Note A1 : si l'utilisateur tranche pour accepter aussi `'mixte'` sur les opérations, ce choix
> ne change PAS l'étape 1 (la racine-only et le repli restent). Il n'impacte que le trigger de
> cohérence (étape 2) et le filtre front (étape 4/5).

### 3. Synchroniser `schema_complete.sql`

Reporter l'ajout de la valeur d'enum, la nouvelle CHECK et le corps mis à jour de
`check_categorie_parent_scope()` dans la source de vérité.

## Ordre d'exécution

1. Écrire 014, l'appliquer en prod, committer.
2. Écrire 015, l'appliquer en prod.
3. Synchroniser `schema_complete.sql`.

## Critère de validation

- `SELECT enum_range(NULL::categorie_scope);` contient `operation`.
- Créer une catégorie `scope='operation'` racine → OK ; tenter une sous-catégorie
  (`parent_id` renseigné) `scope='operation'` → refus `check_violation`.
- La catégorie « Non classé (opérations) » existe (commun, racine, scope `operation`).
- Les catégories `'equipement'`/`'gamme'`/`'mixte'` existantes restent inchangées.

## Contrôle (audit manuel — étape critique)

- Vérifier que 014 est bien **isolée** (aucune autre instruction utilisant `'operation'` dans
  le même fichier — sinon échec « unsafe use of new value of enum type »).
- Confirmer que `check_categorie_parent_scope()` conserve INTACTS les verrous existants
  (2 niveaux gamme/mixte, anti-promotion racine, anti-cycle) et n'ajoute QUE le cas
  `'operation'`.
- Vérifier l'idempotence : ré-exécuter 015 ne crée pas de doublon « Non classé (opérations) »
  ni d'erreur.
- Confirmer qu'aucune policy RLS de `categories` ne filtre par scope (sinon `'operation'`
  serait invisible).
