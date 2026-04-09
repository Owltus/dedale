-- =========================================================================
-- MANTIS — Données de test (seed)
-- Scénario : Hôtel Okko Nantes
-- =========================================================================
-- Exécution : python seed.py
-- =========================================================================

PRAGMA foreign_keys = ON;

-- =========================================================================
-- PHASE 1 : LOCALISATIONS (batiments → niveaux → locaux)
-- =========================================================================

INSERT INTO batiments (nom, description) VALUES
    ('Hôtel Okko Nantes', 'Bâtiment principal — 15 bis rue de Strasbourg, 44000 Nantes');

-- Niveaux (id_batiment = 1) — 8 niveaux, données plans AURA Architectes
INSERT INTO niveaux (nom, description, id_batiment) VALUES
    ('Sous-Sol',  'Stationnement, locaux techniques — 416,80 m²',  1),  -- id 1
    ('RDC',       'Club, accueil, bien-être — 342,39 m²',          1),  -- id 2
    ('Étage 1',   '13 chambres (102-114), locaux techniques',      1),  -- id 3
    ('Étage 2',   '13 chambres (201-213), service',                1),  -- id 4
    ('Étage 3',   '14 chambres (301-315), service',                1),  -- id 5
    ('Étage 4',   '14 chambres (401-415), service',                1),  -- id 6
    ('Étage 5',   '14 chambres (501-515), bureau technique',       1),  -- id 7
    ('Étage 6',   '11 chambres (621-631), service',                1);  -- id 8

-- Locaux Sous-Sol (id_niveau = 1) — plan MAR 102
INSERT INTO locaux (nom, description, surface, id_niveau) VALUES
    ('Stationnement',     'Emplacements + circulation véhicules',  390.00, 1),  -- id 1
    ('Escalier C',        'Cage d''escalier principale',             5.30, 1),  -- id 2
    ('SAS Sous-Sol',      'SAS d''accès sous-sol',                   7.60, 1),  -- id 3
    ('Dégagement SS',     'Circulation sous-sol',                    5.20, 1),  -- id 4
    ('Local Opérateur',   'Local technique opérateur télécom',       3.40, 1),  -- id 5
    ('Local Surpresseur', 'Surpresseur réseau eau',                  5.30, 1);  -- id 6

-- Locaux RDC (id_niveau = 2) — plan MAR 103
INSERT INTO locaux (nom, description, surface, id_niveau) VALUES
    ('Club',                  'Espace principal — restauration et détente', 172.97, 2),  -- id 7
    ('Hall d''entrée',        'Accueil clients',                             22.07, 2),  -- id 8
    ('Accueil - Back Office', 'Bureau réception',                             8.19, 2),  -- id 9
    ('Bureau Directeur',      'Bureau du directeur d''exploitation',          8.40, 2),  -- id 10
    ('Bagagerie',             'Stockage bagages clients',                     4.22, 2),  -- id 11
    ('Cuisine Club',          'Cuisine du Club',                             15.00, 2),  -- id 12
    ('Chaufferie',            'Chaufferie — CTA, PAC, chaudière',            16.76, 2),  -- id 13
    ('Local poubelle',        'Zone de tri et collecte déchets',              8.73, 2),  -- id 14
    ('Lingerie Sale',         'Linge sale en attente de traitement',          5.23, 2),  -- id 15
    ('Lingerie Propre',       'Stockage linge propre',                        7.12, 2),  -- id 16
    ('Quai de livraison',     'Dégagement et quai de livraison',             16.46, 2),  -- id 17
    ('SAS d''entrée',         'SAS d''entrée principal',                      7.39, 2),  -- id 18
    ('Salle de sports',       'Espace fitness clients',                      24.89, 2),  -- id 19
    ('Vestiaire - Sauna',     'Vestiaire et sauna',                          13.57, 2),  -- id 20
    ('Sanitaires RDC',        'Sanitaires du rez-de-chaussée',               11.39, 2);  -- id 21

-- Locaux Étage 1 (id_niveau = 3) — plan MAR 104 — 13 chambres + locaux
INSERT INTO locaux (nom, description, surface, id_niveau) VALUES
    ('Chambre 102', 'Confort — côté rue',   19.07, 3),  -- id 22
    ('Chambre 104', 'Standard — côté rue',  16.57, 3),  -- id 23
    ('Chambre 106', 'Standard — côté rue',  16.57, 3),  -- id 24
    ('Chambre 108', 'Standard — côté rue',  16.57, 3),  -- id 25
    ('Chambre 110', 'Standard — côté rue',  16.57, 3),  -- id 26
    ('Chambre 112', 'Standard — côté rue',  16.57, 3),  -- id 27
    ('Chambre 114', 'Standard — côté rue',  16.57, 3),  -- id 28
    ('Chambre 103', 'Standard — côté cour', 17.60, 3),  -- id 29
    ('Chambre 105', 'Confort — côté cour',  19.00, 3),  -- id 30
    ('Chambre 107', 'Standard — côté cour', 16.52, 3),  -- id 31
    ('Chambre 109', 'Standard — côté cour', 16.52, 3),  -- id 32
    ('Chambre 111', 'Standard — côté cour', 16.52, 3),  -- id 33
    ('Chambre 113', 'Standard — côté cour', 16.52, 3),  -- id 34
    ('LOCAL TGBT',        'Tableau général basse tension',       10.95, 3),  -- id 35
    ('LOCAL VDI',         'Voix données images',                  6.34, 3),  -- id 36
    ('Vestiaire Hommes',  'Vestiaire personnel masculin',         5.30, 3),  -- id 37
    ('Réserve Club',      'Réserve du Club',                      5.60, 3),  -- id 38
    ('Dégagement E1',     'Circulation étage 1',                 40.25, 3);  -- id 39

-- Locaux Étage 2 (id_niveau = 4) — plan MAR 105 — 13 chambres + locaux
INSERT INTO locaux (nom, description, surface, id_niveau) VALUES
    ('Chambre 201', 'Confort — côté rue',   17.80, 4),  -- id 40
    ('Chambre 202', 'Confort — côté rue',   19.57, 4),  -- id 41
    ('Chambre 204', 'Standard — côté rue',  16.57, 4),  -- id 42
    ('Chambre 206', 'Standard — côté rue',  16.57, 4),  -- id 43
    ('Chambre 208', 'Standard — côté rue',  16.57, 4),  -- id 44
    ('Chambre 210', 'Standard — côté rue',  16.57, 4),  -- id 45
    ('Chambre 212', 'Standard — côté rue',  16.57, 4),  -- id 46
    ('Chambre 203', 'Standard — côté cour', 17.60, 4),  -- id 47
    ('Chambre 205', 'Confort — côté cour',  19.00, 4),  -- id 48
    ('Chambre 207', 'Standard — côté cour', 16.52, 4),  -- id 49
    ('Chambre 209', 'Standard — côté cour', 16.52, 4),  -- id 50
    ('Chambre 211', 'Standard — côté cour', 16.52, 4),  -- id 51
    ('Chambre 213', 'Standard — côté cour', 16.52, 4),  -- id 52
    ('Vestiaire Femmes',  'Vestiaire personnel féminin',          5.50, 4),  -- id 53
    ('Stock Linge',       'Stock linge propre étage',              5.60, 4),  -- id 54
    ('Dégagement E2',     'Circulation étage 2',                  40.25, 4);  -- id 55

-- Locaux Étage 3 (id_niveau = 5) — plan MAR 106 — 14 chambres + locaux
INSERT INTO locaux (nom, description, surface, id_niveau) VALUES
    ('Chambre 301', 'Confort — côté rue',   17.80, 5),  -- id 56
    ('Chambre 302', 'PMR — côté rue',       19.07, 5),  -- id 57
    ('Chambre 304', 'Standard — côté rue',  16.57, 5),  -- id 58
    ('Chambre 306', 'Standard — côté rue',  16.57, 5),  -- id 59
    ('Chambre 308', 'Standard — côté rue',  16.57, 5),  -- id 60
    ('Chambre 310', 'Standard — côté rue',  16.57, 5),  -- id 61
    ('Chambre 312', 'Standard — côté rue',  16.57, 5),  -- id 62
    ('Chambre 303', 'Standard — côté cour', 17.60, 5),  -- id 63
    ('Chambre 305', 'Confort — côté cour',  19.00, 5),  -- id 64
    ('Chambre 307', 'Standard — côté cour', 16.52, 5),  -- id 65
    ('Chambre 309', 'Standard — côté cour', 16.52, 5),  -- id 66
    ('Chambre 311', 'Standard — côté cour', 16.52, 5),  -- id 67
    ('Chambre 313', 'Standard — côté cour', 16.52, 5),  -- id 68
    ('Chambre 315', 'Standard — côté cour', 16.52, 5),  -- id 69
    ('Vestiaire ménage',  'Vestiaire personnel ménage / laverie', 5.50, 5),  -- id 70
    ('Stock Hébergement', 'Stock hébergement',                     5.60, 5),  -- id 71
    ('Dégagement E3',     'Circulation étage 3',                  40.25, 5);  -- id 72

-- Locaux Étage 4 (id_niveau = 6) — plan MAR 107 — 14 chambres + locaux
INSERT INTO locaux (nom, description, surface, id_niveau) VALUES
    ('Chambre 401', 'Confort — côté rue',   17.80, 6),  -- id 73
    ('Chambre 402', 'PMR — côté rue',       19.07, 6),  -- id 74
    ('Chambre 404', 'Standard — côté rue',  16.57, 6),  -- id 75
    ('Chambre 406', 'Standard — côté rue',  16.57, 6),  -- id 76
    ('Chambre 408', 'Standard — côté rue',  16.57, 6),  -- id 77
    ('Chambre 410', 'Standard — côté rue',  16.57, 6),  -- id 78
    ('Chambre 412', 'Standard — côté rue',  16.57, 6),  -- id 79
    ('Chambre 403', 'Standard — côté cour', 17.60, 6),  -- id 80
    ('Chambre 405', 'Confort — côté cour',  19.00, 6),  -- id 81
    ('Chambre 407', 'Standard — côté cour', 16.52, 6),  -- id 82
    ('Chambre 409', 'Standard — côté cour', 16.52, 6),  -- id 83
    ('Chambre 411', 'Standard — côté cour', 16.52, 6),  -- id 84
    ('Chambre 413', 'Standard — côté cour', 16.52, 6),  -- id 85
    ('Chambre 415', 'Standard — côté cour', 16.52, 6),  -- id 86
    ('Local Gouvernante', 'Bureau de la gouvernante',              5.50, 6),  -- id 87
    ('Stock Lingerie',    'Stock lingerie étage',                  5.60, 6),  -- id 88
    ('Dégagement E4',     'Circulation étage 4',                  40.25, 6);  -- id 89

-- Locaux Étage 5 (id_niveau = 7) — plan MAR 108 — 14 chambres + locaux
INSERT INTO locaux (nom, description, surface, id_niveau) VALUES
    ('Chambre 501', 'Confort — côté rue',   17.80, 7),  -- id 90
    ('Chambre 502', 'PMR — côté rue',       19.07, 7),  -- id 91
    ('Chambre 504', 'Standard — côté rue',  16.57, 7),  -- id 92
    ('Chambre 506', 'Standard — côté rue',  16.57, 7),  -- id 93
    ('Chambre 508', 'Standard — côté rue',  16.57, 7),  -- id 94
    ('Chambre 510', 'Standard — côté rue',  16.57, 7),  -- id 95
    ('Chambre 512', 'Standard — côté rue',  16.57, 7),  -- id 96
    ('Chambre 503', 'Premium — côté cour',  18.90, 7),  -- id 97
    ('Chambre 505', 'Confort — côté cour',  15.97, 7),  -- id 98
    ('Chambre 507', 'Standard — côté cour', 16.52, 7),  -- id 99
    ('Chambre 509', 'Standard — côté cour', 16.52, 7),  -- id 100
    ('Chambre 511', 'Standard — côté cour', 16.52, 7),  -- id 101
    ('Chambre 513', 'Standard — côté cour', 16.52, 7),  -- id 102
    ('Chambre 515', 'Standard — côté cour', 16.52, 7),  -- id 103
    ('Bureau Technique',  'Bureau du responsable technique',       5.50, 7),  -- id 104
    ('Dégagement E5',     'Circulation étage 5',                  40.25, 7);  -- id 105

-- Locaux Étage 6 (id_niveau = 8) — plan MAR 109 — 11 chambres + locaux
INSERT INTO locaux (nom, description, surface, id_niveau) VALUES
    ('Chambre 621', 'Standard — côté rue',  14.40, 8),  -- id 106
    ('Chambre 622', 'Premium — côté rue',   16.90, 8),  -- id 107
    ('Chambre 623', 'Standard — côté rue',  14.70, 8),  -- id 108
    ('Chambre 624', 'Standard — côté rue',  14.70, 8),  -- id 109
    ('Chambre 626', 'Standard — côté rue',  14.70, 8),  -- id 110
    ('Chambre 628', 'Standard — côté rue',  14.70, 8),  -- id 111
    ('Chambre 630', 'Standard — côté rue',  14.70, 8),  -- id 112
    ('Chambre 631', 'Standard — côté rue',  14.70, 8),  -- id 113
    ('Chambre 625', 'Premium — côté cour',  16.20, 8),  -- id 114
    ('Chambre 627', 'Premium — côté cour',  16.40, 8),  -- id 115
    ('Chambre 629', 'Premium — côté cour',  16.40, 8),  -- id 116
    ('Salle de repos',    'Salle de repos personnel',             10.50, 8),  -- id 117
    ('Local repassage',   'Local repassage linge',                 6.20, 8),  -- id 118
    ('Lingerie E6',       'Lingerie étage 6',                      4.20, 8),  -- id 119
    ('Dégagement E6',     'Circulation étage 6',                  43.23, 8);  -- id 120

-- =========================================================================
-- PHASE 2 : TECHNICIENS
-- =========================================================================

INSERT INTO techniciens (nom, prenom, telephone, email, id_poste, est_actif) VALUES
    ('Martin',  'Pierre', '0600000001', 'p.martin@okkohotels.com',  1, 1),
    ('Dupont',  'Lucas',  '0600000002', 'l.dupont@okkohotels.com',  2, 1);

-- =========================================================================
-- PHASE 3 : PRESTATAIRES EXTERNES
-- =========================================================================
-- id=1 "Mon Entreprise" existe déjà. On met à jour ses infos.

UPDATE prestataires SET
    libelle = 'Okko Hotels Nantes',
    description = 'Équipe technique interne',
    adresse = '15 bis, rue de Strasbourg',
    code_postal = '44000',
    ville = 'Nantes',
    telephone = '0252200070',
    email = 'nantes4401@okkohotels.com'
WHERE id_prestataire = 1;

INSERT INTO prestataires (libelle, description, ville, telephone, email) VALUES
    ('ACME Sécurité Incendie', 'Contrôles réglementaires SSI',   'Nantes', '0240000001', 'contact@acme-securite.fr'),
    ('ThermoServ',             'Maintenance CVC et thermique',    'Nantes', '0240000002', 'contact@thermoserv.fr'),
    ('TK Elevator',            'Maintenance ascenseurs',          'Paris',  '0140000001', 'sav@tk-elevator.fr');

-- =========================================================================
-- PHASE 4a : CATÉGORIES + MODÈLES D'ÉQUIPEMENT
-- =========================================================================

-- Catégories de modèles (regroupement logique sur la page modèles)
INSERT INTO categories_modeles (nom_categorie, description) VALUES
    ('Sécurité incendie',  'Équipements de détection et lutte contre le feu'),  -- id 1
    ('CVC',                'Chauffage, ventilation, climatisation'),             -- id 2
    ('Électricité',        'Distribution et production électrique'),             -- id 3
    ('Transport vertical', 'Ascenseurs et monte-charges');                       -- id 4

-- 12 modèles rattachés à leur catégorie
INSERT INTO modeles_equipements (nom_modele, description, id_categorie) VALUES
    ('Extincteur',            'Caractéristiques techniques des extincteurs',               1),  -- id 1
    ('Détecteur incendie',    'Caractéristiques des détecteurs de fumée et chaleur',       1),  -- id 2
    ('Chaudière',             'Caractéristiques des chaudières et générateurs de chaleur', 2),  -- id 3
    ('BAES',                  'Blocs autonomes d''éclairage de sécurité',                  1),  -- id 4
    ('RIA',                   'Robinets d''incendie armés',                                1),  -- id 5
    ('Colonne sèche',         'Colonnes d''alimentation pompiers',                         1),  -- id 6
    ('CTA',                   'Centrales de traitement d''air',                            2),  -- id 7
    ('PAC',                   'Pompes à chaleur',                                          2),  -- id 8
    ('VMC',                   'Ventilation mécanique contrôlée',                           2),  -- id 9
    ('Tableau électrique',    'TGBT et tableaux divisionnaires',                           3),  -- id 10
    ('Groupe électrogène',    'Alimentation de secours',                                   3),  -- id 11
    ('Ascenseur',             'Cabines et machinerie',                                     4);  -- id 12

-- =========================================================================
-- Champs des modèles (id_champ auto-incrémenté à partir de 1)
-- Total : 48 champs
-- =========================================================================

-- Modèle 1 : Extincteur (champs 1-8)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (1, 'Marque',               'texte',   NULL, 0, 0, NULL,                                                   'Desautel'),       -- id_champ 1
    (1, 'Modèle',               'texte',   NULL, 0, 1, NULL,                                                   NULL),             -- id_champ 2
    (1, 'N° série',             'texte',   NULL, 0, 2, NULL,                                                   NULL),             -- id_champ 3
    (1, 'Agent extincteur',     'liste',   NULL, 1, 3, 'Eau|Eau + additif|CO2|Poudre ABC|Poudre BC|Mousse',   'Eau + additif'),  -- id_champ 4
    (1, 'Poids de charge',      'nombre',  'kg', 1, 4, NULL,                                                   '6'),              -- id_champ 5
    (1, 'Pression',             'liste',   NULL, 0, 5, 'Permanente|Auxiliaire',                                'Permanente'),     -- id_champ 6
    (1, 'Date dernière pesée',  'date',    NULL, 0, 6, NULL,                                                   NULL),             -- id_champ 7
    (1, 'NF',                   'booleen', NULL, 0, 7, NULL,                                                   '1');              -- id_champ 8

-- Modèle 2 : Détecteur incendie (champs 9-16)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (2, 'Marque',               'texte',   NULL, 0, 0, NULL,                                           NULL),         -- id_champ 9
    (2, 'Modèle',               'texte',   NULL, 0, 1, NULL,                                           NULL),         -- id_champ 10
    (2, 'N° série',             'texte',   NULL, 0, 2, NULL,                                           NULL),         -- id_champ 11
    (2, 'Type de détection',    'liste',   NULL, 1, 3, 'Optique|Thermique|Mixte|Ionique|Linéaire',    'Optique'),    -- id_champ 12
    (2, 'Adressable',           'booleen', NULL, 0, 4, NULL,                                           '1'),          -- id_champ 13
    (2, 'Numéro de boucle',     'texte',   NULL, 0, 5, NULL,                                           NULL),         -- id_champ 14
    (2, 'Zone SSI',             'texte',   NULL, 0, 6, NULL,                                           NULL),         -- id_champ 15
    (2, 'Sensibilité',          'liste',   NULL, 0, 7, 'Standard|Haute|Basse',                        'Standard');   -- id_champ 16

-- Modèle 3 : Chaudière (champs 17-25)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (3, 'Marque',                   'texte',   NULL,   0, 0, NULL,                                              NULL),             -- id_champ 17
    (3, 'Modèle',                   'texte',   NULL,   0, 1, NULL,                                              NULL),             -- id_champ 18
    (3, 'N° série',                 'texte',   NULL,   0, 2, NULL,                                              NULL),             -- id_champ 19
    (3, 'Puissance',                'nombre',  'kW',   1, 3, NULL,                                              NULL),             -- id_champ 20
    (3, 'Combustible',              'liste',   NULL,   1, 4, 'Gaz naturel|Fioul|Bois|Granulés|Électrique',     'Gaz naturel'),    -- id_champ 21
    (3, 'Pression nominale',        'nombre',  'bars', 0, 5, NULL,                                              '3'),              -- id_champ 22
    (3, 'Rendement',                'nombre',  '%',    0, 6, NULL,                                              NULL),             -- id_champ 23
    (3, 'Condensation',             'booleen', NULL,   0, 7, NULL,                                              '1'),              -- id_champ 24
    (3, 'Date dernière révision',   'date',    NULL,   0, 8, NULL,                                              NULL);             -- id_champ 25

-- Modèle 4 : BAES (champs 26-27)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (4, 'Marque',               'texte',   NULL, 0, 0, NULL,  'Legrand'),   -- id_champ 26
    (4, 'Modèle',               'texte',   NULL, 0, 1, NULL,  NULL);        -- id_champ 27

-- Modèle 5 : RIA (champs 28-29)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (5, 'Marque',               'texte',   NULL, 0, 0, NULL,  NULL),        -- id_champ 28
    (5, 'Modèle',               'texte',   NULL, 0, 1, NULL,  NULL);        -- id_champ 29

-- Modèle 6 : Colonne sèche (champs 30-31)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (6, 'Marque',               'texte',   NULL, 0, 0, NULL,  NULL),        -- id_champ 30
    (6, 'Modèle',               'texte',   NULL, 0, 1, NULL,  NULL);        -- id_champ 31

-- Modèle 7 : CTA (champs 32-34)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (7, 'Marque',               'texte',   NULL, 0, 0, NULL,  'France Air'),-- id_champ 32
    (7, 'Modèle',               'texte',   NULL, 0, 1, NULL,  NULL),        -- id_champ 33
    (7, 'N° série',             'texte',   NULL, 0, 2, NULL,  NULL);        -- id_champ 34

-- Modèle 8 : PAC (champs 35-37)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (8, 'Marque',               'texte',   NULL, 0, 0, NULL,  'Daikin'),    -- id_champ 35
    (8, 'Modèle',               'texte',   NULL, 0, 1, NULL,  NULL),        -- id_champ 36
    (8, 'N° série',             'texte',   NULL, 0, 2, NULL,  NULL);        -- id_champ 37

-- Modèle 9 : VMC (champs 38-39)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (9, 'Marque',               'texte',   NULL, 0, 0, NULL,  'Atlantic'),  -- id_champ 38
    (9, 'Modèle',               'texte',   NULL, 0, 1, NULL,  NULL);        -- id_champ 39

-- Modèle 10 : Tableau électrique (champs 40-42)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (10, 'Marque',              'texte',   NULL, 0, 0, NULL,  'Schneider'), -- id_champ 40
    (10, 'Modèle',              'texte',   NULL, 0, 1, NULL,  NULL),        -- id_champ 41
    (10, 'N° série',            'texte',   NULL, 0, 2, NULL,  NULL);        -- id_champ 42

-- Modèle 11 : Groupe électrogène (champs 43-45)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (11, 'Marque',              'texte',   NULL, 0, 0, NULL,  NULL),        -- id_champ 43
    (11, 'Modèle',              'texte',   NULL, 0, 1, NULL,  NULL),        -- id_champ 44
    (11, 'N° série',            'texte',   NULL, 0, 2, NULL,  NULL);        -- id_champ 45

-- Modèle 12 : Ascenseur (champs 46-48)
INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES
    (12, 'Marque',              'texte',   NULL, 0, 0, NULL,  'Otis'),      -- id_champ 46
    (12, 'Modèle',              'texte',   NULL, 0, 1, NULL,  NULL),        -- id_champ 47
    (12, 'N° série',            'texte',   NULL, 0, 2, NULL,  NULL);        -- id_champ 48

-- =========================================================================
-- PHASE 4b : DOMAINES & FAMILLES ÉQUIPEMENTS
-- =========================================================================

INSERT INTO domaines_equipements (nom_domaine, description) VALUES
    ('Sécurité incendie',    'Équipements de détection et lutte contre le feu'),
    ('CVC / Climatisation',  'Chauffage, ventilation, climatisation'),
    ('Électricité',          'Distribution et production électrique'),
    ('Plomberie',            'Réseaux eau chaude/froide'),
    ('Transport vertical',   'Ascenseurs et monte-charges');

-- Familles avec rattachement modèle direct
-- famille 1 → modèle 1 (Extincteur)
-- famille 2 → modèle 4 (BAES)
-- famille 3 → modèle 5 (RIA)
-- famille 4 → modèle 6 (Colonne sèche)
-- famille 5 → modèle 7 (CTA)
-- famille 6 → modèle 8 (PAC)
-- famille 7 → modèle 9 (VMC)
-- famille 8 → modèle 10 (Tableau électrique)
-- famille 9 → modèle 11 (Groupe électrogène)
-- famille 10 → modèle 3 (Chaudière)
-- famille 11 → modèle 12 (Ascenseur)
INSERT INTO familles_equipements (nom_famille, description, id_domaine, id_modele_equipement) VALUES
    ('Extincteurs',          'Extincteurs portatifs eau et CO2',     1, 1),
    ('BAES',                 'Blocs autonomes éclairage sécurité',   1, 4),
    ('RIA',                  'Robinets d''incendie armés',           1, 5),
    ('Colonnes sèches',      'Colonnes d''alimentation pompiers',   1, 6),
    ('CTA',                  'Centrales de traitement d''air',       2, 7),
    ('PAC',                  'Pompes à chaleur',                     2, 8),
    ('VMC',                  'Ventilation mécanique contrôlée',      2, 9),
    ('Tableaux électriques', 'TGBT et tableaux divisionnaires',     3, 10),
    ('Groupes électrogènes', 'Alimentation secours',                3, 11),
    ('Chaudières',           'Production eau chaude',                4, 3),
    ('Ascenseurs',           'Cabines et machinerie',                5, 12);

-- =========================================================================
-- PHASE 5 : ÉQUIPEMENTS (~21 items)
-- nom_affichage reprend l'ancien champ nom
-- Les anciennes colonnes nom, marque, modele, numero_serie sont dans valeurs_equipements
-- =========================================================================

-- Extincteurs (famille 1) — répartis sur plusieurs locaux/niveaux
INSERT INTO equipements (nom_affichage, id_famille, id_local) VALUES
    ('Extincteur eau 6L #01', 1, 8),   -- id 1, Hall d'entrée
    ('Extincteur eau 6L #02', 1, 7),   -- id 2, Club
    ('Extincteur eau 6L #03', 1, 39),  -- id 3, Dégagement E1
    ('Extincteur CO2 2kg #01', 1, 12), -- id 4, Cuisine Club
    ('Extincteur CO2 2kg #02', 1, 35), -- id 5, LOCAL TGBT
    ('Extincteur eau 6L #04', 1, 7);   -- id 6, Club

-- BAES (famille 2)
INSERT INTO equipements (nom_affichage, id_famille, id_local) VALUES
    ('BAES Escalier C',       2, 2),   -- id 7, Escalier C
    ('BAES Dégagement E1',    2, 39),  -- id 8, Dégagement E1
    ('BAES Hall',             2, 8),   -- id 9, Hall d'entrée
    ('BAES Club',             2, 7);   -- id 10, Club

-- RIA (famille 3)
INSERT INTO equipements (nom_affichage, id_famille, id_local) VALUES
    ('RIA Hall',              3, 8),   -- id 11, Hall d'entrée
    ('RIA Dégagement E1',     3, 39);  -- id 12, Dégagement E1

-- Colonne sèche (famille 4)
INSERT INTO equipements (nom_affichage, commentaires, id_famille, id_local) VALUES
    ('Colonne sèche principale', 'Raccord pompiers en façade', 4, 18);  -- id 13, SAS d'entrée

-- CTA (famille 5)
INSERT INTO equipements (nom_affichage, id_famille, id_local, date_mise_en_service) VALUES
    ('CTA N°1 — Hall & Club', 5, 13, '2020-06-15'),  -- id 14, Chaufferie
    ('CTA N°2 — Chambres',    5, 13, '2020-06-15');   -- id 15, Chaufferie

-- PAC (famille 6)
INSERT INTO equipements (nom_affichage, id_famille, id_local, date_mise_en_service) VALUES
    ('PAC réversible', 6, 13, '2020-06-15');  -- id 16, Chaufferie

-- VMC (famille 7)
INSERT INTO equipements (nom_affichage, id_famille, id_local) VALUES
    ('VMC Double flux', 7, 13);  -- id 17, Chaufferie

-- TGBT (famille 8)
INSERT INTO equipements (nom_affichage, id_famille, id_local, date_mise_en_service) VALUES
    ('TGBT Principal', 8, 35, '2020-03-01');  -- id 18, LOCAL TGBT

-- Groupe électrogène (famille 9)
INSERT INTO equipements (nom_affichage, id_famille, id_local, date_mise_en_service) VALUES
    ('Groupe électrogène', 9, 35, '2020-03-01');  -- id 19, LOCAL TGBT

-- Chaudière (famille 10)
INSERT INTO equipements (nom_affichage, id_famille, id_local, date_mise_en_service) VALUES
    ('Chaudière gaz', 10, 13, '2020-06-15');  -- id 20, Chaufferie

-- Ascenseur (famille 11)
INSERT INTO equipements (nom_affichage, id_famille, id_local, date_mise_en_service) VALUES
    ('Ascenseur principal', 11, 8, '2020-03-01');  -- id 21, Hall d'entrée

-- =========================================================================
-- PHASE 5b : VALEURS DYNAMIQUES (anciens champs fixes → valeurs_equipements)
-- Les anciennes colonnes nom/marque/modele/numero_serie sont maintenant dans champs_modele
-- =========================================================================

-- Extincteurs (famille 1, modèle 1) : champs 1=Marque, 2=Modèle, 3=N° série
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    -- Extincteur #01 (id 1)
    (1, 1, 'Sicli'),
    (1, 2, 'Eau pulvérisée 6L'),
    (1, 3, 'EXT-001'),
    -- Extincteur #02 (id 2)
    (2, 1, 'Sicli'),
    (2, 2, 'Eau pulvérisée 6L'),
    (2, 3, 'EXT-002'),
    -- Extincteur #03 (id 3)
    (3, 1, 'Sicli'),
    (3, 2, 'Eau pulvérisée 6L'),
    (3, 3, 'EXT-003'),
    -- Extincteur CO2 #01 (id 4)
    (4, 1, 'Sicli'),
    (4, 2, 'CO2 2kg'),
    (4, 3, 'EXT-004'),
    -- Extincteur CO2 #02 (id 5)
    (5, 1, 'Sicli'),
    (5, 2, 'CO2 2kg'),
    (5, 3, 'EXT-005'),
    -- Extincteur #04 (id 6)
    (6, 1, 'Sicli'),
    (6, 2, 'Eau pulvérisée 6L'),
    (6, 3, 'EXT-006');

-- BAES (famille 2, modèle 4) : champs 26=Marque, 27=Modèle
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    -- BAES Cage escalier E1 (id 7)
    (7, 26, 'Legrand'),
    (7, 27, 'ECO 1'),
    -- BAES Couloir E1 (id 8)
    (8, 26, 'Legrand'),
    (8, 27, 'ECO 1'),
    -- BAES Hall (id 9)
    (9, 26, 'Legrand'),
    (9, 27, 'ECO 1'),
    -- BAES Restaurant (id 10)
    (10, 26, 'Legrand'),
    (10, 27, 'ECO 1');

-- RIA (famille 3, modèle 5) : champs 28=Marque, 29=Modèle
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    (11, 28, 'Desautel'),
    (11, 29, 'DN25/30m'),
    (12, 28, 'Desautel'),
    (12, 29, 'DN25/30m');

-- Colonne sèche (famille 4, modèle 6) : champs 30=Marque, 31=Modèle — pas de valeurs renseignées

-- CTA (famille 5, modèle 7) : champs 32=Marque, 33=Modèle, 34=N° série
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    (14, 32, 'France Air'),
    (14, 33, 'Duplex 3000'),
    (14, 34, 'CTA-001'),
    (15, 32, 'France Air'),
    (15, 33, 'Duplex 2000'),
    (15, 34, 'CTA-002');

-- PAC (famille 6, modèle 8) : champs 35=Marque, 36=Modèle, 37=N° série
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    (16, 35, 'Daikin'),
    (16, 36, 'RXYQ12T'),
    (16, 37, 'PAC-001');

-- VMC (famille 7, modèle 9) : champs 38=Marque, 39=Modèle
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    (17, 38, 'Aldes'),
    (17, 39, 'Dee Fly Cube 300');

-- TGBT (famille 8, modèle 10) : champs 40=Marque, 41=Modèle, 42=N° série
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    (18, 40, 'Schneider'),
    (18, 41, 'Prisma P'),
    (18, 42, 'TGBT-001');

-- Groupe électrogène (famille 9, modèle 11) : champs 43=Marque, 44=Modèle, 45=N° série
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    (19, 43, 'SDMO'),
    (19, 44, 'J130K'),
    (19, 45, 'GE-001');

-- Chaudière (famille 10, modèle 3) : champs 17=Marque, 18=Modèle, 19=N° série
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    (20, 17, 'Viessmann'),
    (20, 18, 'Vitodens 200-W'),
    (20, 19, 'CHAU-001');

-- Ascenseur (famille 11, modèle 12) : champs 46=Marque, 47=Modèle, 48=N° série
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    (21, 46, 'TK Elevator'),
    (21, 47, 'Synergy 300'),
    (21, 48, 'ASC-001');

-- Valeurs spécifiques métier pour quelques extincteurs
-- Modèle 1 : 4=Agent extincteur, 5=Poids de charge, 6=Pression, 8=NF
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    (1, 4, 'Eau + additif'),   -- Extincteur #01 : Agent
    (1, 5, '6'),               -- Extincteur #01 : Poids (kg)
    (1, 6, 'Permanente'),      -- Extincteur #01 : Pression
    (1, 8, '1'),               -- Extincteur #01 : NF = oui
    (2, 4, 'Eau + additif'),   -- Extincteur #02 : Agent
    (2, 5, '6'),               -- Extincteur #02 : Poids (kg)
    (2, 8, '1'),               -- Extincteur #02 : NF = oui
    (4, 4, 'CO2'),             -- Extincteur CO2 #01 : Agent
    (4, 5, '2'),               -- Extincteur CO2 #01 : Poids (kg)
    (4, 6, 'Permanente'),      -- Extincteur CO2 #01 : Pression
    (4, 8, '1');               -- Extincteur CO2 #01 : NF = oui

-- Valeurs spécifiques métier pour la chaudière (id_equipement = 20)
-- Modèle 3 : 20=Puissance, 21=Combustible, 22=Pression nominale, 23=Rendement, 24=Condensation
INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) VALUES
    (20, 20, '150'),            -- Puissance (kW)
    (20, 21, 'Gaz naturel'),    -- Combustible
    (20, 22, '3'),              -- Pression nominale (bars)
    (20, 23, '96'),             -- Rendement (%)
    (20, 24, '1');              -- Condensation = oui

-- =========================================================================
-- PHASE 6 : DOMAINES & FAMILLES GAMMES
-- =========================================================================

INSERT INTO domaines_gammes (nom_domaine, description) VALUES
    ('Sécurité incendie',    'Gammes SSI réglementaires et préventives'),
    ('CVC / Climatisation',  'Maintenance thermique et aéraulique'),
    ('Électricité',          'Contrôles et tests électriques'),
    ('Plomberie',            'Entretien réseaux et production ECS'),
    ('Transport vertical',   'Maintenance ascenseurs');

INSERT INTO familles_gammes (nom_famille, description, id_domaine_gamme) VALUES
    ('Extincteurs',          'Vérification et recharge',         1),
    ('BAES',                 'Suivi et contrôle éclairage sécu',  1),
    ('RIA',                  'Vérification robinets incendie',   1),
    ('Colonnes sèches',      'Contrôle colonnes alimentation',  1),
    ('Entretien CTA',        'Maintenance centrales air',        2),
    ('Révision PAC',         'Maintenance pompes à chaleur',     2),
    ('Nettoyage VMC',        'Entretien ventilation',            2),
    ('Vérification TGBT',    'Contrôle tableaux électriques',    3),
    ('Test GE',              'Tests groupes électrogènes',       3),
    ('Entretien chaudière',  'Maintenance production ECS',       4),
    ('Maintenance ascenseur','Entretien cabine et machinerie',   5);

-- =========================================================================
-- PHASE 7 : GAMMES (~13)
-- Périodicités existantes : 1=Hebdo, 3=Mensuel, 6=Trimestriel, 8=Semestriel, 9=Annuel
-- Prestataires : 1=Interne, 2=ACME Sécurité, 3=ThermoServ, 4=TK Elevator
-- =========================================================================

INSERT INTO gammes (nom_gamme, description, est_reglementaire, id_periodicite, id_famille_gamme, id_prestataire) VALUES
    ('Contrôle extincteurs',        'Vérification annuelle réglementaire des extincteurs',         1, 9, 1, 2),
    ('Suivi BAES hebdomadaire',     'Vérification hebdomadaire du fonctionnement des BAES',        0, 1, 2, 1),
    ('Contrôle BAES semestriel',    'Contrôle réglementaire autonomie 1h des BAES',                1, 8, 2, 2),
    ('Vérification RIA',            'Contrôle annuel réglementaire des RIA',                       1, 9, 3, 2),
    ('Contrôle colonnes sèches',    'Vérification annuelle des colonnes sèches',                   1, 9, 4, 2),
    ('Entretien CTA N°1',           'Maintenance trimestrielle CTA Hall & Club',                   0, 6, 5, 3),
    ('Entretien CTA N°2',           'Maintenance trimestrielle CTA Chambres',                      0, 6, 5, 3),
    ('Révision PAC',                'Révision semestrielle pompe à chaleur réversible',            0, 8, 6, 3),
    ('Vérification TGBT',           'Contrôle semestriel du tableau général basse tension',        0, 8, 8, 1),
    ('Test groupe électrogène',     'Test mensuel de démarrage et fonctionnement du GE',           0, 3, 9, 1),
    ('Détartrage chaudière',        'Entretien annuel chaudière gaz',                              0, 9, 10, 3),
    ('Maintenance ascenseur',       'Entretien mensuel réglementaire ascenseur',                   1, 3, 11, 4),
    ('Nettoyage VMC',               'Nettoyage annuel gaines et caissons VMC',                     0, 9, 7, 3);

-- =========================================================================
-- PHASE 8 : OPÉRATIONS (~30)
-- Types : 1=Vérification, 2=Contrôle réglementaire, 3=Entretien, 4=Mesure, 5=Réglage
-- Unités : 1=°C, 2=%, 7=h
-- =========================================================================

-- Contrôle extincteurs (gamme 1)
INSERT INTO operations (nom_operation, description, id_type_operation, id_gamme) VALUES
    ('Vérifier plombage et goupille',       'Contrôle visuel intégrité scellé',           2, 1),
    ('Vérifier pression manomètre',         'Pression dans la zone verte',                2, 1),
    ('Vérifier accessibilité et signalétique','Extincteur visible et accessible',          1, 1);

-- Suivi BAES hebdo (gamme 2)
INSERT INTO operations (nom_operation, id_type_operation, id_gamme) VALUES
    ('Vérifier allumage des BAES',          1, 2),
    ('Signaler toute anomalie',             1, 2);

-- Contrôle BAES semestriel (gamme 3)
INSERT INTO operations (nom_operation, description, id_type_operation, id_gamme) VALUES
    ('Test autonomie 1h en coupure secteur', 'Couper le secteur et vérifier tenue 1h',   2, 3),
    ('Vérifier état des batteries',          'Contrôle visuel et mesure tension',         2, 3);

-- Vérification RIA (gamme 4)
INSERT INTO operations (nom_operation, id_type_operation, id_gamme) VALUES
    ('Dérouler intégralement le tuyau',     2, 4),
    ('Vérifier pression au robinet',        2, 4),
    ('Vérifier état du tuyau et du robinet',1, 4);

-- Contrôle colonnes sèches (gamme 5)
INSERT INTO operations (nom_operation, id_type_operation, id_gamme) VALUES
    ('Vérifier raccords et bouchons',       2, 5),
    ('Tester étanchéité sous pression',     2, 5);

-- Entretien CTA N°1 (gamme 6)
INSERT INTO operations (nom_operation, description, id_type_operation, id_gamme, seuil_minimum, seuil_maximum, id_unite) VALUES
    ('Contrôler filtres',                   'Nettoyage ou remplacement si encrassés',    3, 6, NULL, NULL, NULL),
    ('Mesurer température soufflage',       'Température air soufflé',                   4, 6, 18, 24, 1),
    ('Vérifier courroies et roulements',    NULL,                                        1, 6, NULL, NULL, NULL);

-- Entretien CTA N°2 (gamme 7)
INSERT INTO operations (nom_operation, id_type_operation, id_gamme, seuil_minimum, seuil_maximum, id_unite) VALUES
    ('Contrôler filtres',                   3, 7, NULL, NULL, NULL),
    ('Mesurer température soufflage',       4, 7, 18, 24, 1),
    ('Vérifier courroies et roulements',    1, 7, NULL, NULL, NULL);

-- Révision PAC (gamme 8)
INSERT INTO operations (nom_operation, id_type_operation, id_gamme, seuil_minimum, seuil_maximum, id_unite) VALUES
    ('Contrôler niveau fluide frigorigène',  1, 8, NULL, NULL, NULL),
    ('Mesurer COP',                         4, 8, 3.0, 5.0, 2),
    ('Nettoyer échangeurs',                 3, 8, NULL, NULL, NULL);

-- Vérification TGBT (gamme 9)
INSERT INTO operations (nom_operation, id_type_operation, id_gamme) VALUES
    ('Vérifier serrage connexions',         1, 9),
    ('Tester différentiels',                2, 9),
    ('Contrôler thermographie',             1, 9);

-- Test GE (gamme 10)
INSERT INTO operations (nom_operation, description, id_type_operation, id_gamme, seuil_minimum, seuil_maximum, id_unite) VALUES
    ('Démarrage et montée en charge',       'Test 15 min sous charge',                   1, 10, NULL, NULL, NULL),
    ('Relever compteur horaire',            'Heures de fonctionnement',                  4, 10, NULL, NULL, 7);

-- Détartrage chaudière (gamme 11)
INSERT INTO operations (nom_operation, id_type_operation, id_gamme, seuil_minimum, seuil_maximum, id_unite) VALUES
    ('Détartrer corps de chauffe',          3, 11, NULL, NULL, NULL),
    ('Mesurer température ECS',             4, 11, 55, 65, 1),
    ('Vérifier soupape sécurité',           1, 11, NULL, NULL, NULL);

-- Maintenance ascenseur (gamme 12)
INSERT INTO operations (nom_operation, id_type_operation, id_gamme) VALUES
    ('Vérifier nivelage cabine',            1, 12),
    ('Graisser guides et câbles',           3, 12),
    ('Tester dispositifs de sécurité',      2, 12);

-- Nettoyage VMC (gamme 13)
INSERT INTO operations (nom_operation, id_type_operation, id_gamme) VALUES
    ('Nettoyer caissons et gaines',         3, 13),
    ('Vérifier moteur extracteur',          1, 13);

-- =========================================================================
-- PHASE 9 : LIAISONS GAMMES ↔ ÉQUIPEMENTS
-- =========================================================================

-- Contrôle extincteurs (gamme 1) → tous les extincteurs
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6);

-- Suivi BAES hebdo (gamme 2) → tous les BAES
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (2, 7), (2, 8), (2, 9), (2, 10);

-- Contrôle BAES semestriel (gamme 3) → tous les BAES
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (3, 7), (3, 8), (3, 9), (3, 10);

-- Vérification RIA (gamme 4) → tous les RIA
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (4, 11), (4, 12);

-- Contrôle colonnes sèches (gamme 5) → colonne sèche
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (5, 13);

-- Entretien CTA N°1 (gamme 6) → CTA N°1
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (6, 14);

-- Entretien CTA N°2 (gamme 7) → CTA N°2
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (7, 15);

-- Révision PAC (gamme 8) → PAC
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (8, 16);

-- Vérification TGBT (gamme 9) → TGBT
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (9, 18);

-- Test GE (gamme 10) → Groupe électrogène
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (10, 19);

-- Détartrage chaudière (gamme 11) → Chaudière
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (11, 20);

-- Maintenance ascenseur (gamme 12) → Ascenseur
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (12, 21);

-- Nettoyage VMC (gamme 13) → VMC
INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES
    (13, 17);

-- =========================================================================
-- PHASE 10 : CONTRATS EXTERNES
-- Types : 1=Déterminé, 2=Tacite, 3=Indéterminé
-- Tacite reconduction : pas de date_fin, duree_cycle_mois renseigné
-- =========================================================================

-- Contrat ACME Sécurité (prestataire 2) — tacite reconduction annuelle, SSI
INSERT INTO contrats (id_prestataire, id_type_contrat, reference, date_signature, date_debut, duree_cycle_mois, delai_preavis_jours, commentaires) VALUES
    (2, 2, 'Maintenance SSI', '2024-01-15', '2024-02-01', 12, 90, 'Contrat SSI tacite reconduction annuelle — extincteurs, BAES, RIA, colonnes sèches');

-- Contrat ThermoServ (prestataire 3) — tacite reconduction annuelle, CVC
INSERT INTO contrats (id_prestataire, id_type_contrat, reference, date_signature, date_debut, duree_cycle_mois, delai_preavis_jours, commentaires) VALUES
    (3, 2, 'Maintenance CVC', '2025-01-10', '2025-02-01', 12, 60, 'Contrat CVC tacite reconduction — CTA, PAC, VMC, chaudière');

-- Contrat TK Elevator (prestataire 4) — tacite reconduction, maintenance ascenseur
INSERT INTO contrats (id_prestataire, id_type_contrat, reference, date_signature, date_debut, duree_cycle_mois, delai_preavis_jours, commentaires) VALUES
    (4, 2, 'Maintenance ascenseurs', '2020-03-01', '2020-04-01', 12, 90, 'Contrat ascenseur tacite reconduction — maintenance réglementaire mensuelle');

-- Liaisons contrats ↔ gammes réglementaires
INSERT INTO contrats_gammes (id_contrat, id_gamme) VALUES
    (2, 1),   -- ACME ↔ Contrôle extincteurs
    (2, 3),   -- ACME ↔ Contrôle BAES semestriel
    (2, 4),   -- ACME ↔ Vérification RIA
    (2, 5),   -- ACME ↔ Contrôle colonnes sèches
    (3, 6),   -- ThermoServ ↔ Entretien CTA N°1
    (3, 7),   -- ThermoServ ↔ Entretien CTA N°2
    (3, 8),   -- ThermoServ ↔ Révision PAC
    (3, 11),  -- ThermoServ ↔ Détartrage chaudière
    (3, 13),  -- ThermoServ ↔ Nettoyage VMC
    (4, 12);  -- TK Elevator ↔ Maintenance ascenseur

-- =========================================================================
-- PHASE 10b : GAMMES TYPES (modèles réutilisables d'opérations)
-- Les gammes types sont des templates d'opérations qu'on associe aux gammes
-- via gamme_modeles. Le trigger creation_ot_complet génère les ops
-- depuis les modeles_operations_items (id_type_source = 2) en plus des ops spécifiques.
-- Types opérations : 1=Vérification, 2=Contrôle régl., 3=Entretien, 4=Mesure, 5=Réglage
-- =========================================================================

-- Gamme type 1 : Contrôle visuel SSI (réutilisé par extincteurs, RIA, colonnes sèches)
INSERT INTO modeles_operations (nom_modele, description) VALUES
    ('Contrôle visuel SSI', 'Vérifications visuelles communes à tous les équipements SSI');
INSERT INTO modeles_operations_items (nom_operation, description, id_type_operation, id_modele_operation) VALUES
    ('Vérifier signalétique et affichage', 'Conformité des panneaux et pictogrammes', 1, 1),
    ('Vérifier accessibilité',             'Équipement non obstrué et accessible',    1, 1);

-- Gamme type 2 : Contrôle thermique CVC (réutilisé par CTA, PAC, chaudière)
INSERT INTO modeles_operations (nom_modele, description) VALUES
    ('Contrôle thermique CVC', 'Mesures thermiques communes aux équipements CVC');
INSERT INTO modeles_operations_items (nom_operation, description, id_type_operation, id_modele_operation, seuil_minimum, seuil_maximum, id_unite) VALUES
    ('Mesurer température départ',  'Température du circuit départ',  4, 2, 35, 65, 1),
    ('Mesurer température retour',  'Température du circuit retour',  4, 2, 25, 55, 1);

-- Gamme type 3 : Vérification électrique (réutilisé par TGBT, GE)
INSERT INTO modeles_operations (nom_modele, description) VALUES
    ('Vérification électrique', 'Contrôles électriques communs aux équipements de distribution');
INSERT INTO modeles_operations_items (nom_operation, description, id_type_operation, id_modele_operation) VALUES
    ('Vérifier état des câblages',    'Contrôle visuel de l''état des câbles et connexions', 1, 3),
    ('Contrôler ventilation armoire', 'Ventilation correcte des armoires électriques',       1, 3);

-- Liaisons gamme_modeles : associer les gammes types aux gammes
-- Contrôle visuel SSI (gamme type 1) → Extincteurs (gamme 1), RIA (gamme 4), Colonnes sèches (gamme 5)
INSERT INTO gamme_modeles (id_gamme, id_modele_operation) VALUES
    (1, 1),   -- Contrôle extincteurs ← Contrôle visuel SSI
    (4, 1),   -- Vérification RIA ← Contrôle visuel SSI
    (5, 1);   -- Contrôle colonnes sèches ← Contrôle visuel SSI

-- Contrôle thermique CVC (gamme type 2) → CTA N°1 (gamme 6), CTA N°2 (gamme 7), PAC (gamme 8), Chaudière (gamme 11)
INSERT INTO gamme_modeles (id_gamme, id_modele_operation) VALUES
    (6, 2),   -- Entretien CTA N°1 ← Contrôle thermique CVC
    (7, 2),   -- Entretien CTA N°2 ← Contrôle thermique CVC
    (8, 2),   -- Révision PAC ← Contrôle thermique CVC
    (11, 2);  -- Détartrage chaudière ← Contrôle thermique CVC

-- Vérification électrique (gamme type 3) → TGBT (gamme 9), GE (gamme 10)
INSERT INTO gamme_modeles (id_gamme, id_modele_operation) VALUES
    (9, 3),   -- Vérification TGBT ← Vérification électrique
    (10, 3);  -- Test GE ← Vérification électrique

-- =========================================================================
-- PHASE 11 : ORDRES DE TRAVAIL (37 OT)
-- Le trigger creation_ot_complet remplit les snapshots et génère les opérations
-- Priorités : 1=Urgente, 2=Haute, 3=Normale, 4=Basse
-- Techniciens : 1=Martin Pierre, 2=Dupont Lucas
-- =========================================================================

-- OT 1 : Suivi BAES semaine 1 (janvier)
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 2, g.id_prestataire, '2026-01-05', 3, 2, 'Suivi BAES semaine 1', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 2;

-- OT 2 : Test GE janvier
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 10, g.id_prestataire, '2026-01-08', 3, 2, 'Test GE janvier', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 10;

-- OT 3 : Suivi BAES semaine 2
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 2, g.id_prestataire, '2026-01-12', 3, 2, 'Suivi BAES semaine 2', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 2;

-- OT 4 : Maintenance ascenseur janvier (externe TK Elevator)
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 12, g.id_prestataire, '2026-01-15', 3, NULL, 'Maintenance ascenseur janvier', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 12;

-- OT 5 : Suivi BAES semaine 3
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 2, g.id_prestataire, '2026-01-19', 3, 2, 'Suivi BAES semaine 3', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 2;

-- OT 6 : Suivi BAES semaine 4
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 2, g.id_prestataire, '2026-01-26', 3, 2, 'Suivi BAES semaine 4', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 2;

-- OT 7 : Test GE février
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 10, g.id_prestataire, '2026-02-05', 3, 2, 'Test GE février', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 10;

-- OT 8 : Maintenance ascenseur février
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 12, g.id_prestataire, '2026-02-12', 3, NULL, 'Maintenance ascenseur février', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 12;

-- OT 9 : Entretien CTA N°1 — T1
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 6, g.id_prestataire, '2026-02-15', 3, NULL, 'Entretien CTA N°1 — T1', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 6;

-- OT 10 : Entretien CTA N°2 — T1
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 7, g.id_prestataire, '2026-02-16', 3, NULL, 'Entretien CTA N°2 — T1', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 7;

-- OT 11 : Vérification TGBT — S1 (haute priorité, technicien interne)
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 9, g.id_prestataire, '2026-03-01', 2, 1, 'Vérification TGBT — S1', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 9;

-- OT 12 : Test GE mars
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 10, g.id_prestataire, '2026-03-05', 3, 2, 'Test GE mars', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 10;

-- OT 13 : Maintenance ascenseur mars (sera réouvert)
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 12, g.id_prestataire, '2026-03-12', 3, NULL, 'Maintenance ascenseur mars', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 12;

-- OT 14 : Révision PAC — S1
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 8, g.id_prestataire, '2026-03-15', 3, NULL, 'Révision PAC — S1', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 8;

-- OT 15 : Nettoyage VMC — reporté (sera annulé)
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 13, g.id_prestataire, '2026-03-20', 3, NULL, 'Nettoyage VMC — reporté', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 13;

-- OT 16 : Suivi BAES en retard (reste planifié, date passée)
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 2, g.id_prestataire, '2026-03-23', 3, 2, 'Suivi BAES en retard', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 2;

-- OT 17 : Test GE en retard (reste planifié, date passée)
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 10, g.id_prestataire, '2026-03-28', 3, 2, 'Test GE en retard', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 10;

-- OT 18 : Contrôle extincteurs annuel 2026 (haute priorité)
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 1, g.id_prestataire, '2026-04-01', 2, NULL, 'Contrôle extincteurs annuel 2026', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 1;

-- OT 19 : Vérification RIA annuel 2026 (haute priorité)
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 4, g.id_prestataire, '2026-04-02', 2, NULL, 'Vérification RIA annuel 2026', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 4;

-- OT 20 : Maintenance ascenseur avril
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 12, g.id_prestataire, '2026-04-03', 3, NULL, 'Maintenance ascenseur avril', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 12;

-- OT 21-37 : OT futurs (planifiés, pas encore exécutés)

-- OT 21 : Contrôle colonnes sèches annuel
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 5, g.id_prestataire, '2026-04-10', 3, NULL, 'Contrôle colonnes sèches annuel', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 5;

-- OT 22 : Contrôle BAES semestriel — S1
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 3, g.id_prestataire, '2026-04-15', 3, NULL, 'Contrôle BAES semestriel — S1', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 3;

-- OT 23 : Test GE mai
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 10, g.id_prestataire, '2026-05-05', 3, 2, 'Test GE mai', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 10;

-- OT 24 : Maintenance ascenseur mai
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 12, g.id_prestataire, '2026-05-07', 3, NULL, 'Maintenance ascenseur mai', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 12;

-- OT 25 : Entretien CTA N°1 — T2
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 6, g.id_prestataire, '2026-05-15', 3, NULL, 'Entretien CTA N°1 — T2', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 6;

-- OT 26 : Entretien CTA N°2 — T2
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 7, g.id_prestataire, '2026-05-16', 3, NULL, 'Entretien CTA N°2 — T2', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 7;

-- OT 27 : Test GE juin
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 10, g.id_prestataire, '2026-06-05', 3, 2, 'Test GE juin', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 10;

-- OT 28 : Maintenance ascenseur juin
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 12, g.id_prestataire, '2026-06-11', 3, NULL, 'Maintenance ascenseur juin', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 12;

-- OT 29 : Entretien CTA N°1 — T3
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 6, g.id_prestataire, '2026-08-15', 3, NULL, 'Entretien CTA N°1 — T3', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 6;

-- OT 30 : Entretien CTA N°2 — T3
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 7, g.id_prestataire, '2026-08-16', 3, NULL, 'Entretien CTA N°2 — T3', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 7;

-- OT 31 : Révision PAC — S2
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 8, g.id_prestataire, '2026-09-15', 3, NULL, 'Révision PAC — S2', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 8;

-- OT 32 : Vérification TGBT — S2
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 9, g.id_prestataire, '2026-09-01', 2, 1, 'Vérification TGBT — S2', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 9;

-- OT 33 : Contrôle BAES semestriel — S2
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 3, g.id_prestataire, '2026-10-15', 3, NULL, 'Contrôle BAES semestriel — S2', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 3;

-- OT 34 : Détartrage chaudière annuel
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 11, g.id_prestataire, '2026-10-20', 3, NULL, 'Détartrage chaudière annuel', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 11;

-- OT 35 : Nettoyage VMC annuel
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 13, g.id_prestataire, '2026-11-10', 3, NULL, 'Nettoyage VMC annuel', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 13;

-- OT 36 : Entretien CTA N°1 — T4
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 6, g.id_prestataire, '2026-11-15', 3, NULL, 'Entretien CTA N°1 — T4', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 6;

-- OT 37 : Entretien CTA N°2 — T4
INSERT INTO ordres_travail (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, commentaires, nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides)
SELECT 7, g.id_prestataire, '2026-11-16', 3, NULL, 'Entretien CTA N°2 — T4', g.nom_gamme, g.est_reglementaire, p.libelle, p.jours_periodicite, p.jours_valide FROM gammes g JOIN periodicites p ON g.id_periodicite = p.id_periodicite WHERE g.id_gamme = 7;

-- =========================================================================
-- PHASE 12 : CLÔTURE / ANNULATION / RÉOUVERTURE DES OT PASSÉS
-- Statuts opération : 1=À faire, 2=En cours, 3=Terminée, 4=Annulée (sys), 5=Non applicable
-- IMPORTANT : les mesures DOIVENT être faites AVANT la clôture (trigger bloque sinon)
-- =========================================================================

-- OT 1 : Suivi BAES semaine 1 — clôturé 2026-01-05
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-01-05' WHERE id_ordre_travail = 1;

-- OT 2 : Test GE janvier — mesure compteur puis clôturé 2026-01-08
UPDATE operations_execution SET valeur_mesuree = 330 WHERE id_ordre_travail = 2 AND nom_operation = 'Relever compteur horaire';
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-01-08' WHERE id_ordre_travail = 2;

-- OT 3 : Suivi BAES semaine 2 — clôturé 2026-01-12
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-01-12' WHERE id_ordre_travail = 3;

-- OT 4 : Maintenance ascenseur janvier — clôturé 2026-01-15
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-01-15' WHERE id_ordre_travail = 4;

-- OT 5 : Suivi BAES semaine 3 — clôturé 2026-01-19
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-01-19' WHERE id_ordre_travail = 5;

-- OT 6 : Suivi BAES semaine 4 — clôturé 2026-01-26
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-01-26' WHERE id_ordre_travail = 6;

-- OT 7 : Test GE février — mesure compteur puis clôturé 2026-02-05
UPDATE operations_execution SET valeur_mesuree = 335 WHERE id_ordre_travail = 7 AND nom_operation = 'Relever compteur horaire';
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-02-05' WHERE id_ordre_travail = 7;

-- OT 8 : Maintenance ascenseur février — clôturé 2026-02-12
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-02-12' WHERE id_ordre_travail = 8;

-- OT 9 : Entretien CTA N°1 — T1 — mesures thermiques puis clôturé 2026-02-15
UPDATE operations_execution SET valeur_mesuree = 21.5 WHERE id_ordre_travail = 9 AND nom_operation = 'Mesurer température soufflage';
UPDATE operations_execution SET valeur_mesuree = 42.0 WHERE id_ordre_travail = 9 AND nom_operation = 'Mesurer température départ';
UPDATE operations_execution SET valeur_mesuree = 35.0 WHERE id_ordre_travail = 9 AND nom_operation = 'Mesurer température retour';
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-02-15' WHERE id_ordre_travail = 9 AND id_statut_operation = 1;

-- OT 10 : Entretien CTA N°2 — T1 — mesures thermiques puis clôturé 2026-02-16
UPDATE operations_execution SET valeur_mesuree = 20.8 WHERE id_ordre_travail = 10 AND nom_operation = 'Mesurer température soufflage';
UPDATE operations_execution SET valeur_mesuree = 40.5 WHERE id_ordre_travail = 10 AND nom_operation = 'Mesurer température départ';
UPDATE operations_execution SET valeur_mesuree = 33.0 WHERE id_ordre_travail = 10 AND nom_operation = 'Mesurer température retour';
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-02-16' WHERE id_ordre_travail = 10 AND id_statut_operation = 1;

-- OT 11 : Vérification TGBT — S1 — clôturé 2026-03-01 avec commentaire
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-03-01', commentaires = 'Serrage OK, différentiels conformes' WHERE id_ordre_travail = 11;

-- OT 12 : Test GE mars — mesure compteur puis clôturé 2026-03-05
UPDATE operations_execution SET valeur_mesuree = 342 WHERE id_ordre_travail = 12 AND nom_operation = 'Relever compteur horaire';
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-03-05' WHERE id_ordre_travail = 12;

-- OT 13 : Maintenance ascenseur mars — clôturé puis réouvert
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-03-12' WHERE id_ordre_travail = 13;
UPDATE ordres_travail SET id_statut_ot = 5 WHERE id_ordre_travail = 13;

-- OT 14 : Révision PAC — S1 — mesures COP et thermiques puis clôturé 2026-03-15
UPDATE operations_execution SET valeur_mesuree = 4.2 WHERE id_ordre_travail = 14 AND nom_operation = 'Mesurer COP';
UPDATE operations_execution SET valeur_mesuree = 48.0 WHERE id_ordre_travail = 14 AND nom_operation = 'Mesurer température départ';
UPDATE operations_execution SET valeur_mesuree = 38.0 WHERE id_ordre_travail = 14 AND nom_operation = 'Mesurer température retour';
UPDATE operations_execution SET id_statut_operation = 3, date_execution = '2026-03-15' WHERE id_ordre_travail = 14 AND id_statut_operation = 1;

-- OT 15 : Nettoyage VMC — annulé (toutes les opérations passées en Non applicable)
UPDATE operations_execution SET id_statut_operation = 5 WHERE id_ordre_travail = 15;

-- =========================================================================
-- PHASE 13 : DEMANDES D''INTERVENTION (9 DI)
-- Types DI : 1=Sécurité, 2=Confort, 3=Fonctionnement
-- Statuts DI : 1=Ouverte, 2=Résolue, 3=Réouverte
-- Le trigger force id_statut_di = 1 à la création
-- =========================================================================

-- DI 1 : BAES défaillant escalier C — résolue
INSERT INTO demandes_intervention (id_prestataire, libelle_constat, description_constat, date_constat)
VALUES (2, 'BAES escalier C défaillant', 'Le BAES de l''escalier C ne s''allume plus lors des tests hebdomadaires. Voyant de charge éteint.', '2026-01-20');
INSERT INTO di_localisations (id_di, id_local) VALUES (1, 2);
INSERT INTO di_gammes (id_di, id_gamme) VALUES (1, 2);
UPDATE demandes_intervention SET id_statut_di = 2, description_resolution = 'Batterie remplacée, test de fonctionnement OK.', date_resolution = '2026-01-23' WHERE id_di = 1;

-- DI 2 : Fuite d''eau sous la CTA N°1 — résolue
INSERT INTO demandes_intervention (id_prestataire, libelle_constat, description_constat, date_constat)
VALUES (3, 'Fuite d''eau sous la CTA N°1', 'Flaque d''eau constatée sous la CTA N°1 dans la chaufferie. Possible fuite du bac à condensats.', '2026-02-10');
INSERT INTO di_localisations (id_di, id_local) VALUES (2, 13);
INSERT INTO di_gammes (id_di, id_gamme) VALUES (2, 6);
UPDATE demandes_intervention SET id_statut_di = 2, description_resolution = 'Bac à condensats percé, remplacé par ThermoServ lors de l''entretien trimestriel.', date_resolution = '2026-02-15' WHERE id_di = 2;

-- DI 3 : Bruit anormal ascenseur — résolue
INSERT INTO demandes_intervention (id_prestataire, libelle_constat, description_constat, date_constat)
VALUES (4, 'Bruit anormal ascenseur', 'Bruit métallique lors de l''arrêt en cabine au RDC. Signalé par plusieurs clients.', '2026-03-08');
INSERT INTO di_localisations (id_di, id_local) VALUES (3, 8);
INSERT INTO di_gammes (id_di, id_gamme) VALUES (3, 12);
UPDATE demandes_intervention SET id_statut_di = 2, description_resolution = 'Patins de guidage usés, remplacés par TK Elevator.', date_resolution = '2026-03-12' WHERE id_di = 3;

-- DI 4 : Extincteur cuisine périmé — résolue puis réouverte
INSERT INTO demandes_intervention (id_prestataire, libelle_constat, description_constat, date_constat)
VALUES (2, 'Extincteur cuisine périmé', 'L''extincteur CO2 de la cuisine affiche une date de péremption dépassée (12/2025). Non conforme.', '2026-03-15');
INSERT INTO di_localisations (id_di, id_local) VALUES (4, 12);
INSERT INTO di_gammes (id_di, id_gamme) VALUES (4, 1);
UPDATE demandes_intervention SET id_statut_di = 2, description_resolution = 'Extincteur remplacé provisoirement par un modèle de prêt.', date_resolution = '2026-03-18' WHERE id_di = 4;
UPDATE demandes_intervention SET id_statut_di = 3 WHERE id_di = 4;

-- DI 5 : Disjonction répétée stock linge E2 — ouverte
INSERT INTO demandes_intervention (libelle_constat, description_constat, date_constat)
VALUES ('Disjonction répétée stock linge E2', 'Le disjoncteur du local stock linge E2 saute régulièrement lorsque l''aspirateur industriel est branché. Vérifier le circuit.', '2026-03-25');
INSERT INTO di_localisations (id_di, id_local) VALUES (5, 54);

-- DI 6 : Odeur de brûlé parking souterrain — ouverte
INSERT INTO demandes_intervention (libelle_constat, description_constat, date_constat)
VALUES ('Odeur de brûlé parking souterrain', 'Odeur de brûlé signalée par le personnel au niveau du stationnement sous-sol, côté local opérateur. À investiguer en urgence.', '2026-04-01');
INSERT INTO di_localisations (id_di, id_local) VALUES (6, 1);

-- DI 7 : Pression RIA hall insuffisante — ouverte
INSERT INTO demandes_intervention (id_prestataire, libelle_constat, description_constat, date_constat)
VALUES (2, 'Pression RIA hall insuffisante', 'Lors du contrôle visuel, la pression au manomètre du RIA du hall semble faible. À vérifier avec le contrôle annuel.', '2026-04-02');
INSERT INTO di_localisations (id_di, id_local) VALUES (7, 8);
INSERT INTO di_gammes (id_di, id_gamme) VALUES (7, 4);

-- DI 8 : Température chambres E3 trop basse — résolue
INSERT INTO demandes_intervention (id_prestataire, libelle_constat, description_constat, date_constat)
VALUES (3, 'Température chambres E3 trop basse', 'Plusieurs clients de l''étage 3 se plaignent de températures trop basses dans les chambres malgré le chauffage activé.', '2026-02-01');
INSERT INTO di_localisations (id_di, id_local) VALUES (8, 72);
UPDATE demandes_intervention SET id_statut_di = 2, description_resolution = 'Vanne 3 voies du circuit E3 bloquée en position fermée. Débloquée et réglée.', date_resolution = '2026-02-06' WHERE id_di = 8;

-- DI 9 : Ventilation faible sanitaires RDC — ouverte
INSERT INTO demandes_intervention (libelle_constat, description_constat, date_constat)
VALUES ('Ventilation faible sanitaires RDC', 'Débit d''air très faible dans les sanitaires du RDC. Buée persistante et odeurs. Possible encrassement gaines VMC.', '2026-03-30');
INSERT INTO di_localisations (id_di, id_local) VALUES (9, 21);
INSERT INTO di_gammes (id_di, id_gamme) VALUES (9, 13);

-- =========================================================================
-- PHASE 14 : LIAISONS DI ↔ ÉQUIPEMENTS
-- Cibler un équipement précis pour les DI qui le justifient
-- =========================================================================

-- DI 1 : BAES défaillant → BAES Cage escalier E1 (id_equipement 7)
INSERT INTO di_equipements (id_di, id_equipement) VALUES (1, 7);

-- DI 2 : Fuite sous CTA N°1 → CTA N°1 (id_equipement 14)
INSERT INTO di_equipements (id_di, id_equipement) VALUES (2, 14);

-- DI 3 : Bruit ascenseur → Ascenseur principal (id_equipement 21)
INSERT INTO di_equipements (id_di, id_equipement) VALUES (3, 21);

-- DI 4 : Extincteur cuisine périmé → Extincteur CO2 #01 cuisine (id_equipement 4)
INSERT INTO di_equipements (id_di, id_equipement) VALUES (4, 4);

-- DI 7 : Pression RIA hall → RIA Hall (id_equipement 11)
INSERT INTO di_equipements (id_di, id_equipement) VALUES (7, 11);

-- DI 8 : Température E3 → PAC réversible (id_equipement 16) — problème vanne liée au circuit PAC
INSERT INTO di_equipements (id_di, id_equipement) VALUES (8, 16);

-- DI 9 : Ventilation faible → VMC Double flux (id_equipement 17)
INSERT INTO di_equipements (id_di, id_equipement) VALUES (9, 17);

-- =========================================================================
-- PHASE 15 : MODÈLES DE DEMANDES D'INTERVENTION (templates)
-- id_famille : cible optionnelle pour filtrer les équipements à la création
-- Familles : 1=Extincteurs, 2=BAES, 3=RIA, 5=CTA, 6=PAC, 11=Ascenseurs
-- =========================================================================

INSERT INTO modeles_di (nom_modele, description, id_famille, id_equipement, libelle_constat, description_constat, description_resolution) VALUES
    ('BAES défaillant',
     'Bloc autonome ne s''allumant plus ou voyant de charge éteint',
     2, NULL,
     'BAES défaillant',
     'Le BAES ne s''allume plus lors des tests. Voyant de charge éteint ou clignotant.',
     'Vérifier la batterie et remplacer si nécessaire. Tester le fonctionnement après remplacement.'),

    ('Extincteur CO2 cuisine périmé',
     'Extincteur CO2 de la cuisine dépassé ou non conforme',
     1, 4,
     'Extincteur CO2 cuisine non conforme',
     'L''extincteur CO2 de la cuisine présente un défaut (date périmée, pression hors zone verte).',
     'Remplacer l''extincteur par le prestataire SSI.'),

    ('Extincteur non conforme',
     'Extincteur périmé, déplombé ou manquant',
     1, NULL,
     'Extincteur non conforme',
     'L''extincteur présente un défaut de conformité (date périmée, plombage cassé, pression hors zone verte, ou absent).',
     'Remplacer l''extincteur ou le faire réviser par le prestataire SSI.'),

    ('Pression RIA insuffisante',
     'Manomètre RIA en zone rouge ou aiguille instable',
     3, NULL,
     'Pression RIA insuffisante',
     'La pression au manomètre du RIA est en zone rouge ou anormalement basse. Risque de non-conformité réglementaire.',
     'Vérifier l''alimentation en eau, purger le réseau si nécessaire, faire intervenir le prestataire SSI.'),

    ('Fuite sur CTA',
     'Fuite d''eau ou de condensats sous une CTA',
     5, NULL,
     'Fuite constatée sous CTA',
     'Présence d''eau au sol sous la centrale de traitement d''air. Possible fuite du bac à condensats ou de la tuyauterie.',
     'Couper l''alimentation eau si nécessaire, vérifier le bac à condensats et la tuyauterie, planifier l''intervention du prestataire CVC.'),

    ('Problème PAC réversible',
     'Anomalie sur la pompe à chaleur réversible',
     6, 16,
     'PAC réversible en défaut',
     'La PAC réversible présente un code défaut ou un fonctionnement anormal (bruit, pas de chauffage/clim).',
     'Contrôler le fluide frigorigène, vérifier les échangeurs et le compresseur. Faire intervenir ThermoServ si nécessaire.'),

    ('Problème température chambres',
     'Température anormale signalée par les clients',
     6, NULL,
     'Température chambres anormale',
     'Plaintes de clients concernant une température trop basse ou trop haute dans les chambres. Vérifier le circuit CVC.',
     'Contrôler les vannes 3 voies, la PAC et le thermostat. Régler ou débloquer si nécessaire.'),

    ('Bruit anormal ascenseur',
     'Bruit métallique ou vibration signalé en cabine',
     11, 21,
     'Bruit anormal ascenseur',
     'Bruit métallique, vibration ou à-coup signalé par les usagers lors du fonctionnement de l''ascenseur.',
     'Faire intervenir le prestataire ascenseur pour diagnostic. Vérifier patins de guidage et câbles.'),

    ('Disjonction répétée',
     'Disjoncteur qui saute de façon récurrente',
     NULL, NULL,
     'Disjonction répétée',
     'Le disjoncteur d''un local disjoncte régulièrement, notamment lors de l''utilisation d''appareils haute consommation.',
     'Vérifier le calibre du disjoncteur, l''état du câblage et la puissance cumulée des équipements branchés.'),

    ('Odeur suspecte',
     'Odeur de brûlé, de gaz ou chimique',
     NULL, NULL,
     'Odeur suspecte détectée',
     'Odeur anormale (brûlé, gaz, chimique) signalée dans un local. Investigation urgente requise.',
     NULL);
