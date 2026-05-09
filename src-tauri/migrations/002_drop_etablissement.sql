-- Migration 002 — Suppression de la fonctionnalité Établissement
-- La fiche établissement (et les référentiels ERP associés) n'était pas
-- utilisée. Aucune autre table ne référence etablissements/types_erp/
-- categories_erp (vérifié sur 001), donc on peut tout retirer sans cascade.

DROP TRIGGER IF EXISTS maj_date_modification_etablissement;

DROP INDEX IF EXISTS idx_etablissements_type_erp;
DROP INDEX IF EXISTS idx_etablissements_categorie_erp;

DROP TABLE IF EXISTS etablissements;
DROP TABLE IF EXISTS types_erp;
DROP TABLE IF EXISTS categories_erp;
