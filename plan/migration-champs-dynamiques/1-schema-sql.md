# Etape 1 -- Schema SQL : migration vers champs dynamiques

## Objectif

Modifier `schema.sql` pour supprimer les colonnes fixes (`nom`, `marque`, `modele`, `numero_serie`) de la table `equipements`, rendre le modele obligatoire sur les familles, ajouter la colonne cache `nom_affichage`, et creer les triggers de maintenance automatique.

## Fichier impacte

- `src-tauri/schema.sql`

---

## Travail a realiser

### 1.1 Ajout colonne `nom_affichage` a `equipements`

Ajouter une colonne cache recalculee automatiquement par trigger. Elle contient la valeur du champ d'affichage principal du modele (ex: le "Nom" de l'equipement tel que defini par le modele).

```sql
nom_affichage TEXT NOT NULL DEFAULT ''
```

**Pourquoi un cache ?** La valeur vit dans `valeurs_equipements`, mais `nom_affichage` est lue en permanence par :
- Les listes d'equipements (tri, recherche, affichage)
- Les snapshots OT (`nom_equipement` dans `ordres_travail`)
- L'export et la recherche globale

Sans cache, chaque affichage necessite un JOIN `valeurs_equipements` + sous-requete sur `modeles_equipements.id_champ_affichage`. La colonne cache evite cette indirection.

---

### 1.2 Modification `familles_equipements`

Le modele devient obligatoire : chaque famille DOIT etre liee a un modele d'equipement.

**Avant :**
```sql
id_modele_equipement  INTEGER,
-- ...
FOREIGN KEY (id_modele_equipement) REFERENCES modeles_equipements(id_modele_equipement) ON DELETE SET NULL,
```

**Apres :**
```sql
id_modele_equipement  INTEGER NOT NULL,
-- ...
FOREIGN KEY (id_modele_equipement) REFERENCES modeles_equipements(id_modele_equipement) ON DELETE RESTRICT,
```

**Changements :**
- `INTEGER` -> `INTEGER NOT NULL` : impossible de creer une famille sans modele
- `ON DELETE SET NULL` -> `ON DELETE RESTRICT` : impossible de supprimer un modele utilise par une famille (il faut d'abord supprimer/deplacer les familles)

**Attention :** SQLite ne supporte pas `ALTER TABLE ... ALTER COLUMN`. Il faut recreer la table (voir section 1.5 pour la procedure generique). Cependant, puisque `familles_equipements` n'a pas les memes contraintes complexes qu'`equipements`, la recreation est plus simple.

Procedure pour `familles_equipements` :
```sql
-- 1. Creer la nouvelle table
CREATE TABLE familles_equipements_new (
    id_famille            INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_famille           TEXT NOT NULL,
    description           TEXT,
    id_domaine            INTEGER NOT NULL,
    id_image              INTEGER,
    id_modele_equipement  INTEGER NOT NULL,
    FOREIGN KEY (id_domaine)           REFERENCES domaines_equipements(id_domaine)                   ON DELETE RESTRICT,
    FOREIGN KEY (id_image)             REFERENCES images(id_image)                                   ON DELETE SET NULL,
    FOREIGN KEY (id_modele_equipement) REFERENCES modeles_equipements(id_modele_equipement)           ON DELETE RESTRICT,
    UNIQUE(nom_famille, id_domaine)
) STRICT;

-- 2. Copier les donnees (echouera si des familles ont id_modele_equipement NULL)
INSERT INTO familles_equipements_new
SELECT id_famille, nom_famille, description, id_domaine, id_image, id_modele_equipement
FROM familles_equipements;

-- 3. Remplacer
DROP TABLE familles_equipements;
ALTER TABLE familles_equipements_new RENAME TO familles_equipements;
```

> **Note :** dans le fichier `schema.sql` (installation fraiche), il suffit de modifier directement le CREATE TABLE. La procedure ci-dessus est documentee pour reference si une migration de donnees existantes est necessaire (traitee dans `5-seed-migration.md`).

---

### 1.3 Modification `modeles_equipements`

Ajouter la colonne `id_champ_affichage` qui designe le champ du modele servant de "nom" pour l'equipement.

**Avant :**
```sql
CREATE TABLE modeles_equipements (
    id_modele_equipement INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_modele           TEXT NOT NULL UNIQUE,
    description          TEXT,
    date_creation        TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification    TEXT DEFAULT CURRENT_TIMESTAMP
) STRICT;
```

**Apres :**
```sql
CREATE TABLE modeles_equipements (
    id_modele_equipement INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_modele           TEXT NOT NULL UNIQUE,
    description          TEXT,
    id_champ_affichage   INTEGER,
    date_creation        TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification    TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_champ_affichage) REFERENCES champs_modele(id_champ) ON DELETE SET NULL
) STRICT;
```

**Notes :**
- `id_champ_affichage` est nullable a la creation du modele (on ne peut pas designer un champ qui n'existe pas encore). Mais le backend DOIT verifier qu'il est rempli avant de permettre la creation d'equipements via ce modele.
- `ON DELETE SET NULL` : si le champ d'affichage est archive/supprime, le modele perd sa reference. Le backend detecte ce cas et demande a l'utilisateur de choisir un nouveau champ d'affichage.
- **Attention a la dependance circulaire** : `modeles_equipements` reference `champs_modele`, et `champs_modele` reference `modeles_equipements`. Dans SQLite, la FK est verifiee au moment de l'INSERT/UPDATE, pas au CREATE TABLE. L'ordre de creation dans `schema.sql` n'a donc pas besoin de changer : `modeles_equipements` peut etre cree avant `champs_modele` tant que la FK est declaree.

---

### 1.4 Modification `champs_modele`

Ajouter la colonne `est_archive` pour le soft-delete des champs.

**Avant :**
```sql
CREATE TABLE champs_modele (
    id_champ             INTEGER PRIMARY KEY AUTOINCREMENT,
    id_modele_equipement INTEGER NOT NULL,
    nom_champ            TEXT NOT NULL,
    type_champ           TEXT NOT NULL,
    unite                TEXT,
    est_obligatoire      INTEGER NOT NULL DEFAULT 0,
    ordre                INTEGER NOT NULL DEFAULT 0,
    valeurs_possibles    TEXT,
    FOREIGN KEY (id_modele_equipement) REFERENCES modeles_equipements(id_modele_equipement) ON DELETE CASCADE,
    CHECK (type_champ IN ('texte', 'nombre', 'date', 'booleen', 'liste')),
    CHECK (est_obligatoire IN (0, 1)),
    UNIQUE(id_modele_equipement, nom_champ)
) STRICT;
```

**Apres :**
```sql
CREATE TABLE champs_modele (
    id_champ             INTEGER PRIMARY KEY AUTOINCREMENT,
    id_modele_equipement INTEGER NOT NULL,
    nom_champ            TEXT NOT NULL,
    type_champ           TEXT NOT NULL,
    unite                TEXT,
    est_obligatoire      INTEGER NOT NULL DEFAULT 0,
    ordre                INTEGER NOT NULL DEFAULT 0,
    valeurs_possibles    TEXT,
    est_archive          INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (id_modele_equipement) REFERENCES modeles_equipements(id_modele_equipement) ON DELETE CASCADE,
    CHECK (type_champ IN ('texte', 'nombre', 'date', 'booleen', 'liste')),
    CHECK (est_obligatoire IN (0, 1)),
    CHECK (est_archive IN (0, 1)),
    UNIQUE(id_modele_equipement, nom_champ)
) STRICT;
```

**Pourquoi le soft-delete ?**
- Un hard-delete (`DELETE FROM champs_modele`) cascade-supprime les valeurs dans `valeurs_equipements` via la FK CASCADE. On perd les donnees historiques de tous les equipements.
- Avec `est_archive = 1`, le champ n'apparait plus dans les formulaires de creation/edition, mais les valeurs existantes restent consultables en lecture seule.
- Le backend filtre par `est_archive = 0` pour les formulaires, et inclut tous les champs (y compris archives) pour l'affichage detail.

---

### 1.5 Retrait des colonnes fixes de `equipements`

Supprimer les 4 colonnes devenues obsoletes : `nom`, `numero_serie`, `marque`, `modele`.

**Colonnes conservees :**
| Colonne | Raison |
|---------|--------|
| `id_equipement` | PK |
| `id_famille` | Lien vers la famille (et donc le modele) |
| `id_local` | Localisation — concept universel, independant du type |
| `est_actif` | Etat de l'equipement |
| `commentaires` | Notes libres — concept universel |
| `id_image` | Photo/icone — concept universel |
| `nom_affichage` | **NOUVEAU** — cache du champ d'affichage |
| `date_mise_en_service` | Date universelle |
| `date_fin_garantie` | Date universelle |
| `date_creation` | Horodatage technique |
| `date_modification` | Horodatage technique |

**Colonnes supprimees :**
| Colonne | Remplacement |
|---------|-------------|
| `nom` | Champ du modele (type `texte`, obligatoire, designe comme champ d'affichage) |
| `marque` | Champ du modele (type `texte`) |
| `modele` | Champ du modele (type `texte`) |
| `numero_serie` | Champ du modele (type `texte`) |

**Procedure de recreation de la table :**

SQLite ne supporte pas `ALTER TABLE DROP COLUMN` quand la colonne est referencee par un CHECK, un trigger ou une expression complexe. La colonne `nom` est contrainte par `CHECK (LENGTH(TRIM(nom)) > 0)` — il faut donc recreer la table.

```sql
-- Etape 1 : Creer la nouvelle table (sans les 4 colonnes, avec nom_affichage)
CREATE TABLE equipements_new (
    id_equipement       INTEGER PRIMARY KEY AUTOINCREMENT,
    id_famille          INTEGER NOT NULL,
    id_local            INTEGER,
    est_actif           INTEGER NOT NULL DEFAULT 1,
    commentaires        TEXT,
    id_image            INTEGER,
    nom_affichage       TEXT NOT NULL DEFAULT '',
    date_mise_en_service TEXT,
    date_fin_garantie   TEXT,
    date_creation       TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification   TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_famille)      REFERENCES familles_equipements(id_famille)   ON DELETE RESTRICT,
    FOREIGN KEY (id_local)        REFERENCES locaux(id_local)                   ON DELETE RESTRICT,
    FOREIGN KEY (id_image)        REFERENCES images(id_image)                   ON DELETE SET NULL,
    CHECK (est_actif IN (0, 1)),
    CHECK (LENGTH(TRIM(nom_affichage)) > 0),
    CHECK (date_mise_en_service IS NULL OR date_fin_garantie IS NULL
           OR date_fin_garantie >= date_mise_en_service)
) STRICT;

-- Etape 2 : Copier les donnees existantes
-- Le nom_affichage est initialise avec l'ancien champ `nom` pour la migration
INSERT INTO equipements_new (
    id_equipement, id_famille, id_local, est_actif, commentaires,
    id_image, nom_affichage, date_mise_en_service, date_fin_garantie,
    date_creation, date_modification
)
SELECT
    id_equipement, id_famille, id_local, est_actif, commentaires,
    id_image, nom, date_mise_en_service, date_fin_garantie,
    date_creation, date_modification
FROM equipements;

-- Etape 3 : Supprimer les triggers qui referencent l'ancienne table
-- (les triggers sont lies au nom de table, ils seront invalides apres le RENAME)
DROP TRIGGER IF EXISTS maj_date_modification_equipement;
-- Lister ici TOUS les triggers sur `equipements` a supprimer avant le DROP

-- Etape 4 : Remplacer la table
DROP TABLE equipements;
ALTER TABLE equipements_new RENAME TO equipements;

-- Etape 5 : Recreer les triggers (avec les references mises a jour)
-- Voir section 1.6 et PRD 2-triggers-ot.md

-- Etape 6 : Recreer les index
-- Voir section 1.7
```

**Points critiques :**
- Le `DROP TABLE equipements` cascade-supprime automatiquement les index et triggers associes. Il faut les recreer apres le RENAME.
- Les tables enfants (`valeurs_equipements`, `gammes_equipements`, `documents_equipements`) referencent `equipements(id_equipement)` par FK. Comme la PK est conservee avec les memes valeurs, les FK restent valides apres la migration.
- Le `AUTOINCREMENT` sur la nouvelle table reprend la valeur du compteur SQLite (`sqlite_sequence`) a condition de conserver les memes `id_equipement`.

> **Note :** dans le fichier `schema.sql` (installation fraiche, base vide), on ecrit directement le nouveau CREATE TABLE sans la procedure de migration. La procedure de migration des donnees existantes est traitee dans `5-seed-migration.md`.

**CREATE TABLE final pour `schema.sql` :**
```sql
CREATE TABLE equipements (
    id_equipement       INTEGER PRIMARY KEY AUTOINCREMENT,
    id_famille          INTEGER NOT NULL,
    id_local            INTEGER,
    est_actif           INTEGER NOT NULL DEFAULT 1,
    commentaires        TEXT,
    id_image            INTEGER,
    nom_affichage       TEXT NOT NULL DEFAULT '',
    date_mise_en_service TEXT,
    date_fin_garantie   TEXT,
    date_creation       TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification   TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_famille)      REFERENCES familles_equipements(id_famille)   ON DELETE RESTRICT,
    FOREIGN KEY (id_local)        REFERENCES locaux(id_local)                   ON DELETE RESTRICT,
    FOREIGN KEY (id_image)        REFERENCES images(id_image)                   ON DELETE SET NULL,
    CHECK (est_actif IN (0, 1)),
    CHECK (LENGTH(TRIM(nom_affichage)) > 0),
    CHECK (date_mise_en_service IS NULL OR date_fin_garantie IS NULL
           OR date_fin_garantie >= date_mise_en_service)
) STRICT;
```

---

### 1.6 Triggers de maintenance `nom_affichage`

Ces triggers maintiennent la colonne cache `nom_affichage` synchronisee avec la valeur du champ d'affichage dans `valeurs_equipements`.

#### 1.6.1 Trigger AFTER INSERT sur `valeurs_equipements`

Quand on insere une valeur pour un equipement, si le champ insere correspond au champ d'affichage du modele, on met a jour `nom_affichage`.

```sql
CREATE TRIGGER maj_nom_affichage_insert
AFTER INSERT ON valeurs_equipements
FOR EACH ROW
BEGIN
    UPDATE equipements SET nom_affichage = NEW.valeur
    WHERE id_equipement = NEW.id_equipement
    AND NEW.id_champ = (
        SELECT me.id_champ_affichage
        FROM modeles_equipements me
        JOIN familles_equipements fe ON fe.id_modele_equipement = me.id_modele_equipement
        JOIN equipements e ON e.id_famille = fe.id_famille
        WHERE e.id_equipement = NEW.id_equipement
    );
END;
```

**Logique :** la sous-requete remonte la chaine `equipement -> famille -> modele` pour obtenir le `id_champ_affichage`. Si `NEW.id_champ` correspond, on ecrit `NEW.valeur` dans `nom_affichage`. Sinon, le WHERE ne matche pas et rien ne se passe.

#### 1.6.2 Trigger AFTER UPDATE sur `valeurs_equipements`

Meme logique, declenche quand la valeur d'un champ est modifiee.

```sql
CREATE TRIGGER maj_nom_affichage_update
AFTER UPDATE ON valeurs_equipements
FOR EACH ROW
WHEN NEW.valeur IS NOT OLD.valeur
BEGIN
    UPDATE equipements SET nom_affichage = NEW.valeur
    WHERE id_equipement = NEW.id_equipement
    AND NEW.id_champ = (
        SELECT me.id_champ_affichage
        FROM modeles_equipements me
        JOIN familles_equipements fe ON fe.id_modele_equipement = me.id_modele_equipement
        JOIN equipements e ON e.id_famille = fe.id_famille
        WHERE e.id_equipement = NEW.id_equipement
    );
END;
```

**Note :** la clause `WHEN NEW.valeur IS NOT OLD.valeur` evite un UPDATE inutile si la valeur n'a pas change. On utilise `IS NOT` plutot que `!=` pour gerer correctement les valeurs NULL.

#### 1.6.3 Trigger AFTER DELETE sur `valeurs_equipements`

Quand on supprime une valeur (rare — principalement lors de la suppression d'un champ archive), si c'etait le champ d'affichage, on remet `nom_affichage` a une chaine vide.

```sql
CREATE TRIGGER maj_nom_affichage_delete
AFTER DELETE ON valeurs_equipements
FOR EACH ROW
BEGIN
    UPDATE equipements SET nom_affichage = ''
    WHERE id_equipement = OLD.id_equipement
    AND OLD.id_champ = (
        SELECT me.id_champ_affichage
        FROM modeles_equipements me
        JOIN familles_equipements fe ON fe.id_modele_equipement = me.id_modele_equipement
        JOIN equipements e ON e.id_famille = fe.id_famille
        WHERE e.id_equipement = OLD.id_equipement
    );
END;
```

**Note :** en pratique, la suppression directe de valeurs est rare grace au soft-delete des champs. Ce trigger est surtout un filet de securite.

#### 1.6.4 Trigger AFTER UPDATE sur `modeles_equipements` (changement de champ d'affichage)

Si l'admin change le `id_champ_affichage` d'un modele, il faut recalculer `nom_affichage` pour TOUS les equipements de ce modele.

```sql
CREATE TRIGGER maj_nom_affichage_changement_champ
AFTER UPDATE OF id_champ_affichage ON modeles_equipements
FOR EACH ROW
WHEN NEW.id_champ_affichage IS NOT OLD.id_champ_affichage
BEGIN
    -- Recalcule nom_affichage pour chaque equipement du modele
    UPDATE equipements
    SET nom_affichage = COALESCE(
        (SELECT ve.valeur
         FROM valeurs_equipements ve
         WHERE ve.id_equipement = equipements.id_equipement
           AND ve.id_champ = NEW.id_champ_affichage),
        ''
    )
    WHERE id_famille IN (
        SELECT fe.id_famille
        FROM familles_equipements fe
        WHERE fe.id_modele_equipement = NEW.id_modele_equipement
    );
END;
```

**Note :** `COALESCE(..., '')` gere le cas ou l'equipement n'a pas encore de valeur pour le nouveau champ d'affichage.

---

### 1.7 Index

Ajouter un index sur `nom_affichage` pour les recherches et le tri :

```sql
CREATE INDEX idx_equipements_nom_affichage ON equipements(nom_affichage);
```

**Index existants a conserver** (ils ne referencent pas les colonnes supprimees) :
- `idx_equipements_famille` sur `equipements(id_famille)`
- `idx_equipements_local` sur `equipements(id_local)`
- `idx_valeurs_equipement` sur `valeurs_equipements(id_equipement)`
- `idx_valeurs_champ` sur `valeurs_equipements(id_champ)`
- `idx_familles_modele` sur `familles_equipements(id_modele_equipement)`
- `idx_champs_modele` sur `champs_modele(id_modele_equipement)`

> **Rappel :** les index sont automatiquement supprimes lors du `DROP TABLE equipements` dans la procedure de migration. Il faut les recreer apres le `RENAME`.

---

### 1.8 Impact sur les triggers existants

Les triggers OT qui referencent `e.nom` et `e.numero_serie` doivent etre reecrits. Ce travail est detaille dans le PRD `2-triggers-ot.md`, mais voici un resume des triggers impactes :

| Trigger | Ligne schema.sql | Reference a remplacer |
|---------|-----------------|----------------------|
| `creation_ot_complet` | ~1855 | `e.nom` -> `e.nom_affichage` |
| `creation_ot_complet` | ~1868 | `e.numero_serie` -> sous-requete `valeurs_equipements` ou suppression |
| `reprogrammation_auto` | ~2340 | `e.nom` -> `e.nom_affichage` |
| `reprogrammation_auto` | ~2350 | `e.numero_serie` -> sous-requete `valeurs_equipements` ou suppression |

**Decision :** `e.nom` est remplace par `e.nom_affichage` (disponible directement sur la table). Pour `e.numero_serie`, deux options sont discutees dans `2-triggers-ot.md`.

---

## Resume des modifications dans `schema.sql`

| Section | Action |
|---------|--------|
| `modeles_equipements` | Ajouter `id_champ_affichage INTEGER` + FK vers `champs_modele` |
| `champs_modele` | Ajouter `est_archive INTEGER NOT NULL DEFAULT 0` + CHECK |
| `familles_equipements` | `id_modele_equipement` : nullable -> NOT NULL, SET NULL -> RESTRICT |
| `equipements` | Supprimer `nom`, `marque`, `modele`, `numero_serie`. Ajouter `nom_affichage`. Remplacer CHECK `nom` par CHECK `nom_affichage` |
| Triggers (NOUVEAU) | 4 triggers maintenance `nom_affichage` (INSERT/UPDATE/DELETE `valeurs_equipements` + UPDATE `modeles_equipements`) |
| Triggers (EXISTANTS) | Reecriture triggers OT (voir `2-triggers-ot.md`) |
| Index (NOUVEAU) | `idx_equipements_nom_affichage` |

---

## Criteres de validation

- [ ] Le fichier `schema.sql` est syntaxiquement valide (pas d'erreur a l'ouverture d'une base fraiche)
- [ ] `equipements` n'a plus de colonnes `nom`, `marque`, `modele`, `numero_serie`
- [ ] `equipements` a la colonne `nom_affichage TEXT NOT NULL`
- [ ] `CHECK (LENGTH(TRIM(nom_affichage)) > 0)` est en place
- [ ] `familles_equipements.id_modele_equipement` est NOT NULL avec ON DELETE RESTRICT
- [ ] `modeles_equipements.id_champ_affichage` existe avec FK vers `champs_modele`
- [ ] `champs_modele.est_archive` existe avec CHECK IN (0, 1)
- [ ] Les 4 triggers `nom_affichage` sont crees et fonctionnels
- [ ] L'index `idx_equipements_nom_affichage` est cree
- [ ] Aucune reference a `equipements.nom`, `equipements.marque`, `equipements.modele`, `equipements.numero_serie` dans le schema (sauf procedure de migration documentee)

## Controle /borg

Lancer un /borg pour verifier :
- Coherence des FK (pas de reference circulaire bloquante — la FK `modeles_equipements.id_champ_affichage -> champs_modele.id_champ` est ok car SQLite valide au runtime)
- Les triggers `nom_affichage` ne declenchent pas de boucle (pas de trigger sur `equipements` qui re-touche `valeurs_equipements`)
- Les CASCADE existants restent corrects apres la recreation de la table `equipements`
- Pas de regression sur les triggers non impactes (triggers `date_modification`, triggers operations, etc.)
