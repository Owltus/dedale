# Étape 1 — Schéma SQL v2

## Objectif
Réécrire `schema.sql` avec la nouvelle architecture découplée. Ce fichier sert pour les **installations fraîches** (base vide).

## Fichier impacté
- `src-tauri/schema.sql`

## Travail à réaliser

### 1. Renommer `domaines_techniques` → `domaines_equipements`
- Renommer la table dans le CREATE TABLE
- Mettre à jour toutes les références dans le fichier (FK, triggers, index, commentaires)

### 2. Créer `domaines_gammes`
```sql
CREATE TABLE domaines_gammes (
    id_domaine_gamme INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_domaine      TEXT NOT NULL UNIQUE,
    description      TEXT,
    id_image         INTEGER,
    FOREIGN KEY (id_image) REFERENCES images(id_image) ON DELETE SET NULL
) STRICT;
```

### 3. Créer `familles_gammes`
```sql
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
```

### 4. Modifier `gammes`
- Remplacer `id_famille INTEGER NOT NULL` → `id_famille_gamme INTEGER NOT NULL`
- Supprimer `id_equipement INTEGER`
- Remplacer FK : `FOREIGN KEY (id_famille) REFERENCES familles_equipements` → `FOREIGN KEY (id_famille_gamme) REFERENCES familles_gammes(id_famille_gamme) ON DELETE RESTRICT`
- Supprimer FK : `FOREIGN KEY (id_equipement) REFERENCES equipements`
- Supprimer CHECK sur id_equipement (s'il y en a)

### 5. Créer `gammes_equipements`
```sql
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

### 6. Réécrire les 6 triggers majeurs

| Trigger | Changement |
|---------|-----------|
| `creation_ot_complet` | `nom_famille` : JOIN `familles_gammes` via `gammes.id_famille_gamme`. `nom_equipement` : sous-requête `gammes_equipements` avec condition `COUNT = 1`. |
| `a_propagation_gamme_vers_ot` | Bloc famille : JOIN `familles_gammes`. Supprimer bloc équipement (N↔N). |
| `propagation_renommage_famille` | Dédoubler : créer `propagation_renommage_famille_gamme` sur `familles_gammes` → OT. L'ancien ne touche plus les OT. |
| `propagation_equipement_vers_ot` | Lookup via `gammes_equipements`. Condition : propage uniquement si l'équipement est le seul lié à la gamme. |
| `reprogrammation_auto` | `nom_famille` : JOIN `familles_gammes`. |
| `reinitialisation_resurrection` | Idem. |

### 7. Mettre à jour les index
- Supprimer : `idx_gammes_famille`, `idx_gammes_equipement`
- Ajouter : `idx_gammes_famille_gamme`, `idx_gammes_equipements_gamme`, `idx_gammes_equipements_equip`, `idx_familles_gammes_domaine`

### 8. Ajouter triggers date_modification pour nouvelles tables
- `maj_date_modification_domaine_gamme` (si champ `date_modification` ajouté)
- `maj_date_modification_famille_gamme` (si champ `date_modification` ajouté)

## Critère de validation
- Le fichier `schema.sql` est syntaxiquement valide
- Aucune référence à `domaines_techniques` ne subsiste
- Aucune référence à `gammes.id_famille` ou `gammes.id_equipement` ne subsiste
- Toutes les FK sont cohérentes

## Contrôle /borg
Lancer un /borg pour vérifier :
- Cohérence du schéma SQL (FK circulaires, colonnes manquantes)
- Triggers : toutes les sous-requêtes pointent vers les bonnes tables
- Pas de régression sur les triggers non impactés
