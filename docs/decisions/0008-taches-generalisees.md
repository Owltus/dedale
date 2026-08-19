# 0008 — Tâche généralisée (checklist) pour Travaux / Événements

- **Date** : 2026-08-20
- **Statut** : accepté

## Contexte

Depuis le chantier `unification-travaux-evenements`, Travaux et Événements
portent chacun leur lieu via une table enfant (`travaux_taches` /
`evenements_lieux`, 0..N par fiche) avec un statut d'avancement par ligne
(« en attente / en cours / réalisé / non réalisé / non applicable »,
migration 088).

Ce modèle confond deux axes distincts : **où** ça se passe (le lieu,
obligatoire) et **ce qui** se passe (l'action elle-même, sans identité
propre — la ligne EST le lieu). L'exemple qui l'a révélé : le Travaux
« Remplacement copieur Sharp » a une vraie checklist chronologique
(livraison → mise en service → enlèvement de l'ancien matériel), mais un
seul lieu réel (Accueil - Back Office). Le modèle actuel ne peut représenter
ni les trois étapes distinctes, ni le fait qu'une tâche puisse ne concerner
aucun lieu précis.

Deux usages doivent cohabiter sans qu'on choisisse un « mode » à la
création : une checklist chronologique où l'ordre compte (le copieur), et
une liste non ordonnée où il ne compte pas (rénover huit chambres). Exigence
transverse du PO, répétée : léger, peu de clics, pas de friction — la
ligne de liste doit rester compacte, le détail (lieu, commentaire,
documents) ne s'affiche qu'au clic.

## Décision

Le lieu devient un **attribut facultatif** d'une tâche généralisée dont
l'identité est un **libellé libre**, obligatoire :

- `libelle TEXT NOT NULL` sur `travaux_taches` et `evenements_lieux`
  (migration 090) — identité de la ligne, remplace le lieu comme ancre.
- `local_id` passe de `NOT NULL` à nullable sur les deux tables — le lieu
  (local + équipement) devient un attribut parmi d'autres, plus la clé.
- `commentaire TEXT` nullable ajouté aux deux tables (migration 090).
- `tache_id` nullable ajouté aux deux tables de liaison documents
  (`documents_interventions_travaux`, `documents_evenements`,
  migration 091) : un document peut être rattaché à une tâche précise
  (`tache_id` renseigné) ou à la fiche entière (`tache_id` NULL, comportement
  antérieur inchangé). Supprimer une tâche ne supprime jamais ses documents,
  `ON DELETE SET NULL` les fait remonter au niveau fiche.
- Les RPC de conversion croisée Travaux ↔ Événements (`convertir_*`,
  migration 092) transfèrent désormais libellé, commentaire et
  documents-par-tâche de façon intégrale, en réattribuant chaque document
  à la NOUVELLE tâche correspondante (correspondance par `ordre`, unique
  par fiche au moment de la conversion).
- Réordonnancement manuel par glisser-déposer (`@dnd-kit`), qui sert le cas
  chronologique sans imposer de structure au cas non ordonné (qui reste en
  ordre d'ajout par défaut) — le champ `ordre`, déjà présent, suffit.
- Glisser-déposer d'un document directement depuis la carte « Documents »
  de la fiche vers une tâche (rattache) et inversement (détache), sans
  passer par une modale — même `DndContext` que le réordonnancement,
  différencié par `data.type` (`'tache'` vs `'document'`).
- Brique commune unique (`TacheRow`/`TacheDialog`,
  `features/equipements/components/`) : les 4 composants dupliqués
  (Travaux + Événements) fusionnent en une seule paire, dans la continuité
  du principe déjà appliqué à `LieuxMultiplesField`/`statut-zone.ts`.
- Vocabulaire unifié : « Tâches » remplace « Zones concernées » (Travaux)
  et « Lieux concernés » (Événements) sur les deux pages.
- La frise de statut global (`StatusStepper`) pleine largeur est démotée en
  badge compact + menu de transition (`StatusTransitionSelect`, dans l'en-tête
  de la fiche) : la carte Tâches devient le centre visuel avec un indicateur
  de progression (« x/y réalisées »). Le statut global n'est **pas fusionné**
  avec la progression des tâches — il continue de piloter la clôture, le
  filtre de liste et la conversion Travaux↔Événement, exactement comme
  GitHub/Trello séparent statut global et checklist sans les fusionner.
- Diff d'édition par identifiant stable (`TacheEntree.id?`), pas par lieu :
  dès que plusieurs tâches sans lieu peuvent coexister, rien d'autre que
  l'`id` (invisible pour l'utilisateur, déjà en base) ne permet à
  `useUpdateTravaux`/`useUpdateEvenement` de savoir quelles tâches sont
  conservées (statut/documents intacts), ajoutées ou supprimées.

`travaux_taches` et `evenements_lieux` restent deux tables et deux pages
séparées — seules la structure et le vocabulaire deviennent identiques
(RLS, triggers, RPC, index en dépendent ; renommer les tables en base
aurait été cosmétique, sans bénéfice réel).

## Conséquences

**Aucune ligne existante ne perd d'information.** Le backfill de la
migration 090 donne pour libellé le nom du local à chaque ligne existante,
quel que soit le statut de sa fiche parente (Ouvert, En cours,
Terminé/Clôturé) — aucune ligne n'apparaît vide après migration, aucun
traitement particulier pour les fiches déjà closes (l'édition des tâches
était déjà libre à tout statut depuis le chantier précédent).

**Un document rattaché à une tâche précise n'apparaît plus dans la liste
générale « Documents » de la fiche** — il apparaît sous sa tâche. C'est le
comportement voulu (D5) : la carte Documents de la fiche ne montre plus que
les documents non rattachés à une tâche précise.

**`documentsQueries.byEntity`/`DocumentsTab` gagnent un filtre optionnel**
(`tacheFilter`/`tacheId` : absent = comportement inchangé, `null` =
niveau fiche seulement, uuid = une tâche précise) — les 8 autres
consommateurs de `DocumentsTab` (OT, gammes, contrats, prestataires,
locaux, équipements, DI, investissements) ne sont pas concernés, aucun
n'a de colonne `tache_id`.

**`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` ajoutés en
dépendance** (~16 Ko gzip, chargés en chunk lazy à l'ouverture d'une fiche
Travaux/Événement — pas dans le bundle initial).

## Alternatives écartées

**Ajouter un mode « checklist » vs « lieux » choisi à la création.** Écarté
explicitement par le PO : les deux usages (chronologique, non ordonné)
doivent cohabiter sans qu'on ait à choisir un mode — le champ `ordre` déjà
présent suffit à représenter les deux sans bifurcation de modèle.

**Fusionner le statut global de la fiche avec la progression des tâches.**
Écarté : le statut global pilote des mécanismes qui n'ont pas de rapport
direct avec l'avancement des tâches (clôture avec date + compte-rendu,
filtre de liste, conversion Travaux↔Événement). Le précédent GitHub/Trello
(statut global ET checklist séparés, sans conflit) a été retenu comme bon
patron.

**Renommer les tables `travaux_taches`/`evenements_lieux` en base.** Écarté
(D9) : cosmétique en base pour un bénéfice front uniquement — RLS,
triggers, RPC de conversion et index en dépendent tous, le risque de casse
n'a pas de contrepartie réelle.
