# Etape 1 — Schema SQL

## Objectif
Ajouter les tables pour les modeles d'equipement, leurs champs et les valeurs par equipement. Modifier `familles_equipements` pour y rattacher un modele.

## Fichier impacte
- `src-tauri/schema.sql`

## Travail a realiser

### 1.1 Nouvelle table `modeles_equipements`

Placer **avant** `familles_equipements` (car la FK va pointer vers cette table).

```sql
CREATE TABLE modeles_equipements (
    id_modele_equipement INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_modele           TEXT NOT NULL UNIQUE,
    description          TEXT,
    date_creation        TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification    TEXT DEFAULT CURRENT_TIMESTAMP
) STRICT;
```

### 1.2 Nouvelle table `champs_modele`

Juste apres `modeles_equipements`.

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

**Notes :**
- `valeurs_possibles` : texte separe par `|` pour le type `liste` (ex: `"optique|thermique|mixte|ionique"`). NULL pour les autres types.
- `ordre` : position d'affichage (0-based). Le frontend tri par `ordre` puis `nom_champ`.
- `CASCADE` sur le modele : supprimer un modele supprime ses champs.

### 1.3 Nouvelle table `valeurs_equipements`

Apres `equipements`.

```sql
CREATE TABLE valeurs_equipements (
    id_valeur     INTEGER PRIMARY KEY AUTOINCREMENT,
    id_equipement INTEGER NOT NULL,
    id_champ      INTEGER NOT NULL,
    valeur        TEXT,
    FOREIGN KEY (id_equipement) REFERENCES equipements(id_equipement) ON DELETE CASCADE,
    FOREIGN KEY (id_champ)      REFERENCES champs_modele(id_champ)    ON DELETE CASCADE,
    UNIQUE(id_equipement, id_champ)
) STRICT;
```

**Notes :**
- `CASCADE` sur equipement : supprimer un equipement supprime ses valeurs.
- `CASCADE` sur champ : supprimer un champ du modele supprime les valeurs correspondantes pour tous les equipements.
- `valeur` est toujours TEXT — le `type_champ` dans `champs_modele` determine l'interpretation.

### 1.4 Modifier `familles_equipements`

Ajouter une FK optionnelle vers `modeles_equipements` :

```sql
CREATE TABLE familles_equipements (
    id_famille            INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_famille           TEXT NOT NULL,
    description           TEXT,
    id_domaine            INTEGER NOT NULL,
    id_image              INTEGER,
    id_modele_equipement  INTEGER,                                                    -- AJOUT
    FOREIGN KEY (id_domaine)            REFERENCES domaines_equipements(id_domaine)    ON DELETE RESTRICT,
    FOREIGN KEY (id_image)              REFERENCES images(id_image)                    ON DELETE SET NULL,
    FOREIGN KEY (id_modele_equipement)  REFERENCES modeles_equipements(id_modele_equipement) ON DELETE SET NULL,
    UNIQUE(nom_famille, id_domaine)
) STRICT;
```

**Notes :**
- `ON DELETE SET NULL` : si on supprime un modele, la famille perd sa reference mais continue d'exister.
- Attention : la suppression d'un modele CASCADE-supprime les champs, qui CASCADE-suppriment les valeurs. Le dialog de suppression devra prevenir l'utilisateur.

### 1.5 Index

Apres les index existants :

```sql
CREATE INDEX idx_champs_modele          ON champs_modele(id_modele_equipement);
CREATE INDEX idx_valeurs_equipement     ON valeurs_equipements(id_equipement);
CREATE INDEX idx_valeurs_champ          ON valeurs_equipements(id_champ);
CREATE INDEX idx_familles_modele        ON familles_equipements(id_modele_equipement);
```

### 1.6 Triggers date_modification

```sql
-- Trigger date_modification pour modeles_equipements
CREATE TRIGGER maj_date_modification_modele_equipement
AFTER UPDATE ON modeles_equipements
FOR EACH ROW
WHEN OLD.date_modification = NEW.date_modification
BEGIN
    UPDATE modeles_equipements
    SET date_modification = CURRENT_TIMESTAMP
    WHERE id_modele_equipement = NEW.id_modele_equipement;
END;
```

Pas de trigger date_modification sur `champs_modele` ni `valeurs_equipements` (pas de colonne date_modification sur ces tables — pas necessaire).

## Critere de validation
- Le fichier `schema.sql` est syntaxiquement valide
- `familles_equipements` a bien la colonne `id_modele_equipement` nullable
- Les FK CASCADE sont correctes (modele→champs→valeurs)
- Les CHECK contraintes sont en place (type_champ, est_obligatoire)
- Les index couvrent les FK pour les performances

## Controle /borg
- Coherence des FK (pas de reference circulaire)
- Coherence des CASCADE (suppression en cascade correcte)
- Pas de regression sur les triggers existants
