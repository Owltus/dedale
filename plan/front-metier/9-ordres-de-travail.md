# Étape 9 — Maintenance : Ordres de travail (OT)

## Objectif

Le cœur de l'exécution : générer des OT depuis les gammes, saisir leur exécution, gérer leur cycle de vie.

## Contexte

Backend : `ordres_travail` (statut ref `statuts_ot` : planifie/en_cours/cloture/annule/reouvert,
date_prevue, motifs), `operations_execution` (snapshot par opération, statuts en_attente/en_cours/
terminee/annulee/non_applicable, mesures, photos_paths[]), RPC `reouvrir_ot`. **Snapshots figés**
(modifier une gamme n'affecte pas les OT existants). Successeur auto à la clôture (trigger, semaine ISO).
Index unique anti-doublon (gamme, date_prevue) sur OT actifs.

## Angle à clarifier (cf. INDEX #4)

Vérifier dans le schéma si la **règle réglementaire** (« OT bloqué sans contrat valide / bascule régie »)
est appliquée par un trigger backend ou doit être gérée/affichée côté front.

## Fichier(s) impacté(s)

- `src/features/ordres-travail/` (queries, mutations, schemas, components — le plus gros module)
- `src/routes/_app/ordres-travail/`

## Travail à réaliser

1. Liste des OT (cartes/tableau : numéro, gamme, statut coloré, date prévue, prestataire, priorité), 4 états.
2. Fiche OT : infos + onglet **Opérations** = tableau éditable « brouillon » (mesure avec seuils vert/rouge,
   date d'exécution, statut d'opération ; saisie « intelligente »), + onglet Documents.
3. **Machine à états** : Planifié → En cours → Clôturé ; Réouvrir (`reouvrir_ot`) ; Annuler / Réactiver.
   Griser les actions impossibles ; clôturé/annulé = lecture seule. Catcher les transitions interdites (erreur).
4. Génération d'un OT depuis une gamme (date prévue, priorité). Gérer l'anti-doublon (semaine ISO).

## Critère de validation

- Générer un OT, saisir des mesures (conformité visible), clôturer, vérifier le successeur auto, réouvrir.
- Une transition interdite affiche une erreur propre ; un OT clôturé est en lecture seule.

## Contrôle (audit manuel — étape critique)

- Respect strict des **snapshots** : modifier la gamme ne change pas les OT déjà créés.
- Toutes les transitions de statut passent par le backend (jamais d'écriture de statut « à la main » non autorisée).
- Filtre soft-delete présent sur toutes les listes ; erreurs RLS distinguées des résultats vides.
