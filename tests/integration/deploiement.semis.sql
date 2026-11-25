-- =============================================================================
-- Semis de tests/integration/deploiement.mjs — base LOCALE JETABLE
-- =============================================================================
-- Pose une flotte à déployer (184) : sur le site A, une catégorie de parc et
-- deux sous-catégories (gabarit propre / modèle du site), 230 lieux sur deux
-- niveaux, un équipement déjà présent (doublon), une gamme RÉPÉTÉE par
-- équipement avec un OT ouvert, plus des leurres (gamme du commun, gamme et
-- sous-catégorie du site B, un lieu du site B).
-- Joué par psql (superutilisateur local) : la RLS ne s'applique pas ici.
--
-- Paramètres psql : :siteA, :niveauA, :batimentA, :siteB, :niveauB, :auteur
-- (technicien du site A), :suffixe. Sortie : UNE ligne JSON des identifiants.
--
-- GARDE-FOU : refuse de tourner sans le compte admin@martin.test (base semée
-- par tests/securite/semis.mjs) — rien à faire en production.
-- =============================================================================
\set ON_ERROR_STOP 1
SELECT set_config('dep.siteA', :'siteA', false),
       set_config('dep.niveauA', :'niveauA', false),
       set_config('dep.batimentA', :'batimentA', false),
       set_config('dep.siteB', :'siteB', false),
       set_config('dep.niveauB', :'niveauB', false),
       set_config('dep.auteur', :'auteur', false),
       set_config('dep.suffixe', :'suffixe', false) \gset

DO $semis$
DECLARE
  v_site uuid := current_setting('dep.siteA')::uuid;
  v_niveau uuid := current_setting('dep.niveauA')::uuid;
  v_bat uuid := current_setting('dep.batimentA')::uuid;
  v_site_b uuid := current_setting('dep.siteB')::uuid;
  v_niveau_b uuid := current_setting('dep.niveauB')::uuid;
  v_auteur uuid := current_setting('dep.auteur')::uuid;
  x text := current_setting('dep.suffixe');
  v_presta uuid; v_niveau2 uuid;
  v_parc uuid; v_flotte uuid; v_flotte_m uuid; v_flotte_b uuid; v_parc_b uuid;
  v_cat_modele uuid; v_modele uuid;
  v_dom uuid; v_fam uuid; v_dom_c uuid; v_fam_c uuid; v_dom_b uuid; v_fam_b uuid;
  g uuid; g_commun uuid; g_b uuid; ot uuid;
  v_lieux uuid[] := '{}'; v_id uuid; v_lieu_b uuid; v_doublon uuid; i int;
  v_gabarit jsonb := jsonb_build_object('champs', jsonb_build_array(
      jsonb_build_object('cle', 'Numéro', 'type', 'texte', 'requis', true, 'defaut', NULL),
      jsonb_build_object('cle', 'Marque', 'type', 'liste', 'options', jsonb_build_array('Acme', 'Bolt'),
                         'requis', false, 'defaut', 'Acme'),
      jsonb_build_object('cle', 'Puissance', 'type', 'nombre', 'unite', 'kW', 'requis', false, 'defaut', 2.5),
      jsonb_build_object('cle', 'Repère', 'type', 'double-reference', 'libelleA', 'Zone',
                         'libelleB', 'Point', 'requis', false, 'defaut', NULL),
      jsonb_build_object('cle', 'Raccordé', 'type', 'oui-non', 'requis', false, 'defaut', true),
      jsonb_build_object('cle', 'Pose', 'type', 'date', 'requis', false, 'defaut', NULL,
                         'valeur', '2026-01-15')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@martin.test') THEN
    RAISE EXCEPTION 'Cible refusée : base non semée par semis.mjs.';
  END IF;
  SELECT id INTO v_presta FROM public.prestataires WHERE libelle = 'Prestataire Martin';

  -- Flottes : catégorie de parc → sous-catégorie à gabarit propre, et
  -- sous-catégorie liée à un modèle du site.
  INSERT INTO public.categories (nom, scope, ordre, site_id)
  VALUES ('Parc dep ' || x, 'parc', 1, v_site) RETURNING id INTO v_parc;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id, specifications, valeur_principale)
  VALUES ('Détecteur dep ' || x, 'parc', 1, v_site, v_parc, v_gabarit, 'Numéro') RETURNING id INTO v_flotte;
  INSERT INTO public.categories (nom, scope, ordre, site_id)
  VALUES ('Modèles dep ' || x, 'equipement', 1, v_site) RETURNING id INTO v_cat_modele;
  INSERT INTO public.modeles_equipements (site_id, nom, categorie_id, specifications)
  VALUES (v_site, 'Modèle dep ' || x, v_cat_modele, v_gabarit) RETURNING id INTO v_modele;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id, modele_equipement_id, valeur_principale)
  VALUES ('Clim dep ' || x, 'parc', 2, v_site, v_parc, v_modele, 'Numéro') RETURNING id INTO v_flotte_m;

  -- 230 lieux : 115 sur le niveau semé, 115 sur un second niveau.
  INSERT INTO public.niveaux (batiment_id, nom, ordre) VALUES (v_bat, 'Niveau dep ' || x, 9)
  RETURNING id INTO v_niveau2;
  FOR i IN 1..230 LOOP
    INSERT INTO public.locaux (niveau_id, nom)
    VALUES (CASE WHEN i <= 115 THEN v_niveau ELSE v_niveau2 END,
            'Chambre ' || lpad(i::text, 3, '0') || ' ' || x)
    RETURNING id INTO v_id;
    v_lieux := v_lieux || v_id;
  END LOOP;
  -- Doublon : la flotte a déjà un équipement dans le 1er lieu.
  INSERT INTO public.equipements (local_id, categorie_id, code_inventaire, specifications)
  VALUES (v_lieux[1], v_flotte, 'DEP0-' || x, '{"champs": []}') RETURNING id INTO v_doublon;

  -- Gamme répétée par équipement, 2 opérations, un OT ouvert (sans équipement
  -- lié : repli à 2 lignes génériques).
  INSERT INTO public.categories (nom, scope, ordre, site_id)
  VALUES ('Domaine dep ' || x, 'gamme', 1, v_site) RETURNING id INTO v_dom;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id)
  VALUES ('Famille dep ' || x, 'gamme', 1, v_site, v_dom) RETURNING id INTO v_fam;
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, prestataire_id, created_by, repeter_par_equipement)
  VALUES (v_site, 'Gamme dep ' || x, 'maintenance_preventive', v_fam, 3, v_presta, v_auteur, true) RETURNING id INTO g;
  INSERT INTO public.operations (gamme_id, nom, type_operation_id, ordre) VALUES
    (g, 'Nettoyer', 1, 1), (g, 'Contrôler', 1, 2);
  ot := public.generate_next_ot_for_gamme(g, v_auteur, v_site, CURRENT_DATE);
  IF ot IS NULL THEN RAISE EXCEPTION 'Semis déploiement : OT non généré.'; END IF;

  -- Leurres : gamme du COMMUN, gamme + flotte + lieu du site B.
  INSERT INTO public.categories (nom, scope, ordre) VALUES ('Domaine commun dep ' || x, 'gamme', 1) RETURNING id INTO v_dom_c;
  INSERT INTO public.categories (nom, scope, ordre, parent_id) VALUES ('Famille commun dep ' || x, 'gamme', 1, v_dom_c) RETURNING id INTO v_fam_c;
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, created_by)
  VALUES (NULL, 'Commun dep ' || x, 'maintenance_preventive', v_fam_c, 3, v_auteur) RETURNING id INTO g_commun;
  INSERT INTO public.categories (nom, scope, ordre, site_id) VALUES ('Domaine B dep ' || x, 'gamme', 1, v_site_b) RETURNING id INTO v_dom_b;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id) VALUES ('Famille B dep ' || x, 'gamme', 1, v_site_b, v_dom_b) RETURNING id INTO v_fam_b;
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, prestataire_id, created_by)
  VALUES (v_site_b, 'Gamme B dep ' || x, 'maintenance_preventive', v_fam_b, 3, v_presta, v_auteur) RETURNING id INTO g_b;
  INSERT INTO public.categories (nom, scope, ordre, site_id) VALUES ('Parc B dep ' || x, 'parc', 1, v_site_b) RETURNING id INTO v_parc_b;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id, specifications)
  VALUES ('Flotte B dep ' || x, 'parc', 1, v_site_b, v_parc_b, v_gabarit) RETURNING id INTO v_flotte_b;
  INSERT INTO public.locaux (niveau_id, nom) VALUES (v_niveau_b, 'Chambre B ' || x) RETURNING id INTO v_lieu_b;

  PERFORM set_config('dep.resultat', jsonb_build_object(
    'parc', v_parc, 'flotte', v_flotte, 'flotte_modele', v_flotte_m, 'modele', v_modele,
    'flotte_b', v_flotte_b, 'gabarit', v_gabarit,
    'lieux', to_jsonb(v_lieux), 'lieu_b', v_lieu_b, 'doublon', v_doublon,
    'gamme', g, 'gamme_commun', g_commun, 'gamme_b', g_b, 'ot', ot)::text, false);
END $semis$;

SELECT current_setting('dep.resultat');
