-- ============================================================================
-- 035_hard_delete_retrait_soft_delete.sql
-- ----------------------------------------------------------------------------
-- Phase 2 du chantier « purge de la corbeille » (suppressions définitives).
--
-- Retire la machinerie de SOFT-DELETE et autorise le DELETE physique. Décision
-- PO : on CONSERVE tous les garde-fous d'intégrité (FK RESTRICT + BEFORE DELETE
-- métier) — la suppression devient simplement *réelle* au lieu d'un tag
-- `deleted_at`. AUCUNE FK n'est modifiée (pas de cascade) : les ON DELETE
-- RESTRICT natifs bloquent déjà le hard-delete d'un conteneur non vide
-- (catégorie/sous-catégorie, bâtiment/niveau/local) et renvoient 23503.
--
-- À déployer APRÈS 034 (pré-purge), AVANT 036 (DROP COLUMN deleted_at).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Cascades corbeille (AFTER UPDATE OF deleted_at) — inutiles en hard-delete.
--    En hard-delete, on NE descend PAS automatiquement : un conteneur non vide
--    est refusé par FK RESTRICT (l'utilisateur vide d'abord). Pas de cascade.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_gammes_cascade_corbeille   ON public.gammes;
DROP TRIGGER IF EXISTS trg_sites_cascade_corbeille    ON public.sites;
DROP TRIGGER IF EXISTS trg_batiments_cascade_corbeille ON public.batiments;
DROP TRIGGER IF EXISTS trg_niveaux_cascade_corbeille  ON public.niveaux;
DROP TRIGGER IF EXISTS trg_locaux_cascade_corbeille   ON public.locaux;
DROP FUNCTION IF EXISTS public.cascade_corbeille_gamme();
DROP FUNCTION IF EXISTS public.cascade_corbeille_spatial();

-- ----------------------------------------------------------------------------
-- 2. Contrôles BEFORE UPDATE OF deleted_at — redondants en hard-delete avec les
--    FK RESTRICT (categories.parent_id, gammes.categorie_id,
--    modeles_equipements.categorie_id, modeles_operations.categorie_id ;
--    gamme_modeles.modele_operation_id + validation_suppression_gamme_type_globale).
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_check_categorie_suppression ON public.categories;
DROP FUNCTION IF EXISTS public.check_categorie_suppression();
DROP TRIGGER IF EXISTS trg_modeles_operations_check_suppression ON public.modeles_operations;
DROP FUNCTION IF EXISTS public.check_modele_operation_suppression();

-- ----------------------------------------------------------------------------
-- 3. Cron de purge 90j — plus de corbeille à purger. (cleanup_storage_orphans
--    reste planifié : il nettoie les blobs orphelins, indépendant du soft-delete.)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    PERFORM cron.unschedule('purge_corbeille_90j');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'cron purge_corbeille_90j déjà absent (rien à désplanifier).';
END$$;
DROP FUNCTION IF EXISTS public.purge_corbeille_90j();

-- ----------------------------------------------------------------------------
-- 4. protection_ot_terminaux : AUTORISER le DELETE physique (fin du soft-delete).
--    On conserve l'immutabilité des OT terminaux sur UPDATE et le figeage de
--    gamme_id. On retire la condition deleted_at de la comparaison (la colonne
--    disparaît en 036 ; un OT terminal n'a plus de soft-delete à autoriser).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protection_ot_terminaux()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- DELETE physique désormais AUTORISÉ (suppressions définitives, décision PO).
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    -- gamme_id figé après création (snapshots). Passage à NULL toléré (legacy).
    IF NEW.gamme_id IS NOT NULL
       AND OLD.gamme_id IS DISTINCT FROM NEW.gamme_id THEN
        RAISE EXCEPTION 'gamme_id est figé à la création de l''OT — annulez et recréez si nécessaire';
    END IF;

    -- OT terminal (cloture/annule) : lecture seule hors transition de statut.
    IF OLD.statut IN ('cloture', 'annule')
       AND OLD.statut = NEW.statut
       AND (OLD.nom_gamme,       OLD.description_gamme, OLD.date_prevue,
            OLD.date_debut,      OLD.date_cloture,      OLD.commentaires,
            OLD.prestataire_id,  OLD.motif_annulation,
            OLD.nature_gamme,    OLD.nom_prestataire,   OLD.libelle_periodicite, OLD.jours_periodicite)
        IS DISTINCT FROM
           (NEW.nom_gamme,       NEW.description_gamme, NEW.date_prevue,
            NEW.date_debut,      NEW.date_cloture,      NEW.commentaires,
            NEW.prestataire_id,  NEW.motif_annulation,
            NEW.nature_gamme,    NEW.nom_prestataire,   NEW.libelle_periodicite, NEW.jours_periodicite)
    THEN
        RAISE EXCEPTION 'Modification interdite : OT en statut terminal (%). Réouvrez-le d''abord.', OLD.statut;
    END IF;

    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.protection_ot_terminaux() IS
    'Immutabilité NF EN 13306 sur UPDATE : OT cloture/annule = lecture seule (réouverture pour modifier). gamme_id figé. 035 : le DELETE physique est désormais AUTORISÉ (fin du soft-delete).';

-- ----------------------------------------------------------------------------
-- 5. detacher_et_supprimer_modele_operation : passe du soft-delete au DELETE
--    physique (étape 4 ci-dessous). Le reste (droits, détachement des liaisons
--    cross-site, atomicité) est INCHANGÉ.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detacher_et_supprimer_modele_operation(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := public.current_role();
  v_site uuid;
BEGIN
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Action non autorisée : utilisateur non authentifié ou désactivé.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role NOT IN ('admin', 'manager', 'technicien') THEN
    RAISE EXCEPTION 'Action non autorisée : droits insuffisants pour supprimer ce modèle d''opération.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT site_id INTO v_site
  FROM public.modeles_operations
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modèle d''opération introuvable.'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    v_role = 'admin'
    OR (v_role = 'manager'    AND (v_site IS NULL OR public.has_site_access(v_site)))
    OR (v_role = 'technicien' AND v_site IS NOT NULL AND public.has_site_access(v_site))
  ) THEN
    RAISE EXCEPTION 'Action non autorisée : droits insuffisants pour supprimer ce modèle d''opération.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Détacher TOUTES les liaisons (cross-site inclus, RLS contournée). Triggers
  -- BEFORE DELETE de gamme_modeles actifs → restrict_violation possible (roll back).
  DELETE FROM public.gamme_modeles WHERE modele_operation_id = p_id;

  -- 035 : suppression PHYSIQUE (ex-soft-delete). Plus aucune liaison vivante
  -- après le détachement → validation_suppression_gamme_type_globale passe ;
  -- les items partent en CASCADE avec le modèle.
  DELETE FROM public.modeles_operations WHERE id = p_id;
END;
$$;
COMMENT ON FUNCTION public.detacher_et_supprimer_modele_operation(uuid) IS
    'Détache toutes les liaisons gamme_modeles d''un modèle d''opération PUIS le SUPPRIME physiquement (035 : ex-soft-delete), en une transaction atomique. SECURITY DEFINER pour détacher aussi les liaisons cross-site ; rejoue la règle d''écriture de modeles_operations. Les BEFORE DELETE de gamme_modeles (dernière op préventive active, OT actifs) restent actifs.';

-- ----------------------------------------------------------------------------
-- 6. RGPD : nettoyage Storage à la suppression PHYSIQUE d'un document. Le cron
--    de purge 90j faisait ce travail ; en hard-delete on le déclenche par
--    trigger AFTER DELETE (le blob est retiré dès qu'il n'est plus rattaché).
--    Filet supplémentaire : le cron mensuel cleanup_storage_orphans demeure.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_document_blob()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Ne retire le fichier que s'il n'est plus rattaché nulle part (test global
    -- hors RLS) : sûr pour un hash partagé entre plusieurs entités/portées.
    IF OLD.storage_path IS NOT NULL
       AND NOT public.storage_objet_rattache(OLD.storage_path) THEN
        PERFORM set_config('storage.allow_delete_query', 'true', true);
        DELETE FROM storage.objects
            WHERE bucket_id = 'documents' AND name = OLD.storage_path;
    END IF;
    RETURN OLD;
END;
$$;
COMMENT ON FUNCTION public.cleanup_document_blob() IS
    '035 RGPD : AFTER DELETE ON documents — supprime le blob Storage du document si plus rattaché nulle part (remplace le nettoyage que faisait purge_corbeille_90j). Filet : cleanup_storage_orphans (mensuel).';

DROP TRIGGER IF EXISTS trg_documents_cleanup_blob ON public.documents;
CREATE TRIGGER trg_documents_cleanup_blob
    AFTER DELETE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.cleanup_document_blob();

COMMIT;
