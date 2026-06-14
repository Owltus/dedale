# Étape 2 — `categorie_id` sur `modeles_operations`

## Objectif

Ajouter `modeles_operations.categorie_id` (NOT NULL, `ON DELETE RESTRICT`), avec backfill des
modèles existants, index, trigger de cohérence de scope/site, extension du blocage de
suppression d'une catégorie non vide, et reclassement des copies legacy de site. Calque exact
de l'infra `modeles_equipements`.

## Contexte

- Infra équipement de référence : `schema_complete.sql` l.2024-2194 (colonne l.2038, index
  l.2090-2092, fonction `check_modele_equipement_categorie()` l.2145-2193).
- `modeles_operations` : `schema_complete.sql` l.3325-3360 (pas de `categorie_id` aujourd'hui).
- `check_categorie_suppression()` (l.1703-1741) bloque le soft-delete d'une catégorie ayant un
  enfant vivant OU une gamme rattachée vivante → à étendre aux modèles d'opération.
- Reclassement legacy : calque de `migration 010` (copies de site rangées dans une catégorie
  commune → réaffectées à une catégorie de site homonyme via `copier_categorie_noeud`).
- Ordre obligatoire : colonne NULLABLE → backfill → `SET NOT NULL` (sinon rejet Postgres).

## Fichier(s) impacté(s)

- **NOUVEAU** `contexte/migrations/016_modeles_operations_categorie.sql`
- `contexte/schema_complete.sql` — synchronisation après application

## Travail à réaliser

### 1. Colonne + backfill + NOT NULL + index

```sql
-- 016_modeles_operations_categorie.sql  (transactionnelle)

-- a) colonne nullable
ALTER TABLE public.modeles_operations
  ADD COLUMN IF NOT EXISTS categorie_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT;

-- b) backfill : tout modèle sans catégorie -> « Non classé (opérations) » (créée en 015).
--    Modèle COMMUN -> repli commun. Modèle de SITE -> repli matérialisé sur son site
--    (find-or-create via copier_categorie_noeud) pour rester visible sous son périmètre.
DO $$
DECLARE
  v_repli_commun UUID;
  r RECORD;
  v_cat UUID;
BEGIN
  SELECT id INTO v_repli_commun FROM public.categories
   WHERE site_id IS NULL AND parent_id IS NULL AND scope='operation'
     AND lower(nom)='non classé (opérations)' AND deleted_at IS NULL LIMIT 1;

  FOR r IN SELECT id, site_id FROM public.modeles_operations WHERE categorie_id IS NULL LOOP
    IF r.site_id IS NULL THEN
      v_cat := v_repli_commun;
    ELSE
      v_cat := public.copier_categorie_noeud(v_repli_commun, NULL, r.site_id);
    END IF;
    UPDATE public.modeles_operations SET categorie_id = v_cat WHERE id = r.id;
  END LOOP;
END $$;

-- c) NOT NULL
ALTER TABLE public.modeles_operations ALTER COLUMN categorie_id SET NOT NULL;

-- d) index (calque idx_modeles_equipements_categorie)
CREATE INDEX IF NOT EXISTS idx_modeles_operations_categorie
  ON public.modeles_operations(categorie_id)
  WHERE categorie_id IS NOT NULL;
```

### 2. Trigger de cohérence (calque `check_modele_equipement_categorie`)

```sql
-- Refuse une catégorie de mauvais scope + impose la cohérence de site.
-- Défaut A1 (strict) : n'accepte QUE scope 'operation'. (Si A1 -> 'mixte' accepté,
-- remplacer la condition par : IF c_scope NOT IN ('operation','mixte') THEN ...)
CREATE OR REPLACE FUNCTION public.check_modele_operation_categorie()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c_scope public.categorie_scope; c_site UUID;
BEGIN
  IF NEW.categorie_id IS NULL THEN RETURN NEW; END IF;
  SELECT scope, site_id INTO c_scope, c_site FROM public.categories WHERE id = NEW.categorie_id;

  IF c_scope <> 'operation' THEN
    RAISE EXCEPTION 'Catégorie % de scope % : interdite sur un modèle d''opération (scope ''operation'' requis).',
      NEW.categorie_id, c_scope USING ERRCODE = 'check_violation';
  END IF;

  IF c_site IS NOT NULL THEN
    IF NEW.site_id IS NULL THEN
      RAISE EXCEPTION 'Modèle d''opération entreprise ne peut pas référencer une catégorie de site (catégorie % du site %).',
        NEW.categorie_id, c_site USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.site_id IS DISTINCT FROM c_site THEN
      RAISE EXCEPTION 'Catégorie % du site % mais modèle sur site %.',
        NEW.categorie_id, c_site, NEW.site_id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_modeles_operations_check_categorie
  BEFORE INSERT OR UPDATE OF categorie_id, site_id ON public.modeles_operations
  FOR EACH ROW EXECUTE FUNCTION public.check_modele_operation_categorie();
```

### 3. Étendre `check_categorie_suppression()`

Reprendre le corps de `schema_complete.sql` l.1703-1741 et ajouter un `EXISTS` sur
`modeles_operations` (modèle vivant rattaché → blocage du soft-delete), à côté des `EXISTS`
existants (sous-catégorie, gamme).

```sql
-- ... OR EXISTS (
--   SELECT 1 FROM public.modeles_operations m
--    WHERE m.categorie_id = NEW.id AND m.deleted_at IS NULL
-- ) ...
```

> `modeles_operations` n'a pas de `deleted_at` (pas de soft-delete sur cette table) — vérifier
> dans `schema_complete.sql` et adapter : si la table n'a pas de `deleted_at`, retirer le
> prédicat `m.deleted_at IS NULL` (un simple `EXISTS` sur `categorie_id = NEW.id` suffit).

### 4. Reclassement legacy (calque migration 010)

Si des modèles de site se retrouvaient rangés dans une catégorie commune (ne devrait pas
arriver après backfill, mais idempotence défensive) : boucler comme `migration 010` et
réaffecter via `copier_categorie_noeud(cat_commune, NULL, site_id)`.

### 5. Synchroniser `schema_complete.sql`

Reporter colonne, index, fonction/trigger, et l'extension de `check_categorie_suppression()`.

## Ordre d'exécution

1. Colonne nullable → backfill → NOT NULL → index.
2. Trigger de cohérence.
3. Extension `check_categorie_suppression()`.
4. Reclassement legacy (idempotent).
5. Synchroniser `schema_complete.sql`.

## Critère de validation

- Tous les `modeles_operations` ont un `categorie_id` non nul (`SELECT count(*) … WHERE
  categorie_id IS NULL` = 0) après backfill.
- INSERT d'un modèle d'opération avec une catégorie `scope='gamme'` → refus `check_violation`.
- INSERT d'un modèle COMMUN avec une catégorie de site → refus ; modèle de site avec catégorie
  d'un autre site → refus.
- Soft-delete d'une catégorie `'operation'` contenant un modèle → refus.
- Suppression d'une catégorie d'opération référencée → refus FK (`RESTRICT`).

## Contrôle (audit manuel — étape critique)

- Vérifier l'ordre nullable → backfill → NOT NULL (aucune fenêtre où NOT NULL précède le
  backfill).
- Confirmer que le backfill matérialise bien une catégorie de **site** pour les modèles de
  site (sinon le trigger de cohérence rejetterait l'UPDATE NOT NULL).
- Confirmer que `check_modele_operation_categorie` est SECURITY DEFINER + `search_path=''`.
- Vérifier que l'extension de `check_categorie_suppression()` ne casse pas les blocages
  existants (sous-catégories, gammes) et gère l'absence éventuelle de `deleted_at` sur
  `modeles_operations`.
- Rejouer 016 à blanc (idempotence des `IF NOT EXISTS` / boucles).
