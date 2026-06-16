-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  033_locaux_chauffe_climatise.sql                                           ║
-- ║  Surface CHAUFFÉE / CLIMATISÉE : drapeau par local + remontée du total.     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- Chaque local indique s'il est chauffé/climatisé (oui/non). Les vues d'agrégation
-- (032) gagnent une 2e somme : la surface chauffée/climatisée roulée par niveau et
-- par bâtiment (CREATE OR REPLACE : la colonne est AJOUTÉE EN FIN, autorisé).

ALTER TABLE public.locaux
  ADD COLUMN IF NOT EXISTS chauffe_climatise BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.v_niveaux_surface AS
SELECT
    n.id                            AS niveau_id,
    n.batiment_id,
    COALESCE(SUM(l.surface_m2), 0)  AS surface_m2,
    COALESCE(
      SUM(l.surface_m2) FILTER (WHERE l.chauffe_climatise), 0
    )                               AS surface_chauffee_m2
FROM public.niveaux n
LEFT JOIN public.locaux l ON l.niveau_id = n.id AND l.deleted_at IS NULL
WHERE n.deleted_at IS NULL
GROUP BY n.id, n.batiment_id;

CREATE OR REPLACE VIEW public.v_batiments_surface AS
SELECT
    b.id                            AS batiment_id,
    b.site_id,
    COALESCE(SUM(l.surface_m2), 0)  AS surface_m2,
    COALESCE(
      SUM(l.surface_m2) FILTER (WHERE l.chauffe_climatise), 0
    )                               AS surface_chauffee_m2
FROM public.batiments b
LEFT JOIN public.niveaux n ON n.batiment_id = b.id AND n.deleted_at IS NULL
LEFT JOIN public.locaux  l ON l.niveau_id = n.id   AND l.deleted_at IS NULL
WHERE b.deleted_at IS NULL
GROUP BY b.id, b.site_id;
