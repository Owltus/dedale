-- 037 — Cycle CapEx enrichi
-- Ajoute trois statuts d'investissement au référentiel `statuts_capex` :
-- « À l'étude », « Engagé », « Clôturé ». Le statut reste LIBRE (aucune
-- machine à états, aucune transition imposée) ; l'ordre du parcours affiché
-- (frise de suivi) est porté côté front (features/investissements/etat.ts).
--
-- Les ids 1-4 existants (Demandé/Validé/Réalisé/Refusé) sont CONSERVÉS tels
-- quels pour ne pas casser les références `investissements.statut_capex_id`.
-- Purement additif et idempotent (rejouable sans effet de bord).

INSERT INTO statuts_capex (id, nom, description) VALUES
    (5, 'À l''étude', 'Investissement en instruction / arbitrage'),
    (6, 'Engagé',     'Dépense engagée (commande passée)'),
    (7, 'Clôturé',    'Investissement soldé et clôturé')
ON CONFLICT (id) DO NOTHING;
