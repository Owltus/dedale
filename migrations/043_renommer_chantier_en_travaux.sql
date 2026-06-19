-- =============================================================================
-- 043_renommer_chantier_en_travaux.sql
-- Renomme TOUTE la notion « chantier » en « travaux » : tables, colonnes, index,
-- fonctions + triggers (machine à états + cohérence site + purge), politiques RLS,
-- commentaires. Renommage PUR — aucune perte de données (ALTER … RENAME conserve
-- les lignes et les OID ; les triggers restent liés, les expressions de policies
-- suivent automatiquement les renommages de table/colonne).
--
-- Les CORPS de fonctions plpgsql référencent les noms par TEXTE (liaison tardive)
-- → ils ne suivent PAS un rename : on les recrée explicitement (CREATE OR REPLACE).
--
-- Après application en prod : resync de schema_complete.sql + `npm run gen:types`.
-- =============================================================================

BEGIN;

-- ── 1. Tables ────────────────────────────────────────────────────────────────
ALTER TABLE statuts_chantier                 RENAME TO statuts_travaux;
ALTER TABLE interventions_chantier           RENAME TO interventions_travaux;
ALTER TABLE chantier_localisations           RENAME TO travaux_localisations;
ALTER TABLE chantier_equipements             RENAME TO travaux_equipements;
ALTER TABLE documents_interventions_chantier RENAME TO documents_interventions_travaux;

-- ── 2. Colonnes ──────────────────────────────────────────────────────────────
ALTER TABLE interventions_travaux           RENAME COLUMN statut_chantier_id TO statut_travaux_id;
ALTER TABLE travaux_localisations           RENAME COLUMN chantier_id        TO travaux_id;
ALTER TABLE travaux_equipements             RENAME COLUMN chantier_id        TO travaux_id;
ALTER TABLE documents_interventions_travaux RENAME COLUMN chantier_id        TO travaux_id;

-- ── 3. Index ─────────────────────────────────────────────────────────────────
ALTER INDEX idx_chantier_site                   RENAME TO idx_travaux_site;
ALTER INDEX idx_chantier_statut                 RENAME TO idx_travaux_statut;
ALTER INDEX idx_chantier_created_by             RENAME TO idx_travaux_created_by;
ALTER INDEX idx_chantier_prestataire            RENAME TO idx_travaux_prestataire;
ALTER INDEX idx_chantier_cloture_by             RENAME TO idx_travaux_cloture_by;
ALTER INDEX idx_chantier_localisations_local    RENAME TO idx_travaux_localisations_local;
ALTER INDEX idx_chantier_equipements_equipement RENAME TO idx_travaux_equipements_equipement;
ALTER INDEX idx_doc_chantier_chantier           RENAME TO idx_doc_travaux_travaux;

-- ── 4. Fonctions : rename (garde l'OID → triggers liés) puis corps corrigé ───
ALTER FUNCTION public.validation_statut_initial_chantier() RENAME TO validation_statut_initial_travaux;
ALTER FUNCTION public.validation_transitions_chantier()    RENAME TO validation_transitions_travaux;
ALTER FUNCTION public.validation_chantier_compte_rendu()   RENAME TO validation_travaux_compte_rendu;
ALTER FUNCTION public.set_chantier_cloture_by()            RENAME TO set_travaux_cloture_by;
ALTER FUNCTION public.check_chantier_localisation_site()   RENAME TO check_travaux_localisation_site;
ALTER FUNCTION public.check_chantier_equipement_site()     RENAME TO check_travaux_equipement_site;

CREATE OR REPLACE FUNCTION public.validation_statut_initial_travaux()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.statut_travaux_id IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Le statut initial de travaux doit être « Ouvert » (id=1)';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validation_transitions_travaux()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.statut_travaux_id = NEW.statut_travaux_id THEN
        RETURN NEW;
    END IF;

    IF OLD.statut_travaux_id = 1 AND NEW.statut_travaux_id NOT IN (2, 3, 5) THEN
        RAISE EXCEPTION 'Transition travaux interdite depuis « Ouvert » vers statut %', NEW.statut_travaux_id;
    END IF;
    IF OLD.statut_travaux_id = 2 AND NEW.statut_travaux_id NOT IN (3, 5) THEN
        RAISE EXCEPTION 'Transition travaux interdite depuis « Planifié » vers statut %', NEW.statut_travaux_id;
    END IF;
    IF OLD.statut_travaux_id = 3 AND NEW.statut_travaux_id NOT IN (4, 5) THEN
        RAISE EXCEPTION 'Transition travaux interdite depuis « En cours » vers statut %', NEW.statut_travaux_id;
    END IF;
    IF OLD.statut_travaux_id = 4 AND NEW.statut_travaux_id NOT IN (3) THEN
        RAISE EXCEPTION 'Transition travaux interdite depuis « Terminé » vers statut %', NEW.statut_travaux_id;
    END IF;
    IF OLD.statut_travaux_id = 5 THEN
        RAISE EXCEPTION 'Travaux « Annulé » est un état terminal (aucune transition autorisée)';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validation_travaux_compte_rendu()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.statut_travaux_id = 4 AND OLD.statut_travaux_id <> 4 THEN
        IF NEW.compte_rendu IS NULL OR length(trim(NEW.compte_rendu)) = 0 THEN
            RAISE EXCEPTION 'Clôture impossible : un compte_rendu non vide est obligatoire au passage « Terminé ».';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_travaux_cloture_by()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.statut_travaux_id = 4 AND OLD.statut_travaux_id IS DISTINCT FROM 4 THEN
        -- Passage en Terminé : QUI (forcé serveur) + QUAND (date_fin si non fournie).
        NEW.cloture_by := (SELECT auth.uid());
        NEW.date_fin   := COALESCE(NEW.date_fin, current_date);
    ELSIF NEW.statut_travaux_id = 3 AND OLD.statut_travaux_id = 4 THEN
        -- Réouverture (Terminé → En cours) : les travaux ne sont plus clos.
        NEW.cloture_by := NULL;
        NEW.date_fin   := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_travaux_localisation_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_travaux_site UUID;
    v_local_site   UUID;
BEGIN
    SELECT site_id INTO v_travaux_site FROM public.interventions_travaux WHERE id = NEW.travaux_id;
    SELECT b.site_id INTO v_local_site
    FROM public.locaux    l
    JOIN public.niveaux   n ON n.id = l.niveau_id
    JOIN public.batiments b ON b.id = n.batiment_id
    WHERE l.id = NEW.local_id;

    IF v_local_site IS NULL THEN
        RAISE EXCEPTION 'travaux_localisations : local_id % introuvable ou hiérarchie incomplète', NEW.local_id;
    END IF;
    IF v_local_site <> v_travaux_site THEN
        RAISE EXCEPTION 'travaux_localisations : local_id % (site %) n''appartient pas au site % des travaux %',
            NEW.local_id, v_local_site, v_travaux_site, NEW.travaux_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_travaux_equipement_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_travaux_site UUID;
    v_eq_site      UUID;
BEGIN
    SELECT site_id INTO v_travaux_site FROM public.interventions_travaux WHERE id = NEW.travaux_id;
    SELECT b.site_id INTO v_eq_site
    FROM public.equipements e
    JOIN public.locaux    l ON l.id = e.local_id
    JOIN public.niveaux   n ON n.id = l.niveau_id
    JOIN public.batiments b ON b.id = n.batiment_id
    WHERE e.id = NEW.equipement_id;

    IF v_eq_site IS NULL THEN
        RAISE EXCEPTION 'travaux_equipements : equipement_id % introuvable ou hiérarchie incomplète', NEW.equipement_id;
    END IF;
    IF v_eq_site <> v_travaux_site THEN
        RAISE EXCEPTION 'travaux_equipements : equipement_id % (site %) n''appartient pas au site % des travaux %',
            NEW.equipement_id, v_eq_site, v_travaux_site, NEW.travaux_id;
    END IF;

    RETURN NEW;
END;
$$;

-- ── 5. Triggers : rename des NOMS (le « OF colonne » + la liaison fonction suivent) ──
ALTER TRIGGER trg_validation_statut_initial_chantier   ON interventions_travaux  RENAME TO trg_validation_statut_initial_travaux;
ALTER TRIGGER trg_validation_transitions_chantier      ON interventions_travaux  RENAME TO trg_validation_transitions_travaux;
ALTER TRIGGER trg_validation_chantier_compte_rendu     ON interventions_travaux  RENAME TO trg_validation_travaux_compte_rendu;
ALTER TRIGGER trg_chantier_set_cloture_by              ON interventions_travaux  RENAME TO trg_travaux_set_cloture_by;
ALTER TRIGGER trg_interventions_chantier_set_updated_at ON interventions_travaux RENAME TO trg_interventions_travaux_set_updated_at;
ALTER TRIGGER trg_chantier_localisation_site           ON travaux_localisations  RENAME TO trg_travaux_localisation_site;
ALTER TRIGGER trg_chantier_equipement_site             ON travaux_equipements    RENAME TO trg_travaux_equipement_site;

-- ── 6. Fonction de purge de site (corps cite la table → CREATE OR REPLACE) ───
CREATE OR REPLACE FUNCTION public.supprimer_site_cascade(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (SELECT public.current_role()) <> 'admin' THEN
        RAISE EXCEPTION 'Seul un administrateur peut supprimer un site.'
            USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.purge_active', 'on', true);

    -- 1. Activité métier (référence le structurel / le catalogue)
    DELETE FROM public.observations          WHERE site_id = p_site_id;
    DELETE FROM public.ordres_travail        WHERE site_id = p_site_id;
    DELETE FROM public.interventions_travaux WHERE site_id = p_site_id;
    DELETE FROM public.demandes_intervention WHERE site_id = p_site_id;
    DELETE FROM public.investissements       WHERE site_id = p_site_id;

    DELETE FROM public.contrats_gammes
    WHERE contrat_id IN (SELECT id FROM public.contrats WHERE site_id = p_site_id);

    LOOP
        DELETE FROM public.contrats c
        WHERE c.site_id = p_site_id
          AND NOT EXISTS (
              SELECT 1 FROM public.contrats ch WHERE ch.contrat_parent_id = c.id
          );
        EXIT WHEN NOT FOUND;
    END LOOP;

    DELETE FROM public.gammes WHERE site_id = p_site_id;

    DELETE FROM public.gammes_equipements
    WHERE equipement_id IN (
        SELECT e.id
        FROM public.equipements e
        JOIN public.locaux l    ON l.id = e.local_id
        JOIN public.niveaux n   ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE b.site_id = p_site_id
    );

    DELETE FROM public.equipements
    WHERE local_id IN (
        SELECT l.id
        FROM public.locaux l
        JOIN public.niveaux n   ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE b.site_id = p_site_id
    );
    DELETE FROM public.modeles_equipements WHERE site_id = p_site_id;
    DELETE FROM public.modeles_operations  WHERE site_id = p_site_id;

    DELETE FROM public.locaux
    WHERE niveau_id IN (
        SELECT n.id
        FROM public.niveaux n
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE b.site_id = p_site_id
    );
    DELETE FROM public.niveaux
    WHERE batiment_id IN (SELECT id FROM public.batiments WHERE site_id = p_site_id);
    DELETE FROM public.batiments WHERE site_id = p_site_id;

    LOOP
        DELETE FROM public.categories c
        WHERE c.site_id = p_site_id
          AND NOT EXISTS (
              SELECT 1 FROM public.categories ch WHERE ch.parent_id = c.id
          );
        EXIT WHEN NOT FOUND;
    END LOOP;

    DELETE FROM public.documents WHERE site_id = p_site_id;

    DELETE FROM public.sites WHERE id = p_site_id;
END;
$$;

-- ── 7. Politiques RLS : rename des NOMS (les expressions suivent les renommages) ──
ALTER POLICY chantier_admin_all          ON interventions_travaux RENAME TO travaux_admin_all;
ALTER POLICY chantier_site_scoped_select ON interventions_travaux RENAME TO travaux_site_scoped_select;
ALTER POLICY chantier_site_scoped_insert ON interventions_travaux RENAME TO travaux_site_scoped_insert;
ALTER POLICY chantier_site_scoped_update ON interventions_travaux RENAME TO travaux_site_scoped_update;

ALTER POLICY chantier_localisations_admin_all ON travaux_localisations RENAME TO travaux_localisations_admin_all;
ALTER POLICY chantier_localisations_select    ON travaux_localisations RENAME TO travaux_localisations_select;
ALTER POLICY chantier_localisations_scoped    ON travaux_localisations RENAME TO travaux_localisations_scoped;
ALTER POLICY chantier_equipements_admin_all   ON travaux_equipements   RENAME TO travaux_equipements_admin_all;
ALTER POLICY chantier_equipements_select      ON travaux_equipements   RENAME TO travaux_equipements_select;
ALTER POLICY chantier_equipements_scoped      ON travaux_equipements   RENAME TO travaux_equipements_scoped;

ALTER POLICY doc_chantier_admin_all ON documents_interventions_travaux RENAME TO doc_travaux_admin_all;
ALTER POLICY doc_chantier_scoped    ON documents_interventions_travaux RENAME TO doc_travaux_scoped;
ALTER POLICY doc_chantier_select    ON documents_interventions_travaux RENAME TO doc_travaux_select;

ALTER POLICY statuts_chantier_authenticated_read ON statuts_travaux RENAME TO statuts_travaux_authenticated_read;
ALTER POLICY statuts_chantier_admin_write        ON statuts_travaux RENAME TO statuts_travaux_admin_write;

-- ── 8. Commentaires (tables, colonnes, fonctions) ───────────────────────────
COMMENT ON TABLE interventions_travaux IS
    'Travaux ponctuels (souvent prestataire). Machine à états 1→2/3→4 via statuts_travaux.';
COMMENT ON COLUMN interventions_travaux.cloture_by IS
    'Qui a passé les travaux en Terminé. Peuplé par trigger set_travaux_cloture_by (valeur forcée serveur). NULL tant que non terminé ou réouvert.';
COMMENT ON TABLE travaux_localisations IS
    'Localisations concernées par des travaux (locaux du même site).';
COMMENT ON TABLE travaux_equipements IS
    'Équipements concernés par des travaux (équipements du même site).';

COMMENT ON FUNCTION public.validation_statut_initial_travaux() IS 'Force tout nouveau lot de travaux à démarrer en statut Ouvert (id=1).';
COMMENT ON FUNCTION public.validation_transitions_travaux() IS 'Machine à états travaux : 1→2/3/5, 2→3/5, 3→4/5, 4→3 (réouverture), 5 terminal.';
COMMENT ON FUNCTION public.validation_travaux_compte_rendu() IS 'Passage à Terminé exige un compte_rendu non vide (miroir validation_resolution_di).';
COMMENT ON FUNCTION public.set_travaux_cloture_by() IS 'Peuple cloture_by + date_fin au passage travaux → Terminé (4) ; les efface à la réouverture (4→3). Valeurs forcées serveur.';
COMMENT ON FUNCTION public.check_travaux_localisation_site() IS 'Pattern 6 — un local rattaché à des travaux doit appartenir au site des travaux.';
COMMENT ON FUNCTION public.check_travaux_equipement_site() IS 'Pattern 6 — un équipement rattaché à des travaux doit appartenir au site des travaux.';

-- ── 9. Contraintes & index à noms AUTO-GÉNÉRÉS (PK/FK/CHECK + index implicites) ──
-- ALTER TABLE … RENAME ne renomme NI les contraintes NI l'index de PK : sans ça,
-- la prod garderait « interventions_chantier_pkey », « …_chantier_id_fkey », etc.,
-- divergeant d'une build fraîche (schema_complete = source de vérité). DO dynamique
-- → robuste aux noms tronqués (63 car.) ou suffixés (_check1). Le rename de la
-- contrainte PK renomme aussi son index implicite ; la 2e boucle balaie le reste.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname, c.conrelid::regclass::text AS tbl
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public' AND c.conname LIKE '%chantier%'
    LOOP
        EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
                       r.tbl, r.conname, replace(r.conname, 'chantier', 'travaux'));
    END LOOP;

    FOR r IN
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname LIKE '%chantier%'
    LOOP
        EXECUTE format('ALTER INDEX public.%I RENAME TO %I',
                       r.indexname, replace(r.indexname, 'chantier', 'travaux'));
    END LOOP;
END;
$$;

COMMIT;
