-- 040 — RPC de suppression EN CASCADE d'un site (admin uniquement)
--
-- ATTENTION : action IRRÉVERSIBLE et destructrice. Contrairement au garde-fou
-- habituel (FK RESTRICT : « vider d'abord »), cette RPC efface le site ET TOUT
-- son contenu. Réservée à l'admin, déclenchée côté front par une modale de
-- confirmation par saisie du nom du site.
--
-- Exécutée en SECURITY DEFINER (pour contourner la RLS sur les ~20 tables) mais
-- avec un contrôle de rôle EXPLICITE (DEFINER bypasse la RLS). Toute la fonction
-- s'exécute dans la transaction de l'appelant : si une contrainte échoue, RIEN
-- n'est supprimé (rollback) — pas de suppression partielle.
--
-- Ordre = tri topologique des FK (référant supprimé avant référencé) :
--   1. activité métier (observations, OT, chantiers, DI, investissements, contrats)
--   2. catalogue de site (gammes → libère équipements + modèles d'opération)
--   3. parc d'équipements puis hiérarchie des lieux (RESTRICT → feuille→racine)
--   4. modèles de site, catégories de site (arbre), documents (→ blob Storage)
--   5. le site (cascade : user_sites, prestataires, modèles DI, vignettes…)
-- Les deux arbres auto-référencés (contrats.contrat_parent_id, categories.parent_id,
-- en RESTRICT) sont purgés feuille par feuille via une boucle.

CREATE OR REPLACE FUNCTION public.supprimer_site_cascade(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Réservé à l'admin (SECURITY DEFINER bypasse la RLS → contrôle explicite).
    IF (SELECT public.current_role()) <> 'admin' THEN
        RAISE EXCEPTION 'Seul un administrateur peut supprimer un site.'
            USING ERRCODE = '42501';
    END IF;

    -- Autorise la cascade à supprimer le prestataire INTERNE du site : le trigger
    -- protect_prestataire_interne ne lève l'interdiction que si app.purge_active
    -- = 'on'. set_config(..., true) → portée transaction (auto-reset en fin).
    PERFORM set_config('app.purge_active', 'on', true);

    -- 1. Activité métier (référence le structurel / le catalogue) -------------
    DELETE FROM public.observations           WHERE site_id = p_site_id;
    DELETE FROM public.ordres_travail         WHERE site_id = p_site_id;
    DELETE FROM public.interventions_chantier WHERE site_id = p_site_id;
    DELETE FROM public.demandes_intervention  WHERE site_id = p_site_id;
    DELETE FROM public.investissements        WHERE site_id = p_site_id;

    -- Liaisons contrats↔gammes : contrat_id est RESTRICT et la liaison n'est
    -- cascadée que par la GAMME (pas par le contrat). Les gammes communes
    -- (site_id NULL) ne sont pas supprimées → on retire explicitement les
    -- liaisons des contrats du site avant de supprimer ces contrats.
    DELETE FROM public.contrats_gammes
    WHERE contrat_id IN (SELECT id FROM public.contrats WHERE site_id = p_site_id);

    -- contrats : arbre d'avenants (contrat_parent_id RESTRICT) → feuilles d'abord
    LOOP
        DELETE FROM public.contrats c
        WHERE c.site_id = p_site_id
          AND NOT EXISTS (
              SELECT 1 FROM public.contrats ch WHERE ch.contrat_parent_id = c.id
          );
        EXIT WHEN NOT FOUND;
    END LOOP;

    -- 2. Catalogue / bibliothèque de site -------------------------------------
    -- gammes → cascade operations, gamme_modeles, gammes_equipements,
    -- contrats_gammes : libère les équipements et les modèles d'opération.
    DELETE FROM public.gammes WHERE site_id = p_site_id;

    -- 3. Parc d'équipements puis hiérarchie des lieux (RESTRICT, feuille→racine)
    -- Liaisons gammes↔équipements : equipement_id RESTRICT, cascadée seulement
    -- par la gamme. Une gamme commune liée à un équipement du site ne serait pas
    -- nettoyée → on retire explicitement les liaisons des équipements du site.
    DELETE FROM public.gammes_equipements
    WHERE equipement_id IN (
        SELECT e.id
        FROM public.equipements e
        JOIN public.locaux l    ON l.id = e.local_id
        JOIN public.niveaux n   ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE b.site_id = p_site_id
    );

    DELETE FROM public.equipements
    WHERE local_id IN (
        SELECT l.id
        FROM public.locaux l
        JOIN public.niveaux n   ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE b.site_id = p_site_id
    );
    DELETE FROM public.modeles_equipements WHERE site_id = p_site_id;
    DELETE FROM public.modeles_operations  WHERE site_id = p_site_id;

    DELETE FROM public.locaux
    WHERE niveau_id IN (
        SELECT n.id
        FROM public.niveaux n
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE b.site_id = p_site_id
    );
    DELETE FROM public.niveaux
    WHERE batiment_id IN (SELECT id FROM public.batiments WHERE site_id = p_site_id);
    DELETE FROM public.batiments WHERE site_id = p_site_id;

    -- catégories de site : arbre (parent_id RESTRICT) → feuilles d'abord
    LOOP
        DELETE FROM public.categories c
        WHERE c.site_id = p_site_id
          AND NOT EXISTS (
              SELECT 1 FROM public.categories ch WHERE ch.parent_id = c.id
          );
        EXIT WHEN NOT FOUND;
    END LOOP;

    -- 4. Documents du site → cascade des liaisons + trigger RGPD (blob Storage)
    DELETE FROM public.documents WHERE site_id = p_site_id;

    -- 5. Le site (cascade : user_sites, prestataires, prestataires_sites,
    --    modeles_di, miniatures de site)
    DELETE FROM public.sites WHERE id = p_site_id;
END;
$$;

COMMENT ON FUNCTION public.supprimer_site_cascade(uuid) IS
    '040 — Supprime un site ET TOUT son contenu (admin only, transactionnel). Action irréversible déclenchée par confirmation du nom côté front. Ordre = tri topologique des FK ; arbres auto-référencés (contrats/categories) purgés feuille par feuille.';

GRANT EXECUTE ON FUNCTION public.supprimer_site_cascade(uuid) TO authenticated;
