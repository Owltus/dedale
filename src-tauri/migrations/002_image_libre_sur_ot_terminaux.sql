-- Assouplit protection_ot_terminaux : id_image devient librement modifiable
-- même sur OT clôturés/annulés. Permet une re-synchronisation esthétique
-- des visuels depuis la page détail gamme sans cascade ni perte de données.
-- Tous les autres champs restent protégés à l'identique.

DROP TRIGGER IF EXISTS protection_ot_terminaux;
CREATE TRIGGER protection_ot_terminaux
BEFORE UPDATE ON ordres_travail
FOR EACH ROW
WHEN OLD.id_statut_ot IN (3, 4)
    AND NEW.id_statut_ot != 5                              -- Sauf réouverture (Clôturé→Réouvert)
    AND NOT (OLD.id_statut_ot = 4 AND NEW.id_statut_ot = 1) -- Sauf résurrection (Annulé→Planifié)
    AND (
        OLD.id_statut_ot          IS NOT NEW.id_statut_ot
        OR OLD.nom_gamme           IS NOT NEW.nom_gamme
        OR OLD.description_gamme   IS NOT NEW.description_gamme
        OR OLD.est_reglementaire   IS NOT NEW.est_reglementaire
        OR OLD.nom_localisation    IS NOT NEW.nom_localisation
        OR OLD.nom_famille         IS NOT NEW.nom_famille
        OR OLD.nom_prestataire     IS NOT NEW.nom_prestataire
        OR OLD.id_prestataire      IS NOT NEW.id_prestataire
        OR OLD.id_gamme            IS NOT NEW.id_gamme
        OR OLD.date_prevue         IS NOT NEW.date_prevue
        OR OLD.est_automatique     IS NOT NEW.est_automatique
        OR OLD.id_priorite         IS NOT NEW.id_priorite
        OR (OLD.id_di IS NOT NEW.id_di AND NEW.id_di IS NOT NULL)
        OR (OLD.id_technicien IS NOT NEW.id_technicien AND NEW.id_technicien IS NOT NULL)
        OR OLD.nom_technicien      IS NOT NEW.nom_technicien
        OR OLD.nom_poste           IS NOT NEW.nom_poste
        OR OLD.nom_equipement      IS NOT NEW.nom_equipement
    )
BEGIN
    SELECT RAISE(ABORT, 'Modification interdite : OT terminé. Utilisez la réouverture si une correction est nécessaire.');
END;
