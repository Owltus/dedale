# Migration champs dynamiques — Vue d'ensemble

## Contexte

Les equipements ont actuellement 4 colonnes fixes (`nom`, `marque`, `modele`, `numero_serie`) identiques pour tous les types d'equipement. Un systeme de modeles d'equipement (champs personnalises) a ete ajoute en v16, mais les deux systemes coexistent — l'utilisateur voit les anciens champs fixes ET les champs du modele.

**Objectif :** supprimer les colonnes fixes et faire en sorte que TOUT passe par les champs du modele. Le modele devient obligatoire sur chaque famille.

---

## Architecture cible

```
modeles_equipements
  ├── nom_modele
  ├── description
  └── id_champ_affichage ──────┐   (quel champ sert de "nom")
                                │
champs_modele                   │
  ├── id_champ ◄────────────────┘
  ├── nom_champ (ex: "Nom", "Marque", "N° serie")
  ├── type_champ (texte, nombre, date, booleen, liste)
  ├── unite, est_obligatoire, ordre, valeurs_possibles
  └── est_archive (0/1) ← soft delete, jamais de vrai DELETE

familles_equipements
  └── id_modele_equipement NOT NULL ──→ modeles_equipements

equipements
  ├── id_equipement
  ├── id_famille NOT NULL
  ├── id_local (localisation)
  ├── est_actif
  ├── id_image
  ├── nom_affichage TEXT NOT NULL  ← cache calcule depuis le champ d'affichage
  ├── date_mise_en_service
  ├── date_fin_garantie
  ├── commentaires
  ├── date_creation, date_modification
  └── PAS de nom, marque, modele, numero_serie

valeurs_equipements
  ├── id_equipement ──→ equipements
  ├── id_champ ──→ champs_modele
  └── valeur TEXT
```

**Colonnes CONSERVEES sur equipements :**
- `id_local` — localisation (essentiel, independant du type)
- `est_actif` — etat de l'equipement
- `id_image` — photo/icone
- `date_mise_en_service`, `date_fin_garantie` — dates universelles
- `commentaires` — notes libres
- `nom_affichage` — NOUVEAU, cache recalcule automatiquement

**Colonnes SUPPRIMEES de equipements :**
- `nom` → devient un champ du modele (type texte)
- `marque` → devient un champ du modele (type texte)
- `modele` → devient un champ du modele (type texte)
- `numero_serie` → devient un champ du modele (type texte)

---

## Regles metier

1. **Modele obligatoire** : `familles_equipements.id_modele_equipement` est NOT NULL. Impossible de creer une famille sans choisir un modele.

2. **Champ d'affichage** : chaque modele designe UN champ comme "champ d'affichage principal" (`id_champ_affichage`). C'est ce champ qui alimente `equipements.nom_affichage`.

3. **nom_affichage** : colonne cache sur `equipements`, mise a jour automatiquement par trigger quand la valeur du champ d'affichage change. Utilisee par les listes, la recherche, les snapshots OT, les exports.

4. **Blocage changement modele** : un trigger empeche de changer `id_modele_equipement` sur une famille qui contient des equipements. Pour changer de modele, il faut d'abord vider la famille.

5. **Soft delete des champs** : on ne supprime jamais un champ (`DELETE`). On l'archive (`est_archive = 1`). Les valeurs existantes sont conservees mais le champ n'apparait plus dans les formulaires de creation. Les equipements existants conservent leurs valeurs en lecture seule.

6. **Ajout de champs** : ajouter un champ a un modele existant est toujours possible, meme si des equipements existent. Les equipements existants auront simplement ce champ vide.

---

## Phases

| Etape | Fichier PRD | Contenu |
|-------|-------------|---------|
| 1 | `1-schema-sql.md` | Modifications schema : nom_affichage, NOT NULL modele, retrait colonnes, triggers cache |
| 2 | `2-triggers-ot.md` | Reecriture des 4 triggers OT (snapshots equipement) |
| 3 | `3-modele-affichage.md` | Champ d'affichage, protection changement modele, soft-delete champs |
| 4 | `4-backend-rust.md` | Modifications structs, commandes CRUD, export, recherche |
| 5 | `5-seed-migration.md` | Migration donnees existantes + nouveau seed |
| 6 | `6-frontend.md` | Types, schemas, hooks, pages, composants |
| 7 | `7-verification.md` | Tests manuels complets |

---

## Fichiers impactes (resume)

| Couche | Fichiers |
|--------|----------|
| SQL | `schema.sql` (tables, triggers, index), `seed.sql` |
| Rust models | `models/equipements.rs`, `models/modeles_equipements.rs` |
| Rust commands | `commands/equipements.rs`, `commands/modeles_equipements.rs`, `commands/gammes.rs`, `commands/export.rs`, `commands/recherche.rs` |
| Rust config | `lib.rs`, `db.rs` |
| TS types | `lib/types/equipements.ts` |
| TS schemas | `lib/schemas/equipements.ts` |
| Hooks | `hooks/use-equipements.ts`, `hooks/use-modeles-equipements.ts` |
| Pages | `pages/equipements/[id].tsx`, `pages/equipements/familles/[idFamille].tsx`, `pages/modeles-equipements/[id].tsx` |
| Composants | `components/shared/EquipementList.tsx` |
| Seed | `seed.py` |

---

## Ordre d'execution

```
1. schema.sql — nouvelles colonnes + triggers cache nom_affichage
2. schema.sql — reecriture triggers OT
3. schema.sql — protection modele + soft-delete champs
4. seed.sql — migration des donnees de test
5. db.rs — bump SCHEMA_VERSION
6. models/*.rs — structs modifiees
7. commands/*.rs — requetes SQL modifiees
8. lib.rs — registration
9. Frontend — types, schemas, hooks, pages
10. Verification complete
```
