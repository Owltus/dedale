-- Table clé/valeur pour les paramètres système qui n'ont pas leur table dédiée.
-- Cas d'usage actuel : date ISO-8601 de la dernière sauvegarde manuelle réussie,
-- pour afficher un badge de fraîcheur dans l'onglet Paramètres → Sauvegarde.
CREATE TABLE IF NOT EXISTS parametres_systeme (
    cle    TEXT PRIMARY KEY,
    valeur TEXT NOT NULL
) STRICT;
