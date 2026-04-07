# Etape 5 — Seed + Migration des donnees existantes

## Objectif
Migrer les donnees de test existantes : transformer les colonnes fixes (nom, marque, modele, numero_serie) en champs dynamiques dans valeurs_equipements. Mettre a jour seed.sql et seed.py.

## Fichiers impactes
- `src-tauri/seed.sql`
- `seed.py`

## Travail a realiser

### 5.1 Mise a jour des modeles existants dans le seed

Les 3 modeles existants (Extincteur, Detecteur incendie, Chaudiere) doivent etre enrichis avec les champs "universels" qui etaient avant des colonnes fixes.

**Champs a ajouter aux modeles existants :**

Pour TOUS les modeles, ajouter en tete (ordre 0, 1, 2) :
- "Designation" (texte, obligatoire, ordre 0) — c'est le "nom" de l'equipement
- Eventuellement "Marque" (texte, optionnel)
- Eventuellement "Modele" (texte, optionnel)
- Eventuellement "N° serie" (texte, optionnel)

**Mais :** chaque modele choisit ses propres champs. Un detecteur incendie n'a pas forcement de numero de serie. C'est le but du systeme dynamique.

**Proposition concrete :**

**Modele "Extincteur" :** ajouter en tete
```sql
('Designation', 'texte', NULL, 1, 0),  -- obligatoire, champ d'affichage
('Marque', 'texte', NULL, 0, 1),
('Modele', 'texte', NULL, 0, 2),
('N° serie', 'texte', NULL, 0, 3),
```
Puis les champs specifiques existants (Agent extincteur, Poids, etc.) decales en ordre 4+.

**Modele "Detecteur incendie" :** ajouter en tete
```sql
('Designation', 'texte', NULL, 1, 0),  -- obligatoire, champ d'affichage
('Marque', 'texte', NULL, 0, 1),
```
Puis les champs specifiques (Type de detection, etc.) decales.

**Modele "Chaudiere" :** ajouter en tete
```sql
('Designation', 'texte', NULL, 1, 0),  -- obligatoire, champ d'affichage
('Marque', 'texte', NULL, 0, 1),
('Modele', 'texte', NULL, 0, 2),
('N° serie', 'texte', NULL, 0, 3),
```
Puis les champs specifiques decales.

### 5.2 Creer des modeles pour les familles sans modele

Les familles qui n'avaient pas de modele dans le seed actuel :
- BAES, RIA, Colonnes seches, CTA, PAC, VMC, Tableaux electriques, Groupes electrogenes, Ascenseurs

Pour chaque, creer un modele generique avec au minimum :
```sql
INSERT INTO modeles_equipements (nom_modele, description) VALUES
    ('BAES', 'Bloc autonome eclairage securite'),
    ('RIA', 'Robinet incendie arme'),
    ...
```

Avec champs de base :
```sql
('Designation', 'texte', NULL, 1, 0),
('Marque', 'texte', NULL, 0, 1),
('Modele', 'texte', NULL, 0, 2),
```

Puis rattacher chaque famille :
```sql
UPDATE familles_equipements SET id_modele_equipement = X WHERE nom_famille = 'BAES';
```

### 5.3 Definir le champ d'affichage pour chaque modele

```sql
-- Pour chaque modele, definir le champ 'Designation' comme champ d'affichage
UPDATE modeles_equipements SET id_champ_affichage = (
    SELECT id_champ FROM champs_modele 
    WHERE id_modele_equipement = modeles_equipements.id_modele_equipement 
    AND nom_champ = 'Designation'
);
```

### 5.4 Migrer les valeurs des equipements existants

Pour chaque equipement existant, transferer les anciennes colonnes vers valeurs_equipements :

```sql
-- Transferer 'nom' → champ 'Designation' du modele de la famille
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur)
SELECT e.id_equipement, cm.id_champ, e.nom
FROM equipements_old e
JOIN familles_equipements fe ON e.id_famille = fe.id_famille
JOIN champs_modele cm ON cm.id_modele_equipement = fe.id_modele_equipement AND cm.nom_champ = 'Designation'
WHERE e.nom IS NOT NULL;

-- Transferer 'marque' → champ 'Marque'
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur)
SELECT e.id_equipement, cm.id_champ, e.marque
FROM equipements_old e
JOIN familles_equipements fe ON e.id_famille = fe.id_famille
JOIN champs_modele cm ON cm.id_modele_equipement = fe.id_modele_equipement AND cm.nom_champ = 'Marque'
WHERE e.marque IS NOT NULL;

-- Idem pour modele et numero_serie
```

> **Note :** `equipements_old` est la table temporaire avant recreation. En pratique, dans le seed on insere directement les bonnes valeurs.

### 5.5 Remplir nom_affichage

```sql
-- Apres insertion des valeurs, remplir nom_affichage depuis le champ d'affichage
UPDATE equipements SET nom_affichage = (
    SELECT ve.valeur FROM valeurs_equipements ve
    JOIN champs_modele cm ON ve.id_champ = cm.id_champ
    JOIN modeles_equipements me ON cm.id_modele_equipement = me.id_modele_equipement
    WHERE ve.id_equipement = equipements.id_equipement
    AND cm.id_champ = me.id_champ_affichage
);
```

### 5.6 Reecrire la phase 5 du seed

**AVANT :**
```sql
INSERT INTO equipements (nom, marque, modele, numero_serie, id_famille, id_local) VALUES
    ('Extincteur eau 6L #01', 'Sicli', 'Eau pulverisee 6L', 'EXT-001', 1, 6);
```

**APRES :**
```sql
-- Equipement sans colonnes fixes (juste les metadonnees)
INSERT INTO equipements (nom_affichage, id_famille, id_local) VALUES
    ('Extincteur eau 6L #01', 1, 6);

-- Puis les valeurs dynamiques
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    (1, <id_champ_designation>, 'Extincteur eau 6L #01'),
    (1, <id_champ_marque>, 'Sicli'),
    (1, <id_champ_modele>, 'Eau pulverisee 6L'),
    (1, <id_champ_serie>, 'EXT-001');
```

### 5.7 Mise a jour seed.py

- Bumper `PRAGMA user_version = 12`
- Ajouter verification des modeles pour toutes les familles :
```python
# Verifier que toutes les familles ont un modele
c = db.execute("SELECT COUNT(*) FROM familles_equipements WHERE id_modele_equipement IS NULL").fetchone()[0]
assert c == 0, f"{c} familles sans modele !"
```

## Critere de validation
- `python seed.py` s'execute sans erreur
- Toutes les familles ont un modele (0 NULL)
- Tous les modeles ont un champ d'affichage
- Tous les equipements ont un nom_affichage non vide
- Les valeurs existantes (agent extincteur, puissance chaudiere, etc.) sont preservees
- Les nouvelles valeurs (designation, marque, modele, serie) sont presentes

## Controle /borg
- Coherence des id_champ references dans valeurs_equipements
- Pas de doublon (id_equipement, id_champ)
- Tous les champs obligatoires ont une valeur pour chaque equipement
