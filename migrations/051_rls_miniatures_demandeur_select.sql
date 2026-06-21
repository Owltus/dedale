-- =============================================================================
-- 051 — miniatures : lecture autorisée au DEMANDEUR (vignettes des modèles)
-- =============================================================================
-- Le demandeur choisit un « problème courant » (modeles_di de son site) à la
-- création d'une DI, mais ne VOYAIT pas la vignette du modèle : la policy
-- miniatures_select ne listait pas 'demandeur'. Ce même manque bloquait le Storage
-- (la policy SELECT v0.20 du bucket 'documents' n'autorise un fichier que s'il
-- existe une miniature VISIBLE le pointant → EXISTS … FROM miniatures, soumis à la
-- RLS de la table). En débloquant la lecture de `miniatures`, on débloque donc les
-- DEUX verrous d'un coup.
--
-- LECTURE SEULE, scope inchangé (commun NULL + sites assignés via has_site_access).
-- Aucun droit d'écriture : les policies miniatures_*_all restent admin/manager/
-- technicien. Pas de gen:types (une policy ne change pas les types générés).
--
-- IDEMPOTENT (DROP IF EXISTS avant CREATE) : ré-exécutable sans erreur.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS miniatures_select ON miniatures;
CREATE POLICY miniatures_select ON miniatures FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager','technicien','lecteur','demandeur')
           AND (site_id IS NULL OR public.has_site_access(site_id)));

COMMIT;
