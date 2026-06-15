-- =============================================================================
-- 021 — check_derniere_op_preventive : exempte les gammes-TEMPLATES (commun).
-- =============================================================================
-- Le verrou « une gamme préventive active doit conserver au moins une opération »
-- vise à ne pas interrompre SILENCIEUSEMENT la génération d'OT d'une VRAIE gamme
-- de site. Or une gamme-TEMPLATE de la Bibliothèque (onglet « Plan de maintenance »,
-- site_id NULL) est INERTE : elle ne génère aucun OT. Le verrou n'a donc aucun
-- sens pour elle et empêchait à tort de vider une gamme-template.
--
-- Correctif : on ajoute la condition `site_id IS NULL` aux cas exemptés (au même
-- titre que gamme absente / non préventive / inactive). Le comportement des
-- vraies gammes de site (site_id renseigné) est INCHANGÉ.
--
-- Backend pur : signature de la fonction inchangée, triggers conservés, aucun type
-- modifié → pas de `gen:types` nécessaire.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_derniere_op_preventive()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_old    jsonb := to_jsonb(OLD);
    v_gamme  uuid  := (v_old->>'gamme_id')::uuid;
    v_op_id  uuid  := (v_old->>'id')::uuid;                   -- NULL si gamme_modeles
    v_modele uuid  := (v_old->>'modele_operation_id')::uuid;  -- NULL si operations
    v_nature public.gamme_nature;
    v_active BOOLEAN;
    v_site   uuid;
    v_reste  BOOLEAN;
BEGIN
    SELECT nature, est_active, site_id INTO v_nature, v_active, v_site
    FROM public.gammes WHERE id = v_gamme AND deleted_at IS NULL;

    -- Aucune contrainte si : gamme absente / supprimée / non préventive / inactive,
    -- OU gamme-TEMPLATE (site_id NULL, inerte : ne génère pas d'OT — 021).
    IF v_nature IS DISTINCT FROM 'maintenance_preventive'
       OR v_active IS NOT TRUE
       OR v_site IS NULL THEN
        RETURN OLD;
    END IF;

    -- Reste-t-il au moins une source d'opération APRÈS ce retrait ?
    SELECT EXISTS (
        SELECT 1 FROM public.operations o
        WHERE o.gamme_id = v_gamme
          AND (v_op_id IS NULL OR o.id <> v_op_id)
        UNION ALL
        SELECT 1 FROM public.gamme_modeles gm
        JOIN public.modeles_operations_items moi ON moi.modele_operation_id = gm.modele_operation_id
        WHERE gm.gamme_id = v_gamme
          AND (v_modele IS NULL OR gm.modele_operation_id <> v_modele)
    ) INTO v_reste;

    IF NOT v_reste THEN
        RAISE EXCEPTION 'Impossible de retirer la dernière opération de la gamme préventive % : une gamme préventive active doit conserver au moins une opération. Ajoutez-en une autre, ou désactivez la gamme d''abord.', v_gamme
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.check_derniere_op_preventive() IS
    'v0.21 — BEFORE DELETE sur operations et gamme_modeles : interdit de retirer la dernière source d''opération d''une gamme préventive active. (021 : exempte les gammes-templates site_id NULL, inertes — pas de génération d''OT.)';
