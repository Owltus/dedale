-- =============================================================================
-- 053 — Alignement des droits de SUPPRESSION (DELETE) sur la matrice RLS
-- =============================================================================
-- CONTEXTE — Jusqu'ici, sur la plupart des tables métier, seul l'admin pouvait
-- SUPPRIMER : la seule policy couvrant le DELETE était `*_admin_all FOR ALL`
-- (USING current_role() = 'admin'). Or manager + technicien MODIFIENT déjà ces
-- entités sur LEURS sites (policies *_site_scoped_update / *_technicien_update /
-- *_manager_update). La matrice veut qu'ils puissent aussi les SUPPRIMER dans
-- leur périmètre. La DI a déjà ce traitement (migration 050, di_site_scoped_delete) ;
-- cette migration l'étend aux autres tables.
--
-- RÈGLE D'OR (zéro fuite cross-site) — chaque policy DELETE CALQUE EXACTEMENT la
-- clause USING de la policy UPDATE site-scopée existante de la MÊME table. On ne
-- réinvente aucun scope : on copie le prédicat de rôle + d'accès au site déjà en
-- vigueur en écriture. Les policies sont PERMISSIVE (défaut) → ORées avec
-- `*_admin_all` (l'admin conserve son court-circuit).
--
-- CE QUI NE BOUGE PAS :
--   - `sites` : suppression admin-only (doctrine — aucune policy ajoutée).
--   - Triggers (ex. protect_prestataire_interne) et FK RESTRICT : ils restent
--     l'arbitre des suppressions bloquées (conteneur non vide, prestataire
--     interne, etc.). La RLS n'AUTORISE que l'accès ; le métier valide.
--   - Le rôle `lecteur` (et `demandeur` hors DI) : jamais de DELETE (aucune policy).
--
-- DÉTAIL DU CALQUE :
--   - batiments / niveaux / locaux / equipements : calque *_site_scoped_update
--     (manager+technicien + accès au site, remonté via la hiérarchie spatiale).
--   - categories : UPDATE scindé par rôle (manager gère le commun site_id NULL ;
--     technicien UNIQUEMENT le scope site, site_id NOT NULL). DELETE scindé idem.
--   - prestataires : UPDATE scindé par rôle, convention « prestataire sans site
--     (interne/transverse) = éditable par tous ». DELETE scindé idem.
--   - interventions_travaux / investissements : calque travaux_/capex_site_scoped_update.
--   - documents (hard-delete) : UPDATE scindé manager/technicien partage le MÊME
--     prédicat site `(site_id IS NULL OR has_site_access(site_id))` → une seule
--     policy combinée IN ('manager','technicien') = union exacte des deux UPDATE.
--   - storage.objects (storage_objects_delete_documents) : on AJOUTE 'technicien'
--     à la liste de rôles (admin/manager → admin/manager/technicien). Les helpers
--     storage_objet_modifiable / storage_objet_rattache autorisent DÉJÀ 'technicien'
--     (rattache : garde IN ('admin','manager','technicien') ; modifiable : SECURITY
--     INVOKER sans garde de rôle). Le scope-gating par entité visible est conservé.
--
-- IDEMPOTENT (DROP IF EXISTS avant CREATE), dans une transaction. Pas de gen:types
-- (une policy ne change pas les types générés).
-- =============================================================================

BEGIN;

-- ── 1. batiments ─ calque batiments_site_scoped_update ───────────────────────
DROP POLICY IF EXISTS batiments_site_scoped_delete ON batiments;
CREATE POLICY batiments_site_scoped_delete ON batiments FOR DELETE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

-- ── 2. niveaux ─ calque niveaux_site_scoped_update (site via batiment) ───────
DROP POLICY IF EXISTS niveaux_site_scoped_delete ON niveaux;
CREATE POLICY niveaux_site_scoped_delete ON niveaux FOR DELETE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND EXISTS (
            SELECT 1 FROM batiments b
            WHERE b.id = niveaux.batiment_id
              AND public.has_site_access(b.site_id)
        )
    );

-- ── 3. locaux ─ calque locaux_site_scoped_update (site via niveau → batiment) ─
DROP POLICY IF EXISTS locaux_site_scoped_delete ON locaux;
CREATE POLICY locaux_site_scoped_delete ON locaux FOR DELETE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND EXISTS (
            SELECT 1 FROM niveaux n
            JOIN batiments b ON b.id = n.batiment_id
            WHERE n.id = locaux.niveau_id
              AND public.has_site_access(b.site_id)
        )
    );

-- ── 4. equipements ─ calque equipements_site_scoped_update (can_access_local) ─
DROP POLICY IF EXISTS equipements_site_scoped_delete ON equipements;
CREATE POLICY equipements_site_scoped_delete ON equipements FOR DELETE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.can_access_local(local_id)
    );

-- ── 5. categories ─ UPDATE scindé par rôle → DELETE scindé idem ───────────────
-- Manager : commun (site_id NULL) OU site accessible — calque categories_site_scoped_update.
DROP POLICY IF EXISTS categories_site_scoped_delete ON categories;
CREATE POLICY categories_site_scoped_delete ON categories FOR DELETE
    USING (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- Technicien : UNIQUEMENT le scope site (site_id NOT NULL) — calque categories_technicien_update.
-- Le commun (site_id NULL) reste réservé admin + manager (inviolabilité biblio).
DROP POLICY IF EXISTS categories_technicien_delete ON categories;
CREATE POLICY categories_technicien_delete ON categories FOR DELETE
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    );

-- ── 6. prestataires ─ UPDATE scindé par rôle → DELETE scindé idem ─────────────
-- Convention « prestataire sans site = visible/éditable par tous » (NOT EXISTS) OU
-- accès à un de ses sites. Le trigger protect_prestataire_interne protège l'interne.
-- Manager — calque prestataires_manager_update.
DROP POLICY IF EXISTS prestataires_manager_delete ON prestataires;
CREATE POLICY prestataires_manager_delete ON prestataires FOR DELETE
    USING (
        (SELECT public.current_role()) = 'manager'
        AND (
            NOT EXISTS (SELECT 1 FROM prestataires_sites ps WHERE ps.prestataire_id = prestataires.id)
            OR EXISTS (
                SELECT 1 FROM prestataires_sites ps
                WHERE ps.prestataire_id = prestataires.id
                  AND public.has_site_access(ps.site_id)
            )
        )
    );

-- Technicien — calque prestataires_technicien_update.
DROP POLICY IF EXISTS prestataires_technicien_delete ON prestataires;
CREATE POLICY prestataires_technicien_delete ON prestataires FOR DELETE
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND (
            NOT EXISTS (SELECT 1 FROM prestataires_sites ps WHERE ps.prestataire_id = prestataires.id)
            OR EXISTS (
                SELECT 1 FROM prestataires_sites ps
                WHERE ps.prestataire_id = prestataires.id
                  AND public.has_site_access(ps.site_id)
            )
        )
    );

-- ── 7. interventions_travaux ─ calque travaux_site_scoped_update ──────────────
DROP POLICY IF EXISTS travaux_site_scoped_delete ON interventions_travaux;
CREATE POLICY travaux_site_scoped_delete ON interventions_travaux FOR DELETE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

-- ── 8. investissements ─ calque capex_site_scoped_update ──────────────────────
DROP POLICY IF EXISTS capex_site_scoped_delete ON investissements;
CREATE POLICY capex_site_scoped_delete ON investissements FOR DELETE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

-- ── 9. documents (hard-delete) ─ union exacte de documents_manager_update +
-- documents_technicien_update (prédicat site identique pour les deux rôles).
DROP POLICY IF EXISTS documents_site_scoped_delete ON documents;
CREATE POLICY documents_site_scoped_delete ON documents FOR DELETE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- ── 10. storage.objects ─ DELETE des blobs : ajout du rôle 'technicien' ───────
-- Aligne la suppression Storage sur le hard-delete documents : le technicien peut
-- désormais supprimer un blob de SON périmètre. Le scope-gating reste assuré par
-- storage_objet_modifiable(name) (objet référencé par une entité VISIBLE, ou
-- orphelin) — admin court-circuite. Helpers déjà compatibles 'technicien' (cf.
-- en-tête). ⚠️ PORTABILITÉ HÉBERGÉ (v0.36) : création DIRECTE (sans SET ROLE,
-- refusé en hébergé) dans un bloc NON BLOQUANT (NOTICE + fallback Dashboard si refus).
DO $do$
BEGIN
    EXECUTE $pol$DROP POLICY IF EXISTS storage_objects_delete_documents ON storage.objects$pol$;
    EXECUTE $pol$CREATE POLICY storage_objects_delete_documents ON storage.objects FOR DELETE
        USING (bucket_id = 'documents' AND (SELECT public.current_role()) IN ('admin','manager','technicien') AND public.storage_objet_modifiable(name))$pol$;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Policy storage_objects_delete_documents non mise à jour via SQL (% : %) — ajouter ''technicien'' à la liste de rôles via le Dashboard (Storage → Policies).', SQLSTATE, SQLERRM;
END
$do$;

COMMIT;
