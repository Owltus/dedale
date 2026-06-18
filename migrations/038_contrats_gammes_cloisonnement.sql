-- 038 — Cloisonnement de contrats_gammes par le SITE DU CONTRAT
--
-- Faille (audit RLS) : les policies non-admin de la liaison contrats_gammes
-- scopaient UNIQUEMENT sur la gamme (can_access_gamme), qui renvoie vrai pour
-- toute gamme « commune » (bibliothèque, site_id NULL). Comme un contrat
-- (contrats.site_id NOT NULL) peut couvrir une gamme commune, un utilisateur
-- d'un site voyait — et un manager pouvait modifier/supprimer — les lignes de
-- liaison de contrats d'AUTRES sites (fuite de contrat_id + commentaire).
--
-- Correctif : ancrer la visibilité/écriture sur le site du CONTRAT
-- (can_access_contrat), en conservant les contrôles gamme pour l'écriture
-- (inviolabilité du commun côté technicien). Idempotent.

-- Helper : accès au site du contrat (toujours site-scopé). SECURITY DEFINER
-- (anti-récursion, comme has_site_access / can_access_gamme).
CREATE OR REPLACE FUNCTION public.can_access_contrat(p_contrat_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.contrats c
        WHERE c.id = p_contrat_id
          AND public.has_site_access(c.site_id)
    );
$$;
COMMENT ON FUNCTION public.can_access_contrat(uuid) IS
    '038 — true si le caller a accès au site du contrat (contrats.site_id NOT NULL). SECURITY DEFINER (anti-récursion). Cloisonne contrats_gammes par le site du CONTRAT (la gamme commune ne cloisonne pas).';
GRANT EXECUTE ON FUNCTION public.can_access_contrat(uuid) TO authenticated, service_role;

-- SELECT (manager/technicien/lecteur) : accès au site du CONTRAT.
DROP POLICY IF EXISTS contrats_gammes_select ON contrats_gammes;
CREATE POLICY contrats_gammes_select ON contrats_gammes FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.can_access_contrat(contrat_id)
    );

-- Écriture manager : site du contrat ET accès gamme (commun autorisé).
DROP POLICY IF EXISTS contrats_gammes_manager_write ON contrats_gammes;
CREATE POLICY contrats_gammes_manager_write ON contrats_gammes FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND public.can_access_contrat(contrat_id)
        AND public.can_access_gamme(gamme_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND public.can_access_contrat(contrat_id)
        AND public.can_access_gamme(gamme_id)
    );

-- Écriture technicien : site du contrat ET gamme SITE (inviolabilité du commun).
DROP POLICY IF EXISTS contrats_gammes_technicien_all ON contrats_gammes;
CREATE POLICY contrats_gammes_technicien_all ON contrats_gammes FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND public.can_access_contrat(contrat_id)
        AND public.can_access_gamme_site(gamme_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND public.can_access_contrat(contrat_id)
        AND public.can_access_gamme_site(gamme_id)
    );
