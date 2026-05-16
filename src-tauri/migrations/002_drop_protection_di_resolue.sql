-- 002_drop_protection_di_resolue.sql
-- Supprime le trigger qui verrouillait toute modification d'une DI résolue.
-- Le besoin métier a évolué : une DI résolue doit pouvoir être éditée librement
-- (corrections post-clôture, ajustements de date, retouches de la résolution
-- elle-même) sans passer par une réouverture intermédiaire.

DROP TRIGGER IF EXISTS protection_di_resolue;
