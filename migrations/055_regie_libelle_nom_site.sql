-- =============================================================================
-- 055 — Régie interne : libellé = nom du site (suppression du préfixe)
-- =============================================================================
-- Décision PO : le préfixe « Régie interne — » est retiré. L'équipe interne d'un
-- site prend simplement le NOM DU SITE comme libellé. Le mécanisme est INCHANGÉ
-- (1 interne par site, est_interne=true, fallback de resolve_prestataire_effectif) ;
-- seul l'affichage change (le front lit prestataires.libelle). Les internes sont
-- hors de l'unicité de libellé (uq_prestataires_libelle_active WHERE
-- est_interne=false) → aucun conflit même si un externe porte le même nom.
--
-- IDEMPOTENT (CREATE OR REPLACE + UPDATE gardé par IS DISTINCT FROM).
-- Pas de gen:types (aucune colonne ne change).
-- =============================================================================

BEGIN;

-- 1) Trigger : un nouveau site crée son équipe interne nommée = nom du site.
CREATE OR REPLACE FUNCTION public.create_interne_for_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_presta_id UUID;
BEGIN
    INSERT INTO public.prestataires (libelle, metier, est_interne, site_id)
    VALUES (NEW.nom, 'Maintenance interne', true, NEW.id)
    RETURNING id INTO v_presta_id;

    INSERT INTO public.prestataires_sites (prestataire_id, site_id)
    VALUES (v_presta_id, NEW.id);

    RETURN NEW;
END;
$$;

-- 2) Renomme les équipes internes EXISTANTES : libellé = nom de leur site.
--    (Le trigger de protection n'interdit que la bascule du flag est_interne,
--     pas le changement de libellé.)
UPDATE public.prestataires p
   SET libelle = s.nom
  FROM public.sites s
 WHERE p.site_id = s.id
   AND p.est_interne = true
   AND p.libelle IS DISTINCT FROM s.nom;

COMMIT;
