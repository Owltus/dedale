# Étape 3 — RPC `copier_modele_operation` (commun → site)

## Objectif

Créer la RPC `copier_modele_operation(p_source_modele_id UUID, p_site_cible UUID) RETURNS UUID`,
SECURITY DEFINER, qui duplique PAR VALEUR un modèle d'opération (et ses items
`modeles_operations_items`) vers un site cible, en matérialisant la catégorie de site via
`copier_categorie_noeud` (repli « Non classé (opérations) »). Calque de
`copier_modele_equipement`.

## Contexte

- RPC de référence : `copier_modele_equipement` (`schema_complete.sql` l.2305-2471, version
  post-migration 009). Mêmes gardes de rôle, même matérialisation de catégorie, même repli.
- `copier_categorie_noeud(p_source_cat_id, p_parent_cible_id, p_site_cible)` (l.3850-3912,
  post-011) : find-or-create idempotent d'une catégorie sur la cible (clé site/parent/scope/nom).
- Différence avec l'équipement : un modèle d'opération porte des **items**
  (`modeles_operations_items`) à recopier, là où le modèle d'équipement porte un JSON
  `specifications`. Il faut donc copier le modèle PUIS insérer ses items.
- Helpers : `public.current_role()`, `public.has_site_access(site_id)`.

## Fichier(s) impacté(s)

- **NOUVEAU** `contexte/migrations/017_copier_modele_operation.sql`
- `contexte/schema_complete.sql` — synchronisation après application

## Travail à réaliser

### 1. RPC `copier_modele_operation`

```sql
-- 017_copier_modele_operation.sql
CREATE OR REPLACE FUNCTION public.copier_modele_operation(
    p_source_modele_id UUID,
    p_site_cible       UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_role   TEXT := public.current_role();
    v_source public.modeles_operations%ROWTYPE;
    v_new_id UUID;
BEGIN
    -- 1. Auth
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_modele_operation : utilisateur non authentifié.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Droits selon scope cible (calque copier_modele_equipement)
    IF p_site_cible IS NULL THEN
        IF v_role NOT IN ('admin','manager') THEN
            RAISE EXCEPTION 'copier_modele_operation : seuls admin et manager peuvent copier vers le commun.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        IF v_role = 'admin' THEN NULL;
        ELSIF v_role IN ('manager','technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION 'copier_modele_operation : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION 'copier_modele_operation : rôle % non autorisé.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- 3. Lecture source (pas de soft-delete sur modeles_operations : pas de filtre deleted_at)
    SELECT * INTO v_source FROM public.modeles_operations WHERE id = p_source_modele_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_modele_operation : modèle source % introuvable.', p_source_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 3bis. Audit défensif accès source
    IF v_source.site_id IS NOT NULL AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_modele_operation : accès refusé au modèle source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 4. Catégorie cible : matérialiser via copier_categorie_noeud, repli si en corbeille
    IF EXISTS (SELECT 1 FROM public.categories WHERE id = v_source.categorie_id AND deleted_at IS NULL) THEN
        v_source.categorie_id := public.copier_categorie_noeud(v_source.categorie_id, NULL, p_site_cible);
    ELSE
        SELECT id INTO v_source.categorie_id FROM public.categories
         WHERE site_id IS NULL AND parent_id IS NULL AND scope='operation'
           AND lower(nom)='non classé (opérations)' AND deleted_at IS NULL LIMIT 1;
        -- Si cible = site, matérialiser le repli sur le site
        IF p_site_cible IS NOT NULL AND v_source.categorie_id IS NOT NULL THEN
            v_source.categorie_id := public.copier_categorie_noeud(v_source.categorie_id, NULL, p_site_cible);
        END IF;
        IF v_source.categorie_id IS NULL THEN
            RAISE EXCEPTION 'copier_modele_operation : repli « Non classé (opérations) » introuvable.'
                USING ERRCODE = 'no_data_found';
        END IF;
    END IF;

    -- 5. Copie du modèle PAR VALEUR
    INSERT INTO public.modeles_operations (id, site_id, nom, description, image_path, categorie_id)
    VALUES (gen_random_uuid(), p_site_cible, v_source.nom, v_source.description,
            v_source.image_path, v_source.categorie_id)
    RETURNING id INTO v_new_id;

    -- 6. Copie des items (modeles_operations_items) du modèle source
    INSERT INTO public.modeles_operations_items
        (id, modele_operation_id, nom, description, ordre, type_operation_id, unite_id, seuil_minimum, seuil_maximum)
    SELECT gen_random_uuid(), v_new_id, nom, description, ordre, type_operation_id, unite_id, seuil_minimum, seuil_maximum
      FROM public.modeles_operations_items
     WHERE modele_operation_id = p_source_modele_id;

    RETURN v_new_id;
END $$;
```

> Vérifier les colonnes EXACTES de `modeles_operations_items` (`schema_complete.sql` l.3365-3392)
> avant de figer la liste du `INSERT … SELECT` (nom, description, ordre, type_operation_id,
> unite_id, seuil_minimum, seuil_maximum). Gérer l'unicité du nom au commun/site si une RPC est
> rejouée (le `nom` est unique par scope) — proposer un suffixe « (copie) » ou laisser remonter
> l'erreur 23505 au front comme pour l'équipement (à aligner sur le comportement équipement).

### 2. Synchroniser `schema_complete.sql`

Reporter la RPC + son `COMMENT ON FUNCTION` (décrire scope, droits, matérialisation catégorie,
repli, copie des items).

## Ordre d'exécution

1. Vérifier les colonnes de `modeles_operations_items`.
2. Écrire 017, appliquer en prod.
3. Synchroniser `schema_complete.sql`.

## Critère de validation

- En tant que manager avec accès au site S : `SELECT copier_modele_operation('<id_commun>','<S>')`
  → renvoie un id ; le nouveau modèle est sur S, dans une catégorie de S, avec **tous ses items**.
- En tant que technicien sans accès au site cible → `insufficient_privilege`.
- Copie d'un modèle dont la catégorie source est en corbeille → atterrit dans « Non classé
  (opérations) » (matérialisée sur le site si cible = site).
- La copie est **indépendante** : modifier l'original commun ne touche pas la copie.

## Contrôle (audit manuel — étape critique)

- Confirmer SECURITY DEFINER + `search_path=''` + gardes de rôle identiques à
  `copier_modele_equipement`.
- Vérifier que la copie des items est **complète** et rattachée au NOUVEAU modèle (pas de
  fuite vers la source).
- Vérifier le comportement sur collision de nom (23505) : aligné sur l'équipement (remontée au
  front) ou suffixe — décider et documenter.
- Confirmer qu'un modèle VIDE (0 item) se copie sans erreur (pas de trigger `check_violation`
  côté items).
