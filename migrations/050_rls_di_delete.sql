-- =============================================================================
-- 050 — Demandes d'intervention : politiques de SUPPRESSION (DELETE)
-- =============================================================================
-- Jusqu'ici, seul l'admin pouvait SUPPRIMER une DI (di_admin_all FOR ALL ; aucune
-- policy DELETE site-scopée ni demandeur). Décision PO :
--   - manager + technicien : suppriment toute DI de LEURS sites (au même titre
--     qu'ils la modifient déjà — di_site_scoped_update).
--   - demandeur : supprime SA propre DI tant qu'elle est Ouverte (statut 1) — il
--     gère son petit périmètre. Une fois Résolue/Réouverte, plus de suppression.
--   - lecteur : jamais (aucune policy DELETE).
--
-- Les liaisons (di_localisations / di_equipements) et documents liés (documents_di)
-- partent en cascade (ON DELETE CASCADE). Pas de gen:types (une policy ne change
-- pas les types générés).
--
-- IDEMPOTENT (DROP IF EXISTS avant CREATE) : ré-exécutable sans erreur, y compris
-- si une version antérieure de cette migration a déjà posé di_site_scoped_delete.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS di_site_scoped_delete ON demandes_intervention;
CREATE POLICY di_site_scoped_delete ON demandes_intervention FOR DELETE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

DROP POLICY IF EXISTS di_demandeur_delete ON demandes_intervention;
CREATE POLICY di_demandeur_delete ON demandes_intervention FOR DELETE
    USING (
        (SELECT public.current_role()) = 'demandeur'
        AND created_by = (SELECT auth.uid())
        AND statut_di_id = 1
    );

COMMIT;
