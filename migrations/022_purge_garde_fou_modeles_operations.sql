-- =============================================================================
-- 022 — purge_corbeille_90j : garde-fou manquant categories ↔ modeles_operations
-- -----------------------------------------------------------------------------
-- But : empêcher que la purge RGPD nocturne soit annulée (ROLLBACK TOTAL) chaque
--       nuit dès qu'une catégorie scope 'operation' tombe en corbeille > 90 j
--       alors qu'un `modeles_operations` vivant la référence encore.
--
-- Cause : `modeles_operations.categorie_id` est ON DELETE RESTRICT (migration 016),
--   mais le DELETE des `categories` ne testait NOT EXISTS que sur gammes /
--   modeles_equipements / sous-catégories — PAS modeles_operations.
--
-- Seul ajout vs la fonction existante : la clause NOT EXISTS marquée `-- [022]`
--   dans le DELETE des categories. Le reste est identique. SQL simple (pas de
--   regex/antislash) : CREATE OR REPLACE = remplace toute la fonction d'un coup.
--
-- ⚠️ NON TESTÉ EN BASE — la version autoritative reste schema_complete.sql (qui
--   garde ses commentaires détaillés ; ici ils sont condensés). Reporter le seul
--   ajout `-- [022]` dans schema_complete.sql. Pas de `npm run gen:types`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_corbeille_90j()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_nb     INTEGER;
BEGIN
    PERFORM set_config('app.purge_active', 'on', true);

    -- documents : fichiers Storage supprimés AVANT la ligne metadata (RGPD).
    PERFORM set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects
        WHERE bucket_id = 'documents'
          AND name IN (
              SELECT storage_path FROM public.documents
              WHERE deleted_at IS NOT NULL
                AND deleted_at < now() - interval '90 days'
          );
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('storage_objects', v_nb);

    DELETE FROM public.documents
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('documents', v_nb);

    DELETE FROM public.demandes_intervention
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('demandes_intervention', v_nb);

    DELETE FROM public.interventions_chantier
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('interventions_chantier', v_nb);

    DELETE FROM public.investissements
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('investissements', v_nb);

    -- equipements : détacher d'abord gammes_equipements (FK RESTRICT entrante).
    DELETE FROM public.gammes_equipements
        WHERE equipement_id IN (
            SELECT id FROM public.equipements
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
        );
    DELETE FROM public.equipements WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('equipements', v_nb);

    DELETE FROM public.modeles_equipements WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('modeles_equipements', v_nb);

    DELETE FROM public.locaux WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('locaux', v_nb);

    DELETE FROM public.niveaux WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('niveaux', v_nb);

    DELETE FROM public.batiments WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('batiments', v_nb);

    DELETE FROM public.gammes
        WHERE deleted_at IS NOT NULL
          AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('gammes', v_nb);

    -- categories : garde-fous NOT EXISTS (tous RESTRICT). [022] ajoute modeles_operations.
    DELETE FROM public.categories
        WHERE deleted_at IS NOT NULL
          AND deleted_at < now() - interval '90 days'
          AND NOT EXISTS (
              SELECT 1 FROM public.gammes g WHERE g.categorie_id = public.categories.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.modeles_equipements me WHERE me.categorie_id = public.categories.id
          )
          -- [022] sans ce garde-fou, une catégorie 'operation' en corbeille référencée
          -- par un modèle d'opération vivant fait échouer ce DELETE et annule la purge.
          AND NOT EXISTS (
              SELECT 1 FROM public.modeles_operations mo WHERE mo.categorie_id = public.categories.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.categories enfant WHERE enfant.parent_id = public.categories.id
          );
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('categories', v_nb);

    -- ordres_travail : bypass protection via 'replica' + audit manuel. OT 'cloture' jamais purgés.
    INSERT INTO public.audit_log (user_id, table_name, row_pk, action, before, after)
    SELECT
        NULL,
        'ordres_travail',
        ot.id::text,
        'DELETE',
        to_jsonb(ot.*),
        NULL
    FROM public.ordres_travail ot
    WHERE ot.deleted_at IS NOT NULL
      AND ot.deleted_at < now() - interval '90 days'
      AND ot.statut <> 'cloture';

    SET LOCAL session_replication_role = replica;

    DELETE FROM public.operations_execution
        WHERE ordre_travail_id IN (
            SELECT id FROM public.ordres_travail
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
              AND statut <> 'cloture'
        );
    DELETE FROM public.documents_ordres_travail
        WHERE ordre_travail_id IN (
            SELECT id FROM public.ordres_travail
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
              AND statut <> 'cloture'
        );
    UPDATE public.observations SET ot_id = NULL
        WHERE source <> 'controle_reglementaire'
          AND ot_id IN (
              SELECT id FROM public.ordres_travail
              WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
                AND statut <> 'cloture'
          );
    DELETE FROM public.observations
        WHERE source = 'controle_reglementaire'
          AND ot_id IN (
              SELECT id FROM public.ordres_travail
              WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
                AND statut <> 'cloture'
          );

    DELETE FROM public.ordres_travail
        WHERE deleted_at IS NOT NULL
          AND deleted_at < now() - interval '90 days'
          AND statut <> 'cloture';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    SET LOCAL session_replication_role = origin;
    v_result := v_result || jsonb_build_object('ordres_travail', v_nb);

    -- prestataires : garde-fou NOT EXISTS (contrat / gamme / OT).
    DELETE FROM public.prestataires p
        WHERE p.deleted_at IS NOT NULL AND p.deleted_at < now() - interval '90 days'
          AND NOT EXISTS (SELECT 1 FROM public.contrats c        WHERE c.prestataire_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM public.gammes g          WHERE g.prestataire_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM public.ordres_travail ot WHERE ot.prestataire_id = p.id);
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('prestataires', v_nb);

    -- sites : EN DERNIER, garde-fou NOT EXISTS sur les FK RESTRICT filles.
    DELETE FROM public.sites s
        WHERE s.deleted_at IS NOT NULL AND s.deleted_at < now() - interval '90 days'
          AND NOT EXISTS (SELECT 1 FROM public.batiments b              WHERE b.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.gammes g                 WHERE g.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.categories c             WHERE c.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.documents d              WHERE d.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.demandes_intervention di WHERE di.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.observations o           WHERE o.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.ordres_travail ot        WHERE ot.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.contrats c               WHERE c.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.interventions_chantier ic WHERE ic.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.investissements inv      WHERE inv.site_id = s.id);
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('sites', v_nb);

    RAISE LOG 'purge_corbeille_90j: purge terminee %', v_result;

    RETURN v_result;
END;
$$;
