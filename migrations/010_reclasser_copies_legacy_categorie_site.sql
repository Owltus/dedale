-- =============================================================================
-- 010 — Reclassement des copies LEGACY : modèle de site rangé dans une catégorie
--       COMMUNE → on le déplace dans une catégorie DE SITE (homonyme).
-- =============================================================================
-- Contexte : avant la migration 009, copier un modèle « commun → site » créait un
-- modèle DE SITE (site_id renseigné) mais le laissait dans la catégorie COMMUNE.
-- Sous le filtre du site, une catégorie commune n'apparaît pas → ces copies étaient
-- invisibles (sauf sous « Tout » ou via le repli front).
--
-- Ce script range chacune de ces copies dans une vraie catégorie de site, via le
-- MÊME find-or-create que la RPC 009 (copier_categorie_noeud) : il réutilise la
-- catégorie de site homonyme si elle existe (créée par une copie post-009), sinon
-- la crée par valeur. Les originaux COMMUNS ne sont pas touchés.
--
-- Idempotent / sûr :
--   - rejouable : après exécution, plus aucun modèle ne matche le WHERE → no-op ;
--   - le trigger check_modele_equipement_categorie accepte « modèle site → catégorie
--     même site » → l'UPDATE passe ;
--   - on ne touche pas à site_id (trigger d'immuabilité non déclenché) ;
--   - catégorie source en corbeille → modèle ignoré (pas d'échec).
-- =============================================================================

DO $$
DECLARE
    r          RECORD;
    v_cat_site UUID;
    v_count    INT := 0;
BEGIN
    FOR r IN
        SELECT m.id          AS modele_id,
               m.categorie_id AS cat_commune,
               m.site_id      AS site_id
          FROM public.modeles_equipements m
          JOIN public.categories c ON c.id = m.categorie_id
         WHERE m.deleted_at IS NULL
           AND m.site_id    IS NOT NULL   -- modèle DE SITE
           AND c.site_id    IS NULL       -- mais rangé dans une catégorie COMMUNE
           AND c.deleted_at IS NULL
    LOOP
        -- Find-or-create la catégorie homonyme sur le site du modèle (idempotent :
        -- plusieurs modèles d'une même catégorie commune → une seule catégorie de site).
        v_cat_site := public.copier_categorie_noeud(r.cat_commune, NULL, r.site_id);

        UPDATE public.modeles_equipements
           SET categorie_id = v_cat_site
         WHERE id = r.modele_id;

        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE 'Reclassement legacy : % modèle(s) de site déplacé(s) vers une catégorie de site.', v_count;
END $$;
