-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  030_categorie_parc_specifications.sql                                      ║
-- ║  Gabarit « spécifique » LOCAL d'une sous-catégorie de parc : caractéristiques║
-- ║  définies sur la sous-catégorie (pas dans la Bibliothèque).                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- Une sous-catégorie de parc fixe SON gabarit à la création : SOIT un modèle de
-- site (029, modele_equipement_id) → équipements = copies du modèle ; SOIT un
-- gabarit « spécifique » LOCAL (cette colonne) → caractéristiques définies sur
-- place, rien ne va dans la Bibliothèque (comme les opérations spécifiques). Dans
-- les deux cas, les équipements créés dans la sous-catégorie héritent du gabarit.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS specifications JSONB;

COMMENT ON COLUMN public.categories.specifications IS
  'Gabarit « spécifique » LOCAL d''une sous-catégorie de parc (scope ''parc'') : caractéristiques (champs JSONB) dont héritent ses équipements, sans passer par la Bibliothèque. NULL = pas de gabarit local. Exclusif avec modele_equipement_id.';

-- Exclusion mutuelle : une sous-catégorie a SOIT un modèle, SOIT un gabarit local.
ALTER TABLE public.categories
  ADD CONSTRAINT chk_categorie_modele_xor_specs
    CHECK (modele_equipement_id IS NULL OR specifications IS NULL);

-- Hygiène du JSONB (calque du CHECK des equipements) quand un gabarit est posé.
ALTER TABLE public.categories
  ADD CONSTRAINT chk_categorie_specs_objet
    CHECK (
      specifications IS NULL
      OR (
        jsonb_typeof(specifications) = 'object'
        AND NOT (specifications ? '__proto__')
        AND NOT (specifications ? 'constructor')
        AND NOT (specifications ? 'prototype')
      )
    );
