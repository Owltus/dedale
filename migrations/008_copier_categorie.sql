-- 008_copier_categorie.sql
-- Date : 2026-06-12
-- But  : (1) Étendre public.copier_gamme pour copier AUSSI miniature_id (garde de
--            scope miniature_scope_ok → NULL si la miniature de site est incompatible
--            avec le site cible, sinon le trigger check_miniature_site_direct lèverait
--            integrity_constraint_violation).
--        (2) Créer public.copier_categorie : copie d'un SOUS-ARBRE de catégories
--            (une racine parent_id NULL, OU une sous-catégorie) vers un site
--            (p_site_cible renseigné = export) ou vers le commun (p_site_cible NULL =
--            duplication), avec SÉLECTION FINE des sous-catégories (p_souscat_ids) et
--            des gammes (p_gamme_ids). Idempotente : MERGE par (site, parent, nom).
-- Dépendances : public.copier_gamme (matrice de droits calquée), public.miniature_scope_ok,
--        public.current_role, public.has_site_access, (SELECT auth.uid()) ; tables
--        public.categories, public.gammes, public.operations, public.gamme_modeles ;
--        triggers check_categorie_parent_scope, check_gamme_categorie,
--        check_categorie_no_cycle, check_miniature_site_direct.
-- Touche schema_complete.sql : fonction copier_gamme (ajout de miniature_id à l'INSERT
--        INTO public.gammes + COMMENT) ; AJOUT des fonctions copier_categorie_noeud
--        (helper interne) et copier_categorie (RPC client). À reporter dans
--        schema_complete.sql après application.
-- Sécurité : SECURITY DEFINER + SET search_path = '' (TOUT qualifié public./auth.).
--        copier_categorie rejoue la matrice de droits de copier_gamme et audite la
--        SOURCE (catégorie racine + chaque gamme source). Grants alignés sur la
--        doctrine de durcissement (boucle DO de schema_complete.sql) : le helper
--        interne n'est ouvert qu'à service_role (jamais appelé en direct par le
--        client) ; la RPC copier_categorie est ouverte à authenticated + service_role.
--        copier_gamme est ré-émise via CREATE OR REPLACE : sa signature (uuid, uuid)
--        est inchangée → ses privilèges existants (authenticated/service_role, anon
--        révoqué) sont PRÉSERVÉS, aucun GRANT à rejouer.
-- Risque data : NUL en relecture. Les écritures sont des COPIES par valeur ; aucune
--        mutation des sources. Idempotent : un conteneur déjà présent (même site/parent/
--        nom) est réutilisé, une gamme vivante homonyme déjà présente dans la catégorie
--        cible est ignorée → ré-exécution sûre, pas de doublon.
-- Après application : npm run gen:types
BEGIN;

-- ============================================================================
-- (1) public.copier_gamme — ré-émission À L'IDENTIQUE + ajout de miniature_id
--     Seule différence avec la version de schema_complete.sql : la colonne
--     miniature_id est ajoutée à l'INSERT INTO public.gammes, gardée par
--     miniature_scope_ok (miniature de site incompatible avec le site cible → NULL).
--     TOUT le reste (droits, secours « Non classé », operations, gamme_modeles,
--     copie_depuis_id) est inchangé.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.copier_gamme(
    p_source_gamme_id UUID,
    p_site_cible      UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role     TEXT := public.current_role();
    v_source   public.gammes%ROWTYPE;
    v_new_id   UUID;
BEGIN
    -- ----------------------------------------------------------------------
    -- 1. Contrôle des droits du caller
    -- ----------------------------------------------------------------------
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_gamme : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_site_cible IS NULL THEN
        -- Copie vers le niveau entreprise (créer / remonter un modèle).
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION
                'copier_gamme : seuls admin et manager peuvent copier une gamme vers le niveau entreprise (bibliothèque).'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        -- Injection vers un site : admin partout, manager/technicien si accès.
        IF v_role = 'admin' THEN
            NULL; -- admin : OK partout
        ELSIF v_role IN ('manager', 'technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION
                    'copier_gamme : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION
                'copier_gamme : rôle % non autorisé à injecter une gamme sur un site.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- ----------------------------------------------------------------------
    -- 2. Lecture de la gamme source
    -- ----------------------------------------------------------------------
    SELECT * INTO v_source
    FROM public.gammes
    WHERE id = p_source_gamme_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_gamme : gamme source % introuvable ou supprimée.', p_source_gamme_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 2bis. Contrôle d'accès à la SOURCE (audit défensif) : la lecture étant
    -- faite en SECURITY DEFINER (bypass RLS), il faut revérifier que le caller
    -- a le droit de voir la gamme source. Une gamme bibliothèque (site_id NULL)
    -- est partagée → copiable par tous ; une gamme SITE n'est copiable que si le
    -- caller a accès à son site (admin partout). Sans ce garde, un manager/
    -- technicien pouvait exfiltrer le contenu d'une gamme d'un site hors scope
    -- (nom, périodicité, opérations) en la copiant vers son propre site.
    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_gamme : accès refusé à la gamme source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ----------------------------------------------------------------------
    -- 2ter. Cohérence catégorie ↔ scope cible (calque copier_modele_equipement).
    --    Si la catégorie source est scopée site et incompatible avec le site cible
    --    (site cible différent, ou NULL = remontée entreprise), copier categorie_id
    --    brut ferait échouer check_gamme_categorie (catégorie de site référencée par
    --    une gamme d'un autre site / entreprise). categorie_id étant NOT NULL
    --    (chantier 2026-06-10), on ne peut pas la nuller : on réassigne la
    --    SOUS-catégorie de secours « Non classé » (enfant de « Non classé (gammes) »,
    --    ENTREPRISE → sous-catégorie valide acceptée pour toute gamme). Le manager
    --    reclassera après.
    DECLARE
        v_cat_site    UUID;
        v_racine_id   UUID;
        v_cat_secours UUID;
    BEGIN
        IF v_source.categorie_id IS NOT NULL THEN
            SELECT site_id INTO v_cat_site FROM public.categories WHERE id = v_source.categorie_id;
            IF v_cat_site IS NOT NULL AND v_cat_site IS DISTINCT FROM p_site_cible THEN
                SELECT id INTO v_racine_id
                  FROM public.categories
                 WHERE site_id IS NULL AND parent_id IS NULL
                   AND lower(nom) = 'non classé (gammes)'
                   AND deleted_at IS NULL
                 LIMIT 1;
                SELECT id INTO v_cat_secours
                  FROM public.categories
                 WHERE site_id IS NULL AND parent_id = v_racine_id
                   AND lower(nom) = 'non classé'
                   AND deleted_at IS NULL
                 LIMIT 1;
                -- Durcissement (2026-06-10) : si la catégorie de secours « Non
                -- classé » a été supprimée/purgée, v_cat_secours est NULL → l'INSERT
                -- ci-dessous violerait le NOT NULL (23502 opaque). On lève à la place
                -- une erreur explicite, actionnable par l'humain.
                IF v_cat_secours IS NULL THEN
                    RAISE EXCEPTION 'copier_gamme : catégorie de secours « Non classé » introuvable — recréez-la avant de copier.'
                        USING ERRCODE = 'no_data_found';
                END IF;
                v_source.categorie_id := v_cat_secours;
            END IF;
        END IF;
    END;

    -- ----------------------------------------------------------------------
    -- 3. Copie de la gamme (snapshot par valeur — copie découplée)
    --    L'unicité du nom étant par niveau, on conserve le nom de la source.
    --    est_active forcé à true : une copie fraîche est prête à l'emploi,
    --    même si la gamme source avait été désactivée.
    --    copie_depuis_id : posé UNIQUEMENT pour une injection descendante
    --    (entreprise → site, p_site_cible renseigné). Pour une remontée
    --    site → entreprise (p_site_cible NULL), la gamme remontée dans la
    --    bibliothèque est neuve et indépendante : pas de lien retour vers la
    --    gamme du technicien (copie_depuis_id reste NULL).
    --    miniature_id (008) : conservée si compatible avec le scope cible
    --    (pool entreprise ou même site), sinon remise à NULL — sans ce garde le
    --    trigger check_miniature_site_direct lèverait integrity_constraint_violation.
    -- ----------------------------------------------------------------------
    INSERT INTO public.gammes (
        id, site_id, copie_depuis_id,
        nom, description, nature, categorie_id,
        periodicite_id, prestataire_id, image_path, miniature_id,
        est_active, created_by
    ) VALUES (
        gen_random_uuid(), p_site_cible,
        CASE WHEN p_site_cible IS NOT NULL THEN p_source_gamme_id ELSE NULL END,
        v_source.nom, v_source.description, v_source.nature, v_source.categorie_id,
        v_source.periodicite_id, v_source.prestataire_id, v_source.image_path,
        CASE WHEN public.miniature_scope_ok(v_source.miniature_id, p_site_cible)
             THEN v_source.miniature_id ELSE NULL END,
        true, (SELECT auth.uid())
    )
    RETURNING id INTO v_new_id;

    -- ----------------------------------------------------------------------
    -- 4. Copie des opérations spécifiques de la gamme source
    -- ----------------------------------------------------------------------
    INSERT INTO public.operations (
        id, gamme_id,
        nom, description, type_operation_id,
        seuil_minimum, seuil_maximum, unite_id, ordre
    )
    SELECT
        gen_random_uuid(), v_new_id,
        o.nom, o.description, o.type_operation_id,
        o.seuil_minimum, o.seuil_maximum, o.unite_id, o.ordre
    FROM public.operations o
    WHERE o.gamme_id = p_source_gamme_id;

    -- ----------------------------------------------------------------------
    -- 5. Copie des liens gamme_modeles (les modeles_operations restent
    --    partagés — seule la ligne de liaison est dupliquée).
    -- ----------------------------------------------------------------------
    INSERT INTO public.gamme_modeles (gamme_id, modele_operation_id)
    SELECT v_new_id, gm.modele_operation_id
    FROM public.gamme_modeles gm
    WHERE gm.gamme_id = p_source_gamme_id;

    RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.copier_gamme(UUID, UUID) IS
    'Bibliothèque de gammes : duplique une gamme PAR VALEUR vers un site (injection) ou vers le niveau entreprise (remontée modèle, p_site_cible NULL). Copie la gamme, ses operations et ses liens gamme_modeles. copie_depuis_id n''est posé que pour une injection descendante (site cible renseigné) ; une remontée vers la bibliothèque produit une gamme neuve et indépendante (copie_depuis_id NULL). La catégorie est réassignée à la sous-catégorie « Non classé » si son scope est incompatible avec le scope cible (categorie_id NOT NULL → jamais nullifiée ; manager reclasse). La miniature (miniature_id) est conservée si elle est compatible avec le scope cible (pool entreprise ou même site), sinon remise à NULL (garde miniature_scope_ok ; 008). Droits : copie entreprise = admin/manager ; copie site = admin ou manager/technicien avec accès au site. Retourne l''id de la nouvelle gamme.';

-- ============================================================================
-- (2a) public.copier_categorie_noeud — helper interne FIND-OR-CREATE
--      Matérialise UN nœud de catégorie sur la cible (merge / idempotence) :
--      réutilise une catégorie vivante de même (site, parent, lower(nom)) — clé de
--      uq_categories_nom — sinon crée une copie par valeur. Centralise la logique
--      pour éviter sa triplication (racine, sous-cat sélectionnée, sous-cat d'une
--      gamme). SECURITY DEFINER (écrit hors RLS, comme copier_gamme). NON exposé au
--      client : ré-entrant uniquement depuis copier_categorie (service_role).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.copier_categorie_noeud(
    p_source_cat_id   UUID,
    p_parent_cible_id UUID,
    p_site_cible      UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_src   public.categories%ROWTYPE;
    v_cible UUID;
BEGIN
    -- Lecture de la catégorie source (vivante).
    SELECT * INTO v_src
      FROM public.categories
     WHERE id = p_source_cat_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_categorie_noeud : catégorie source % introuvable ou supprimée.', p_source_cat_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- FIND : un conteneur de même (site, parent, lower(nom)) existe déjà sur la
    -- cible → on le réutilise (merge). IS NOT DISTINCT FROM gère les NULL (commun /
    -- racine). Clé alignée sur l'index unique uq_categories_nom (deleted_at IS NULL).
    SELECT id INTO v_cible
      FROM public.categories
     WHERE site_id   IS NOT DISTINCT FROM p_site_cible
       AND parent_id IS NOT DISTINCT FROM p_parent_cible_id
       AND lower(nom) = lower(v_src.nom)
       AND deleted_at IS NULL
     LIMIT 1;

    IF FOUND THEN
        RETURN v_cible;
    END IF;

    -- CREATE : copie par valeur. scope/ordre conservés (le scope du parent englobe
    -- celui de l'enfant — garanti car on matérialise racine puis sous-cat sur la
    -- cible). miniature conservée si compatible avec le scope cible, sinon NULL
    -- (sinon check_miniature_site_direct lèverait integrity_constraint_violation).
    -- copie_depuis_id : posé seulement pour un EXPORT vers un site (p_site_cible non
    -- NULL) ; NULL pour une duplication vers le commun (symétrie copier_gamme).
    -- NB : public.categories n'a PAS de colonne created_by (≠ gammes) → non renseignée.
    INSERT INTO public.categories (
        id, site_id, parent_id, copie_depuis_id,
        nom, scope, description, image_path, ordre, miniature_id
    ) VALUES (
        gen_random_uuid(), p_site_cible, p_parent_cible_id,
        CASE WHEN p_site_cible IS NOT NULL THEN p_source_cat_id ELSE NULL END,
        v_src.nom, v_src.scope, v_src.description, v_src.image_path, v_src.ordre,
        CASE WHEN public.miniature_scope_ok(v_src.miniature_id, p_site_cible)
             THEN v_src.miniature_id ELSE NULL END
    )
    RETURNING id INTO v_cible;

    RETURN v_cible;
END;
$$;

COMMENT ON FUNCTION public.copier_categorie_noeud(UUID, UUID, UUID) IS
    'Interne (copier_categorie) : FIND-OR-CREATE d''un nœud de catégorie sur la cible. Réutilise une catégorie vivante de même (site, parent, lower(nom)) — clé de uq_categories_nom — pour le merge/idempotence ; sinon crée une copie par valeur (nom, scope, description, image_path, ordre ; miniature conservée si miniature_scope_ok, sinon NULL ; copie_depuis_id posé seulement pour un export vers un site). public.categories n''a pas de created_by. SECURITY DEFINER (écrit hors RLS). NON exposé au client (service_role uniquement).';

-- ============================================================================
-- (2b) public.copier_categorie — copie d'un sous-arbre de catégories
-- ============================================================================
CREATE OR REPLACE FUNCTION public.copier_categorie(
    p_source_categorie_id UUID,
    p_site_cible          UUID,
    p_souscat_ids         UUID[] DEFAULT '{}',
    p_gamme_ids           UUID[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role             TEXT := public.current_role();
    v_source           public.categories%ROWTYPE;
    v_root_cible_id    UUID;   -- racine matérialisée sur la cible
    v_souscat_cible_id UUID;   -- sous-cat matérialisée (cas SOURCE = sous-catégorie)
    v_cat_cible        UUID;   -- catégorie cible d'une gamme dans la boucle
    v_ret              UUID;   -- valeur de retour
    v_g                public.gammes%ROWTYPE;
    v_new_gamme_id     UUID;
    v_sc_id            UUID;
BEGIN
    -- ----------------------------------------------------------------------
    -- 1. Contrôle des droits du caller (calque EXACT de copier_gamme)
    -- ----------------------------------------------------------------------
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_categorie : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_site_cible IS NULL THEN
        -- Duplication vers le commun (entreprise) : admin + manager uniquement.
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION
                'copier_categorie : seuls admin et manager peuvent copier une catégorie vers le niveau entreprise (commun).'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        -- Export vers un site : admin partout, manager/technicien si accès.
        IF v_role = 'admin' THEN
            NULL; -- admin : OK partout
        ELSIF v_role IN ('manager', 'technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION
                    'copier_categorie : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION
                'copier_categorie : rôle % non autorisé à exporter une catégorie sur un site.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- ----------------------------------------------------------------------
    -- 2. Lecture de la catégorie source (vivante)
    -- ----------------------------------------------------------------------
    SELECT * INTO v_source
      FROM public.categories
     WHERE id = p_source_categorie_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_categorie : catégorie source % introuvable ou supprimée.', p_source_categorie_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 2bis. Contrôle d'accès à la SOURCE (audit défensif, calque copier_gamme) :
    -- lecture en SECURITY DEFINER (bypass RLS) → revérifier que le caller peut voir
    -- la catégorie source. Catégorie commune (site_id NULL) = partagée, copiable par
    -- tous les rôles autorisés ; catégorie SITE = copiable seulement si accès au site
    -- (admin partout).
    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_categorie : accès refusé à la catégorie source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ----------------------------------------------------------------------
    -- 3. Matérialisation du chemin de catégories sur la cible (find-or-create)
    --    On construit racine puis sous-cat DIRECTEMENT sur la cible → les gammes
    --    pointeront une vraie sous-cat du site (pas besoin du secours « Non classé »
    --    de copier_gamme). check_categorie_parent_scope / check_gamme_categorie
    --    passent (racine cohérente → sous-cat niveau 2 → gamme).
    -- ----------------------------------------------------------------------
    IF v_source.parent_id IS NULL THEN
        -- SOURCE = RACINE -------------------------------------------------------
        -- Matérialiser la racine cible.
        v_root_cible_id := public.copier_categorie_noeud(v_source.id, NULL, p_site_cible);

        -- Sous-catégories VIDES explicitement sélectionnées : seules celles qui
        -- sont des ENFANTS DIRECTS de la source sont matérialisées (filtrage).
        FOR v_sc_id IN
            SELECT c.id
              FROM public.categories c
             WHERE c.id = ANY (p_souscat_ids)
               AND c.parent_id = v_source.id
               AND c.deleted_at IS NULL
               -- Audit défensif (parité copier_gamme 2bis) : une racine COMMUNE peut
               -- légalement héberger des sous-cats scopées site → sans ce filtre, un
               -- manager exfiltrerait nom/description/image d'une sous-cat hors de son
               -- scope. Commun (site_id NULL) et admin passent toujours.
               AND (
                   c.site_id IS NULL
                   OR v_role = 'admin'
                   OR public.has_site_access(c.site_id)
               )
        LOOP
            PERFORM public.copier_categorie_noeud(v_sc_id, v_root_cible_id, p_site_cible);
        END LOOP;

        v_ret := v_root_cible_id;
    ELSE
        -- SOURCE = SOUS-CATÉGORIE ----------------------------------------------
        -- Matérialiser d'abord la racine parente, puis la sous-cat sous celle-ci.
        -- p_souscat_ids est IGNORÉ dans ce cas.
        v_root_cible_id    := public.copier_categorie_noeud(v_source.parent_id, NULL, p_site_cible);
        v_souscat_cible_id := public.copier_categorie_noeud(v_source.id, v_root_cible_id, p_site_cible);

        v_ret := v_souscat_cible_id;
    END IF;

    -- ----------------------------------------------------------------------
    -- 4. Copie des gammes sélectionnées (commun aux deux cas)
    --    Pour chaque gamme vivante de p_gamme_ids :
    --      - SOURCE = racine     → matérialiser SA sous-catégorie (gammes.categorie_id)
    --                              sous la racine cible (auto-inclusion du chemin) ;
    --      - SOURCE = sous-cat   → cible fixe = sous-cat matérialisée ; on n'inclut
    --                              que les gammes dont categorie_id = la source.
    -- ----------------------------------------------------------------------
    FOR v_g IN
        SELECT *
          FROM public.gammes
         WHERE id = ANY (p_gamme_ids)
           AND deleted_at IS NULL
    LOOP
        -- Branche SOURCE = sous-catégorie : on n'inclut que les gammes rattachées à
        -- la sous-cat source. On écarte les AUTRES EN TÊTE (avant l'audit), pour ne
        -- pas faire échouer toute l'opération sur un id de gamme non pertinent et
        -- hors-scope qui aurait de toute façon été ignoré.
        IF v_source.parent_id IS NOT NULL
           AND v_g.categorie_id IS DISTINCT FROM v_source.id THEN
            CONTINUE;
        END IF;

        -- Audit défensif de la SOURCE (calque copier_gamme 2bis) : une catégorie
        -- commune peut héberger des gammes scopées site (check_gamme_categorie
        -- l'autorise) → sans ce garde, copier une catégorie commune permettrait
        -- d'exfiltrer le contenu d'une gamme d'un site hors scope.
        IF v_g.site_id IS NOT NULL
           AND v_role <> 'admin'
           AND NOT public.has_site_access(v_g.site_id) THEN
            RAISE EXCEPTION 'copier_categorie : accès refusé à une gamme source (%).', v_g.id
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        -- Résolution de la catégorie cible de la gamme.
        IF v_source.parent_id IS NULL THEN
            v_cat_cible := public.copier_categorie_noeud(v_g.categorie_id, v_root_cible_id, p_site_cible);
        ELSE
            v_cat_cible := v_souscat_cible_id;
        END IF;

        -- Idempotence : si une gamme VIVANTE de même lower(nom) existe déjà dans
        -- la catégorie cible (typiquement une copie antérieure), on saute — évite
        -- le doublon et le 23505. NB : l'unicité réelle des gammes est par SITE
        -- (uniq_gammes_site / uniq_gammes_entreprise) ; un homonyme dans une AUTRE
        -- catégorie du même site fera donc remonter un 23505 explicite (collision
        -- métier réelle, même comportement que copier_gamme).
        IF EXISTS (
            SELECT 1
              FROM public.gammes g2
             WHERE g2.categorie_id = v_cat_cible
               AND lower(g2.nom) = lower(v_g.nom)
               AND g2.deleted_at IS NULL
        ) THEN
            CONTINUE;
        END IF;

        -- Copie de la gamme (par valeur, snapshot découplé — calque copier_gamme).
        INSERT INTO public.gammes (
            id, site_id, copie_depuis_id,
            nom, description, nature, categorie_id,
            periodicite_id, prestataire_id, image_path, miniature_id,
            est_active, created_by
        ) VALUES (
            gen_random_uuid(), p_site_cible,
            CASE WHEN p_site_cible IS NOT NULL THEN v_g.id ELSE NULL END,
            v_g.nom, v_g.description, v_g.nature, v_cat_cible,
            v_g.periodicite_id, v_g.prestataire_id, v_g.image_path,
            CASE WHEN public.miniature_scope_ok(v_g.miniature_id, p_site_cible)
                 THEN v_g.miniature_id ELSE NULL END,
            true, (SELECT auth.uid())
        )
        RETURNING id INTO v_new_gamme_id;

        -- Opérations spécifiques de la gamme source.
        INSERT INTO public.operations (
            id, gamme_id,
            nom, description, type_operation_id,
            seuil_minimum, seuil_maximum, unite_id, ordre
        )
        SELECT
            gen_random_uuid(), v_new_gamme_id,
            o.nom, o.description, o.type_operation_id,
            o.seuil_minimum, o.seuil_maximum, o.unite_id, o.ordre
        FROM public.operations o
        WHERE o.gamme_id = v_g.id;

        -- Liens gamme_modeles (les modeles_operations restent partagés).
        INSERT INTO public.gamme_modeles (gamme_id, modele_operation_id)
        SELECT v_new_gamme_id, gm.modele_operation_id
        FROM public.gamme_modeles gm
        WHERE gm.gamme_id = v_g.id;
    END LOOP;

    RETURN v_ret;
END;
$$;

COMMENT ON FUNCTION public.copier_categorie(UUID, UUID, UUID[], UUID[]) IS
    'Bibliothèque : copie un SOUS-ARBRE de catégories (racine OU sous-catégorie) vers un site (p_site_cible renseigné = export) ou vers le commun (p_site_cible NULL = duplication), avec sélection fine des sous-catégories (p_souscat_ids) et des gammes (p_gamme_ids). Conteneur seul = arrays vides. IDEMPOTENT / MERGE : chaque catégorie est matérialisée par FIND-OR-CREATE sur (site, parent, lower(nom)) — un conteneur déjà présent est réutilisé ; une gamme vivante homonyme déjà présente dans la catégorie cible est ignorée. Le chemin (racine → sous-cat) est construit directement sur la cible → pas de secours « Non classé ». miniature conservée si compatible (miniature_scope_ok) sinon NULL. copie_depuis_id posé seulement pour un export vers un site. Droits = calque copier_gamme (commun : admin/manager ; site : admin ou manager/technicien avec accès) + audit défensif de la source (catégorie racine et chaque gamme). Si SOURCE = racine : retourne l''id de la racine cible (p_souscat_ids = enfants directs vides à inclure). Si SOURCE = sous-catégorie : retourne l''id de la sous-cat cible (p_souscat_ids ignoré, gammes filtrées sur categorie_id = source).';

-- ============================================================================
-- (3) Privilèges — alignés sur la doctrine de durcissement de schema_complete.sql
--     (boucle DO : REVOKE des fonctions DEFINER à PUBLIC/anon/authenticated, GRANT
--     service_role ; puis ré-autorisation explicite des RPC client à authenticated).
--     La boucle ne se rejoue PAS dans une migration incrémentale → on reproduit son
--     état final à la main pour les deux nouvelles fonctions. copier_gamme est
--     inchangée de signature (CREATE OR REPLACE préserve ses grants) → rien à faire.
-- ============================================================================
-- Helper interne : jamais appelé en direct par le client (service_role seulement).
REVOKE EXECUTE ON FUNCTION public.copier_categorie_noeud(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.copier_categorie_noeud(uuid, uuid, uuid) TO service_role;

-- RPC client : authenticated (la fonction contrôle elle-même rôle + scope) + service_role.
REVOKE EXECUTE ON FUNCTION public.copier_categorie(uuid, uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.copier_categorie(uuid, uuid, uuid[], uuid[]) TO authenticated, service_role;

COMMIT;
