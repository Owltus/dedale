# Etape 2 — Donnees de test (seed)

## Objectif
Ajouter des modeles d'equipement avec leurs champs dans `seed.sql`, et rattacher les familles existantes a ces modeles. Mettre quelques valeurs sur les equipements existants.

## Fichiers impactes
- `src-tauri/seed.sql`
- `seed.py` (ajout verifications)

## Travail a realiser

### 2.1 Modeles d'equipement

3 modeles couvrant des cas d'usage differents :

```sql
INSERT INTO modeles_equipements (nom_modele, description) VALUES
  ('Extincteur', 'Caracteristiques techniques des extincteurs'),
  ('Detecteur incendie', 'Caracteristiques des detecteurs de fumee et chaleur'),
  ('Chaudiere', 'Caracteristiques des chaudieres et generateurs de chaleur');
```

### 2.2 Champs par modele

**Extincteur :**
```sql
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles) VALUES
  (1, 'Agent extincteur', 'liste', NULL, 1, 0, 'Eau|Eau + additif|CO2|Poudre ABC|Poudre BC|Mousse'),
  (1, 'Poids de charge', 'nombre', 'kg', 1, 1, NULL),
  (1, 'Pression', 'liste', NULL, 0, 2, 'Permanente|Auxiliaire'),
  (1, 'Date derniere pesee', 'date', NULL, 0, 3, NULL),
  (1, 'NF', 'booleen', NULL, 0, 4, NULL);
```

**Detecteur incendie :**
```sql
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles) VALUES
  (2, 'Type de detection', 'liste', NULL, 1, 0, 'Optique|Thermique|Mixte|Ionique|Lineaire'),
  (2, 'Adressable', 'booleen', NULL, 0, 1, NULL),
  (2, 'Numero de boucle', 'texte', NULL, 0, 2, NULL),
  (2, 'Zone SSI', 'texte', NULL, 0, 3, NULL),
  (2, 'Sensibilite', 'liste', NULL, 0, 4, 'Standard|Haute|Basse');
```

**Chaudiere :**
```sql
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles) VALUES
  (3, 'Puissance', 'nombre', 'kW', 1, 0, NULL),
  (3, 'Combustible', 'liste', NULL, 1, 1, 'Gaz naturel|Fioul|Bois|Granules|Electrique'),
  (3, 'Pression nominale', 'nombre', 'bars', 0, 2, NULL),
  (3, 'Rendement', 'nombre', '%', 0, 3, NULL),
  (3, 'Condensation', 'booleen', NULL, 0, 4, NULL),
  (3, 'Date derniere revision', 'date', NULL, 0, 5, NULL);
```

### 2.3 Rattacher les familles existantes aux modeles

Adapter selon les familles presentes dans le seed actuel. Exemple :

```sql
-- Rattacher les familles existantes aux modeles
-- (adapter les IDs selon le seed existant)
UPDATE familles_equipements SET id_modele_equipement = 1 WHERE nom_famille = 'Extincteurs';
UPDATE familles_equipements SET id_modele_equipement = 2 WHERE nom_famille = 'Detecteurs incendie';
UPDATE familles_equipements SET id_modele_equipement = 3 WHERE nom_famille = 'Chaudieres';
```

> **Note :** verifier les noms exacts des familles dans le seed existant et adapter.

### 2.4 Valeurs d'exemple pour quelques equipements

```sql
-- Valeurs pour les equipements existants (adapter les IDs)
-- Exemple : si l'equipement 1 est un extincteur
-- INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
--   (1, 1, 'Eau + additif'),   -- Agent extincteur
--   (1, 2, '6'),               -- Poids de charge (kg)
--   (1, 3, 'Permanente'),      -- Pression
--   (1, 5, '1');               -- NF = oui
```

> **Note :** les IDs exacts dependent des INSERT precedents. Adapter au moment de l'implementation.

### 2.5 Mise a jour de `seed.py`

Ajouter les nouvelles tables a la liste de verification :

```python
for t in [..., "modeles_equipements", "champs_modele", "valeurs_equipements"]:
```

## Critere de validation
- `python seed.py` s'execute sans erreur
- Les 3 modeles sont crees avec le bon nombre de champs
- Les familles correspondantes sont rattachees
- Les valeurs d'exemple sont presentes

## Controle /borg
- Les `valeurs_possibles` sont coherentes avec le `type_champ`
- Les champs `est_obligatoire` sont pertinents (pas tout obligatoire, pas tout optionnel)
- Les ordres sont corrects (0-based, sans trou)
