-- ============================================================================
-- 014_categorie_scope_operation.sql
-- ----------------------------------------------------------------------------
-- Ajoute la valeur 'operation' à l'ENUM categorie_scope : les modèles d'opération
-- vont, comme les modèles d'équipement, se ranger dans des catégories DÉDIÉES à
-- UN SEUL niveau (scope 'operation', racine-only — cf. migration 015).
--
-- ATTENTION : « ALTER TYPE ... ADD VALUE » n'est PAS transactionnel en Postgres
-- et la nouvelle valeur ne peut pas être utilisée dans la MÊME transaction que
-- son ajout. Cette migration est donc ISOLÉE (rien d'autre ici) et doit être
-- appliquée + committée AVANT toute migration qui emploie 'operation' (015+).
-- IF NOT EXISTS : rejouable sans erreur.
-- ============================================================================

ALTER TYPE public.categorie_scope ADD VALUE IF NOT EXISTS 'operation';
