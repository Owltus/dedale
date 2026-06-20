-- =============================================================================
-- 044 — Tâches de travaux (to-do list à statuts)
-- =============================================================================
-- Ajoute une liste de TÂCHES À STATUT sur un travail (interventions_travaux),
-- dans l'esprit des operations_execution d'un ordre de travail. Chaque tâche :
-- un libellé libre, rattachée FACULTATIVEMENT à un local et/ou un équipement du
-- même site, avec un statut parmi :
--   en_attente · en_cours · realise · non_realise · non_applicable
--
-- Les anciennes liaisons à plat travaux_localisations / travaux_equipements ne
-- sont PAS supprimées (non destructif) ; le front cesse simplement de les
-- alimenter au profit des tâches. Une migration ultérieure pourra les retirer
-- une fois confirmées vides.
--
-- Dépendances : interventions_travaux, locaux, niveaux, batiments, equipements,
--   users, public.set_updated_at(), public.has_site_access(), public.current_role().
-- =============================================================================

BEGIN;

-- ── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE travaux_taches (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    travaux_id     UUID NOT NULL REFERENCES interventions_travaux(id) ON DELETE CASCADE,
    -- Local / équipement concernés : facultatifs. SET NULL pour NE PAS perdre la
    -- tâche si l'un d'eux est supprimé (cohérent avec prestataire_id/cloture_by).
    local_id       UUID REFERENCES locaux(id)      ON DELETE SET NULL,
    equipement_id  UUID REFERENCES equipements(id) ON DELETE SET NULL,
    libelle        TEXT NOT NULL CHECK (length(trim(libelle)) > 0),
    statut         TEXT NOT NULL DEFAULT 'en_attente'
                   CHECK (statut IN ('en_attente','en_cours','realise','non_realise','non_applicable')),
    -- Ordre d'affichage (réordonnancement futur) ; à défaut, tri par created_at.
    ordre          INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE travaux_taches IS
    'Tâches (to-do à statut) d''un travail. Local/équipement facultatifs, du même site que le travail.';

CREATE INDEX idx_travaux_taches_travaux    ON travaux_taches(travaux_id);
CREATE INDEX idx_travaux_taches_local      ON travaux_taches(local_id);
CREATE INDEX idx_travaux_taches_equipement ON travaux_taches(equipement_id);
CREATE INDEX idx_travaux_taches_created_by ON travaux_taches(created_by);

CREATE TRIGGER trg_travaux_taches_set_updated_at
    BEFORE UPDATE ON travaux_taches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Pattern 6 — cohérence de site ───────────────────────────────────────────
-- Local & équipement (s'ils sont renseignés) appartiennent au site du travail ;
-- si les deux sont renseignés, l'équipement doit être dans le local indiqué.
CREATE OR REPLACE FUNCTION public.check_travaux_tache_coherence()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_travaux_site UUID;
    v_local_site   UUID;
    v_eq_site      UUID;
    v_eq_local     UUID;
BEGIN
    SELECT site_id INTO v_travaux_site
    FROM public.interventions_travaux WHERE id = NEW.travaux_id;

    IF NEW.local_id IS NOT NULL THEN
        SELECT b.site_id INTO v_local_site
        FROM public.locaux    l
        JOIN public.niveaux   n ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE l.id = NEW.local_id;
        IF v_local_site IS NULL THEN
            RAISE EXCEPTION 'travaux_taches : local_id % introuvable ou hiérarchie incomplète', NEW.local_id;
        END IF;
        IF v_local_site <> v_travaux_site THEN
            RAISE EXCEPTION 'travaux_taches : local_id % (site %) hors du site % du travail %',
                NEW.local_id, v_local_site, v_travaux_site, NEW.travaux_id;
        END IF;
    END IF;

    IF NEW.equipement_id IS NOT NULL THEN
        SELECT b.site_id, e.local_id INTO v_eq_site, v_eq_local
        FROM public.equipements e
        JOIN public.locaux    l ON l.id = e.local_id
        JOIN public.niveaux   n ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE e.id = NEW.equipement_id;
        IF v_eq_site IS NULL THEN
            RAISE EXCEPTION 'travaux_taches : equipement_id % introuvable ou hiérarchie incomplète', NEW.equipement_id;
        END IF;
        IF v_eq_site <> v_travaux_site THEN
            RAISE EXCEPTION 'travaux_taches : equipement_id % (site %) hors du site % du travail %',
                NEW.equipement_id, v_eq_site, v_travaux_site, NEW.travaux_id;
        END IF;
        IF NEW.local_id IS NOT NULL AND v_eq_local <> NEW.local_id THEN
            RAISE EXCEPTION 'travaux_taches : equipement_id % n''est pas dans le local %',
                NEW.equipement_id, NEW.local_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_travaux_tache_coherence() IS
    'Pattern 6 — local/équipement d''une tâche appartiennent au site du travail ; équipement dans le local indiqué.';

CREATE TRIGGER trg_travaux_tache_coherence
    BEFORE INSERT OR UPDATE ON travaux_taches
    FOR EACH ROW EXECUTE FUNCTION public.check_travaux_tache_coherence();

-- Durcissement EXECUTE (cf. lint 0028) : la fonction est appelée par le trigger,
-- jamais directement. La boucle déclarative du bloc « durcissement » de
-- schema_complete.sql la couvre lors d'un build neuf ; en prod (boucle déjà
-- passée), on révoque explicitement et on ré-autorise le service_role.
REVOKE EXECUTE ON FUNCTION public.check_travaux_tache_coherence() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_travaux_tache_coherence() TO service_role;

-- ── RLS — calque EXACT des liaisons travaux (scope via le site du travail) ───
ALTER TABLE travaux_taches ENABLE ROW LEVEL SECURITY;

CREATE POLICY travaux_taches_admin_all ON travaux_taches FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY travaux_taches_select ON travaux_taches FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND EXISTS (
            SELECT 1 FROM interventions_travaux ic
            WHERE ic.id = travaux_taches.travaux_id
              AND public.has_site_access(ic.site_id)
        )
    );

CREATE POLICY travaux_taches_scoped ON travaux_taches FOR ALL
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND EXISTS (
            SELECT 1 FROM interventions_travaux ic
            WHERE ic.id = travaux_taches.travaux_id
              AND public.has_site_access(ic.site_id)
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND EXISTS (
            SELECT 1 FROM interventions_travaux ic
            WHERE ic.id = travaux_taches.travaux_id
              AND public.has_site_access(ic.site_id)
        )
    );

COMMIT;
