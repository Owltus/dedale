-- =============================================================================
-- Semis d'OT de la base LOCALE JETABLE — complément de semis.mjs
-- =============================================================================
-- Joué par `npm run base:monter` juste après semis.mjs (comptes et sites déjà
-- là). Pose sur le site A de quoi faire tourner le cycle de vie d'un OT
-- (tests/securite/triggers-ot.sql) :
--   - une catégorie de gamme et sa sous-catégorie (arborescence stricte) ;
--   - une gamme PÉRIODIQUE (mensuelle) active, avec deux opérations sans mesure ;
--   - son premier OT « planifie », créé comme le fait la base
--     (generate_next_ot_for_gamme), opérations recopiées par l'orchestrateur.
--
-- GARDE-FOU : refuse de tourner ailleurs que sur une base semée par semis.mjs
-- (compte admin@martin.test présent). Il n'a rien à faire en production.
-- =============================================================================
DO $semis$
DECLARE
  v_admin uuid; v_site uuid; v_presta uuid;
  v_racine uuid; v_sous uuid; v_gamme uuid; v_ot uuid;
BEGIN
  SELECT u.id INTO v_admin FROM auth.users u WHERE u.email = 'admin@martin.test';
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Cible refusée : base non semée par semis.mjs (admin@martin.test absent).';
  END IF;
  SELECT id INTO v_site FROM public.sites WHERE nom = 'Site Alpha';
  SELECT id INTO v_presta FROM public.prestataires WHERE libelle = 'Prestataire Martin';

  INSERT INTO public.categories (nom, scope, ordre, site_id)
  VALUES ('Domaine Martin', 'gamme', 1, v_site) RETURNING id INTO v_racine;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id)
  VALUES ('Famille Martin', 'gamme', 1, v_site, v_racine) RETURNING id INTO v_sous;

  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, prestataire_id, created_by)
  VALUES (v_site, 'Gamme périodique Martin', 'maintenance_preventive', v_sous, 3, v_presta, v_admin)
  RETURNING id INTO v_gamme;
  INSERT INTO public.operations (gamme_id, nom, type_operation_id, ordre) VALUES
    (v_gamme, 'Vérifier le fonctionnement', 1, 1),
    (v_gamme, 'Nettoyer les filtres', 3, 2);

  v_ot := public.generate_next_ot_for_gamme(v_gamme, v_admin, v_site, CURRENT_DATE);
  IF v_ot IS NULL THEN
    RAISE EXCEPTION 'Semis OT : aucun OT généré pour la gamme périodique.';
  END IF;
  RAISE NOTICE 'Semis OT : gamme périodique + 1 OT planifié (% opération(s)).',
    (SELECT count(*) FROM public.operations_execution WHERE ordre_travail_id = v_ot);
END $semis$;
