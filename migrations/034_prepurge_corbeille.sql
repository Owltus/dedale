-- ============================================================================
-- 034_prepurge_corbeille.sql
-- ----------------------------------------------------------------------------
-- Phase 1 du chantier « purge de la corbeille » (suppressions définitives).
--
-- Supprime PHYSIQUEMENT et DÉFINITIVEMENT toutes les lignes actuellement en
-- corbeille (`deleted_at IS NOT NULL`), AVANT le retrait des colonnes deleted_at
-- (migration 036). Sans cette pré-purge, le futur `DROP COLUMN deleted_at` ferait
-- « ressusciter » ces lignes (le filtre disparaît, elles redeviendraient vivantes).
--
-- Repris de purge_corbeille_90j() : MÊME ordre feuilles -> racines (respect des FK
-- RESTRICT), MÊME bypass `session_replication_role = replica` là où il était requis,
-- MÊME nettoyage Storage RGPD. Différences (décision PO) :
--   - plus de seuil « > 90 jours » : on purge TOUTE la corbeille ;
--   - plus d'exception « OT clôturés » : ils sont purgés aussi (fin de la rétention
--     automatique NF EN 13306, assumée).
--
-- IRRÉVERSIBLE. Faire un SNAPSHOT Supabase AVANT d'exécuter.
-- La vérification finale signale tout résidu (à résoudre avant la migration 036).
-- ============================================================================

DO $$
DECLARE
    v_nb INTEGER;
BEGIN
    -- Autorise la suppression en cascade des équipes internes des sites purgés
    -- (FK prestataires.site_id CASCADE ; protect_prestataire_interne lit ce flag).
    PERFORM set_config('app.purge_active', 'on', true);

    -- documents : fichiers Storage AVANT la metadata (RGPD). Le trigger
    -- storage.protect_delete exige cette GUC pour autoriser le DELETE direct.
    PERFORM set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects
        WHERE bucket_id = 'documents'
          AND name IN (SELECT storage_path FROM public.documents WHERE deleted_at IS NOT NULL);
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge storage_objects: %', v_nb;

    DELETE FROM public.documents WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge documents: %', v_nb;

    -- demandes_intervention : liaisons di_* en CASCADE.
    DELETE FROM public.demandes_intervention WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge demandes_intervention: %', v_nb;

    -- interventions_chantier : liaisons chantier_* en CASCADE.
    DELETE FROM public.interventions_chantier WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge interventions_chantier: %', v_nb;

    -- investissements : documents_investissements en CASCADE.
    DELETE FROM public.investissements WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge investissements: %', v_nb;

    -- equipements : détacher d'abord gammes_equipements (FK RESTRICT entrante,
    -- sans soft-delete propre), sinon foreign_key_violation. di_equipements /
    -- documents_equipements partent en CASCADE ; observations.equipement_id SET NULL.
    DELETE FROM public.gammes_equipements
        WHERE equipement_id IN (SELECT id FROM public.equipements WHERE deleted_at IS NOT NULL);
    DELETE FROM public.equipements WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge equipements: %', v_nb;

    -- modeles_equipements : equipements.copie_depuis_modele_id ON DELETE SET NULL.
    DELETE FROM public.modeles_equipements WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge modeles_equipements: %', v_nb;

    -- modeles_di : feuille pure.
    DELETE FROM public.modeles_di WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge modeles_di: %', v_nb;

    -- modeles_operations : fenêtre replica dédiée (triggers + FK désactivés). On
    -- nettoie EXPLICITEMENT les items (CASCADE inactif) et gamme_modeles (RESTRICT
    -- inactif) avant de supprimer les modèles. Placé AVANT categories.
    SET LOCAL session_replication_role = replica;
    DELETE FROM public.modeles_operations_items
        WHERE modele_operation_id IN (SELECT id FROM public.modeles_operations WHERE deleted_at IS NOT NULL);
    DELETE FROM public.gamme_modeles
        WHERE modele_operation_id IN (SELECT id FROM public.modeles_operations WHERE deleted_at IS NOT NULL);
    DELETE FROM public.modeles_operations WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    SET LOCAL session_replication_role = origin;
    RAISE NOTICE 'prepurge modeles_operations: %', v_nb;

    -- locaux / niveaux / batiments (hiérarchie spatiale, feuilles -> racine).
    DELETE FROM public.locaux WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge locaux: %', v_nb;

    DELETE FROM public.niveaux WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge niveaux: %', v_nb;

    DELETE FROM public.batiments WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge batiments: %', v_nb;

    -- ordres_travail : AVANT gammes/sites/prestataires pour libérer leurs FK
    -- RESTRICT. protection_ot_terminaux interdit le DELETE physique -> bypass
    -- replica. On purge TOUS les OT en corbeille, y compris clôturés (D5).
    -- Audit manuel AVANT (replica désactive le trigger d'audit).
    INSERT INTO public.audit_log (user_id, table_name, row_pk, action, before, after)
    SELECT NULL, 'ordres_travail', ot.id::text, 'DELETE', to_jsonb(ot.*), NULL
    FROM public.ordres_travail ot
    WHERE ot.deleted_at IS NOT NULL;

    SET LOCAL session_replication_role = replica;
    -- Enfants CASCADE/SET NULL non déclenchés en replica -> nettoyage explicite.
    DELETE FROM public.operations_execution
        WHERE ordre_travail_id IN (SELECT id FROM public.ordres_travail WHERE deleted_at IS NOT NULL);
    DELETE FROM public.documents_ordres_travail
        WHERE ordre_travail_id IN (SELECT id FROM public.ordres_travail WHERE deleted_at IS NOT NULL);
    -- observations : SET NULL si la ligne peut vivre détachée ; sinon (contrôle
    -- réglementaire, CHECK ot_id NOT NULL) suppression avec l'OT (CHECK survit à replica).
    UPDATE public.observations SET ot_id = NULL
        WHERE source <> 'controle_reglementaire'
          AND ot_id IN (SELECT id FROM public.ordres_travail WHERE deleted_at IS NOT NULL);
    DELETE FROM public.observations
        WHERE source = 'controle_reglementaire'
          AND ot_id IN (SELECT id FROM public.ordres_travail WHERE deleted_at IS NOT NULL);
    DELETE FROM public.ordres_travail WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    SET LOCAL session_replication_role = origin;
    RAISE NOTICE 'prepurge ordres_travail: %', v_nb;

    -- gammes : ordres_travail.gamme_id ON DELETE SET NULL ; liaisons en CASCADE.
    DELETE FROM public.gammes WHERE deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge gammes: %', v_nb;

    -- categories : garde-fou NOT EXISTS sur les FK RESTRICT (gamme/modèle/enfant
    -- VIVANTS restants). Les soft-deletés ayant été purgés au-dessus, seuls des
    -- éléments vivants pourraient retenir une catégorie soft-deletée (cas anormal :
    -- le trigger empêche de mettre en corbeille une catégorie non vide). Signalé
    -- comme résidu par la vérification finale le cas échéant.
    DELETE FROM public.categories c
        WHERE c.deleted_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.gammes g              WHERE g.categorie_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM public.modeles_equipements m WHERE m.categorie_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM public.modeles_operations o  WHERE o.categorie_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM public.categories e          WHERE e.parent_id   = c.id);
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge categories: %', v_nb;

    -- prestataires : APRÈS les OT. Garde-fou NOT EXISTS (contrat / gamme / OT
    -- vivants restants). app.purge_active autorise la cascade des équipes internes.
    DELETE FROM public.prestataires p
        WHERE p.deleted_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.contrats c        WHERE c.prestataire_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM public.gammes g          WHERE g.prestataire_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM public.ordres_travail ot WHERE ot.prestataire_id = p.id);
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    RAISE NOTICE 'prepurge prestataires: %', v_nb;

    -- sites : EN DERNIER. Garde-fou NOT EXISTS sur les FK RESTRICT filles encore
    -- vivantes. Une observation directe sur le site (observations sans soft-delete)
    -- peut le retenir -> signalé comme résidu (à traiter avant migration 036).
    DELETE FROM public.sites s
        WHERE s.deleted_at IS NOT NULL
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
    RAISE NOTICE 'prepurge sites: %', v_nb;

    RAISE NOTICE 'prepurge terminée.';
END;
$$;

-- ============================================================================
-- VÉRIFICATION : doit renvoyer ZÉRO ligne. Toute ligne listée est un résidu en
-- corbeille (à traiter avant la migration 036 « DROP COLUMN deleted_at », sinon
-- résurrection). Cas attendu de résidu : un site/catégorie retenu par une
-- référence vivante (observation directe, élément non purgé) — à résoudre au cas
-- par cas selon la décision de cascade (migration 035).
-- ============================================================================
SELECT 'sites'                  AS table_name, count(*) AS residus FROM public.sites                  WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'batiments',            count(*) FROM public.batiments            WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'niveaux',              count(*) FROM public.niveaux              WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'locaux',               count(*) FROM public.locaux               WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'categories',           count(*) FROM public.categories           WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'equipements',          count(*) FROM public.equipements          WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'modeles_equipements',  count(*) FROM public.modeles_equipements  WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'prestataires',         count(*) FROM public.prestataires         WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'gammes',               count(*) FROM public.gammes               WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'modeles_operations',   count(*) FROM public.modeles_operations   WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'demandes_intervention',count(*) FROM public.demandes_intervention WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'interventions_chantier',count(*) FROM public.interventions_chantier WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'investissements',      count(*) FROM public.investissements      WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'modeles_di',           count(*) FROM public.modeles_di           WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'ordres_travail',       count(*) FROM public.ordres_travail       WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'documents',            count(*) FROM public.documents            WHERE deleted_at IS NOT NULL
ORDER BY residus DESC, table_name;
