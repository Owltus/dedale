-- =============================================================================
-- Test rejouable des déclencheurs d'OT (phase 0 de l'audit d'architecture)
-- =============================================================================
-- Fige le cycle de vie d'un OT tel que la BASE le calcule (trigger
-- gestion_statut_ot) à partir des opérations, sur de VRAIS OT en attente :
--   1. une opération démarrée            → l'OT passe « en_cours » ;
--   2. toutes terminées                  → l'OT est « cloture » et la gamme
--                                           périodique reçoit son OT suivant ;
--   3. toutes « non applicable »         → l'OT est « annule ».
--
-- AUCUNE ÉCRITURE CONSERVÉE : tout se passe dans un bloc DO qui se termine
-- TOUJOURS par RAISE EXCEPTION (annulation de la transaction). Le message
-- final commence par « TEST OK » ou « TEST ECHEC ».
--
-- Lancement : npx supabase db query --linked --yes -f tests/securite/triggers-ot.sql
-- (le --yes est exigé par la CLI pour un bloc DO, même annulé).
-- =============================================================================
DO $test$
DECLARE
  v_ot uuid; v_ot2 uuid; v_ot3 uuid; v_gamme uuid; v_user uuid;
  v_statut text; v_nb_avant int; v_nb_apres int;
  echecs text := ''; bilan text := '';
BEGIN
  SELECT id INTO v_user FROM public.users WHERE est_actif ORDER BY created_at LIMIT 1;
  -- Comme l'appli : l'auteur de la clôture (closed_by = auth.uid()) devient
  -- l'auteur de l'OT suivant — sans session, la génération n'aurait pas d'auteur.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- OT planifié d'une gamme active et périodique, dont aucune opération n'est
  -- une mesure (pas de valeur exigée) et qui est le seul OT actif de sa gamme.
  SELECT o.id, o.gamme_id INTO v_ot, v_gamme
  FROM public.ordres_travail o
  JOIN public.gammes g ON g.id = o.gamme_id AND g.est_active
  -- Gamme PÉRIODIQUE : seule une gamme périodique reçoit un OT suivant.
  JOIN public.periodicites p ON p.id = g.periodicite_id AND p.jours_periodicite > 0
  WHERE o.statut = 'planifie'
    AND EXISTS (SELECT 1 FROM public.operations_execution e WHERE e.ordre_travail_id = o.id)
    AND NOT EXISTS (SELECT 1 FROM public.operations_execution e
                    WHERE e.ordre_travail_id = o.id AND e.unite_symbole IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.ordres_travail o2
                    WHERE o2.gamme_id = o.gamme_id AND o2.id <> o.id
                      AND o2.statut IN ('planifie','en_cours','reouvert'))
  ORDER BY o.date_prevue LIMIT 1;
  IF v_ot IS NULL THEN RAISE EXCEPTION 'TEST IMPOSSIBLE : aucun OT planifié adapté'; END IF;

  -- 1. Une opération démarrée → OT en cours.
  UPDATE public.operations_execution SET statut = 'en_cours', date_execution = now(), executed_by = v_user
  WHERE id = (SELECT id FROM public.operations_execution WHERE ordre_travail_id = v_ot ORDER BY id LIMIT 1);
  SELECT statut INTO v_statut FROM public.ordres_travail WHERE id = v_ot;
  bilan := bilan || '1:' || v_statut || ' ';
  IF v_statut <> 'en_cours' THEN echecs := echecs || '[1 attendu en_cours, obtenu ' || v_statut || '] '; END IF;

  -- 2. Toutes terminées → OT clôturé + OT suivant programmé pour la gamme.
  SELECT count(*) INTO v_nb_avant FROM public.ordres_travail WHERE gamme_id = v_gamme;
  UPDATE public.operations_execution
     SET statut = 'terminee', date_execution = now(), executed_by = v_user
   WHERE ordre_travail_id = v_ot;
  SELECT statut INTO v_statut FROM public.ordres_travail WHERE id = v_ot;
  SELECT count(*) INTO v_nb_apres FROM public.ordres_travail WHERE gamme_id = v_gamme;
  bilan := bilan || '2:' || v_statut || ' (+' || (v_nb_apres - v_nb_avant) || ' OT) ';
  IF v_statut <> 'cloture' THEN echecs := echecs || '[2 attendu cloture, obtenu ' || v_statut || '] '; END IF;
  IF v_nb_apres - v_nb_avant <> 1 THEN echecs := echecs || '[2 attendu 1 OT suivant, obtenu ' || (v_nb_apres - v_nb_avant) || '] '; END IF;

  -- 3. Toutes « non applicable » sur l'OT suivant → annulé.
  SELECT id INTO v_ot2 FROM public.ordres_travail
  WHERE gamme_id = v_gamme AND statut = 'planifie' ORDER BY created_at DESC LIMIT 1;
  IF v_ot2 IS NULL THEN
    echecs := echecs || '[3 pas d''OT suivant à annuler] ';
  ELSE
    UPDATE public.operations_execution SET statut = 'non_applicable'
     WHERE ordre_travail_id = v_ot2;
    SELECT statut INTO v_statut FROM public.ordres_travail WHERE id = v_ot2;
    bilan := bilan || '3:' || v_statut;
    IF v_statut <> 'annule' THEN echecs := echecs || '[3 attendu annule, obtenu ' || v_statut || '] '; END IF;
  END IF;

  IF echecs = '' THEN
    RAISE EXCEPTION 'TEST OK (annulé) — %', bilan;
  ELSE
    RAISE EXCEPTION 'TEST ECHEC (annulé) — % — %', echecs, bilan;
  END IF;
END $test$;
