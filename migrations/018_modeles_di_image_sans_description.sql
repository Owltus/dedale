-- =============================================================================
-- 018 — Modèles de DI : image (pool de vignettes) + suppression de description.
-- =============================================================================
-- (1) Rattache les modèles de DI au POOL DE VIGNETTES (miniature_id), comme les
--     modèles d'équipement (migration 012) : dédup par hash, scope entreprise/site,
--     cohérence de site garantie par le trigger partagé check_miniature_site_direct
--     (modeles_di a un site_id DIRECT).
-- (2) count_miniature_refs compte désormais aussi modeles_di — sinon une vignette
--     utilisée par un modèle de DI serait vue « refcount 0 » et son fichier Storage
--     supprimé à tort (cassant l'image).
-- (3) Supprime la colonne description : champ mort (jamais lu — ni le panneau, ni la
--     suggestion rapide ne l'affichent ; libellé + constat suffisent).
--
-- À FAIRE APRÈS DÉPLOIEMENT : `npm run gen:types` (miniature_id apparaît, description
-- disparaît des types générés).
-- =============================================================================

BEGIN;

-- 1. Colonne miniature_id + index. ON DELETE SET NULL : supprimer une vignette
--    délie le modèle (ne le casse pas).
ALTER TABLE public.modeles_di
    ADD COLUMN miniature_id UUID REFERENCES public.miniatures(id) ON DELETE SET NULL;
CREATE INDEX idx_modeles_di_miniature
    ON public.modeles_di(miniature_id) WHERE miniature_id IS NOT NULL;

-- 2. Cohérence de site (Pattern 6) : site_id DIRECT → trigger partagé.
CREATE TRIGGER trg_check_miniature_site_modeles_di
    BEFORE INSERT OR UPDATE OF miniature_id ON public.modeles_di
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_direct();

-- 3. Comptage de références : ajouter modeles_di.
CREATE OR REPLACE FUNCTION public.count_miniature_refs(p_miniature_id UUID)
RETURNS BIGINT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_role TEXT := public.current_role();
BEGIN
    IF v_role IS NULL OR v_role NOT IN ('admin','manager','technicien') THEN
        RAISE EXCEPTION 'count_miniature_refs : rôle non autorisé'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN (SELECT count(*) FROM public.categories   WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.gammes       WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.prestataires WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.batiments    WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.niveaux      WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.locaux       WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.modeles_equipements WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.equipements         WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.modeles_di          WHERE miniature_id = p_miniature_id);
END;
$$;

-- 4. Suppression de la colonne description (champ mort).
ALTER TABLE public.modeles_di DROP COLUMN description;

COMMIT;
