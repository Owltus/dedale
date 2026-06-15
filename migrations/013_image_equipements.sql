-- =============================================================================
-- 013 — Image (pool de vignettes) sur les ÉQUIPEMENTS (instances).
-- =============================================================================
-- Pendant de la migration 012 (modèles) côté instances. Un équipement physique
-- peut désormais porter une vignette du pool (miniature_id), scopée entreprise/site.
--
-- equipements n'a PAS de site_id DIRECT (il dérive via local → niveau → batiment) :
-- on crée un trigger de cohérence à SITE DÉRIVÉ (calque check_miniature_site_local).
--
-- La vue v_equipements_complet fait « SELECT e.* » : ajouter une colonne à la table
-- n'y réapparaît PAS toute seule, et CREATE OR REPLACE refuse d'insérer une colonne
-- au MILIEU de la liste (e.* avant les colonnes ajoutées). On DROP + recrée la vue
-- (aucun objet n'en dépend), puis on ré-applique security_invoker + le GRANT.
--
-- Rétro-compatible : ADD COLUMN nullable ; CREATE OR REPLACE conserve les GRANT des
-- fonctions. À FAIRE APRÈS DÉPLOIEMENT : `npm run gen:types`.
-- =============================================================================

BEGIN;

-- 1. Colonne + index (calque catégories/gammes).
ALTER TABLE public.equipements
    ADD COLUMN miniature_id UUID REFERENCES public.miniatures(id) ON DELETE SET NULL;
CREATE INDEX idx_equipements_miniature
    ON public.equipements(miniature_id) WHERE miniature_id IS NOT NULL;

-- 2. Cohérence de site (Pattern 6) à SITE DÉRIVÉ (via local → niveau → batiment).
CREATE OR REPLACE FUNCTION public.check_miniature_site_equipement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_site UUID;
BEGIN
    IF NEW.miniature_id IS NOT NULL THEN
        SELECT b.site_id INTO v_site
        FROM public.locaux    l
        JOIN public.niveaux   n ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE l.id = NEW.local_id;
        IF NOT public.miniature_scope_ok(NEW.miniature_id, v_site) THEN
            RAISE EXCEPTION 'Miniature % incompatible avec le site de l''équipement.', NEW.miniature_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_check_miniature_site_equipements
    BEFORE INSERT OR UPDATE OF miniature_id ON public.equipements
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_equipement();

-- 3. Comptage de références : liste COMPLÈTE des 8 entités illustrées
--    (6 d'origine + modeles_equipements en 012 + equipements ici).
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
    RETURN (SELECT count(*) FROM public.categories          WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.gammes              WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.prestataires        WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.batiments           WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.niveaux             WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.locaux              WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.modeles_equipements WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.equipements         WHERE miniature_id = p_miniature_id);
END;
$$;

-- 4. Vue v_equipements_complet : recréée pour ré-exposer e.* (donc miniature_id).
--    DROP + CREATE (aucun objet n'en dépend), puis security_invoker + GRANT.
DROP VIEW public.v_equipements_complet;
CREATE VIEW public.v_equipements_complet AS
SELECT
    e.*,
    c.nom              AS categorie_nom,
    c.scope            AS categorie_scope,
    v.chemin_court     AS localisation_courte,
    v.chemin_complet   AS localisation_complete,
    v.site_id,
    v.batiment_id,
    v.niveau_id,
    v.site_nom,
    v.batiment_nom,
    v.niveau_nom,
    v.local_nom
FROM public.equipements e
LEFT JOIN public.categories       c ON c.id = e.categorie_id AND c.deleted_at IS NULL
LEFT JOIN public.v_locaux_chemin  v ON v.local_id = e.local_id
WHERE e.deleted_at IS NULL;
ALTER VIEW public.v_equipements_complet SET (security_invoker = true);
GRANT SELECT ON public.v_equipements_complet TO anon, authenticated;
COMMENT ON VIEW public.v_equipements_complet IS
    'Équipement enrichi du chemin spatial + libellé catégorie + vignette (miniature_id via e.*). Filtre auto les supprimés.';

COMMIT;
