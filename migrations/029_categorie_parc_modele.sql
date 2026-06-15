-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  029_categorie_parc_modele.sql                                              ║
-- ║  Modèle FIXÉ sur une sous-catégorie de parc : tous les équipements créés    ║
-- ║  dans la sous-catégorie en sont des copies (snapshot).                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- Vision : une SOUS-catégorie de parc (scope 'parc', niveau 2) est une flotte
-- HOMOGÈNE d'équipements issus d'UN modèle de site. À sa création on lui fixe un
-- modèle (existant ou créé sur-le-champ) ; chaque équipement créé dedans est une
-- copie figée du modèle (RPC instancier_equipement, déjà en place). Le caractère
-- OBLIGATOIRE du modèle sur une sous-catégorie est porté côté UI (le formulaire
-- impose le choix) ; la base valide la cohérence quand un modèle est posé.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS modele_equipement_id UUID
    REFERENCES public.modeles_equipements(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.categories.modele_equipement_id IS
  'Modèle d''équipement FIXÉ sur une sous-catégorie de parc (scope ''parc'') : les équipements créés dedans en sont des copies. NULL ailleurs. Doit être un modèle DU SITE de la catégorie (validé par trigger).';

-- Validation : un modèle ne se fixe que sur une catégorie de parc, et ce doit être
-- un modèle VIVANT du MÊME site que la catégorie (les modèles communs s'exportent
-- d'abord vers le site via la Bibliothèque).
CREATE OR REPLACE FUNCTION public.check_categorie_modele()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    m_site     UUID;
    m_deleted  TIMESTAMPTZ;
    m_exists   BOOLEAN;
BEGIN
    IF NEW.modele_equipement_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.scope <> 'parc' THEN
        RAISE EXCEPTION 'Un modèle ne peut être fixé que sur une catégorie de parc (scope ''parc'').'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT true, site_id, deleted_at
      INTO m_exists, m_site, m_deleted
      FROM public.modeles_equipements
     WHERE id = NEW.modele_equipement_id;

    IF m_exists IS NULL THEN
        RAISE EXCEPTION 'Modèle % introuvable.', NEW.modele_equipement_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF m_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Modèle % en corbeille : impossible de le fixer.', NEW.modele_equipement_id
            USING ERRCODE = 'check_violation';
    END IF;
    -- Modèle DU site (pas commun) et du MÊME site que la catégorie.
    IF m_site IS NULL OR m_site IS DISTINCT FROM NEW.site_id THEN
        RAISE EXCEPTION 'Le modèle fixé doit être un modèle de CE site (exporte d''abord un modèle commun vers le site).'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_categories_modele
    BEFORE INSERT OR UPDATE OF modele_equipement_id, scope, site_id ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.check_categorie_modele();

COMMENT ON FUNCTION public.check_categorie_modele() IS
    'Valide le modèle fixé sur une sous-catégorie de parc : scope ''parc'' obligatoire, modèle vivant et appartenant au MÊME site que la catégorie.';
