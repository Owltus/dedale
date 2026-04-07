# Phase 13 — Découplage Gammes / Équipements

## Contexte

Actuellement, les gammes et les équipements partagent les mêmes tables de hiérarchie (`domaines_techniques`, `familles_equipements`). La gamme a une FK directe `id_famille` vers `familles_equipements` et un lien optionnel `id_equipement` vers un équipement précis.

**Problèmes identifiés :**
- Déplacer une gamme vers une autre famille ne vérifie aucune cohérence avec l'équipement lié
- Impossible de lier une gamme à plusieurs équipements (ex : 3 BAES couverts par la même gamme)
- La hiérarchie domaine/famille est partagée alors que les besoins de classification sont différents (ex : famille équipement "Extincteur eau 6L" vs famille gamme "Moyens de lutte contre le feu")
- Le lien gamme → 1 seul équipement est trop rigide pour une GMAO réaliste

**Objectif :** Créer deux systèmes indépendants reliés par une table de liaison N↔N.

---

## Architecture cible

```
ÉQUIPEMENTS (inchangé)                  GAMMES (nouvelles tables)
──────────────────────                  ──────────────────────
domaines_equipements (renommé)          domaines_gammes (NOUVEAU)
└── familles_equipements                └── familles_gammes (NOUVEAU)
    └── equipements                         └── gammes (MODIFIÉ)
                                                └── ordres_travail
        │                                       │
        └──── gammes_equipements (NOUVEAU) ─────┘
                    (N ↔ N, optionnel)
```

**Règles :**
- Chaque système a ses propres domaines et familles (tables séparées)
- La liaison gamme ↔ équipement est optionnelle des deux côtés
- 1 OT global par gamme (pas 1 OT par équipement)
- Les équipements liés sont informatifs sur l'OT

---

## Phase 1 — Schéma SQL

### 1.1 Nouvelles tables

```sql
-- Domaines spécifiques aux gammes
CREATE TABLE domaines_gammes (
    id_domaine_gamme INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_domaine      TEXT NOT NULL UNIQUE,
    description      TEXT,
    id_image         INTEGER,
    FOREIGN KEY (id_image) REFERENCES images(id_image) ON DELETE SET NULL
) STRICT;

-- Familles spécifiques aux gammes
CREATE TABLE familles_gammes (
    id_famille_gamme INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_famille      TEXT NOT NULL,
    description      TEXT,
    id_domaine_gamme INTEGER NOT NULL,
    id_image         INTEGER,
    FOREIGN KEY (id_domaine_gamme) REFERENCES domaines_gammes(id_domaine_gamme) ON DELETE RESTRICT,
    FOREIGN KEY (id_image)         REFERENCES images(id_image)                  ON DELETE SET NULL,
    UNIQUE(nom_famille, id_domaine_gamme)
) STRICT;

-- Liaison N↔N gammes ↔ équipements
CREATE TABLE gammes_equipements (
    id_gamme_equipement INTEGER PRIMARY KEY AUTOINCREMENT,
    id_gamme            INTEGER NOT NULL,
    id_equipement       INTEGER NOT NULL,
    date_liaison        TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gamme)      REFERENCES gammes(id_gamme)           ON DELETE CASCADE,
    FOREIGN KEY (id_equipement) REFERENCES equipements(id_equipement) ON DELETE RESTRICT,
    UNIQUE(id_gamme, id_equipement)
) STRICT;
```

### 1.2 Renommage table existante

```sql
ALTER TABLE domaines_techniques RENAME TO domaines_equipements;
```

### 1.3 Modification table `gammes`

- **Supprimer** `id_famille` (FK → familles_equipements)
- **Supprimer** `id_equipement` (FK → equipements)
- **Ajouter** `id_famille_gamme` (FK → familles_gammes, NOT NULL)

> SQLite ne supporte pas `ALTER TABLE DROP COLUMN` avec des FK. Stratégie : créer nouvelle table, copier, remplacer.

### 1.4 Modification table `ordres_travail`

- `nom_famille` reste — mais résolu depuis `familles_gammes` (pas `familles_equipements`)
- `nom_equipement` et `numero_serie_equipement` restent — remplis uniquement si la gamme a **exactement 1** équipement lié, sinon NULL

### 1.5 Triggers à réécrire (6 majeurs)

| Trigger | Impact |
|---------|--------|
| `creation_ot_complet` | Snapshot `nom_famille` depuis `familles_gammes`. Snapshot `nom_equipement` depuis `gammes_equipements` (si 1 seul lié). |
| `a_propagation_gamme_vers_ot` | Propagation famille depuis `familles_gammes`. Bloc équipement supprimé (N↔N = pas de propagation directe). |
| `propagation_renommage_famille` | **Dédoublé** : un pour `familles_gammes` (→ OT), un pour `familles_equipements` (inchangé, ne touche plus les OT). |
| `propagation_equipement_vers_ot` | Reécrit : lookup via `gammes_equipements` au lieu de `gammes.id_equipement`. Propage uniquement si 1 seul équipement lié. |
| `reprogrammation_auto` | Snapshot `nom_famille` depuis `familles_gammes`. |
| `reinitialisation_resurrection` | Idem. |

### 1.6 Nouveaux index

```sql
CREATE INDEX idx_gammes_famille_gamme ON gammes(id_famille_gamme);
CREATE INDEX idx_gammes_equipements_gamme ON gammes_equipements(id_gamme);
CREATE INDEX idx_gammes_equipements_equip ON gammes_equipements(id_equipement);
CREATE INDEX idx_familles_gammes_domaine  ON familles_gammes(id_domaine_gamme);
```

### 1.7 Index à supprimer

```sql
-- Plus de colonnes correspondantes sur gammes
DROP INDEX idx_gammes_famille;
DROP INDEX idx_gammes_equipement;
```

### 1.8 Migration des données existantes

```sql
-- 1. Créer les nouvelles tables (domaines_gammes, familles_gammes, gammes_equipements)
-- 2. Copier les domaines et familles utilisés par les gammes
INSERT INTO domaines_gammes (id_domaine_gamme, nom_domaine, description, id_image)
SELECT id_domaine, nom_domaine, description, id_image
FROM domaines_equipements
WHERE id_domaine IN (
    SELECT DISTINCT fe.id_domaine
    FROM gammes g JOIN familles_equipements fe ON g.id_famille = fe.id_famille
);

INSERT INTO familles_gammes (id_famille_gamme, nom_famille, description, id_domaine_gamme, id_image)
SELECT fe.id_famille, fe.nom_famille, fe.description, fe.id_domaine, fe.id_image
FROM familles_equipements fe
WHERE fe.id_famille IN (SELECT DISTINCT id_famille FROM gammes);

-- 3. Migrer les liens gamme→équipement existants vers la table de liaison
INSERT INTO gammes_equipements (id_gamme, id_equipement)
SELECT id_gamme, id_equipement FROM gammes WHERE id_equipement IS NOT NULL;

-- 4. Recréer la table gammes avec id_famille_gamme
-- (procédure copy-replace détaillée dans la section Migration)
```

---

## Phase 2 — Backend Rust

### 2.1 Fichiers à modifier

| Fichier | Changements |
|---------|-------------|
| `schema.sql` | Schéma complet v2 avec nouvelles tables, triggers réécrits |
| `db.rs` | Ajouter système de migration (détection version + script migration v1→v2) |
| `models/gammes.rs` | Remplacer `id_famille`/`id_equipement` par `id_famille_gamme`. Ajouter structs `DomaineGamme`, `FamilleGamme`, `GammeEquipementLink`. |
| `models/dashboard.rs` | `GammeAlerte.nom_famille` : inchangé (string) |
| `commands/gammes.rs` | Réécrire toutes les requêtes (JOIN `familles_gammes`). Ajouter ~14 commandes CRUD domaines/familles gammes + liaison équipements. |
| `commands/equipements.rs` | Renommer `domaines_techniques` → `domaines_equipements` dans SQL. Réécrire `get_ot_by_equipement` (JOIN via `gammes_equipements`). |
| `commands/ordres_travail.rs` | `get_ot_by_famille` : filtrer par `gammes.id_famille_gamme`. |
| `commands/export.rs` | `export_csv_gammes` : JOIN `familles_gammes`. |
| `commands/recherche.rs` | Sous-requête `nom_famille` depuis `familles_gammes`. |
| `commands/dashboard.rs` | JOIN `familles_gammes` pour alerte gammes régl. |
| `lib.rs` | Enregistrer ~14 nouvelles commandes dans `generate_handler![]`. |

### 2.2 Nouvelles commandes Tauri

```
# Domaines gammes
get_domaines_gammes()              → Vec<DomaineGamme>
get_domaine_gamme(id)              → DomaineGamme
create_domaine_gamme(input)        → DomaineGamme
update_domaine_gamme(id, input)    → DomaineGamme
delete_domaine_gamme(id)           → ()

# Familles gammes
get_familles_gammes(id_domaine?)   → Vec<FamilleGamme>
get_famille_gamme(id)              → FamilleGamme
create_famille_gamme(input)        → FamilleGamme
update_famille_gamme(id, input)    → FamilleGamme
delete_famille_gamme(id)           → ()

# Liaison gammes ↔ équipements
get_gamme_equipements(id_gamme)    → Vec<Equipement>
link_gamme_equipement(id_gamme, id_equipement)    → ()
unlink_gamme_equipement(id_gamme, id_equipement)  → ()
get_equipement_gammes(id_equipement)              → Vec<GammeListItem>
```

### 2.3 Système de migration (db.rs)

```rust
// Détection : vérifier si la table domaines_gammes existe
// Si non → exécuter le script de migration v1→v2
// Pour les nouvelles installations → schema.sql contient déjà la v2
```

La migration doit :
1. Désactiver `PRAGMA foreign_keys` temporairement
2. Créer les nouvelles tables
3. Copier les données (domaines, familles, liaisons équipements)
4. Recréer `gammes` avec la nouvelle structure
5. Drop + Recreate tous les triggers impactés
6. Valider avec `PRAGMA foreign_key_check`
7. Réactiver `PRAGMA foreign_keys`

---

## Phase 3 — Frontend (Types, Schemas, Hooks)

### 3.1 Types (`src/lib/types/gammes.ts`)

```typescript
// MODIFIÉ
interface Gamme {
  // ... (autres champs inchangés)
  id_famille_gamme: number;   // REMPLACE id_famille
  // SUPPRIMÉ: id_equipement
}

// NOUVEAU
interface DomaineGamme {
  id_domaine_gamme: number;
  nom_domaine: string;
  description: string | null;
  id_image: number | null;
}

interface FamilleGamme {
  id_famille_gamme: number;
  nom_famille: string;
  description: string | null;
  id_domaine_gamme: number;
  id_image: number | null;
}
```

### 3.2 Schemas (`src/lib/schemas/gammes.ts`)

```typescript
// MODIFIÉ
gammeSchema: id_famille_gamme remplace id_famille, id_equipement supprimé

// NOUVEAU
domaineGammeSchema: { nom_domaine, description?, id_image? }
familleGammeSchema: { nom_famille, description?, id_domaine_gamme, id_image? }
```

### 3.3 Hooks (`src/hooks/use-gammes.ts`)

**Nouveaux hooks :**
- `useDomainesGammes()`, `useDomaineGamme(id)`, `useCreateDomaineGamme()`, `useUpdateDomaineGamme()`, `useDeleteDomaineGamme()`
- `useFamillesGammes(idDomaine?)`, `useFamilleGamme(id)`, `useCreateFamilleGamme()`, `useUpdateFamilleGamme()`, `useDeleteFamilleGamme()`
- `useGammeEquipements(idGamme)`, `useLinkGammeEquipement()`, `useUnlinkGammeEquipement()`
- `useEquipementGammes(idEquipement)` (gammes liées à un équipement)

**Modifiés :**
- `useGammes(idFamilleGamme?)` : paramètre renommé
- Query keys : `id_famille` → `id_famille_gamme`

### 3.4 Hooks (`src/hooks/use-equipements.ts`)

- `useOtByEquipement` : inchangé côté frontend (la requête backend change)
- Tout le reste inchangé

---

## Phase 4 — Frontend (Pages)

### 4.1 Pages modifiées

| Page | Changement |
|------|-----------|
| `pages/gammes/index.tsx` | `useDomaines()` → `useDomainesGammes()`. Schema : `domaineGammeSchema`. |
| `pages/gammes/domaines/[idDomaine].tsx` | `useFamilles()` → `useFamillesGammes()`. Schema : `familleGammeSchema`. |
| `pages/gammes/familles/[idFamille].tsx` | `useFamille()` → `useFamilleGamme()`. Supprimer sélecteur équipement dans le formulaire gamme. Supprimer `useEquipements()`. |
| `pages/gammes/[id].tsx` | **Majeur** — supprimer champ équipement du formulaire. Ajouter onglet/section "Équipements liés" avec UI de liaison (ajouter/retirer). |
| `pages/equipements/index.tsx` | Commande `get_domaines` requête `domaines_equipements` (renommage transparent côté backend). Aucun changement frontend. |
| `pages/equipements/[id].tsx` | Ajouter section "Gammes liées" avec `useEquipementGammes()`. |

### 4.2 UI de liaison équipements (page gamme détail)

Nouveau composant ou section dans l'onglet existant :
- Liste des équipements liés avec bouton "Retirer"
- Bouton "Ajouter des équipements" → Dialog avec :
  - Sélecteur domaine équipement (filtre optionnel)
  - Sélecteur famille équipement (filtre optionnel)
  - Liste des équipements avec checkbox
  - Bouton "Lier la sélection"

---

## Phase 5 — Vérification

### Tests manuels

1. **Installation fraîche** : supprimer `gmao.db`, relancer → vérifier schéma v2 créé
2. **Migration** : lancer avec base existante → vérifier données préservées
3. **CRUD équipements** : créer/modifier/supprimer domaines, familles, équipements → inchangé
4. **CRUD hiérarchie gammes** : créer domaine_gamme, famille_gamme, gamme → fonctionne
5. **Liaison N↔N** : lier 3 équipements à 1 gamme → vérifier
6. **Liaison croisée** : lier 1 équipement à 2 gammes → vérifier
7. **Création OT (1 équipement lié)** : `nom_equipement` rempli dans l'OT
8. **Création OT (0 ou 2+ équipements)** : `nom_equipement` = NULL
9. **Propagation famille gamme** : modifier `nom_famille` d'une `famille_gamme` → OT actifs mis à jour
10. **Propagation nom équipement** : renommer un équipement lié seul à une gamme → OT mis à jour
11. **Reprogrammation** : clôturer un OT → OT suivant créé avec bons snapshots
12. **Dashboard** : alerte "gammes régl. sans OT" affiche la bonne famille
13. **Recherche globale** : rechercher une gamme → sous-label famille correct
14. **Export CSV** : export gammes → colonne famille correcte
15. **Suppression équipement lié** : bloquée (RESTRICT) avec message explicite

### Commandes de vérification

```bash
npm run tauri dev            # Lancer et tester manuellement
npx tsc --noEmit             # Type-check TypeScript
cargo build                  # Vérifier compilation Rust
```

---

## Fichiers impactés (résumé)

| Couche | Fichiers |
|--------|----------|
| SQL | `schema.sql` |
| Rust | `db.rs`, `models/gammes.rs`, `models/dashboard.rs`, `commands/gammes.rs`, `commands/equipements.rs`, `commands/ordres_travail.rs`, `commands/export.rs`, `commands/recherche.rs`, `commands/dashboard.rs`, `lib.rs` |
| Types TS | `lib/types/gammes.ts` |
| Schemas | `lib/schemas/gammes.ts` |
| Hooks | `hooks/use-gammes.ts`, `hooks/use-equipements.ts` |
| Pages | `pages/gammes/index.tsx`, `pages/gammes/[id].tsx`, `pages/gammes/domaines/[idDomaine].tsx`, `pages/gammes/familles/[idFamille].tsx`, `pages/equipements/[id].tsx` |
| **Total** | **~18 fichiers modifiés, 0 nouveau fichier** |

---

## Ordre d'exécution

```
1. schema.sql (nouveau schéma complet v2)
2. db.rs (migration v1→v2 + init v2)
3. models/gammes.rs (structs)
4. commands/gammes.rs (CRUD domaines/familles/liaison + réécriture requêtes)
5. commands/equipements.rs, ordres_travail.rs, export.rs, recherche.rs, dashboard.rs
6. lib.rs (enregistrement commandes)
7. Types + Schemas + Hooks frontend
8. Pages frontend
9. Tests manuels
```
