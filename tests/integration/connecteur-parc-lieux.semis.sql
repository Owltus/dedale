-- =============================================================================
-- Semis de tests/integration/connecteur-parc-lieux.mjs — base LOCALE JETABLE
-- =============================================================================
-- Pose le terrain des gestes Claude 188-190 :
--   site A : une catégorie de parc et une flotte (gabarit propre, valeur
--     principale « Numéro »), 215 lieux sur un niveau dédié, 200 équipements
--     (lieux 1 à 200) rattachés à une gamme RÉPÉTÉE par équipement avec un OT
--     ouvert, un équipement lié à une DI (lieu 201), six équipements
--     supprimables (lieux 202 à 207), lieux 208 à 215 vides ;
--   commun : une catégorie de modèles, six modèles à installer (un par
--     identité testée) et un modèle à modifier, une gamme (leurre) ;
--   site B : une flotte, un lieu, un équipement, une gamme (leurres) ;
--   deux types de lieu à gabarit (« Type cpl » : Lits, Vue ; « Autre type
--   cpl » : Lits, Sol).
-- Joué par psql (superutilisateur local) : la RLS ne s'applique pas ici.
--
-- Paramètres psql : :siteA, :batimentA, :siteB, :niveauB, :auteur, :di, :suffixe.
-- Sortie : UNE ligne JSON des identifiants.
--
-- GARDE-FOU : refuse de tourner sans le compte admin@martin.test (base semée
-- par tests/securite/semis.mjs) — rien à faire en production.
-- =============================================================================
\set ON_ERROR_STOP 1
SELECT set_config('cpl.siteA', :'siteA', false),
       set_config('cpl.batimentA', :'batimentA', false),
       set_config('cpl.siteB', :'siteB', false),
       set_config('cpl.niveauB', :'niveauB', false),
       set_config('cpl.auteur', :'auteur', false),
       set_config('cpl.di', :'di', false),
       set_config('cpl.suffixe', :'suffixe', false) \gset

DO $semis$
DECLARE
  v_site uuid := current_setting('cpl.siteA')::uuid;
  v_bat uuid := current_setting('cpl.batimentA')::uuid;
  v_site_b uuid := current_setting('cpl.siteB')::uuid;
  v_niveau_b uuid := current_setting('cpl.niveauB')::uuid;
  v_auteur uuid := current_setting('cpl.auteur')::uuid;
  v_di uuid := current_setting('cpl.di')::uuid;
  x text := current_setting('cpl.suffixe');
  v_presta uuid; v_niveau uuid; v_parc uuid; v_flotte uuid; v_parc_b uuid; v_flotte_b uuid;
  v_cat_commun uuid; v_cat_site uuid; v_communs uuid[] := '{}'; v_commun_edit uuid; v_modele_site uuid;
  v_dom uuid; v_fam uuid; v_dom_c uuid; v_fam_c uuid; v_dom_b uuid; v_fam_b uuid;
  g uuid; g_commun uuid; g_b uuid; ot uuid; v_type smallint; v_type2 smallint;
  v_lieux uuid[] := '{}'; v_eqs uuid[] := '{}'; v_suppr uuid[] := '{}'; v_id uuid; v_lieu_b uuid; v_eq_di uuid; i int;
  v_gabarit jsonb := jsonb_build_object('champs', jsonb_build_array(
      jsonb_build_object('cle', 'Numéro', 'type', 'texte', 'requis', true, 'defaut', NULL),
      jsonb_build_object('cle', 'Marque', 'type', 'liste', 'options', jsonb_build_array('Acme', 'Bolt'),
                         'requis', false, 'defaut', 'Acme'),
      jsonb_build_object('cle', 'Pose', 'type', 'date', 'requis', false, 'defaut', NULL)));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@martin.test') THEN
    RAISE EXCEPTION 'Cible refusée : base non semée par semis.mjs.';
  END IF;
  SELECT id INTO v_presta FROM public.prestataires WHERE libelle = 'Prestataire Martin';

  -- Types de lieu à gabarit (référentiel : ids libres au-delà de l'existant).
  SELECT coalesce(max(id), 0) + 1 INTO v_type FROM public.types_locaux;
  INSERT INTO public.types_locaux (id, libelle, specifications) VALUES
    (v_type, 'Type cpl ' || x, jsonb_build_object('champs', jsonb_build_array(
        jsonb_build_object('cle', 'Lits', 'type', 'nombre', 'requis', false, 'defaut', 1),
        jsonb_build_object('cle', 'Vue', 'type', 'liste', 'options', jsonb_build_array('Mer', 'Cour'),
                           'requis', false, 'defaut', 'Cour')))),
    (v_type + 1, 'Autre type cpl ' || x, jsonb_build_object('champs', jsonb_build_array(
        jsonb_build_object('cle', 'Lits', 'type', 'nombre', 'requis', false, 'defaut', 2),
        jsonb_build_object('cle', 'Sol', 'type', 'texte', 'requis', false, 'defaut', NULL))));
  v_type2 := v_type + 1;

  -- Flotte du site A.
  INSERT INTO public.categories (nom, scope, ordre, site_id)
  VALUES ('Parc cpl ' || x, 'parc', 1, v_site) RETURNING id INTO v_parc;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id, specifications, valeur_principale)
  VALUES ('Détecteur cpl ' || x, 'parc', 1, v_site, v_parc, v_gabarit, 'Numéro') RETURNING id INTO v_flotte;

  -- Bibliothèque : catégorie du commun, six modèles à installer, un à modifier ;
  -- un modèle du site.
  INSERT INTO public.categories (nom, scope, ordre) VALUES ('Modèles commun cpl ' || x, 'equipement', 1)
  RETURNING id INTO v_cat_commun;
  FOR i IN 0..5 LOOP
    INSERT INTO public.modeles_equipements (site_id, nom, categorie_id, description, specifications)
    VALUES (NULL, 'Commun ' || i || ' cpl ' || x, v_cat_commun, 'Détecteur du siège', v_gabarit) RETURNING id INTO v_id;
    v_communs := v_communs || v_id;
  END LOOP;
  INSERT INTO public.modeles_equipements (site_id, nom, categorie_id, specifications)
  VALUES (NULL, 'Commun édit cpl ' || x, v_cat_commun, v_gabarit) RETURNING id INTO v_commun_edit;
  INSERT INTO public.categories (nom, scope, ordre, site_id) VALUES ('Modèles A cpl ' || x, 'equipement', 1, v_site)
  RETURNING id INTO v_cat_site;
  INSERT INTO public.modeles_equipements (site_id, nom, categorie_id, specifications)
  VALUES (v_site, 'Modèle A cpl ' || x, v_cat_site, v_gabarit) RETURNING id INTO v_modele_site;

  -- 215 lieux sur un niveau dédié.
  INSERT INTO public.niveaux (batiment_id, nom, ordre) VALUES (v_bat, 'Niveau cpl ' || x, 8) RETURNING id INTO v_niveau;
  FOR i IN 1..215 LOOP
    INSERT INTO public.locaux (niveau_id, nom) VALUES (v_niveau, 'Salle ' || lpad(i::text, 3, '0') || ' ' || x)
    RETURNING id INTO v_id;
    v_lieux := v_lieux || v_id;
  END LOOP;

  -- Équipements : 200 rattachés à la gamme, 1 avec DI, 6 supprimables.
  FOR i IN 1..207 LOOP
    INSERT INTO public.equipements (local_id, categorie_id, specifications)
    VALUES (v_lieux[i], v_flotte, jsonb_build_object('champs', (
        SELECT jsonb_agg(c || jsonb_build_object('valeur',
                   CASE WHEN c->>'cle' = 'Numéro' THEN to_jsonb('S' || i) ELSE c->'defaut' END) ORDER BY o)
        FROM jsonb_array_elements(v_gabarit->'champs') WITH ORDINALITY AS t(c, o))))
    RETURNING id INTO v_id;
    IF i <= 200 THEN v_eqs := v_eqs || v_id;
    ELSIF i = 201 THEN v_eq_di := v_id;
    ELSE v_suppr := v_suppr || v_id;
    END IF;
  END LOOP;
  INSERT INTO public.di_equipements (di_id, equipement_id) VALUES (v_di, v_eq_di);

  -- Gamme répétée par équipement, 2 opérations, un OT ouvert ; liaisons posées
  -- sous l'indicateur de lot (une synchro).
  INSERT INTO public.categories (nom, scope, ordre, site_id)
  VALUES ('Domaine cpl ' || x, 'gamme', 1, v_site) RETURNING id INTO v_dom;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id)
  VALUES ('Famille cpl ' || x, 'gamme', 1, v_site, v_dom) RETURNING id INTO v_fam;
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, prestataire_id, created_by, repeter_par_equipement)
  VALUES (v_site, 'Gamme cpl ' || x, 'maintenance_preventive', v_fam, 3, v_presta, v_auteur, true) RETURNING id INTO g;
  INSERT INTO public.operations (gamme_id, nom, type_operation_id, ordre) VALUES
    (g, 'Nettoyer', 1, 1), (g, 'Contrôler', 1, 2);
  ot := public.generate_next_ot_for_gamme(g, v_auteur, v_site, CURRENT_DATE);
  IF ot IS NULL THEN RAISE EXCEPTION 'Semis connecteur-parc-lieux : OT non généré.'; END IF;
  PERFORM set_config('dedale.deploiement_en_cours', 'on', true);
  INSERT INTO public.gammes_equipements (gamme_id, equipement_id)
  SELECT g, e FROM unnest(v_eqs || v_suppr) e;
  PERFORM set_config('dedale.deploiement_en_cours', 'off', true);

  -- Leurres : gamme du commun ; flotte, lieu, équipement et gamme du site B.
  INSERT INTO public.categories (nom, scope, ordre) VALUES ('Domaine commun cpl ' || x, 'gamme', 1) RETURNING id INTO v_dom_c;
  INSERT INTO public.categories (nom, scope, ordre, parent_id) VALUES ('Famille commun cpl ' || x, 'gamme', 1, v_dom_c) RETURNING id INTO v_fam_c;
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, created_by)
  VALUES (NULL, 'Gamme commun cpl ' || x, 'maintenance_preventive', v_fam_c, 3, v_auteur) RETURNING id INTO g_commun;
  INSERT INTO public.categories (nom, scope, ordre, site_id) VALUES ('Domaine B cpl ' || x, 'gamme', 1, v_site_b) RETURNING id INTO v_dom_b;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id) VALUES ('Famille B cpl ' || x, 'gamme', 1, v_site_b, v_dom_b) RETURNING id INTO v_fam_b;
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, prestataire_id, created_by)
  VALUES (v_site_b, 'Gamme B cpl ' || x, 'maintenance_preventive', v_fam_b, 3, v_presta, v_auteur) RETURNING id INTO g_b;
  INSERT INTO public.categories (nom, scope, ordre, site_id) VALUES ('Parc B cpl ' || x, 'parc', 1, v_site_b) RETURNING id INTO v_parc_b;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id, specifications, valeur_principale)
  VALUES ('Flotte B cpl ' || x, 'parc', 1, v_site_b, v_parc_b, v_gabarit, 'Numéro') RETURNING id INTO v_flotte_b;
  INSERT INTO public.locaux (niveau_id, nom) VALUES (v_niveau_b, 'Salle B ' || x) RETURNING id INTO v_lieu_b;
  INSERT INTO public.equipements (local_id, categorie_id, specifications)
  VALUES (v_lieu_b, v_flotte_b, jsonb_build_object('champs', '[]'::jsonb));

  PERFORM set_config('cpl.resultat', jsonb_build_object(
    'parc', v_parc, 'flotte', v_flotte, 'niveau', v_niveau, 'lieux', to_jsonb(v_lieux),
    'equipements', to_jsonb(v_eqs), 'eq_di', v_eq_di, 'supprimables', to_jsonb(v_suppr),
    'gamme', g, 'ot', ot, 'gamme_commun', g_commun, 'gamme_b', g_b,
    'cat_commun', v_cat_commun, 'cat_site', v_cat_site, 'communs', to_jsonb(v_communs),
    'commun_edit', v_commun_edit, 'modele_site', v_modele_site,
    'parc_b', v_parc_b, 'flotte_b', v_flotte_b, 'lieu_b', v_lieu_b,
    'type', v_type, 'type2', v_type2)::text, false);
END $semis$;

SELECT current_setting('cpl.resultat');
