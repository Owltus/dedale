-- 041 — Durcissement EXECUTE des fonctions SECURITY DEFINER ajoutées APRÈS le
-- durcissement initial (§2 du schéma). Créées par migrations ultérieures, elles
-- ont gardé le GRANT EXECUTE à PUBLIC par défaut → exécutables par anon ET
-- authenticated via l'API REST /rpc/ (Supabase linter 0028/0029).
--
-- Rappel doctrine (§2 schema_complete.sql) : les fonctions DEFINER (triggers,
-- crons, helpers internes) n'ont besoin d'AUCUN grant (elles s'exécutent en
-- contexte propriétaire) ; seules les vraies RPC métier restent appelables par
-- authenticated, et les helpers RLS doivent l'être (la policy s'évalue sous le
-- rôle appelant). On rejoue ce durcissement pour ces fonctions précises.
-- Idempotent.

-- a) Fonctions de TRIGGER + helper Storage interne : retirer PUBLIC/anon/authenticated.
DO $$
DECLARE sig text;
BEGIN
    FOREACH sig IN ARRAY ARRAY[
        'public.check_categorie_modele()',
        'public.check_categorie_parent_scope()',
        'public.check_gamme_categorie()',
        'public.check_miniature_site_equipement()',
        'public.check_modele_operation_categorie()',
        'public.cleanup_document_blob()',
        'public.supprimer_blob_orphelin(text)'
    ]
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', sig);
    END LOOP;
END $$;

-- b) Helper RLS (appelé dans les policies) : conserver authenticated, retirer anon.
--    (can_access_contrat a déjà authenticated + service_role via la migration 038.)
REVOKE EXECUTE ON FUNCTION public.can_access_contrat(uuid) FROM PUBLIC, anon;

-- c) RPC métier (appelées par le front) : retirer PUBLIC/anon, garantir authenticated.
REVOKE EXECUTE ON FUNCTION public.supprimer_site_cascade(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.supprimer_site_cascade(uuid) TO service_role;

-- copier_modele_operation : RPC d'import de modèle d'opération (front). Son GRANT
-- authenticated manquait (§3) → elle s'appuyait sur PUBLIC. On le rend explicite.
REVOKE EXECUTE ON FUNCTION public.copier_modele_operation(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.copier_modele_operation(uuid, uuid) TO authenticated, service_role;
