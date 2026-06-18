-- 039 — Rétablir security_invoker sur v_locaux_chemin et v_registre_securite
--
-- Régression introduite par 036_drop_deleted_at : ces 2 vues y ont été recréées
-- via CREATE OR REPLACE VIEW SANS réappliquer security_invoker (fait pour les 4
-- autres vues, oublié pour celles-ci). Or CREATE OR REPLACE VIEW réinitialise
-- les options → les vues sont retombées en SECURITY DEFINER, donc elles
-- s'exécutent avec les droits du créateur et COURT-CIRCUITENT la RLS (le linter
-- Supabase « security_definer_view » les signale en ERROR).
--
-- Correctif : les repasser en security_invoker (la vue applique alors la RLS de
-- l'utilisateur qui interroge). Idempotent.

ALTER VIEW public.v_locaux_chemin     SET (security_invoker = true);
ALTER VIEW public.v_registre_securite SET (security_invoker = true);
