-- =============================================================================
-- Semis de tests/integration/lecture-du-lieu.mjs — base LOCALE JETABLE
-- =============================================================================
-- Pose, sur le site donné, un lieu « chargé » dont chaque objet est rattaché
-- par CHAQUE chemin que lisent fiche_local / *_du_lieu (183), plus des leurres
-- qui ne doivent PAS sortir. Joué par psql (superutilisateur local) : la RLS
-- ne s'applique pas ici, c'est la préparation du terrain.
--
-- Paramètres psql : :site, :niveau, :auteur (technicien du site),
-- :demandeur (demandeur du site, ou l'auteur), :suffixe.
-- Sortie : UNE ligne JSON des identifiants posés.
--
-- GARDE-FOU : refuse de tourner sans le compte admin@martin.test (base semée
-- par tests/securite/semis.mjs) — rien à faire en production.
-- =============================================================================
\set ON_ERROR_STOP 1
SELECT set_config('lieu.site', :'site', false),
       set_config('lieu.niveau', :'niveau', false),
       set_config('lieu.auteur', :'auteur', false),
       set_config('lieu.demandeur', :'demandeur', false),
       set_config('lieu.suffixe', :'suffixe', false) \gset

DO $semis$
DECLARE
  v_site uuid := current_setting('lieu.site')::uuid;
  v_niveau uuid := current_setting('lieu.niveau')::uuid;
  v_auteur uuid := current_setting('lieu.auteur')::uuid;
  v_demandeur uuid := current_setting('lieu.demandeur')::uuid;
  x text := current_setting('lieu.suffixe');
  v_presta uuid; v_cat_parc uuid;
  v_racine uuid; v_sous uuid; v_racine_c uuid; v_sous_c uuid;
  v_local uuid; v_leurre uuid; e1 uuid; e2 uuid; e3 uuid;
  g1 uuid; g2 uuid; g3 uuid; g_commun uuid; ot1 uuid; ot2 uuid; ot3 uuid;
  di1 uuid; di2 uuid; di3 uuid; di_leurre uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid;
  v1 uuid; v2 uuid; v3 uuid; v4 uuid;
  d1 uuid; d2 uuid; d3 uuid; d4 uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@martin.test') THEN
    RAISE EXCEPTION 'Cible refusée : base non semée par semis.mjs.';
  END IF;
  SELECT id INTO v_presta FROM public.prestataires WHERE libelle = 'Prestataire Martin';
  SELECT id INTO v_cat_parc FROM public.categories WHERE nom = 'Categorie Martin';

  -- Lieu chargé (2 équipements) et lieu leurre voisin (1 équipement).
  INSERT INTO public.locaux (niveau_id, nom, surface_m2, hauteur_m, capacite_personnes, accessible_pmr)
  VALUES (v_niveau, 'Lieu chargé ' || x, 20, 2.5, 12, true) RETURNING id INTO v_local;
  INSERT INTO public.locaux (niveau_id, nom) VALUES (v_niveau, 'Lieu leurre ' || x) RETURNING id INTO v_leurre;
  INSERT INTO public.equipements (local_id, categorie_id, code_inventaire)
  VALUES (v_local, v_cat_parc, 'LC1-' || x) RETURNING id INTO e1;
  INSERT INTO public.equipements (local_id, categorie_id, code_inventaire)
  VALUES (v_local, v_cat_parc, 'LC2-' || x) RETURNING id INTO e2;
  INSERT INTO public.equipements (local_id, categorie_id, code_inventaire)
  VALUES (v_leurre, v_cat_parc, 'LL1-' || x) RETURNING id INTO e3;

  -- Gammes : G1 répétée liée à E1 (OT1 : chemin gamme ET opération) ;
  -- G2 répétée liée à E2 puis détachée (OT2, clôturé : chemin opération seul) ;
  -- G3 inactive liée à E1, sans OT ; G3 sert au filtre « actives ».
  INSERT INTO public.categories (nom, scope, ordre, site_id)
  VALUES ('Domaine lieu ' || x, 'gamme', 1, v_site) RETURNING id INTO v_racine;
  INSERT INTO public.categories (nom, scope, ordre, site_id, parent_id)
  VALUES ('Famille lieu ' || x, 'gamme', 1, v_site, v_racine) RETURNING id INTO v_sous;
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, prestataire_id, created_by, repeter_par_equipement)
  VALUES (v_site, 'G1 lieu ' || x, 'maintenance_preventive', v_sous, 3, v_presta, v_auteur, true) RETURNING id INTO g1;
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, prestataire_id, created_by, repeter_par_equipement)
  VALUES (v_site, 'G2 lieu ' || x, 'maintenance_preventive', v_sous, 3, v_presta, v_auteur, true) RETURNING id INTO g2;
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, prestataire_id, created_by)
  VALUES (v_site, 'G3 lieu ' || x, 'maintenance_preventive', v_sous, 3, v_presta, v_auteur) RETURNING id INTO g3;
  INSERT INTO public.operations (gamme_id, nom, type_operation_id, ordre) VALUES
    (g1, 'Contrôler', 1, 1), (g2, 'Contrôler', 1, 1), (g3, 'Contrôler', 1, 1);
  INSERT INTO public.gammes_equipements (gamme_id, equipement_id) VALUES (g1, e1), (g2, e2), (g3, e1);
  -- Leurre : gamme du site liée à l'équipement du lieu voisin, avec son OT.
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, prestataire_id, created_by)
  VALUES (v_site, 'Gleurre ' || x, 'maintenance_preventive', v_sous, 3, v_presta, v_auteur) RETURNING id INTO g_commun;
  INSERT INTO public.operations (gamme_id, nom, type_operation_id, ordre) VALUES (g_commun, 'Contrôler', 1, 1);
  INSERT INTO public.gammes_equipements (gamme_id, equipement_id) VALUES (g_commun, e3);

  ot1 := public.generate_next_ot_for_gamme(g1, v_auteur, v_site, CURRENT_DATE);
  ot2 := public.generate_next_ot_for_gamme(g2, v_auteur, v_site, CURRENT_DATE - 40);
  ot3 := public.generate_next_ot_for_gamme(g_commun, v_auteur, v_site, CURRENT_DATE);
  IF ot1 IS NULL OR ot2 IS NULL OR ot3 IS NULL THEN
    RAISE EXCEPTION 'Semis lieu : OT non générés (% % %).', ot1, ot2, ot3;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operations_execution WHERE ordre_travail_id = ot2 AND equipement_id = e2) THEN
    RAISE EXCEPTION 'Semis lieu : OT2 sans opération sur E2.';
  END IF;
  UPDATE public.gammes SET est_active = false WHERE id = g3;

  -- Histoire : OT2 clôturé puis E2 détaché de G2 (déclencheurs coupés : on
  -- pose l'état final, pas le chemin métier qui y mène).
  SET LOCAL session_replication_role = replica;
  UPDATE public.ordres_travail SET statut = 'cloture', date_cloture = now() WHERE id = ot2;
  DELETE FROM public.gammes_equipements WHERE gamme_id = g2 AND equipement_id = e2;
  -- Gamme du COMMUN liée à E1 : ne doit jamais sortir sur un lieu.
  INSERT INTO public.categories (nom, scope, ordre) VALUES ('Domaine commun ' || x, 'gamme', 1) RETURNING id INTO v_racine_c;
  INSERT INTO public.categories (nom, scope, ordre, parent_id) VALUES ('Famille commun ' || x, 'gamme', 1, v_racine_c) RETURNING id INTO v_sous_c;
  INSERT INTO public.gammes (site_id, nom, nature, categorie_id, periodicite_id, created_by)
  VALUES (NULL, 'Commun ' || x, 'maintenance_preventive', v_sous_c, 3, v_auteur) RETURNING id INTO g_commun;
  INSERT INTO public.gammes_equipements (gamme_id, equipement_id) VALUES (g_commun, e1);
  SET LOCAL session_replication_role = origin;

  -- DI : par le lieu, par l'équipement (clôturée), par les deux ; leurre.
  INSERT INTO public.demandes_intervention (site_id, created_by, constat, date_constat)
  VALUES (v_site, v_auteur, 'DI lieu ' || x, CURRENT_DATE - 1) RETURNING id INTO di1;
  INSERT INTO public.demandes_intervention (site_id, created_by, constat, date_constat)
  VALUES (v_site, v_auteur, 'DI équipement ' || x, CURRENT_DATE - 2) RETURNING id INTO di2;
  INSERT INTO public.demandes_intervention (site_id, created_by, constat, date_constat)
  VALUES (v_site, v_auteur, 'DI double ' || x, CURRENT_DATE - 3) RETURNING id INTO di3;
  INSERT INTO public.demandes_intervention (site_id, created_by, constat, date_constat)
  VALUES (v_site, v_auteur, 'DI leurre ' || x, CURRENT_DATE) RETURNING id INTO di_leurre;
  INSERT INTO public.di_localisations (di_id, local_id) VALUES (di1, v_local), (di3, v_local), (di_leurre, v_leurre);
  INSERT INTO public.di_equipements (di_id, equipement_id) VALUES (di2, e2), (di3, e1), (di3, e2), (di_leurre, e3);

  -- Travaux : lieu principal ; équipement principal ; tâches (lieu + équipement) ;
  -- principal ET tâche (terminé).
  INSERT INTO public.interventions_travaux (site_id, created_by, titre, local_id)
  VALUES (v_site, v_auteur, 'Travaux lieu ' || x, v_local) RETURNING id INTO t1;
  INSERT INTO public.interventions_travaux (site_id, created_by, titre, equipement_id)
  VALUES (v_site, v_auteur, 'Travaux équipement ' || x, e1) RETURNING id INTO t2;
  INSERT INTO public.interventions_travaux (site_id, created_by, titre)
  VALUES (v_site, v_auteur, 'Travaux tâches ' || x) RETURNING id INTO t3;
  INSERT INTO public.interventions_travaux (site_id, created_by, titre, local_id)
  VALUES (v_site, v_auteur, 'Travaux double ' || x, v_local) RETURNING id INTO t4;
  INSERT INTO public.travaux_taches (travaux_id, libelle, local_id) VALUES (t3, 'Tâche lieu', v_local), (t4, 'Tâche lieu', v_local);
  INSERT INTO public.travaux_taches (travaux_id, libelle, equipement_id) VALUES (t3, 'Tâche équipement', e2);
  INSERT INTO public.interventions_travaux (site_id, created_by, titre, local_id)
  VALUES (v_site, v_auteur, 'Travaux leurre ' || x, v_leurre);

  -- Événements : même jeu de chemins.
  INSERT INTO public.evenements (site_id, created_by, titre, local_id)
  VALUES (v_site, v_auteur, 'Événement lieu ' || x, v_local) RETURNING id INTO v1;
  INSERT INTO public.evenements (site_id, created_by, titre, equipement_id)
  VALUES (v_site, v_auteur, 'Événement équipement ' || x, e2) RETURNING id INTO v2;
  INSERT INTO public.evenements (site_id, created_by, titre)
  VALUES (v_site, v_auteur, 'Événement tâches ' || x) RETURNING id INTO v3;
  INSERT INTO public.evenements (site_id, created_by, titre, equipement_id)
  VALUES (v_site, v_auteur, 'Événement double ' || x, e1) RETURNING id INTO v4;
  INSERT INTO public.evenements_lieux (evenement_id, libelle, local_id) VALUES (v3, 'Tâche lieu', v_local);
  INSERT INTO public.evenements_lieux (evenement_id, libelle, local_id, equipement_id) VALUES (v3, 'Tâche équipement', v_local, e1), (v4, 'Tâche équipement', v_local, e1);
  INSERT INTO public.evenements (site_id, created_by, titre, equipement_id)
  VALUES (v_site, v_auteur, 'Événement leurre ' || x, e3);

  -- Documents : par le lieu ; par l'équipement ; par les deux ; déposé par le
  -- demandeur (le seul qu'il voie).
  INSERT INTO public.documents (type_document_id, nom_original, storage_path, hash_sha256, taille_octets, mime_type, uploaded_by, site_id)
  VALUES (1, 'lieu.pdf', v_site || '/lieu-' || x || '.pdf', md5('d1' || x) || md5('1d' || x), 10, 'application/pdf', v_auteur, v_site) RETURNING id INTO d1;
  INSERT INTO public.documents (type_document_id, nom_original, storage_path, hash_sha256, taille_octets, mime_type, uploaded_by, site_id)
  VALUES (1, 'eq.pdf', v_site || '/eq-' || x || '.pdf', md5('d2' || x) || md5('2d' || x), 10, 'application/pdf', v_auteur, v_site) RETURNING id INTO d2;
  INSERT INTO public.documents (type_document_id, nom_original, storage_path, hash_sha256, taille_octets, mime_type, uploaded_by, site_id)
  VALUES (1, 'double.pdf', v_site || '/double-' || x || '.pdf', md5('d3' || x) || md5('3d' || x), 10, 'application/pdf', v_auteur, v_site) RETURNING id INTO d3;
  INSERT INTO public.documents (type_document_id, nom_original, storage_path, hash_sha256, taille_octets, mime_type, uploaded_by, site_id)
  VALUES (1, 'demandeur.pdf', v_site || '/dem-' || x || '.pdf', md5('d4' || x) || md5('4d' || x), 10, 'application/pdf', v_demandeur, v_site) RETURNING id INTO d4;
  INSERT INTO public.documents_locaux (document_id, local_id) VALUES (d1, v_local), (d3, v_local), (d4, v_local);
  INSERT INTO public.documents_equipements (document_id, equipement_id) VALUES (d2, e1), (d3, e1), (d3, e2);

  -- États terminaux (déclencheurs coupés : état final posé directement).
  SET LOCAL session_replication_role = replica;
  UPDATE public.demandes_intervention
     SET statut_di_id = 3, description_resolution = 'Résolu', date_resolution = CURRENT_DATE
   WHERE id = di2;
  UPDATE public.interventions_travaux
     SET statut_travaux_id = 4, compte_rendu = 'Fait', date_fin = CURRENT_DATE, verrouille = true
   WHERE id = t4;
  UPDATE public.evenements
     SET statut_evenement_id = 4, compte_rendu = 'Clos', date_cloture = CURRENT_DATE, verrouille = true
   WHERE id = v4;
  SET LOCAL session_replication_role = origin;

  PERFORM set_config('lieu.resultat', jsonb_build_object(
    'local', v_local, 'leurre', v_leurre, 'equipements', jsonb_build_array(e1, e2),
    'gammes', jsonb_build_object('g1', g1, 'g3', g3),
    'ot', jsonb_build_object('ot1', ot1, 'ot2', ot2),
    'di', jsonb_build_object('di1', di1, 'di2', di2, 'di3', di3),
    'travaux', jsonb_build_object('t1', t1, 't2', t2, 't3', t3, 't4', t4),
    'evenements', jsonb_build_object('v1', v1, 'v2', v2, 'v3', v3, 'v4', v4),
    'documents', jsonb_build_object('d1', d1, 'd2', d2, 'd3', d3, 'd4', d4))::text, false);
END $semis$;

SELECT current_setting('lieu.resultat');
