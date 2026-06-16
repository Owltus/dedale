-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  032_surfaces_agregees.sql                                                  ║
-- ║  Remontée des surfaces : un niveau hérite de la somme des surfaces de ses   ║
-- ║  locaux ; un bâtiment de la somme de ses niveaux.                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- Vues d'agrégation lues côté front pour afficher la surface roulée par niveau et
-- par bâtiment. `security_invoker` → la somme ne compte que les lignes visibles
-- par l'utilisateur (RLS des tables batiments/niveaux/locaux). Soft-delete exclu.

CREATE VIEW public.v_niveaux_surface AS
SELECT
    n.id                            AS niveau_id,
    n.batiment_id,
    COALESCE(SUM(l.surface_m2), 0)  AS surface_m2
FROM public.niveaux n
LEFT JOIN public.locaux l ON l.niveau_id = n.id AND l.deleted_at IS NULL
WHERE n.deleted_at IS NULL
GROUP BY n.id, n.batiment_id;

ALTER VIEW public.v_niveaux_surface SET (security_invoker = true);
GRANT SELECT ON public.v_niveaux_surface TO anon, authenticated;
COMMENT ON VIEW public.v_niveaux_surface IS
    'Surface roulée d''un niveau = somme des surfaces de ses locaux (vivants).';

CREATE VIEW public.v_batiments_surface AS
SELECT
    b.id                            AS batiment_id,
    b.site_id,
    COALESCE(SUM(l.surface_m2), 0)  AS surface_m2
FROM public.batiments b
LEFT JOIN public.niveaux n ON n.batiment_id = b.id AND n.deleted_at IS NULL
LEFT JOIN public.locaux  l ON l.niveau_id = n.id   AND l.deleted_at IS NULL
WHERE b.deleted_at IS NULL
GROUP BY b.id, b.site_id;

ALTER VIEW public.v_batiments_surface SET (security_invoker = true);
GRANT SELECT ON public.v_batiments_surface TO anon, authenticated;
COMMENT ON VIEW public.v_batiments_surface IS
    'Surface roulée d''un bâtiment = somme des surfaces de tous ses locaux (vivants).';
