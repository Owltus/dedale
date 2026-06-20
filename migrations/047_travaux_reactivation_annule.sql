-- =============================================================================
-- 047 — Travaux : réactivation depuis « Annulé » (5 → 1 Ouvert)
-- =============================================================================
-- « Annulé » n'est plus strictement terminal : on autorise le retour à
-- « Ouvert » (résurrection, à l'image des OT annule→planifie). Les autres
-- transitions depuis Annulé restent interdites. Aucun champ de clôture à
-- nettoyer : date_fin / cloture_by ne sont posés qu'au passage « Terminé »,
-- jamais en « Annulé » (qui n'est jamais atteint depuis Terminé).
-- =============================================================================

BEGIN;

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
    -- Annulé : réactivation autorisée UNIQUEMENT vers « Ouvert » (5 → 1).
    IF OLD.statut_travaux_id = 5 AND NEW.statut_travaux_id NOT IN (1) THEN
        RAISE EXCEPTION 'Réactivation travaux : depuis « Annulé », seul le retour à « Ouvert » est autorisé (statut %)', NEW.statut_travaux_id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validation_transitions_travaux() IS
    'Machine à états travaux : 1→2/3/5, 2→3/5, 3→4/5, 4→3 (réouverture), 5→1 (réactivation).';

COMMIT;
