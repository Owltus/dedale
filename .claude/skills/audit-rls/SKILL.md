---
name: audit-rls
description: Audite le cloisonnement des données de Dédale (RLS PostgreSQL, Storage, rôles) directement sur la base, en lecture seule. À utiliser pour vérifier qui voit quoi, après une migration touchant une policy, ou avant d'ouvrir l'application à de nouveaux utilisateurs.
---

# Auditer le cloisonnement des données

> **Auditer la BASE, jamais le fichier.** `schema_complete.sql` est en retard sur la production : un audit mené dessus a produit un faux constat dès sa première minute (12 tables annoncées sans RLS en avaient toutes une). Toutes les requêtes ci-dessous s'exécutent dans l'éditeur SQL Supabase et sont en **lecture seule**.

## Ce que la RLS est, et n'est pas

La RLS est une fonction de **PostgreSQL**, pas de Supabase. Elle compte ici parce que le navigateur parle **directement** à la base : sans elle, la clé publique donnerait accès à toutes les tables. Elle filtre **ligne par ligne, côté serveur**, quelle que soit la requête envoyée.

Deux fonctions pivots portent tout le modèle :

- `current_role()` — rôle de l'utilisateur connecté, **NULL si son compte est désactivé** (c'est le coupe-circuit).
- `has_site_access(site_id)` — vrai si administrateur (accès transverse) ou rattaché à ce site. C'est ce qui matérialise « mes sites ».

## Les 8 contrôles

### 1. Toutes les tables ont-elles la RLS ?

```sql
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
```

Zéro ligne attendu. Une table sans RLS est lisible **et modifiable** par tout compte connecté : Supabase accorde les droits par défaut au rôle `authenticated`.

### 2. Une policy sans condition ?

```sql
WITH p AS (SELECT tablename, cmd, policyname,
                  coalesce(qual, with_check, 'true') AS expr
           FROM pg_policies WHERE schemaname = 'public')
SELECT tablename || ' [' || cmd || '] ' || policyname || ' >> ' || expr
FROM   p
WHERE  expr NOT LIKE '%current_role%' AND expr NOT LIKE '%has_site_access%'
  AND  expr NOT LIKE '%auth.uid%'     AND expr NOT LIKE '%shares_site%';
```

**Piège** : pour une policy `INSERT`, la condition est dans `with_check`, pas dans `qual` — d'où le `coalesce`. Sans lui, les 20 policies d'insertion remontent en faux positifs.

Seules réponses légitimes : les interdictions volontaires (`false` sur le journal d'audit).

### 3. Le cloisonnement par site tient-il ?

```sql
WITH t AS (SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'site_id'),
     pol AS (SELECT tablename, cmd, policyname,
                    coalesce(qual,'') || ' ' || coalesce(with_check,'') AS expr
             FROM pg_policies WHERE schemaname = 'public')
SELECT p.tablename || ' [' || p.cmd || '] ' || p.policyname
FROM   pol p JOIN t ON t.table_name = p.tablename
WHERE  p.expr NOT LIKE '%has_site_access%' AND p.expr NOT LIKE '%admin%';
```

Chaque ligne demande un examen : certaines sont légitimes (cloisonnement par **propriétaire** plutôt que par site), d'autres sont des trous. C'est cette requête qui a révélé qu'un demandeur pouvait déposer un document sur un site étranger.

### 4. Les vues contournent-elles la RLS ?

```sql
SELECT c.relname, c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public' AND c.relkind = 'v';
```

Chaque vue **doit** porter `security_invoker=true`. Sans cette option, elle s'exécute avec les droits de son créateur et **contourne la RLS de ses tables** — c'est le piège classique.

### 5. Les fonctions privilégiées sont-elles verrouillées ?

```sql
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public' AND p.prosecdef
  AND  coalesce(p.proconfig::text, '') NOT LIKE '%search_path%';
```

Zéro ligne attendu : une fonction `SECURITY DEFINER` sans `search_path` figé est détournable par un schéma malveillant.

### 6. Le stockage

```sql
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets;
SELECT policyname, cmd, coalesce(qual, with_check, '') FROM pg_policies WHERE schemaname = 'storage';
```

Le bucket doit être **privé**. Point subtil vérifié : les policies Storage de Dédale ne mentionnent pas le site, mais exigent que l'objet soit **référencé par une ligne** (`documents`, `equipements`…) — et la RLS de ces tables s'applique à cette sous-requête. Le cloisonnement est donc **hérité**, pas absent. Ne pas conclure trop vite.

### 7. La preuve par les faits — endosser un rôle

Le contrôle le plus convaincant : au lieu de lire les règles, compter ce qu'un utilisateur voit réellement. Rien n'est écrit, la transaction est annulée.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"UUID-UTILISATEUR"}';

SELECT public.current_role()                        AS role_vu,
       (SELECT count(*) FROM sites)                 AS sites,
       (SELECT count(*) FROM demandes_intervention) AS demandes,
       (SELECT count(*) FROM ordres_travail)        AS ordres;
ROLLBACK;
```

Identifiants à tester, un par rôle :

```sql
SELECT r.code AS role, u.id FROM users u JOIN roles r ON r.id = u.role_id
WHERE u.est_actif ORDER BY r.code;
```

### 8. Les réglages d'authentification

Hors base, dans le tableau de bord : inscription publique fermée, protection contre les mots de passe compromis, durée des sessions, et les **URL de redirection** (une liste vide renvoie les liens de réinitialisation vers l'URL par défaut — souvent `localhost`).

## Écrire le rapport

- Distinguer ce qui est **vérifié** de ce qui est **supposé**. Un point non conclu se dit « non conclu », jamais « conforme ».
- Citer la requête et son résultat, pas une impression.
- Dire aussi ce qui va bien : un rapport qui ne liste que les écarts fait croire que tout est cassé.
- Une correction se livre en **migration** (voir le skill `migration-sql`), jamais en modification directe depuis l'éditeur.
