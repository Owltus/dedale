-- =============================================================================
-- 024 — Corbeille (soft-delete 90 j) pour modeles_operations + modeles_di
-- -----------------------------------------------------------------------------
-- Plan corbeille : tranche T7 (le plan la numérotait 027 ; appliquée en 024 car
--   024 d'origine est ABANDONNÉE (D1) et 025/026 contrats/observations sont
--   reportés — on garde une numérotation CONTIGUË pour l'application manuelle).
--
-- But : donner une VRAIE corbeille 90 j à modeles_operations et modeles_di, qui
--   étaient en HARD-DELETE (la promesse « récupérable 90 j » ne tenait pas pour
--   eux). On laisse VOLONTAIREMENT de côté les vignettes (miniatures) : pool
--   partagé, pas de corbeille (décision PO).
--
-- Contenu :
--   1. ADD COLUMN deleted_at + index de purge (partiel WHERE deleted_at IS NOT NULL).
--   2. Index uniques de modeles_operations recréés AVEC `deleted_at IS NULL`
--      (la corbeille libère le nom). modeles_di n'a AUCUN index unique → rien à faire.
--   3. Verrou check_modele_operation_suppression (BEFORE UPDATE OF deleted_at) :
--      refuse la mise en corbeille tant que le modèle est lié à une gamme VIVANTE.
--   4. Re-patch check_categorie_suppression (023) : + AND mo.deleted_at IS NULL.
--   5. RPC detacher_et_supprimer_modele_operation : « détacher PUIS UPDATE deleted_at »
--      au lieu du DELETE physique (le front reste sur la RPC → corbeille « gratuite »).
--   5bis. copier_modele_operation : source filtrée `deleted_at IS NULL` (doctrine
--      « la base valide » — ne pas dupliquer/ressusciter un modèle en corbeille).
--   6. purge_corbeille_90j : étapes modeles_operations (fenêtre replica DÉDIÉE) +
--      modeles_di, et garde-fou NOT EXISTS modeles_operations sur la purge categories.
--
-- ⚠️ NON TESTÉ EN BASE. Migration sensible : touche la purge RGPD + le verrou des
--    catégories. Reproduit INTÉGRALEMENT purge_corbeille_90j / check_categorie_suppression
--    / detacher_et_supprimer_modele_operation (CREATE OR REPLACE) avec, à l'identique,
--    le corps existant + uniquement les ajouts décrits.
--
-- ⚠️ COUPLAGE FRONT (à faire APRÈS application + `npm run gen:types`) :
--    - modeles_operations : la RPC bascule en SOFT-delete → la LISTE front DOIT
--      filtrer `.is('deleted_at', null)`, sinon un modèle supprimé reste visible.
--    - modeles_di : pour ACTIVER la corbeille, basculer la mutation front de DELETE
--      vers `UPDATE deleted_at = now()` + filtrer les listes. Sans ça : pas de casse
--      (le hard-delete actuel marche toujours), la corbeille reste juste inutilisée.
--
-- CHOIX ASSUMÉS (revue adverse) — volontairement HORS périmètre de 024 :
--   • v_miniatures_pool : on NE filtre PAS deleted_at sur modeles_operations/modeles_di
--     (cosmétique). Direction CONSERVATRICE : une vignette d'un modèle en corbeille reste
--     « utilisée » → jamais nettoyée à tort ; count_miniature_refs protège déjà le blob.
--   • cascade_corbeille_spatial : un modèle de site ne suit PAS son site en corbeille
--     (calque de modeles_equipements — corbeille bibliothèque indépendante du spatial).
--
-- Reporter dans schema_complete.sql APRÈS application. `npm run gen:types` REQUIS
--   (modeles_operations / modeles_di gagnent la colonne deleted_at).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Colonnes deleted_at + index de purge
-- ---------------------------------------------------------------------------
ALTER TABLE public.modeles_operations ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE public.modeles_di         ADD COLUMN deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.modeles_operations.deleted_at IS
    'Corbeille (soft-delete) : NULL = vivant, renseigné = en corbeille (purge physique à 90 j). (024)';
COMMENT ON COLUMN public.modeles_di.deleted_at IS
    'Corbeille (soft-delete) : NULL = vivant, renseigné = en corbeille (purge physique à 90 j). (024)';

CREATE INDEX idx_modeles_operations_deleted ON public.modeles_operations(deleted_at)
    WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_modeles_di_deleted ON public.modeles_di(deleted_at)
    WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Index uniques de modeles_operations : libérer le nom en corbeille
-- ---------------------------------------------------------------------------
-- Le `nom` reste SENSIBLE À LA CASSE (pas de lower()) : on ajoute uniquement le
-- filtre `deleted_at IS NULL`. Recréation MOINS stricte → ne peut pas échouer sur
-- l'existant (toute ligne respectait déjà la contrainte plus large).
DROP INDEX public.uniq_modeles_operations_entreprise;
CREATE UNIQUE INDEX uniq_modeles_operations_entreprise
    ON public.modeles_operations (nom)
    WHERE site_id IS NULL AND deleted_at IS NULL;

DROP INDEX public.uniq_modeles_operations_site;
CREATE UNIQUE INDEX uniq_modeles_operations_site
    ON public.modeles_operations (site_id, nom)
    WHERE site_id IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Verrou de mise en corbeille d'un modèle d'opération
-- ---------------------------------------------------------------------------
-- Calque du verrou catégories : refuse le soft-delete tant qu'une gamme VIVANTE
-- (deleted_at IS NULL) est rattachée via gamme_modeles → force le détachement
-- explicite (assuré par la RPC ci-dessous). Une liaison vers une gamme DÉJÀ en
-- corbeille n'empêche pas (elle disparaîtra avec sa gamme à la purge).
-- SECURITY DEFINER : doit voir les liaisons cross-site (hors RLS du caller).
CREATE OR REPLACE FUNCTION public.check_modele_operation_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.gamme_modeles gm
        JOIN public.gammes g ON g.id = gm.gamme_id
        WHERE gm.modele_operation_id = NEW.id
          AND g.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'Mise en corbeille impossible : ce modèle d''opération est encore rattaché à une gamme. Dissociez-le d''abord.'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_modeles_operations_check_suppression
    BEFORE UPDATE OF deleted_at ON public.modeles_operations
    FOR EACH ROW
    WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    EXECUTE FUNCTION public.check_modele_operation_suppression();

COMMENT ON FUNCTION public.check_modele_operation_suppression() IS
    'BEFORE UPDATE OF deleted_at ON modeles_operations : refuse la mise en corbeille tant qu''une gamme VIVANTE référence le modèle via gamme_modeles (force le détachement, fait par detacher_et_supprimer_modele_operation). (024)';

-- ---------------------------------------------------------------------------
-- 4. Re-patch check_categorie_suppression (023) : modeles_operations vivants seuls
-- ---------------------------------------------------------------------------
-- Identique à 023, on ajoute juste `AND mo.deleted_at IS NULL` : une catégorie
-- portant uniquement des modèles d'opération EN CORBEILLE redevient supprimable.
CREATE OR REPLACE FUNCTION public.check_categorie_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Bypass légitime (Pattern 3) — inactif en pratique.
    IF current_setting('app.cascade_soft_delete', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- Verrou de structure : refuse la mise en corbeille tant qu'un enfant VIVANT
    -- existe — sous-catégorie, gamme, modèle d'équipement ou modèle d'opération.
    -- (Pas equipements : categorie_id SET NULL = déclassement volontaire.)
    IF EXISTS (
        SELECT 1 FROM public.categories c
        WHERE c.parent_id = NEW.id
          AND c.deleted_at IS NULL
    ) OR EXISTS (
        SELECT 1 FROM public.gammes g
        WHERE g.categorie_id = NEW.id
          AND g.deleted_at IS NULL
    ) OR EXISTS (
        SELECT 1 FROM public.modeles_equipements me
        WHERE me.categorie_id = NEW.id
          AND me.deleted_at IS NULL
    ) OR EXISTS (
        SELECT 1 FROM public.modeles_operations mo
        WHERE mo.categorie_id = NEW.id
          AND mo.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'Suppression impossible : cette catégorie contient encore des sous-catégories, des gammes ou des modèles. Videz d''abord son contenu.'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_categorie_suppression() IS
    'BEFORE UPDATE OF deleted_at ON categories : verrou de structure. Bloque la mise en corbeille si la catégorie a une sous-catégorie, une gamme, un modèle d''équipement ou un modèle d''opération VIVANT (deleted_at IS NULL). Force le bas-vers-haut. (024 : modeles_operations désormais filtré sur deleted_at, cf. 023.)';

-- ---------------------------------------------------------------------------
-- 5. RPC detacher_et_supprimer_modele_operation : détacher PUIS mise en corbeille
-- ---------------------------------------------------------------------------
-- Le front continue d'appeler cette RPC pour « supprimer » un modèle d'opération.
-- Seul le geste final change : UPDATE deleted_at (corbeille) au lieu d'un DELETE
-- physique. Les liaisons gamme_modeles sont toujours détachées d'abord (cross-site
-- inclus, RLS contournée). Les items modeles_operations_items RESTENT en base (ils
-- vivent avec le parent, filtrés par son deleted_at) et ne partiront en CASCADE
-- qu'à la purge 90 j.
CREATE OR REPLACE FUNCTION public.detacher_et_supprimer_modele_operation(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := public.current_role();
  v_site uuid;
BEGIN
  -- 0. Caller actif ? current_role() = NULL pour un user désactivé (F02) → on rejette
  --    explicitement (un v_role NULL rendrait la logique de droits « ni vrai ni faux »
  --    et laisserait passer ; DEFINER contournant la RLS, c'est notre seul rempart).
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Action non autorisée : utilisateur non authentifié ou désactivé.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 0bis. Rôles jamais autorisés en écriture (lecteur, demandeur) : barrés AVANT
  --       toute lecture, pour ne pas leur offrir un oracle d'existence (calque copier_gamme).
  IF v_role NOT IN ('admin', 'manager', 'technicien') THEN
    RAISE EXCEPTION 'Action non autorisée : droits insuffisants pour supprimer ce modèle d''opération.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 1. Le modèle existe ? On lit son scope (IF NOT FOUND fiable même si site_id NULL).
  SELECT site_id INTO v_site
  FROM public.modeles_operations
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modèle d''opération introuvable.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 2. Re-vérification des droits d'écriture (rejoue les policies de modeles_operations).
  IF NOT (
    v_role = 'admin'
    OR (v_role = 'manager'    AND (v_site IS NULL OR public.has_site_access(v_site)))
    OR (v_role = 'technicien' AND v_site IS NOT NULL AND public.has_site_access(v_site))
  ) THEN
    RAISE EXCEPTION 'Action non autorisée : droits insuffisants pour supprimer ce modèle d''opération.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Détacher TOUTES les liaisons (cross-site inclus, RLS contournée). Triggers
  --    BEFORE DELETE de gamme_modeles actifs → restrict_violation possible (roll back)
  --    si des OT actifs utilisent une gamme liée.
  DELETE FROM public.gamme_modeles WHERE modele_operation_id = p_id;

  -- 4. Mettre le modèle EN CORBEILLE (soft-delete, récupérable 90 j). Le verrou
  --    check_modele_operation_suppression passe : plus aucune liaison vivante après
  --    l'étape 3. AND deleted_at IS NULL → idempotent (no-op si déjà en corbeille).
  UPDATE public.modeles_operations
     SET deleted_at = now()
   WHERE id = p_id
     AND deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.detacher_et_supprimer_modele_operation(uuid) IS
    'Bibliothèque d''opérations : détache TOUTES les liaisons gamme_modeles d''un modèle d''opération PUIS le met EN CORBEILLE (soft-delete, UPDATE deleted_at — 024, ex-DELETE physique), en UNE transaction atomique. SECURITY DEFINER pour détacher aussi les liaisons cross-site masquées au caller par la RLS ; rejoue donc explicitement la règle d''écriture de modeles_operations (admin partout ; manager si entreprise ou site accessible ; technicien si modèle de site accessible). Les triggers BEFORE DELETE de gamme_modeles (dernière op d''une préventive active, OT actifs) restent actifs et peuvent annuler toute la transaction. no_data_found si le modèle n''existe pas, insufficient_privilege si droits insuffisants.';

-- ---------------------------------------------------------------------------
-- 5bis. copier_modele_operation : ne plus copier un modèle EN CORBEILLE
-- ---------------------------------------------------------------------------
-- Durcissement « la base valide » (doctrine) : la RPC lisait sa source sans filtrer
-- deleted_at — après 024 elle pourrait DUPLIQUER (ressusciter) un modèle mis en
-- corbeille via un UUID connu. On aligne sur copier_gamme : source VIVANTE seulement.
-- Reproduction intégrale ; seule la lecture source (étape 3) gagne `AND deleted_at IS NULL`.
CREATE OR REPLACE FUNCTION public.copier_modele_operation(
    p_source_modele_id UUID,
    p_site_cible       UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role   TEXT := public.current_role();
    v_source public.modeles_operations%ROWTYPE;
    v_new_id UUID;
BEGIN
    -- 1. Auth caller
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_modele_operation : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Droits selon scope cible
    IF p_site_cible IS NULL THEN
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION 'copier_modele_operation : seuls admin et manager peuvent copier vers la bibliothèque entreprise.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        IF v_role = 'admin' THEN
            NULL;
        ELSIF v_role IN ('manager', 'technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION 'copier_modele_operation : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION 'copier_modele_operation : rôle % non autorisé.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- 3. Lecture du modèle source VIVANT (024 : on ne copie pas un modèle en corbeille).
    SELECT * INTO v_source
      FROM public.modeles_operations
     WHERE id = p_source_modele_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_modele_operation : modèle source % introuvable.', p_source_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 3bis. Contrôle d'accès à la source (audit défensif)
    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_modele_operation : accès refusé au modèle source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 4. Catégorie cible : matérialisation (find-or-create) ; repli si en corbeille
    IF EXISTS (
        SELECT 1 FROM public.categories
         WHERE id = v_source.categorie_id AND deleted_at IS NULL
    ) THEN
        v_source.categorie_id := public.copier_categorie_noeud(
            v_source.categorie_id, NULL, p_site_cible
        );
    ELSE
        SELECT id INTO v_source.categorie_id
          FROM public.categories
         WHERE site_id IS NULL AND parent_id IS NULL
           AND scope = 'operation'
           AND lower(nom) = 'non classé (opérations)'
           AND deleted_at IS NULL
         LIMIT 1;
        IF v_source.categorie_id IS NULL THEN
            RAISE EXCEPTION 'copier_modele_operation : catégorie de secours « Non classé (opérations) » introuvable — recréez-la avant de copier.'
                USING ERRCODE = 'no_data_found';
        END IF;
    END IF;

    -- 5. Copie du modèle PAR VALEUR
    INSERT INTO public.modeles_operations (
        id, site_id, nom, description, image_path, miniature_id, categorie_id
    ) VALUES (
        gen_random_uuid(), p_site_cible,
        v_source.nom, v_source.description, v_source.image_path,
        CASE WHEN public.miniature_scope_ok(v_source.miniature_id, p_site_cible)
             THEN v_source.miniature_id ELSE NULL END,
        v_source.categorie_id
    )
    RETURNING id INTO v_new_id;

    -- 6. Copie des items rattachés au NOUVEAU modèle
    INSERT INTO public.modeles_operations_items (
        id, modele_operation_id, nom, description,
        type_operation_id, seuil_minimum, seuil_maximum, unite_id, ordre
    )
    SELECT gen_random_uuid(), v_new_id, nom, description,
           type_operation_id, seuil_minimum, seuil_maximum, unite_id, ordre
      FROM public.modeles_operations_items
     WHERE modele_operation_id = p_source_modele_id;

    RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.copier_modele_operation(UUID, UUID) IS
    'Bibliothèque de modèles d''opérations : duplique un modèle VIVANT PAR VALEUR (avec ses items) vers un site (p_site_cible renseigné) ou vers la bibliothèque entreprise (p_site_cible NULL). Copie indépendante de la source. La catégorie de la source est MATÉRIALISÉE dans le scope cible via copier_categorie_noeud (find-or-create idempotent). Repli « Non classé (opérations) » si la catégorie source est en corbeille. Droits : copie entreprise = admin/manager ; copie site = admin ou manager/technicien avec accès au site. Retourne l''id du nouveau modèle. Calque de copier_modele_equipement. (024 : source filtrée deleted_at IS NULL — pas de copie d''un modèle en corbeille.)';

-- ---------------------------------------------------------------------------
-- 6. purge_corbeille_90j : étapes modeles_operations + modeles_di + garde-fou catégorie
-- ---------------------------------------------------------------------------
-- Reproduction INTÉGRALE de la fonction existante. Ajouts 024 (et UNIQUEMENT eux) :
--   • étape modeles_di (DELETE simple, hors replica) après modeles_equipements ;
--   • étape modeles_operations dans une fenêtre 'replica' DÉDIÉE (triggers + FK off)
--     juste après, placée AVANT categories ;
--   • garde-fou `AND NOT EXISTS modeles_operations` sur la purge des categories
--     (modeles_operations.categorie_id est NOT NULL ON DELETE RESTRICT, 016).
CREATE OR REPLACE FUNCTION public.purge_corbeille_90j()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_nb     INTEGER;
BEGIN
    -- v0.26 : autorise la suppression en cascade des équipes internes des sites
    -- purgés (FK prestataires.site_id CASCADE ; protect_prestataire_interne lit ce flag).
    PERFORM set_config('app.purge_active', 'on', true);

    -- Ordre de purge : du plus feuille au plus racine pour respecter les FK RESTRICT.
    --
    -- PRÉSERVATION DES OT CLÔTURÉS (NF EN 13306) : un OT en statut 'cloture' est
    -- une preuve légale de contrôle réglementaire ERP — il N'EST JAMAIS purgé
    -- automatiquement par ce cron. Seul un admin peut le détruire manuellement.
    -- Conséquence : un OT clôturé peut survivre à la purge de sa gamme parente
    -- grâce à ses snapshots figés (Pattern 1) ; la FK gamme_id passe à NULL
    -- (ON DELETE SET NULL — cf définition de ordres_travail.gamme_id).
    --
    -- GARDE-FOU FK : le DELETE physique des OT (tout en bas) bascule la session
    -- en session_replication_role = 'replica', ce qui DÉSACTIVE le contrôle des
    -- FK. Les DELETE de gammes/categories s'exécutent AVANT ce basculement (donc
    -- FK actives). Pour les categories on garde des garde-fous NOT EXISTS sur
    -- (gamme, modèle d'équipement, modèle d'opération, sous-catégorie) — RESTRICT
    -- volontaire. Pour les gammes, plus de garde-fou côté OT : le SET NULL absorbe
    -- les OT survivants (clôturés ou non encore purgés à ce stade).

    -- documents — purge tôt (les liaisons documents_* partent en CASCADE ; la seule
    -- FK métier entrante, observations.document_levee_id, est ON DELETE SET NULL et
    -- ce DELETE tourne HORS replica → le SET NULL se déclenche, pas de garde-fou requis).
    --
    -- F28 audit sécu : suppression PHYSIQUE des fichiers Storage rattachés AVANT
    -- de supprimer la ligne metadata. Sans ça, les blobs restent indéfiniment
    -- dans le bucket 'documents' (fuite RGPD + coût de stockage). On supprime
    -- via storage.objects (RLS bypass via SECURITY DEFINER + search_path = '').
    -- Supabase storage récent : le trigger storage.protect_delete (statement-level)
    -- interdit tout DELETE direct sur storage.objects, SAUF si cette GUC est posée
    -- (mécanisme officiel — la Storage API la pose elle-même). SET LOCAL = portée TX.
    -- Sans ça, la purge entière échoue (transaction avortée) → purge RGPD jamais faite.
    PERFORM set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects
        WHERE bucket_id = 'documents'
          AND name IN (
              SELECT storage_path FROM public.documents
              WHERE deleted_at IS NOT NULL
                AND deleted_at < now() - interval '90 days'
          );
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('storage_objects', v_nb);

    DELETE FROM public.documents
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('documents', v_nb);

    -- demandes_intervention (signalement curatif autonome). Soft-delete RGPD :
    -- purge à 90j comme les autres entités. Les liaisons di_equipements /
    -- di_localisations partent en CASCADE (FK ON DELETE CASCADE). La table est
    -- auditée → le trigger AFTER DELETE trace la purge. Aucun trigger de
    -- protection ne bloque le DELETE d'une DI (pas de bypass replica requis).
    DELETE FROM public.demandes_intervention
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('demandes_intervention', v_nb);

    -- interventions_chantier (v0.33) — soft-delete RGPD, purge à 90j. Les liaisons
    -- chantier_localisations / chantier_equipements / documents_interventions_chantier
    -- partent en CASCADE. Aucun trigger de protection terminal (pas de bypass replica).
    DELETE FROM public.interventions_chantier
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('interventions_chantier', v_nb);

    -- investissements (v0.33) — soft-delete RGPD, purge à 90j. La liaison
    -- documents_investissements part en CASCADE.
    DELETE FROM public.investissements
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('investissements', v_nb);

    -- equipements — détacher D'ABORD les liaisons gammes_equipements (FK RESTRICT
    -- entrante, table de liaison sans soft-delete propre, jamais nettoyée par
    -- ailleurs) : sinon le DELETE ci-dessous lève foreign_key_violation et AVORTE
    -- toute la purge (le bloc tourne hors 'replica', FK actives). Les autres
    -- liaisons entrantes se résolvent seules : di_equipements / documents_equipements
    -- (CASCADE), observations.equipement_id (SET NULL).
    DELETE FROM public.gammes_equipements
        WHERE equipement_id IN (
            SELECT id FROM public.equipements
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
        );
    DELETE FROM public.equipements WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('equipements', v_nb);

    -- modeles_equipements — chantier C 2026-05-25.
    -- equipements.copie_depuis_modele_id est ON DELETE SET NULL → aucun garde-fou
    -- FK nécessaire : la purge d'un modèle déclasse proprement les équipements
    -- instanciés (qui conservent leurs specs grâce au snapshot Pattern 1).
    DELETE FROM public.modeles_equipements WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('modeles_equipements', v_nb);

    -- modeles_di (024) — feuille pure : aucune FK entrante, aucun trigger BEFORE
    -- DELETE, pas d'items. DELETE simple, hors replica. (NB : tant que le front
    -- hard-delete encore les DI, cette étape ne trouve rien — prête pour le jour
    -- où la mutation passe en soft-delete.)
    DELETE FROM public.modeles_di WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('modeles_di', v_nb);

    -- modeles_operations (024) — fenêtre 'replica' DÉDIÉE. Hors replica, le DELETE
    -- déclencherait validation_suppression_gamme_type_globale (BEFORE DELETE), la FK
    -- gamme_modeles RESTRICT et la CASCADE des items, avec un RISQUE D'AVORTER toute
    -- la purge (aucun bloc EXCEPTION par étape ici). En 'replica', triggers ET FK
    -- sont désactivés → on nettoie EXPLICITEMENT les items (CASCADE inactif) puis les
    -- liaisons gamme_modeles (RESTRICT inactif), avant de supprimer les modèles.
    -- Placé AVANT categories pour que leur garde-fou NOT EXISTS modeles_operations
    -- passe dès ce run. En régime normal les liaisons ont déjà été détachées à la
    -- mise en corbeille (RPC) — ces deux DELETE de nettoyage sont alors des no-op.
    SET LOCAL session_replication_role = replica;
    DELETE FROM public.modeles_operations_items
        WHERE modele_operation_id IN (
            SELECT id FROM public.modeles_operations
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
        );
    DELETE FROM public.gamme_modeles
        WHERE modele_operation_id IN (
            SELECT id FROM public.modeles_operations
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
        );
    DELETE FROM public.modeles_operations
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    SET LOCAL session_replication_role = origin;
    v_result := v_result || jsonb_build_object('modeles_operations', v_nb);

    -- locaux
    DELETE FROM public.locaux WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('locaux', v_nb);

    -- niveaux
    DELETE FROM public.niveaux WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('niveaux', v_nb);

    -- batiments
    DELETE FROM public.batiments WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('batiments', v_nb);

    -- gammes — Plus de garde-fou côté OT : la FK ordres_travail.gamme_id est
    -- ON DELETE SET NULL, donc la purge d'une gamme déclasse proprement les OT
    -- conservés (clôturés ou pas encore purgés). Les OT survivent grâce aux
    -- snapshots figés (Pattern 1).
    DELETE FROM public.gammes
        WHERE deleted_at IS NOT NULL
          AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('gammes', v_nb);

    -- categories — GARDE-FOU : on n'efface PAS une catégorie encore référencée
    -- par une gamme non purgée (gammes.categorie_id RESTRICT), par un modèle
    -- d'équipement (modeles_equipements.categorie_id RESTRICT — 2026-06-10), par
    -- un modèle d'opération (modeles_operations.categorie_id RESTRICT — 016, garde-fou
    -- ajouté en 024) ni par une catégorie enfant (parent_id RESTRICT). equipements.
    -- categorie_id et copie_depuis_id étant ON DELETE SET NULL, aucun garde-fou
    -- nécessaire de ces côtés (la purge déclasse simplement les équipements).
    DELETE FROM public.categories
        WHERE deleted_at IS NOT NULL
          AND deleted_at < now() - interval '90 days'
          AND NOT EXISTS (
              SELECT 1 FROM public.gammes g WHERE g.categorie_id = public.categories.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.modeles_equipements me WHERE me.categorie_id = public.categories.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.modeles_operations mo WHERE mo.categorie_id = public.categories.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.categories enfant WHERE enfant.parent_id = public.categories.id
          );
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('categories', v_nb);

    -- prestataires + sites : v0.21 — purgés APRÈS les OT (déplacés plus bas), sinon
    -- leurs OT (même soft-deletés) bloqueraient le DELETE par FK RESTRICT. Voir le
    -- bloc « prestataires/sites » en fin de fonction (avec garde-fous NOT EXISTS).

    -- ordres_travail (soft-delete RGPD : on conserve 90j puis on purge — SAUF
    -- les OT en statut 'cloture' qui sont des preuves légales NF EN 13306 et
    -- ne sont JAMAIS purgés automatiquement. Seul un admin peut les détruire).
    -- ATTENTION : protection_ot_terminaux bloque DELETE physique ; il faut
    -- bypasser via session_replication_role = 'replica' (service_role + SET LOCAL).
    -- F15 (audit sécu) : 'replica' désactive AUSSI les triggers d'audit
    --   (audit_ordres_travail) → on log manuellement AVANT le DELETE pour
    --   garder une trace conforme NF EN 13306. row_pk en TEXT, before = ligne
    --   complète, after = NULL (DELETE). user_id = NULL car cron système.
    INSERT INTO public.audit_log (user_id, table_name, row_pk, action, before, after)
    SELECT
        NULL,                        -- cron système, pas d'user
        'ordres_travail',
        ot.id::text,
        'DELETE',
        to_jsonb(ot.*),
        NULL
    FROM public.ordres_travail ot
    WHERE ot.deleted_at IS NOT NULL
      AND ot.deleted_at < now() - interval '90 days'
      AND ot.statut <> 'cloture';   -- preuve légale → jamais purgée auto

    -- ATTENTION : 'replica' désactive AUSSI les triggers d'intégrité référentielle
    -- (FK). Les actions ON DELETE CASCADE / SET NULL des enfants des OT ne se
    -- déclenchent donc PAS → on nettoie EXPLICITEMENT, sinon lignes orphelines :
    --   - operations_execution (FK CASCADE, pas de soft-delete propre → jamais
    --     purgée autrement : un OT purgé laisserait ses opex orphelines)
    --   - documents_ordres_travail (FK CASCADE, table de liaison)
    --   - observations.ot_id (FK SET NULL : la ligne survit, on neutralise le lien)
    SET LOCAL session_replication_role = replica;

    DELETE FROM public.operations_execution
        WHERE ordre_travail_id IN (
            SELECT id FROM public.ordres_travail
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
              AND statut <> 'cloture'
        );
    DELETE FROM public.documents_ordres_travail
        WHERE ordre_travail_id IN (
            SELECT id FROM public.ordres_travail
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
              AND statut <> 'cloture'
        );
    -- observations : lien souple (SET NULL) pour celles qui peuvent vivre
    -- détachées. MAIS le CHECK observations_source_controle_ot impose ot_id NOT
    -- NULL pour source='controle_reglementaire', et les CHECK SURVIVENT à 'replica'
    -- (contrairement aux FK) → un SET NULL aveugle lèverait check_violation et
    -- avorterait la purge. Ces observations de contrôle sont donc purgées AVEC leur
    -- OT (un OT non clôturé purgé les emporte ; les OT clôturés ne sont jamais
    -- purgés). observations n'a aucune FK entrante → DELETE sûr (pas d'orphelin).
    UPDATE public.observations SET ot_id = NULL
        WHERE source <> 'controle_reglementaire'
          AND ot_id IN (
              SELECT id FROM public.ordres_travail
              WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
                AND statut <> 'cloture'
          );
    DELETE FROM public.observations
        WHERE source = 'controle_reglementaire'
          AND ot_id IN (
              SELECT id FROM public.ordres_travail
              WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
                AND statut <> 'cloture'
          );

    DELETE FROM public.ordres_travail
        WHERE deleted_at IS NOT NULL
          AND deleted_at < now() - interval '90 days'
          AND statut <> 'cloture';   -- preuve légale → jamais purgée auto
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    SET LOCAL session_replication_role = origin;
    v_result := v_result || jsonb_build_object('ordres_travail', v_nb);

    -- prestataires — v0.21 : APRÈS les OT (les OT non clôturés sont désormais purgés).
    -- Garde-fou NOT EXISTS : un prestataire encore référencé par un contrat (pas de
    -- soft-delete), une gamme ou un OT (clôturé = preuve jamais purgée) reste en
    -- corbeille — jamais détruit tant qu'une de ces références existe (décision PO 2026).
    DELETE FROM public.prestataires p
        WHERE p.deleted_at IS NOT NULL AND p.deleted_at < now() - interval '90 days'
          AND NOT EXISTS (SELECT 1 FROM public.contrats c        WHERE c.prestataire_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM public.gammes g          WHERE g.prestataire_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM public.ordres_travail ot WHERE ot.prestataire_id = p.id);
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('prestataires', v_nb);

    -- sites — v0.21 : EN DERNIER. La cascade spatiale (trg_sites_cascade_corbeille)
    -- a normalement déjà mis batiments/gammes/categories/documents/DI/OT du site en
    -- corbeille (donc purgés au-dessus). Garde-fou NOT EXISTS sur les 6 FK RESTRICT
    -- filles : un OT clôturé (preuve jamais purgée) ou une observation (pas de
    -- soft-delete) retient le site → il reste en corbeille (décision PO 2026 : on ne
    -- détruit jamais une preuve NF EN 13306).
    DELETE FROM public.sites s
        WHERE s.deleted_at IS NOT NULL AND s.deleted_at < now() - interval '90 days'
          AND NOT EXISTS (SELECT 1 FROM public.batiments b             WHERE b.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.gammes g                WHERE g.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.categories c            WHERE c.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.documents d             WHERE d.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.demandes_intervention di WHERE di.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.observations o          WHERE o.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.ordres_travail ot       WHERE ot.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.contrats c              WHERE c.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.interventions_chantier ic WHERE ic.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.investissements inv     WHERE inv.site_id = s.id);
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('sites', v_nb);

    -- Trace d'exécution (apparaît dans les logs Supabase). Le détail par table
    -- — dont documents, gammes et categories avec leurs garde-fous FK — sert au
    -- suivi RGPD et au diagnostic d'éventuels résidus non purgés.
    RAISE LOG 'purge_corbeille_90j: purge terminée %', v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.purge_corbeille_90j() IS
    'Cron quotidien 05:00 : supprime physiquement les entités soft-deleted depuis > 90 jours. Bypass triggers via session_replication_role. (024 : + modeles_operations (fenêtre replica dédiée) + modeles_di + garde-fou catégorie NOT EXISTS modeles_operations.)';

COMMIT;
