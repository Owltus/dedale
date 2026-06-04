# Étape 17 — Validation globale & finalisation

## Objectif

Revue d'ensemble, cohérence inter-modules, polish et préparation au déploiement.

## Fichier(s) impacté(s)

- Transverse (tous les modules)
- `README.md`, éventuelle `DEPLOY.md` front

## Travail à réaliser

1. **Cohérence** : navigation complète, fils d'Ariane, états vides/erreur partout (règle des 4 états), libellés FR.
2. **Rôles** : vérifier écran par écran que l'UI reflète la RLS (actions grisées/masquées selon le rôle).
3. **Qualité** : `npm run lint`, `npm run typecheck`, `npm run build` au vert ; revue `/code-review`.
4. **Perf** : pagination des grandes listes, agrégations planning/relevés acceptables.
5. **Déploiement** : variables d'env de prod, build statique, vérif CORS Supabase, doc de déploiement.

## Critère de validation

- Parcours complet d'un cas métier réel (créer site → local → équipement → gamme → OT → clôture) sans accroc.
- Build de production OK ; aucun secret côté client ; comportements RLS corrects par rôle.

## Contrôle (audit manuel — étape critique, finale)

- Aucune liste sans filtre soft-delete ; aucune fuite inter-sites ; aucune couleur en dur (tokens).
- Tous les flux d'écriture gèrent l'erreur RLS `42501` proprement.
