-- Migration 005 : retire l'extension de fichier des noms de documents.
--
-- Avant cette migration, `documents.nom_original` stockait le nom complet du
-- fichier uploadé, extension comprise (`"Manuel pompe.pdf"`, `"Photo.webp"`).
-- L'extension est désormais considérée comme du bruit technique :
--   - elle est déjà connue de `nom_fichier` (chemin de stockage hashé)
--   - elle est calculée à la volée dans les SELECT (`extension`)
--   - l'utilisateur ne doit plus avoir à la voir ni la saisir
--
-- Stratégie : pour chaque extension reconnue (liste blanche), un UPDATE qui
-- ne touche que les lignes dont `nom_original` se termine par cette extension.
-- LIKE est insensible à la casse sur ASCII (PRAGMA case_sensitive_like = OFF
-- par défaut), donc `"Photo.PDF"` est bien matché par `LIKE '%.pdf'`.
--
-- Les noms qui contiennent un point sans terminer par une extension reconnue
-- (ex: `"Rapport v1.2"`) ne sont pas touchés. Pour `"Rapport v1.2.pdf"`, seul
-- le suffixe ".pdf" (4 caractères) est retiré → `"Rapport v1.2"`.

UPDATE documents SET nom_original = SUBSTR(nom_original, 1, LENGTH(nom_original) - 4) WHERE nom_original LIKE '%.pdf';
UPDATE documents SET nom_original = SUBSTR(nom_original, 1, LENGTH(nom_original) - 5) WHERE nom_original LIKE '%.webp';
UPDATE documents SET nom_original = SUBSTR(nom_original, 1, LENGTH(nom_original) - 5) WHERE nom_original LIKE '%.jpeg';
UPDATE documents SET nom_original = SUBSTR(nom_original, 1, LENGTH(nom_original) - 4) WHERE nom_original LIKE '%.jpg';
UPDATE documents SET nom_original = SUBSTR(nom_original, 1, LENGTH(nom_original) - 4) WHERE nom_original LIKE '%.png';
UPDATE documents SET nom_original = SUBSTR(nom_original, 1, LENGTH(nom_original) - 4) WHERE nom_original LIKE '%.gif';
UPDATE documents SET nom_original = SUBSTR(nom_original, 1, LENGTH(nom_original) - 4) WHERE nom_original LIKE '%.bmp';
