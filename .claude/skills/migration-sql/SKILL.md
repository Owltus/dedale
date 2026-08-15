---
name: migration-sql
description: Écrit une migration SQL Supabase pour Dédale, l'applique, resynchronise le schéma versionné et met la doctrine à jour. À utiliser dès qu'on touche au schéma, à une policy RLS, à un trigger, à une contrainte ou à une table de référence.
---

# Écrire une migration Dédale

> **Le backend porte toute la logique métier et la sécurité.** Une migration n'est jamais « juste du SQL » : elle change le contrat que le front consomme, et parfois une règle que la doctrine énonce.

## Pourquoi ce skill existe

`CLAUDE.md` a prescrit pendant des mois « toujours filtrer `.is('deleted_at', null)' », dans un bloc marqué « NON négociable », alors que les migrations 034-036 avaient supprimé la colonne. La règle décrivait du code qui ne compilait plus.

La cause n'est pas une inattention : **rien n'imposait de resynchroniser la doctrine après une migration**. C'est l'étape 6 ci-dessous, et c'est la raison d'être de ce skill.

## Où vivent les choses

| Quoi                     | Où                                   | Versionné ?                       |
| ------------------------ | ------------------------------------ | --------------------------------- |
| Migrations incrémentales | `migrations/NNN-nom.sql` à la racine | **Non — gitignoré**               |
| Schéma complet           | `schema_complete.sql` à la racine    | **Oui — seule source versionnée** |
| Types TypeScript         | `src/lib/database.types.ts`          | Oui, généré                       |

**Pourquoi les migrations ne sont pas publiées** : le dépôt est public et une migration peut contenir des données réelles (coordonnées de prestataires, noms de sites). Ne jamais les committer, ne jamais les coller dans un rapport partagé.

## Recette

### 1. Auditer l'existant — dans la BASE, pas dans le fichier

`schema_complete.sql` **est en retard sur la production** : un audit mené dessus a produit un faux constat dès sa première minute (12 tables annoncées sans RLS en avaient toutes une).

Vérifier l'état réel via l'éditeur SQL, en lecture seule :

```sql
-- Policies d'une table
SELECT policyname, cmd, qual, with_check
FROM   pg_policies WHERE schemaname = 'public' AND tablename = 'ma_table';

-- Tables sans RLS
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

-- Triggers d'une table
SELECT t.tgname, p.proname FROM pg_trigger t
JOIN   pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
WHERE  c.relname = 'ma_table' AND NOT t.tgisinternal;
```

### 2. Numéroter et écrire

Numéro suivant libre dans `migrations/`. L'en-tête est **la moitié du livrable** — modèle imposé, calqué sur les migrations 075 et 076 :

```sql
-- =============================================================================
-- NNN — Titre court à l'infinitif
-- =============================================================================
-- Symptôme corrigé : ce que l'utilisateur voyait.
--
-- Cause : le mécanisme exact, avec les fichiers ou lignes en cause.
--
-- Correctif : ce que fait cette migration, et ce qu'elle ne fait PAS.
--
-- Innocuité : pourquoi elle ne casse rien — lignes existantes concernées ou
-- non, rôles impactés, rétroactivité.
--
-- Vérification après application :
--     SELECT … (une requête qui prouve que ça a marché)
-- =============================================================================
```

Règles de contenu :

- **Idempotence** : `DROP POLICY IF EXISTS` avant `CREATE POLICY`, `CREATE OR REPLACE` pour les fonctions.
- **Helpers en `public.`** — jamais `auth.xxx()` sauf `auth.uid()`.
- Toute fonction `SECURITY DEFINER` fige son `search_path` (`SET search_path = ''`).
- Une policy `INSERT` met sa condition dans `WITH CHECK`, pas dans `USING`.
- Cloisonner par site avec `public.has_site_access(site_id)` — c'est le point que la policy `documents_demandeur_insert` avait oublié.
- `COMMENT ON POLICY` / `COMMENT ON FUNCTION` pour expliquer l'intention, avec le numéro de migration entre parenthèses.

### 3. Appliquer

Éditeur SQL Supabase. **Pièges vérifiés** :

- Pas de `TEMP TABLE` réutilisée entre deux instructions : utiliser un CTE.
- L'éditeur peut avoir **écrit malgré un message d'erreur** : toujours vérifier l'état après coup.
- Un script qui désactive des triggers doit les réactiver — vérifier explicitement qu'ils le sont.

### 4. Vérifier

Jouer la requête de vérification de l'en-tête. Elle doit prouver le résultat, pas l'absence d'erreur.

### 5. Resynchroniser `schema_complete.sql`

C'est la seule source versionnée : une migration non répercutée y crée une divergence invisible qui piégera le prochain audit.

### 6. Répercuter côté front

- `npm run gen:types` (après `npx supabase login`).
- Migration **non encore déployée** ? Éditer `database.types.ts` **à la main en pont**, et régénérer au déploiement. C'est la seule édition manuelle admise.
- **Chercher ce que la migration invalide dans la doctrine** : `CLAUDE.md`, `docs/conventions/*`, `.claude/skills/*`. Une colonne supprimée, une policy élargie, un statut ajouté changent souvent une règle écrite. **Cette recherche n'est pas optionnelle** — c'est l'omission qui a produit la contradiction du soft-delete.
- Le front ne réimplémente pas la validation : il **catche** l'erreur et l'affiche (`writeErrorMessage`, `deleteErrorMessage`).

### 7. Consigner

Une migration qui change une règle du jeu (cycle d'états, matrice de droits, portée d'une entité) mérite un ADR dans `docs/decisions/`.

## Rappels de doctrine backend

- **Single-tenant** : pas de notion de client, tout appartient à l'unique entreprise.
- **Sécurité = rôle + sites.** 5 rôles : `admin` · `manager` · `technicien` · `lecteur` · `demandeur`. On raisonne « mes sites », jamais d'assignation nominative.
- **Hard-delete** : plus de `deleted_at`. Les garde-fous sont les FK (`RESTRICT` / `CASCADE`).
- Hiérarchie des lieux : `sites → batiments → niveaux → locaux → equipements`.
- Les vues SQL doivent être en `security_invoker` — sinon elles contournent la RLS.
