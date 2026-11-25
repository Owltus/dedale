-- =============================================================================
-- Semis de la sonde du connecteur (edge-functions.mjs, partie MCP) — base
-- LOCALE JETABLE
-- =============================================================================
-- Pose de quoi lire le parc par le connecteur Claude (185) :
--   site A : un niveau et trois chambres « Chambre standard » (surface, capacité,
--            PMR, caractéristiques) ; une catégorie de modèles et un modèle de
--            site « Détecteur optique » ; une flotte (sous-catégorie de parc)
--            liée à ce modèle, trois équipements valorisés (deux issus d'un
--            même déploiement en masse) et un plan de maintenance lié ;
--   commun : le même « Détecteur optique » (donc installé sur A) et un
--            « Extincteur CO2 » non installé ;
--   site B : une flotte et un équipement leurres (ne doivent jamais sortir
--            pour une personne du site A).
-- Joué par psql (superutilisateur local) : la RLS ne s'applique pas ici.
--
-- Paramètres psql : :siteA, :batimentA, :siteB, :niveauB, :auteur (technicien
-- du site A), :suffixe. Sortie : UNE ligne JSON des identifiants utiles.
-- Retrait : connecteur-lecture.menage.sql (même suffixe).
--
-- GARDE-FOU : refuse de tourner sans le compte admin@martin.test (base semée
-- par tests/securite/semis.mjs) — rien à faire en production.
-- =============================================================================
\set ON_ERROR_STOP 1
SELECT set_config('cl.siteA', :'siteA', false),
       set_config('cl.batimentA', :'batimentA', false),
       set_config('cl.siteB', :'siteB', false),
       set_config('cl.niveauB', :'niveauB', false),
       set_config('cl.auteur', :'auteur', false),
       set_config('cl.suffixe', :'suffixe', false) \gset

DO $semis$
DECLARE
  v_site uuid := current_setting('cl.siteA')::uuid;
  v_bat uuid := current_setting('cl.batimentA')::uuid;
  v_site_b uuid := current_setting('cl.siteB')::uuid;
  v_niveau_b uuid := current_setting('cl.niveauB')::uuid;
  v_auteur uuid := current_setting('cl.auteur')::uuid;
  x text := current_setting('cl.suffixe');
  v_presta uuid; v_type int; v_niveau uuid; l101 uuid; l102 uuid; l110 uuid; l_b uuid;
  v_cat_mod uuid; v_cat_mod_c uuid; v_cat_mod_b uuid; v_mod uuid; v_mod_b uuid;
  v_parc uuid; v_flotte uuid; v_parc_b uuid; v_flotte_b uuid;
  v_dom uuid; v_fam uuid; g uuid;
  e1 uuid; e2 uuid; e3 uuid; v_lot uuid := gen_random_uuid();
  v_gabarit jsonb := jsonb_build_object('champs', jsonb_build_array(
      jsonb_build_object('cle', 'Repère', 'type', 'texte', 'requis', true, 'defaut', NULL),
      jsonb_build_object('cle', 'Technologie', 'type', 'liste', 'options', jsonb_build_array('Optique', 'Thermique'),
                         'requis', false, 'defaut', 'Optique'),
      jsonb_build_object('cle', 'Adresse', 'type', 'double-reference', 'libelleA', 'Zone',
                         'libelleB', 'Point', 'requis', false, 'defaut', NULL),
      jsonb_build_object('cle', 'Pose', 'type', 'date', 'requis', false, 'defaut', NULL)));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@martin.test') THEN
    RAISE EXCEPTION 'Cible refusée : base non semée par semis.mjs.';
  END IF;
  SELECT id INTO v_presta FROM public.prestataires WHERE libelle = 'Prestataire Martin';

  -- Lieux : un type, un niveau, trois chambres.
  -- Type de référence (table de référence, ids figés) : « Chambre standard ».
  SELECT id INTO v_type FROM public.types_locaux WHERE libelle = 'Chambre standard';
  INSERT INTO public.niveaux (batiment_id, nom, ordre) VALUES (v_bat, 'R+1 cl ' || x, 1) RETURNING id INTO v_niveau;
  INSERT INTO public.locaux (niveau_id, nom, type_local_id, surface_m2, hauteur_m, capacite_personnes, accessible_pmr, specifications)
  VALUES (v_niveau, 'Chambre 101 cl ' || x, v_type, 18, 2.5, 2, true,
          jsonb_build_object('champs', jsonb_build_array(
            jsonb_build_object('cle', 'Literie', 'type', 'liste', 'options', jsonb_build_array('Double', 'Twin'),
                               'requis', false, 'defaut', NULL, 'valeur', 'Double'))))
  RETURNING id INTO l101;
  INSERT INTO public.locaux (niveau_id, nom, type_local_id, surface_m2, capacite_personnes)
  VALUES (v_niveau, 'Chambre 102 cl ' || x, v_type, 16, 2) RETURNING id INTO l102;
  INSERT INTO public.locaux (niveau_id, nom, type_local_id) VALUES (v_niveau, 'Chambre 110 cl ' || x, v_type)
  RETURNING id INTO l110;

  -- Bibliothèque : modèle du site A, le même au commun, un commun non installé.
  INSERT INTO public.categories (nom, scope, ordre, site_id) VALUES ('Sécurité cl ' || x, 'equipement', 1, v_site)
  RETURNING id INTO v_cat_mod;
  INSERT INTO public.modeles_equipements (site_id, nom, categorie_id, specifications, description)
  VALUES (v_site, 'Détecteur optique cl ' || x, v_cat_mod, v_gabarit, 'Détecteur de fumée des chambres') RETURNING id INTO v_mod;
  INSERT INTO public.categories (nom, scope, ordre) VALUES ('Sécurité commun cl ' || x, 'equipement', 1)
  RETURNING id INTO v_cat_mod_c;
  INSERT INTO public.modeles_equipements (site_id, nom, categorie_id, specifications)
  VALUES (NULL, 'Détecteur optique cl ' || x, v_cat_mod_c, v_gabarit),
         (NULL, 'Extincteur CO2 cl ' || x, v_cat_mod_c, '{"champs": []}');

  -- Flotte du site A liée au modèle, trois équipements (deux d'un même lot).
  INSERT INTO public.categories (nom, scope, ordre, site_id) VALUES ('Sécurité incendie cl ' || x, 'parc', 1, v_site)
  RETURNING id INTO v_parc;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id, modele_equipement_id, valeur_principale, valeur_secondaire)
  VALUES ('Détecteur cl ' || x, 'parc', 1, v_site, v_parc, v_mod, 'Repère', 'Technologie') RETURNING id INTO v_flotte;
  PERFORM set_config('dedale.deploiement_en_cours', 'on', true);
  INSERT INTO public.equipements (local_id, categorie_id, code_inventaire, specifications, lot_deploiement)
  VALUES (l101, v_flotte, 'DET1-' || x, jsonb_set(v_gabarit, '{champs}', jsonb_build_array(
            jsonb_build_object('cle', 'Repère', 'type', 'texte', 'requis', true, 'valeur', 'Chambre 101'),
            jsonb_build_object('cle', 'Technologie', 'type', 'liste', 'options', jsonb_build_array('Optique', 'Thermique'),
                               'requis', false, 'valeur', 'Optique'),
            jsonb_build_object('cle', 'Adresse', 'type', 'double-reference', 'libelleA', 'Zone', 'libelleB', 'Point',
                               'requis', false, 'valeur', jsonb_build_object('a', '3', 'b', '12')))), v_lot)
  RETURNING id INTO e1;
  INSERT INTO public.equipements (local_id, categorie_id, code_inventaire, specifications, lot_deploiement)
  VALUES (l102, v_flotte, 'DET2-' || x, jsonb_build_object('champs', jsonb_build_array(
            jsonb_build_object('cle', 'Repère', 'type', 'texte', 'requis', true, 'valeur', 'Chambre 102'))), v_lot)
  RETURNING id INTO e2;
  PERFORM set_config('dedale.deploiement_en_cours', 'off', true);
  INSERT INTO public.equipements (local_id, categorie_id, code_inventaire, specifications)
  VALUES (l110, v_flotte, 'DET3-' || x, jsonb_build_object('champs', jsonb_build_array(
            jsonb_build_object('cle', 'Repère', 'type', 'texte', 'requis', true, 'valeur', 'Chambre 110'))))
  RETURNING id INTO e3;

  -- Plan de maintenance du site lié aux trois détecteurs.
  INSERT INTO public.categories (nom, scope, ordre, site_id) VALUES ('Domaine cl ' || x, 'gamme', 1, v_site)
  RETURNING id INTO v_dom;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id) VALUES ('Famille cl ' || x, 'gamme', 1, v_site, v_dom)
  RETURNING id INTO v_fam;
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, prestataire_id, created_by)
  VALUES (v_site, 'Contrôle détecteurs cl ' || x, 'maintenance_preventive', v_fam, 3, v_presta, v_auteur) RETURNING id INTO g;
  INSERT INTO public.gammes_equipements (gamme_id, equipement_id) VALUES (g, e1), (g, e2), (g, e3);

  -- Leurres du site B.
  INSERT INTO public.categories (nom, scope, ordre, site_id) VALUES ('Sécurité B cl ' || x, 'equipement', 1, v_site_b)
  RETURNING id INTO v_cat_mod_b;
  INSERT INTO public.modeles_equipements (site_id, nom, categorie_id, specifications)
  VALUES (v_site_b, 'Modèle B cl ' || x, v_cat_mod_b, v_gabarit) RETURNING id INTO v_mod_b;
  INSERT INTO public.categories (nom, scope, ordre, site_id) VALUES ('Parc B cl ' || x, 'parc', 1, v_site_b)
  RETURNING id INTO v_parc_b;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id, modele_equipement_id)
  VALUES ('Flotte B cl ' || x, 'parc', 1, v_site_b, v_parc_b, v_mod_b) RETURNING id INTO v_flotte_b;
  INSERT INTO public.locaux (niveau_id, nom) VALUES (v_niveau_b, 'Chambre B cl ' || x) RETURNING id INTO l_b;
  INSERT INTO public.equipements (local_id, categorie_id, code_inventaire, specifications)
  VALUES (l_b, v_flotte_b, 'DETB-' || x, '{"champs": []}');

  PERFORM set_config('cl.resultat', jsonb_build_object('lieu101', l101, 'lieu_b', l_b)::text, false);
END $semis$;

SELECT current_setting('cl.resultat');
