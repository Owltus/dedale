-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  031_equipements_drop_commentaires.sql                                      ║
-- ║  Retire la notion de « commentaires » sur les ÉQUIPEMENTS.                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- La vue v_equipements_complet expose `e.*` → elle dépend de la colonne. On la
-- DROP, on retire la colonne (sa contrainte de taille part automatiquement avec),
-- puis on RECRÉE la vue à l'identique (le `e.*` exclut désormais commentaires).
-- (Les commentaires des AUTRES tables — OT, prestataires, capex… — sont inchangés.)

DROP VIEW public.v_equipements_complet;

ALTER TABLE public.equipements DROP COLUMN commentaires;

CREATE VIEW public.v_equipements_complet AS
SELECT
    e.*,
    c.nom              AS categorie_nom,
    c.scope            AS categorie_scope,
    v.chemin_court     AS localisation_courte,
    v.chemin_complet   AS localisation_complete,
    v.site_id,
    v.batiment_id,
    v.niveau_id,
    v.site_nom,
    v.batiment_nom,
    v.niveau_nom,
    v.local_nom
FROM public.equipements e
LEFT JOIN public.categories       c ON c.id = e.categorie_id AND c.deleted_at IS NULL
LEFT JOIN public.v_locaux_chemin  v ON v.local_id = e.local_id
WHERE e.deleted_at IS NULL;

ALTER VIEW public.v_equipements_complet SET (security_invoker = true);
GRANT SELECT ON public.v_equipements_complet TO anon, authenticated;
COMMENT ON VIEW public.v_equipements_complet IS
    'Équipement enrichi du chemin spatial + libellé catégorie + vignette (miniature_id via e.*). Filtre auto les supprimés.';
