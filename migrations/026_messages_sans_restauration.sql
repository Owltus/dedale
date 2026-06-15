-- =============================================================================
-- 026 — Reformuler 2 messages qui suggéraient une restauration impossible
-- -----------------------------------------------------------------------------
-- Suite de 025 (retrait du code de restauration) : deux messages d'erreur
-- conseillaient encore « restaurez-le », action qui n'existe plus dans l'app.
-- On les reformule + on retire le vocabulaire « corbeille » de ces messages
-- utilisateur (cohérent avec le nettoyage du front).
--
-- resolve_prestataire_effectif : « dans la corbeille : restaurez-le ou choisissez-en
--   un autre » → « a été supprimé : choisissez-en un autre ».
-- reouvrir_ot : « OT en corbeille — restaurez-le avant réouverture » → « a été
--   supprimé : réouverture impossible » ; et « (ou mettez-le en corbeille) » →
--   « (ou supprimez-le) ».
--
-- Reproduction INTÉGRALE des 2 fonctions (CREATE OR REPLACE) ; SEULS les textes de
-- message/commentaire changent — toute la logique est identique. CREATE OR REPLACE
-- conserve les COMMENT et GRANT existants. Aucun changement de signature → pas de
-- gen:types. ⚠️ NON TESTÉ EN BASE. Reporter dans schema_complete.sql après application.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. resolve_prestataire_effectif : message « prestataire supprimé »
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_prestataire_effectif(
    p_gamme_id            UUID,
    p_prestataire_demande UUID,
    p_date_prevue         DATE
)
RETURNS UUID
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
    v_prest_existe BOOLEAN;
    v_interne_id   UUID;
    v_has_gammes   BOOLEAN;
    v_valide       BOOLEAN;
BEGIN
    -- Cas trivial : prestataire demandé inconnu
    SELECT EXISTS (
        SELECT 1 FROM public.prestataires
         WHERE id = p_prestataire_demande
           AND deleted_at IS NULL
    ) INTO v_prest_existe;

    IF NOT v_prest_existe THEN
        -- v0.21 : message métier clair — distingue « supprimé » d'« inexistant ».
        IF EXISTS (SELECT 1 FROM public.prestataires WHERE id = p_prestataire_demande) THEN
            RAISE EXCEPTION 'Ce prestataire a été supprimé : choisissez-en un autre avant de créer cet ordre de travail.'
                USING ERRCODE = 'foreign_key_violation';
        ELSE
            RAISE EXCEPTION 'Prestataire introuvable (id %).', p_prestataire_demande
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    -- Récupère le prestataire interne (cible de fallback)
    -- v0.26 : l'interne est désormais PAR SITE → on prend la régie du site de la gamme.
    SELECT pr.id INTO v_interne_id
      FROM public.prestataires pr
      JOIN public.gammes g ON g.id = p_gamme_id
     WHERE pr.est_interne = true
       AND pr.deleted_at IS NULL
       AND pr.site_id = g.site_id;

    IF v_interne_id IS NULL THEN
        RAISE EXCEPTION 'Aucune équipe interne pour le site de la gamme % (régie de site manquante).', p_gamme_id;
    END IF;

    -- Cas 1 : prestataire demandé EST l'interne → on garde, pas de contrat requis
    IF p_prestataire_demande = v_interne_id THEN
        RETURN v_interne_id;
    END IF;

    -- La gamme est-elle rattachée à au moins un contrat ?
    SELECT EXISTS (
        SELECT 1 FROM public.contrats_gammes WHERE gamme_id = p_gamme_id
    ) INTO v_has_gammes;

    IF v_has_gammes THEN
        -- Cas 2 : gamme contractualisée → contrat valide liant gamme ↔ prestataire
        SELECT EXISTS (
            SELECT 1
              FROM public.contrats_gammes cg
              JOIN public.contrats c ON c.id = cg.contrat_id
             WHERE cg.gamme_id = p_gamme_id
               AND c.prestataire_id = p_prestataire_demande
               AND c.date_debut <= p_date_prevue
               AND (
                    c.date_fin IS NULL
                    OR c.date_fin >= p_date_prevue
                    OR c.type_contrat_id = 2          -- tacite : valide tant que non résilié
               )
               AND c.date_resiliation IS NULL
               AND c.est_archive = false
        ) INTO v_valide;
    ELSE
        -- Cas 3 : gamme non contractualisée → contrat global actif du prestataire
        SELECT EXISTS (
            SELECT 1
              FROM public.contrats c
             WHERE c.prestataire_id = p_prestataire_demande
               AND c.date_debut <= p_date_prevue
               AND (
                    c.date_fin IS NULL
                    OR c.date_fin >= p_date_prevue
                    OR c.type_contrat_id = 2          -- tacite
               )
               AND c.date_resiliation IS NULL
               AND c.est_archive = false
        ) INTO v_valide;
    END IF;

    -- Si pas de contrat valide → bascule sur l'interne
    RETURN CASE
        WHEN v_valide THEN p_prestataire_demande
        ELSE v_interne_id
    END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. reouvrir_ot : messages « OT supprimé » (plus de « restaurez-le »)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reouvrir_ot(
    p_ot_id UUID,
    p_motif TEXT
)
RETURNS public.ordres_travail
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_ot public.ordres_travail;
BEGIN
    -- Validation motif (en plus du CHECK colonne, pour message clair)
    IF p_motif IS NULL OR length(trim(p_motif)) = 0 THEN
        RAISE EXCEPTION 'Motif de réouverture obligatoire'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Lecture filtrée par RLS : si l'utilisateur n'a pas accès au site
    -- (ou n'a pas le bon rôle), aucune ligne ne remonte. On distingue ce cas
    -- de l'OT inexistant via un message neutre (pas de leak de l'existence).
    SELECT * INTO v_ot
    FROM public.ordres_travail
    WHERE id = p_ot_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'OT introuvable ou hors de votre périmètre';
    END IF;

    IF v_ot.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cet ordre de travail a été supprimé : réouverture impossible.';
    END IF;

    IF v_ot.statut <> 'cloture' THEN
        RAISE EXCEPTION 'Seul un OT clôturé peut être rouvert (statut actuel : %)',
            v_ot.statut;
    END IF;

    -- v0.25 : anti-doublon (même règle qu'à la création). Refuser la réouverture
    -- si un autre OT actif existe déjà sur la gamme — typiquement le successeur
    -- préventif généré à la clôture. Sinon on se retrouverait avec 2 OT actifs
    -- sur la même gamme, ce que la création interdit pourtant strictement.
    IF v_ot.gamme_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.ordres_travail
        WHERE gamme_id = v_ot.gamme_id
          AND id <> v_ot.id
          AND statut NOT IN ('cloture', 'annule')
          AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Réouverture impossible : un OT actif existe déjà pour cette gamme. Traitez-le (ou supprimez-le) avant de rouvrir cet OT.'
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- UPDATE : la RLS valide l'autorisation (USING + WITH CHECK),
    -- protection_ot_terminaux autorise la transition cloture → reouvert,
    -- nettoyage_dates_coherentes efface date_cloture, le trigger d'audit
    -- log_audit() AFTER UPDATE trace l'opération.
    UPDATE public.ordres_travail
    SET statut            = 'reouvert',
        motif_reouverture = trim(p_motif)
    WHERE id = p_ot_id
    RETURNING * INTO v_ot;

    -- v0.31 : un rôle en LECTURE SEULE sur l'OT (lecteur, demandeur, ou
    -- manager/technicien hors de son périmètre) voit l'OT via la policy SELECT
    -- mais n'a pas de policy UPDATE → l'UPDATE ci-dessus matche 0 ligne et v_ot
    -- est réinitialisé à NULL (RETURNING * INTO sans ligne). On refuse alors
    -- explicitement au lieu de renvoyer un faux succès muet (OT vide).
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Réouverture non autorisée : vous avez un accès en lecture seule à cet OT.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN v_ot;
END;
$$;

COMMIT;
