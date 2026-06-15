-- =============================================================================
-- 020 — Vue v_miniatures_pool : usage (origines + libellés liés) des vignettes.
-- =============================================================================
-- Objectif UX : dans le modal « Choisir une image » et l'onglet Vignettes,
-- pouvoir (1) filtrer les vignettes par ORIGINE (la/les familles d'entités qui les
-- référencent) et (2) chercher une image par le NOM des entités auxquelles elle est
-- déjà liée.
--
-- La vue enrichit chaque vignette de :
--   - origines TEXT[]  : familles distinctes qui la référencent
--       'equipement'        (modèles d'équipement, équipements, catégories équip./mixte)
--       'operation'         (modèles d'opération, catégories opération)
--       'plan_maintenance'  (gammes, catégories gamme/mixte)
--       'di'                (modèles de DI)
--       'lieux'             (prestataires, bâtiments, niveaux, locaux)
--     → tableau VIDE = vignette inutilisée (aucune référence visible).
--   - libelles TEXT    : noms des entités liées concaténés (cible de la recherche).
--
-- security_invoker = true (convention du projet, cf. v_equipements_complet) : la vue
-- s'exécute avec les droits de l'appelant → la RLS des tables sous-jacentes
-- s'applique, donc origines/libelles ne reflètent QUE l'usage visible par
-- l'utilisateur (pas de fuite de noms d'entités hors de son périmètre).
--
-- Les écritures (upload/suppression) continuent de cibler la table `miniatures` ;
-- seule la LECTURE du pool passe par cette vue.
--
-- À FAIRE APRÈS DÉPLOIEMENT : `npm run gen:types`.
-- =============================================================================

CREATE OR REPLACE VIEW public.v_miniatures_pool AS
WITH refs AS (
    SELECT miniature_id, 'equipement'::text AS origine, nom AS libelle
      FROM public.modeles_equipements
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'equipement', nom
      FROM public.equipements
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'equipement', nom
      FROM public.categories
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
       AND scope IN ('equipement', 'mixte')
    UNION ALL
    SELECT miniature_id, 'operation', nom
      FROM public.modeles_operations
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'operation', nom
      FROM public.categories
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
       AND scope = 'operation'
    UNION ALL
    SELECT miniature_id, 'plan_maintenance', nom
      FROM public.gammes
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'plan_maintenance', nom
      FROM public.categories
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
       AND scope IN ('gamme', 'mixte')
    UNION ALL
    SELECT miniature_id, 'di', libelle
      FROM public.modeles_di
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'lieux', libelle
      FROM public.prestataires
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'lieux', nom
      FROM public.batiments
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'lieux', nom
      FROM public.niveaux
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'lieux', nom
      FROM public.locaux
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
),
agg AS (
    SELECT miniature_id,
           array_agg(DISTINCT origine ORDER BY origine) AS origines,
           string_agg(DISTINCT libelle, ' ')            AS libelles
      FROM refs
     GROUP BY miniature_id
)
SELECT
    m.id,
    m.site_id,
    m.hash_sha256,
    m.storage_path,
    m.created_at,
    m.created_by,
    COALESCE(a.origines, ARRAY[]::text[]) AS origines,
    COALESCE(a.libelles, '')             AS libelles
  FROM public.miniatures m
  LEFT JOIN agg a ON a.miniature_id = m.id;

ALTER VIEW public.v_miniatures_pool SET (security_invoker = true);
GRANT SELECT ON public.v_miniatures_pool TO anon, authenticated;

COMMENT ON VIEW public.v_miniatures_pool IS
    'Pool de vignettes enrichi de l''usage : origines TEXT[] (familles d''entités qui référencent la vignette : equipement / operation / plan_maintenance / di / lieux ; vide = inutilisée) et libelles TEXT (noms des entités liées, pour la recherche). security_invoker → respecte la RLS (usage visible par l''appelant uniquement). Lecture seule ; les écritures ciblent la table miniatures. (020)';
