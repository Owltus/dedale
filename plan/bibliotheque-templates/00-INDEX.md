# Plan — Bibliothèque de templates (cloisonnée)

## Contexte

La Bibliothèque doit devenir un **catalogue central inviolable** de templates réutilisables :
admin/manager **proposent** au commun, les techniciens **copient** vers leurs sites puis
**modifient leurs copies** — l'original au commun ne bouge jamais. Aujourd'hui les trois
notions (catégories d'équipement, organisation des gammes, onglet générique « Domaines &
familles ») se mélangent. On veut un **cloisonnement strict par famille de templates**.

Découverte clé de l'exploration : **le backend supporte déjà toute cette logique**
(commun = `site_id NULL` inviolable via RLS, gammes-templates inertes, `gammes.categorie_id`
scope `gamme` = arborescence, `gamme_modeles` N-N réutilisable, RPC `copier_gamme` /
`copier_modele_equipement`). Le chantier est donc **majoritairement du front à exposer +
réorganiser**, avec **très peu de SQL** (quelques RLS/RPC à confirmer).

## Décisions tranchées

- **D1 — Raffiner l'existant.** Pas de tables neuves : on s'appuie sur le commun/site, les
  `copier_*` et la RLS déjà en place.
- **D2 — Biblio inviolable.** Commun = admin/manager only (déjà garanti RLS). Le tech copie
  vers son site et modifie sa copie.
- **D3 — Terminologie.** « catégorie / sous-catégorie » partout (fini « domaine/famille »).
- **D4 — 5 onglets**, plus de mélange : Modèles d'équipement · Modèles d'opération · Gammes
  (arborescence) · Modèles de DI · Vignettes. **L'onglet générique « Domaines & familles »
  est supprimé** ; chaque type gère ses propres catégories.
- **D5 — Équipement = catégorie à UN seul niveau** (pas de sous-catégorie).
- **D6 — Modèles d'opération** : aucune catégorie, tri par **origine** (commun/site),
  rattachables à des gammes (`gamme_modeles`), **suppression non-bloquante** (on détache
  proprement + on montre les gammes impactées).
- **D7 — Export commun → site fin** : une gamme seule **ou** une catégorie entière + son
  contenu, via `copier_gamme` / `copier_modele_equipement`.

## Angles à clarifier (à trancher au fil des étapes)

- **A1 — Copie « catégorie entière + contenu ».** `copier_gamme` copie UNE gamme. Copier une
  catégorie = boucler côté front sur ses gammes, OU une nouvelle RPC `copier_categorie_contenu`.
  À trancher en étape 3.
- **A2 — RLS `gamme_modeles`.** L'import/détachement d'un modèle d'opération dans une gamme :
  vérifier que la RLS l'autorise (manager/tech sur leur scope) ; sinon ajouter une policy (SQL).
- **A3 — Catégories `mixte`.** Avec le cloisonnement par type, que deviennent les catégories
  scope `mixte` ? (les montrer dans Équipement ET Gammes, ou cesser d'en créer). À trancher
  en étape 4.
- **A4 — Instanciation équipement.** Comportement conservé : le vrai équipement hérite de la
  catégorie de son modèle (copie par valeur, déjà en place). Pas de champ « catégorie
  officielle » séparé (cohérent avec D1).

## Phases

| #   | Fichier                                                          | Lot                                                                                                                               | Dépend de | Effort | Livrable                                                                      | Critique |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ | ----------------------------------------------------------------------------- | -------- |
| 1   | [1-arborescence-gammes.md](./1-arborescence-gammes.md)           | Onglet **Gammes** : arborescence catégorie/sous-catégorie des gammes-templates communes + CRUD                                    | —         | L      | Un nouvel onglet Biblio qui liste/édite les gammes-templates rangées en arbre | ⚠        |
| 2   | [2-import-modeles-operation.md](./2-import-modeles-operation.md) | **Import** d'un modèle d'opération dans une gamme (`gamme_modeles`) + affichage des liens                                         | 1         | M      | Bouton « Importer un modèle d'opération » dans le détail d'une gamme          | ⚠        |
| 3   | [3-export-commun-site.md](./3-export-commun-site.md)             | **Export commun → site** (copie fine) pour les techs : gammes + modèles d'équipement                                              | 1         | M      | Bouton « Copier vers mon site » (item seul ou catégorie + contenu)            | ⚠        |
| 4   | [4-nettoyage-coherence.md](./4-nettoyage-coherence.md)           | **Nettoyage** : suppression onglet générique, équipement 1 niveau, terminologie, suppression non-bloquante des modèles d'op. liés | 1         | M      | Biblio cohérente, cloisonnée, sans mélange                                    | ⚠        |

## Ordre d'exécution

Séquentiel, **validation utilisateur après chaque lot** : 1 → 2 → 3 → 4.

## Architecture cible

```
BIBLIOTHÈQUE (commun, site_id NULL — admin/manager only)
├─ Modèles d'équipement   → catégorie (1 niveau, scope equipement)  ──copier_modele_equipement──┐
├─ Modèles d'opération    → sans catégorie, par origine             ──import (gamme_modeles)──┐  │
├─ Gammes (arborescence)  → catégorie/sous-catégorie (scope gamme)  ──copier_gamme────────────┼──┼──→ SITE du tech
│     gamme-template = opérations spécifiques + modèles d'op. liés                            │  │     (copies modifiables)
├─ Modèles de DI          → site strict (inchangé)                                            │  │
└─ Vignettes              → pool partagé (inchangé)                                           │  │
                                                                                              ▼  ▼
                                                              le tech compose / réutilise / déploie
```

## Backend — ajustements éventuels (à confirmer, hors front)

| Item                                                     | Besoin                         | Étape |
| -------------------------------------------------------- | ------------------------------ | ----- |
| RLS `gamme_modeles` (INSERT/DELETE manager/tech)         | à vérifier ; policy si absente | 2     |
| RPC copie « catégorie + contenu »                        | optionnel (sinon boucle front) | 3     |
| RLS détachement `gamme_modeles` pour suppression logique | à vérifier                     | 4     |

> La base étant **déjà déployée**, tout ajustement SQL est appliqué côté backend par
> l'utilisateur (migration). Le plan minimise ces besoins.
