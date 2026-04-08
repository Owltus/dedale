-- =========================================================================
-- MANTIS - SYSTÈME DE GESTION DE MAINTENANCE ASSISTÉE PAR ORDINATEUR
-- Base de données SQLite - Script d'initialisation complet
-- =========================================================================
-- IMPORTANT : PRAGMAs à activer à CHAQUE connexion (côté Tauri/Rust) :
--   PRAGMA foreign_keys = ON;           -- Obligatoire : active les FK
--   PRAGMA journal_mode = WAL;          -- Performance : write-ahead log (1 writer + N readers)
--   PRAGMA busy_timeout = 2000;         -- Évite SQLITE_BUSY sur accès concurrent (2s)
--   PRAGMA cache_size = -64000;         -- Cache 64 Mo (défaut 2 Mo, insuffisant pour les triggers)
--   PRAGMA synchronous = NORMAL;        -- Sûr avec WAL, plus rapide que FULL
--   PRAGMA temp_store = MEMORY;         -- Tables temporaires en RAM
--   PRAGMA mmap_size = 268435456;       -- Memory-mapped I/O 256 Mo (accélère les lectures)
-- NE PAS activer : PRAGMA recursive_triggers (voir note ligne 69)

-- Ce fichier regroupe :
--   1. Schéma (CREATE TABLE)
--   2. Données de référence (INSERT)
--   3. Index de performance
--   4. Triggers système (protection, workflow, propagation, nettoyage)

-- Conventions :
--   - DATE     → données métier (date_constat, date_debut, date_fin…)
--   - DATETIME → horodatage technique / audit (date_creation, date_modification…)
--   - Statuts OT 3 (Clôturé) et 4 (Annulé) = IMMUTABLES (sauf réouverture 3→5)
--   - Nommage 100% français, terminologie GMAO (NF EN 13306)

-- Corrections appliquées (v2) :
--   - ordres_travail.id_gamme_modele renommé en id_gamme (FK vers gammes directement)
--   - ordres_travail.nom_prestataire ajouté (snapshot figé comme nom_technicien)
--   - id_prestataire est maintenant un snapshot figé à la création
--   - validation_contrat_creation (BEFORE INSERT) remplace validation_contrat_ot_preventif
--     avec logique gamme réglementaire → RAISE / non réglementaire → bascule interne
--   - validation_prestataire_temporel supprimé (redondant, snapshot figé)
--   - creation_ot_complet : résolution + snapshot prestataire intégrés
--   - gestion_statut_ot étape 4 : COALESCE pour date_cloture si ops sans date
--   - propagation_periodicite_vers_ot : restreint aux OT statut 1 uniquement
--   - reinitialisation_resurrection : renumérotation correcte des étapes
--   - a_propagation_gamme_vers_ot : propagation id_prestataire supprimée (snapshot figé)
--   - protection_ot_terminaux : nom_prestataire ajouté à la blacklist
--
-- Corrections appliquées (v3) :
--   - types_documents : ajout colonne est_systeme, description rendue NOT NULL
--   - Données de référence types_documents : réduit à 3 types système universels
--     (Attestation, Rapport, Contrat) — les types sectoriels sont à créer par le client
--   - Trigger protection_suppression_type_document ajouté (section 4.2) :
--     bloque la suppression d'un type utilisé avec message de reclassification explicite
--
-- Corrections appliquées (v6) :
--   - contrats : ajout id_contrat_parent (versioning), est_archive, objet_avenant
--   - Trigger archivage_contrat_parent : archive automatiquement le parent
--     quand une nouvelle version est créée (id_contrat_parent renseigné)
--   - Trigger protection_contrat_archive : bloque toute modification
--     d'un contrat archivé — figé comme un OT clôturé
--   - Index idx_contrats_parent ajouté
--   - Pas de montant financier, pas de références formelles, 1 contrat = 1 prestataire
--   - Table postes ajoutée (id_poste, libelle, description)
--   - techniciens : ajout id_poste (FK vers postes)
--   - ordres_travail : ajout nom_poste (snapshot figé, renseigné uniquement si interne)
--   - creation_ot_complet : snapshot nom_poste conditionnel (interne uniquement)
--   - sync_snapshot_technicien_ot : snapshot nom_poste mis à jour avec le technicien
--   - propagation_renommage_technicien : propogation nom_poste si poste change
--   - Trigger validation_technicien_interne_uniquement ajouté :
--     bloque l'assignation d'un technicien à un OT externe (prestataire != 1)
--   - protection_ot_terminaux : nom_poste ajouté à la blacklist
--   - Données de référence : 4 postes par défaut insérés
--   - statuts_operations : ajout statut 5 'Non applicable' (choix utilisateur, ne bloque pas clôture)
--   - statuts_operations : 'Annulée' (id=4) = SYSTÈME UNIQUEMENT, jamais sélectionnable manuellement
--   - operations_execution CHECK : statut 5 autorisé sans date_execution (comme statut 4)
--   - Trigger protection_statut_annulee_manuel ajouté : bloque toute tentative manuelle
--     de passer une opération en Annulée — réservé aux cascades système
--   - gestion_statut_ot : statut 5 traité comme statut 4 pour la clôture (ne bloque pas)
--   - reinitialisation_resurrection : statut 5 préservé (choix utilisateur, pas réinitialisé)
--   - nettoyage_dates_coherentes : annulation OT ne touche pas les ops en statut 5
--
-- Corrections appliquées (v11) :
--   - reprogrammation_auto : ajout filtre id_statut_ot NOT IN (3, 4) dans la condition
--     de vérification d'OT futur. Sans ce filtre, un OT annulé avec une date future
--     bloquait silencieusement la chaîne de reprogrammation.
--   - validation_transitions_manuelles : clôture manuelle (→3) bloquée si des opérations
--     sont encore en attente (1) ou en cours (2). Pour sauter un OT, utiliser l'annulation.
--   - Trigger protection_passage_reglementaire ajouté : bloque le passage
--     est_reglementaire 0→1 si des OT actifs existent avec un prestataire externe
--     sans contrat valide.
--   - protection_ot_terminaux : id_image aligné sur id_di/id_technicien
--     (autorise SET NULL, permet de supprimer des images obsolètes).
--   - Trigger validation_statut_initial_di ajouté : force id_statut_di=1 à l'INSERT.
--     Sans cela, on pouvait créer une DI directement en statut Résolue (2).
--   - Trigger protection_id_gamme_ot ajouté : bloque toute modification de
--     id_gamme sur les OT (la gamme est figée à la création, les opérations
--     et snapshots en dépendent).
--
-- Corrections appliquées (v16) :
--   - Modèles d'équipement : tables modeles_equipements, champs_modele, valeurs_equipements
--   - familles_equipements : ajout id_modele_equipement (FK optionnelle, ON DELETE SET NULL)
--   - Index : idx_champs_modele, idx_valeurs_equipement, idx_valeurs_champ, idx_familles_modele
--   - Trigger : maj_date_modification_modele_equipement
--
-- Corrections appliquées (v13) :
--   - Découplage gammes/équipements : les gammes ont désormais leur propre hiérarchie
--     de classification (domaines_gammes, familles_gammes) indépendante des équipements.
--   - domaines_techniques renommé en domaines_equipements (table existante, FK mises à jour)
--   - Nouvelles tables : domaines_gammes, familles_gammes, gammes_equipements (liaison N↔N)
--   - gammes : id_famille remplacé par id_famille_gamme (FK → familles_gammes),
--     id_equipement supprimé (remplacé par la table de liaison gammes_equipements)
--   - ordres_travail : nom_famille résolu depuis familles_gammes, nom_equipement rempli
--     uniquement si exactement 1 équipement lié via gammes_equipements
--   - 6 triggers majeurs réécrits : creation_ot_complet, a_propagation_gamme_vers_ot,
--     propagation_renommage_famille (→ familles_gammes), propagation_equipement_vers_ot,
--     reinitialisation_resurrection
--   - Nouveaux index : idx_gammes_famille_gamme, idx_gammes_equipements_gamme,
--     idx_gammes_equipements_equip, idx_familles_gammes_domaine,
--     idx_domaines_gammes_image, idx_familles_gammes_image

-- Attention : les triggers date_modification fonctionnent car
-- PRAGMA recursive_triggers est OFF par défaut en SQLite.
-- Ne JAMAIS activer recursive_triggers sans réécrire ces triggers.
-- ATTENTION MAINTENANCE : protection_ot_terminaux utilise une approche BLACKLIST.
-- Toute nouvelle colonne ajoutée à ordres_travail doit être explicitement
-- ajoutée à ce trigger si elle doit être protégée sur les OT terminaux.
-- =========================================================================


-- =========================================================================
-- PARTIE 1 : SCHÉMA — TABLES DE RÉFÉRENCE
-- =========================================================================

--------------------------------------------------------------------------------
-- 1.1 Référentiel ERP (Établissements Recevant du Public)
--------------------------------------------------------------------------------
CREATE TABLE types_erp (
    id_type_erp   INTEGER PRIMARY KEY,
    code          TEXT NOT NULL UNIQUE,
    libelle       TEXT NOT NULL,
    description   TEXT
) STRICT;

CREATE TABLE categories_erp (
    id_categorie_erp INTEGER PRIMARY KEY,
    libelle          TEXT NOT NULL UNIQUE,
    description      TEXT
) STRICT;

CREATE TABLE etablissements (
    id_etablissement  INTEGER PRIMARY KEY AUTOINCREMENT,
    nom               TEXT NOT NULL,
    id_type_erp       INTEGER,
    id_categorie_erp  INTEGER,
    adresse           TEXT,
    code_postal       TEXT,
    ville             TEXT,
    capacite_accueil  INTEGER,
    surface_m2        REAL,
    date_creation     TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_type_erp)      REFERENCES types_erp(id_type_erp)           ON DELETE RESTRICT,
    FOREIGN KEY (id_categorie_erp) REFERENCES categories_erp(id_categorie_erp) ON DELETE RESTRICT,
    -- AJOUT v12 : validations autonomes
    CHECK (capacite_accueil IS NULL OR capacite_accueil > 0),
    CHECK (surface_m2 IS NULL OR surface_m2 > 0),
    CHECK (code_postal IS NULL OR (LENGTH(code_postal) = 5 AND code_postal GLOB '[0-9][0-9][0-9][0-9][0-9]'))
) STRICT;

--------------------------------------------------------------------------------
-- 1.2 Images centralisées (stockage BLOB, icônes WebP)
-- Note : adapté pour une application locale offline, pas de serveur de fichiers.
-- Convient pour des icônes légères (WebP). Ne pas y stocker de photos haute résolution.
--------------------------------------------------------------------------------
CREATE TABLE images (
    id_image      INTEGER PRIMARY KEY,
    nom           TEXT NOT NULL,
    description   TEXT,
    image_data    BLOB NOT NULL,
    image_mime    TEXT NOT NULL DEFAULT 'image/webp',
    taille_octets INTEGER NOT NULL,
    date_creation TEXT DEFAULT CURRENT_TIMESTAMP,
    CHECK (taille_octets > 0)  -- AJOUT v11
) STRICT;

--------------------------------------------------------------------------------
-- 1.3 Unités, périodicités, types d'opérations et sources
--------------------------------------------------------------------------------
CREATE TABLE unites (
    id_unite    INTEGER PRIMARY KEY,
    nom         TEXT NOT NULL UNIQUE,
    symbole     TEXT NOT NULL UNIQUE,
    description TEXT
) STRICT;

CREATE TABLE periodicites (
    id_periodicite   INTEGER PRIMARY KEY,
    libelle          TEXT NOT NULL UNIQUE,
    description      TEXT,
    jours_periodicite INTEGER NOT NULL,
    jours_valide      INTEGER NOT NULL,
    tolerance_jours   INTEGER NOT NULL DEFAULT 0,
    CHECK (jours_periodicite >= 0),
    CHECK (jours_valide >= 0),
    CHECK (tolerance_jours >= 0),
    -- AJOUT v11 : cohérence entre les 3 valeurs
    CHECK (jours_valide <= jours_periodicite),
    CHECK (tolerance_jours <= jours_valide)
) STRICT;

CREATE TABLE types_sources (
    id_type_source INTEGER PRIMARY KEY,
    libelle        TEXT NOT NULL UNIQUE,
    description    TEXT
) STRICT;

CREATE TABLE types_operations (
    id_type_operation INTEGER PRIMARY KEY,
    libelle           TEXT NOT NULL UNIQUE,
    description       TEXT,
    necessite_seuils  INTEGER NOT NULL DEFAULT 0,
    CHECK (necessite_seuils IN (0, 1))
) STRICT;


-- =========================================================================
-- PARTIE 1 : SCHÉMA — DEMANDES D'INTERVENTION (DI)
-- =========================================================================

-- AJOUT v10 : statuts DI (machine à états comme les OT)
CREATE TABLE statuts_di (
    id_statut_di INTEGER PRIMARY KEY,
    nom_statut   TEXT NOT NULL UNIQUE,
    description  TEXT
) STRICT;

CREATE TABLE demandes_intervention (
    id_di                          INTEGER PRIMARY KEY AUTOINCREMENT,
    id_statut_di                   INTEGER NOT NULL DEFAULT 1,  -- AJOUT v10
    id_prestataire                 INTEGER,  -- prestataire assigné (optionnel)
    libelle_constat                TEXT NOT NULL,
    description_constat            TEXT NOT NULL,
    date_constat                   TEXT NOT NULL DEFAULT CURRENT_DATE,
    description_resolution         TEXT,
    date_resolution                TEXT,
    description_resolution_suggeree TEXT,
    date_creation                  TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification              TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_statut_di) REFERENCES statuts_di(id_statut_di) ON DELETE RESTRICT,
    FOREIGN KEY (id_prestataire) REFERENCES prestataires(id_prestataire) ON DELETE SET NULL,
    -- AJOUT v12 : textes non vides
    CHECK (LENGTH(TRIM(libelle_constat)) > 0),
    CHECK (LENGTH(TRIM(description_constat)) > 0)
) STRICT;

CREATE TABLE di_gammes (
    id_liaison    INTEGER PRIMARY KEY,
    id_di         INTEGER NOT NULL,
    id_gamme      INTEGER NOT NULL,
    date_liaison  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_di)    REFERENCES demandes_intervention(id_di) ON DELETE CASCADE,
    FOREIGN KEY (id_gamme) REFERENCES gammes(id_gamme)             ON DELETE CASCADE,
    UNIQUE(id_di, id_gamme)
) STRICT;

CREATE TABLE di_localisations (
    id_liaison       INTEGER PRIMARY KEY,
    id_di            INTEGER NOT NULL,
    id_local         INTEGER NOT NULL,
    date_liaison     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_di)    REFERENCES demandes_intervention(id_di)    ON DELETE CASCADE,
    FOREIGN KEY (id_local) REFERENCES locaux(id_local)  ON DELETE CASCADE,
    UNIQUE(id_di, id_local)
) STRICT;

-- AJOUT v18 : liaison N↔N DI ↔ équipements
CREATE TABLE di_equipements (
    id_liaison       INTEGER PRIMARY KEY,
    id_di            INTEGER NOT NULL,
    id_equipement    INTEGER NOT NULL,
    date_liaison     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_di)          REFERENCES demandes_intervention(id_di)  ON DELETE CASCADE,
    FOREIGN KEY (id_equipement)  REFERENCES equipements(id_equipement)    ON DELETE CASCADE,
    UNIQUE(id_di, id_equipement)
) STRICT;


-- =========================================================================
-- PARTIE 1 : SCHÉMA — SYSTÈME DOCUMENTAIRE
-- =========================================================================

CREATE TABLE types_documents (
    id_type_document INTEGER PRIMARY KEY,
    nom              TEXT NOT NULL UNIQUE,
    description      TEXT NOT NULL,  -- obligatoire : lisibilité des acronymes et termes métier
    est_systeme      INTEGER NOT NULL DEFAULT 0,  -- 1 = type livré par défaut (signal UI uniquement)
    CHECK (est_systeme IN (0, 1))
) STRICT;

CREATE TABLE documents (
    id_document      INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_original     TEXT NOT NULL,
    hash_sha256      TEXT NOT NULL UNIQUE,
    nom_fichier      TEXT NOT NULL,
    taille_octets    INTEGER NOT NULL,
    id_type_document INTEGER NOT NULL,
    date_upload      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_type_document) REFERENCES types_documents(id_type_document) ON DELETE RESTRICT,
    CHECK (LENGTH(hash_sha256) = 64),
    CHECK (taille_octets > 0)  -- AJOUT v11
) STRICT;

CREATE TABLE documents_prestataires (
    id_liaison    INTEGER PRIMARY KEY,
    id_document   INTEGER NOT NULL,
    id_prestataire INTEGER NOT NULL,
    date_liaison  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    commentaire   TEXT,
    FOREIGN KEY (id_document)    REFERENCES documents(id_document)      ON DELETE CASCADE,
    FOREIGN KEY (id_prestataire) REFERENCES prestataires(id_prestataire) ON DELETE CASCADE,
    UNIQUE(id_document, id_prestataire)
) STRICT;

CREATE TABLE documents_ordres_travail (
    id_liaison       INTEGER PRIMARY KEY,
    id_document      INTEGER NOT NULL,
    id_ordre_travail INTEGER NOT NULL,
    date_liaison     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    commentaire      TEXT,
    FOREIGN KEY (id_document)      REFERENCES documents(id_document)          ON DELETE CASCADE,
    FOREIGN KEY (id_ordre_travail) REFERENCES ordres_travail(id_ordre_travail) ON DELETE CASCADE,
    UNIQUE(id_document, id_ordre_travail)
) STRICT;

CREATE TABLE documents_gammes (
    id_liaison  INTEGER PRIMARY KEY,
    id_document INTEGER NOT NULL,
    id_gamme    INTEGER NOT NULL,
    date_liaison TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    commentaire TEXT,
    FOREIGN KEY (id_document) REFERENCES documents(id_document) ON DELETE CASCADE,
    FOREIGN KEY (id_gamme)    REFERENCES gammes(id_gamme)        ON DELETE CASCADE,
    UNIQUE(id_document, id_gamme)
) STRICT;

CREATE TABLE documents_contrats (
    id_liaison  INTEGER PRIMARY KEY,
    id_document INTEGER NOT NULL,
    id_contrat  INTEGER NOT NULL,
    date_liaison TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    commentaire TEXT,
    FOREIGN KEY (id_document) REFERENCES documents(id_document) ON DELETE CASCADE,
    FOREIGN KEY (id_contrat)  REFERENCES contrats(id_contrat)   ON DELETE CASCADE,
    UNIQUE(id_document, id_contrat)
) STRICT;

CREATE TABLE documents_di (
    id_liaison  INTEGER PRIMARY KEY,
    id_document INTEGER NOT NULL,
    id_di       INTEGER NOT NULL,
    date_liaison TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    commentaire TEXT,
    FOREIGN KEY (id_document) REFERENCES documents(id_document)          ON DELETE CASCADE,
    FOREIGN KEY (id_di)       REFERENCES demandes_intervention(id_di)    ON DELETE CASCADE,
    UNIQUE(id_document, id_di)
) STRICT;

CREATE TABLE documents_localisations (
    id_liaison       INTEGER PRIMARY KEY,
    id_document      INTEGER NOT NULL,
    id_local         INTEGER NOT NULL,
    date_liaison     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    commentaire      TEXT,
    FOREIGN KEY (id_document) REFERENCES documents(id_document)  ON DELETE CASCADE,
    FOREIGN KEY (id_local)    REFERENCES locaux(id_local)        ON DELETE CASCADE,
    UNIQUE(id_document, id_local)
) STRICT;

CREATE TABLE documents_equipements (
    id_liaison       INTEGER PRIMARY KEY,
    id_document      INTEGER NOT NULL,
    id_equipement    INTEGER NOT NULL,
    date_liaison     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    commentaire      TEXT,
    FOREIGN KEY (id_document)    REFERENCES documents(id_document)       ON DELETE CASCADE,
    FOREIGN KEY (id_equipement)  REFERENCES equipements(id_equipement)   ON DELETE CASCADE,
    UNIQUE(id_document, id_equipement)
) STRICT;

CREATE TABLE documents_techniciens (
    id_liaison       INTEGER PRIMARY KEY,
    id_document      INTEGER NOT NULL,
    id_technicien    INTEGER NOT NULL,
    date_liaison     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    commentaire      TEXT,
    FOREIGN KEY (id_document)    REFERENCES documents(id_document)       ON DELETE CASCADE,
    FOREIGN KEY (id_technicien)  REFERENCES techniciens(id_technicien)   ON DELETE CASCADE,
    UNIQUE(id_document, id_technicien)
) STRICT;


-- =========================================================================
-- PARTIE 1 : SCHÉMA — GESTION CONTRACTUELLE
-- =========================================================================

CREATE TABLE prestataires (
    id_prestataire INTEGER PRIMARY KEY AUTOINCREMENT,
    libelle        TEXT NOT NULL UNIQUE,
    description    TEXT,
    adresse        TEXT,
    code_postal    TEXT,
    ville          TEXT,
    telephone      TEXT,
    email          TEXT,
    id_image       INTEGER,
    FOREIGN KEY (id_image) REFERENCES images(id_image) ON DELETE SET NULL,
    -- AJOUT v12 : validations autonomes
    CHECK (code_postal IS NULL OR (LENGTH(code_postal) = 5 AND code_postal GLOB '[0-9][0-9][0-9][0-9][0-9]')),
    CHECK (email IS NULL OR email LIKE '%_@_%.__%')
) STRICT;

CREATE TABLE postes (
    id_poste    INTEGER PRIMARY KEY,
    libelle     TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL
) STRICT;

CREATE TABLE techniciens (
    id_technicien INTEGER PRIMARY KEY AUTOINCREMENT,
    nom           TEXT NOT NULL,
    prenom        TEXT NOT NULL,
    telephone     TEXT,
    email         TEXT,
    id_poste      INTEGER,
    est_actif     INTEGER NOT NULL DEFAULT 1,
    id_image      INTEGER,
    date_creation TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_poste)  REFERENCES postes(id_poste) ON DELETE SET NULL,
    FOREIGN KEY (id_image)  REFERENCES images(id_image) ON DELETE SET NULL,
    CHECK (est_actif IN (0, 1)),
    CHECK (email IS NULL OR email LIKE '%_@_%.__%')  -- AJOUT v12
) STRICT;

CREATE TABLE types_contrats (
    id_type_contrat INTEGER PRIMARY KEY,
    libelle         TEXT NOT NULL UNIQUE,
    description     TEXT
) STRICT;

CREATE TABLE contrats (
    id_contrat                INTEGER PRIMARY KEY AUTOINCREMENT,
    id_prestataire            INTEGER NOT NULL,
    id_type_contrat           INTEGER NOT NULL,
    -- Versioning : NULL = contrat racine, renseigné = avenant d'une version précédente
    id_contrat_parent         INTEGER,
    est_archive               INTEGER NOT NULL DEFAULT 0,  -- 1 = version remplacée, figée
    objet_avenant             TEXT,  -- description courte du motif de cette nouvelle version
    reference                 TEXT NOT NULL,  -- nom/référence du contrat (ex: "Maintenance CVC 2026")
    date_signature            TEXT,
    date_debut                TEXT NOT NULL,
    date_fin                  TEXT,
    date_resiliation          TEXT,
    date_notification         TEXT,
    duree_cycle_mois          INTEGER,
    delai_preavis_jours       INTEGER DEFAULT 30,
    fenetre_resiliation_jours INTEGER,
    commentaires              TEXT,
    date_creation             TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification         TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_prestataire)   REFERENCES prestataires(id_prestataire)    ON DELETE RESTRICT,
    FOREIGN KEY (id_type_contrat)  REFERENCES types_contrats(id_type_contrat) ON DELETE RESTRICT,
    FOREIGN KEY (id_contrat_parent) REFERENCES contrats(id_contrat)           ON DELETE RESTRICT,
    CHECK (date_fin IS NULL OR date_debut <= date_fin),
    CHECK (date_resiliation IS NULL OR date_resiliation >= date_debut),
    CHECK (date_notification IS NULL OR date_resiliation IS NULL OR date_notification <= date_resiliation),
    CHECK (delai_preavis_jours >= 0),
    CHECK (duree_cycle_mois IS NULL OR duree_cycle_mois > 0),
    CHECK (fenetre_resiliation_jours IS NULL OR fenetre_resiliation_jours > 0),
    CHECK (est_archive IN (0, 1)),
    CHECK (date_signature IS NULL OR date_signature <= date_debut),  -- AJOUT v12
    CHECK (LENGTH(TRIM(reference)) > 0)
) STRICT;

CREATE TABLE contrats_gammes (
    id_liaison   INTEGER PRIMARY KEY,
    id_contrat   INTEGER NOT NULL,
    id_gamme     INTEGER NOT NULL,
    date_liaison TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    commentaire  TEXT,
    -- CORRIGÉ v7 (W-35) : RESTRICT au lieu de CASCADE — empêche la suppression
    -- silencieuse d'un contrat lié à des gammes. L'utilisateur doit dissocier d'abord.
    FOREIGN KEY (id_contrat) REFERENCES contrats(id_contrat) ON DELETE RESTRICT,
    FOREIGN KEY (id_gamme)   REFERENCES gammes(id_gamme)     ON DELETE RESTRICT,
    UNIQUE(id_contrat, id_gamme)
) STRICT;


-- =========================================================================
-- PARTIE 1 : SCHÉMA — STRUCTURE OPÉRATIONNELLE
-- =========================================================================

-- MODIFIÉ v14 : localisations décomposées en 3 niveaux fixes (batiments > niveaux > locaux)
CREATE TABLE batiments (
    id_batiment       INTEGER PRIMARY KEY AUTOINCREMENT,
    nom               TEXT NOT NULL UNIQUE,
    description       TEXT,
    id_image          INTEGER,
    date_creation     TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_image) REFERENCES images(id_image) ON DELETE SET NULL
) STRICT;

CREATE TABLE niveaux (
    id_niveau         INTEGER PRIMARY KEY AUTOINCREMENT,
    nom               TEXT NOT NULL,
    description       TEXT,
    id_batiment       INTEGER NOT NULL,
    id_image          INTEGER,
    date_creation     TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_batiment) REFERENCES batiments(id_batiment) ON DELETE RESTRICT,
    FOREIGN KEY (id_image)    REFERENCES images(id_image)       ON DELETE SET NULL,
    UNIQUE(nom, id_batiment)
) STRICT;

CREATE TABLE locaux (
    id_local          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom               TEXT NOT NULL,
    description       TEXT,
    surface           REAL,
    id_niveau         INTEGER NOT NULL,
    id_image          INTEGER,
    date_creation     TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_niveau) REFERENCES niveaux(id_niveau) ON DELETE RESTRICT,
    FOREIGN KEY (id_image)  REFERENCES images(id_image)   ON DELETE SET NULL,
    UNIQUE(nom, id_niveau),
    CHECK (surface IS NULL OR surface > 0)
) STRICT;

-- AJOUT v18 : catégories de modèles d'équipement (regroupement logique)
CREATE TABLE categories_modeles (
    id_categorie  INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_categorie TEXT NOT NULL UNIQUE,
    description   TEXT
) STRICT;

-- AJOUT v16 : modèles d'équipement — champs personnalisés par type d'équipement
-- Un modèle définit un ensemble de champs (nom, type, unité, obligatoire, ordre).
-- Chaque famille d'équipement peut être rattachée à un modèle (FK optionnelle).
CREATE TABLE modeles_equipements (
    id_modele_equipement INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_modele           TEXT NOT NULL UNIQUE,
    description          TEXT,
    id_categorie         INTEGER,
    date_creation        TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification    TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_categorie) REFERENCES categories_modeles(id_categorie) ON DELETE SET NULL
) STRICT;

-- Champs d'un modèle d'équipement
-- Types supportés : texte, nombre, date, booleen, liste
-- Pour le type 'liste', valeurs_possibles contient les options séparées par '|'
CREATE TABLE champs_modele (
    id_champ             INTEGER PRIMARY KEY AUTOINCREMENT,
    id_modele_equipement INTEGER NOT NULL,
    nom_champ            TEXT NOT NULL,
    type_champ           TEXT NOT NULL,
    unite                TEXT,
    est_obligatoire      INTEGER NOT NULL DEFAULT 0,
    ordre                INTEGER NOT NULL DEFAULT 0,
    valeurs_possibles    TEXT,
    valeur_defaut        TEXT,
    est_archive          INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (id_modele_equipement) REFERENCES modeles_equipements(id_modele_equipement) ON DELETE CASCADE,
    CHECK (type_champ IN ('texte', 'nombre', 'date', 'booleen', 'liste')),
    CHECK (est_obligatoire IN (0, 1)),
    CHECK (est_archive IN (0, 1)),
    UNIQUE(id_modele_equipement, nom_champ)
) STRICT;

-- RENOMMÉ v13 : domaines_techniques → domaines_equipements
-- Hiérarchie spécifique aux équipements
CREATE TABLE domaines_equipements (
    id_domaine  INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_domaine TEXT NOT NULL UNIQUE,
    description TEXT,
    id_image    INTEGER,
    FOREIGN KEY (id_image) REFERENCES images(id_image) ON DELETE SET NULL
) STRICT;

CREATE TABLE familles_equipements (
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

-- MODIFIÉ v17 : retrait colonnes fixes (nom, marque, modele, numero_serie)
-- Ces données passent désormais par valeurs_equipements via le modèle de la famille.
-- nom_affichage est un champ éditable directement par l'utilisateur (obligatoire).
CREATE TABLE equipements (
    id_equipement       INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_affichage        TEXT NOT NULL,
    date_mise_en_service TEXT,
    date_fin_garantie   TEXT,
    id_famille          INTEGER NOT NULL,
    id_local            INTEGER,
    est_actif           INTEGER NOT NULL DEFAULT 1,
    commentaires        TEXT,
    id_image            INTEGER,
    date_creation       TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification   TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_famille)      REFERENCES familles_equipements(id_famille)   ON DELETE RESTRICT,
    FOREIGN KEY (id_local)        REFERENCES locaux(id_local)               ON DELETE RESTRICT,
    FOREIGN KEY (id_image)        REFERENCES images(id_image)               ON DELETE SET NULL,
    CHECK (est_actif IN (0, 1)),
    CHECK (LENGTH(TRIM(nom_affichage)) > 0),
    CHECK (date_mise_en_service IS NULL OR date_fin_garantie IS NULL OR date_fin_garantie >= date_mise_en_service)
) STRICT;

-- AJOUT v16 : valeurs des champs personnalisés par équipement
-- Stocke la valeur de chaque champ du modèle pour chaque équipement.
-- La valeur est toujours TEXT — le type_champ dans champs_modele détermine l'interprétation.
CREATE TABLE valeurs_equipements (
    id_valeur     INTEGER PRIMARY KEY AUTOINCREMENT,
    id_equipement INTEGER NOT NULL,
    id_champ      INTEGER NOT NULL,
    valeur        TEXT,
    FOREIGN KEY (id_equipement) REFERENCES equipements(id_equipement) ON DELETE CASCADE,
    FOREIGN KEY (id_champ)      REFERENCES champs_modele(id_champ)    ON DELETE CASCADE,
    UNIQUE(id_equipement, id_champ)
) STRICT;

-- AJOUT v13 : hiérarchie spécifique aux gammes (indépendante des équipements)
CREATE TABLE domaines_gammes (
    id_domaine_gamme INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_domaine      TEXT NOT NULL UNIQUE,
    description      TEXT,
    id_image         INTEGER,
    FOREIGN KEY (id_image) REFERENCES images(id_image) ON DELETE SET NULL
) STRICT;

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

CREATE TABLE statuts_operations (
    id_statut_operation INTEGER PRIMARY KEY,
    nom_statut          TEXT NOT NULL UNIQUE,
    description         TEXT
) STRICT;

CREATE TABLE statuts_ot (
    id_statut_ot INTEGER PRIMARY KEY,
    nom_statut   TEXT NOT NULL UNIQUE,
    description  TEXT
) STRICT;

CREATE TABLE priorites_ot (
    id_priorite  INTEGER PRIMARY KEY,
    nom_priorite TEXT NOT NULL UNIQUE,
    niveau       INTEGER NOT NULL UNIQUE,
    description  TEXT
) STRICT;


-- =========================================================================
-- PARTIE 1 : SCHÉMA — GAMMES TYPES RÉUTILISABLES
-- =========================================================================

CREATE TABLE modeles_operations (
    id_modele_operation   INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_modele  TEXT NOT NULL UNIQUE,
    description     TEXT,
    id_image        INTEGER,
    date_creation   TEXT DEFAULT CURRENT_DATE,
    FOREIGN KEY (id_image) REFERENCES images(id_image) ON DELETE SET NULL
) STRICT;

CREATE TABLE modeles_operations_items (
    id_modele_operation_item INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_operation      TEXT NOT NULL,
    description        TEXT,
    id_type_operation  INTEGER NOT NULL,
    id_modele_operation      INTEGER NOT NULL,
    seuil_minimum      REAL,
    seuil_maximum      REAL,
    id_unite           INTEGER,
    FOREIGN KEY (id_modele_operation)     REFERENCES modeles_operations(id_modele_operation)     ON DELETE CASCADE,
    FOREIGN KEY (id_type_operation) REFERENCES types_operations(id_type_operation) ON DELETE RESTRICT,
    FOREIGN KEY (id_unite)          REFERENCES unites(id_unite)                ON DELETE RESTRICT,
    CHECK (seuil_minimum IS NULL OR seuil_maximum IS NULL OR seuil_minimum <= seuil_maximum)
) STRICT;

CREATE TABLE modeles_di (
    id_modele_di          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_modele            TEXT NOT NULL UNIQUE,
    description           TEXT,
    id_famille            INTEGER,  -- AJOUT v18 : lien optionnel vers une famille d'équipement
    id_equipement         INTEGER,  -- AJOUT v18 : lien optionnel vers un équipement précis
    libelle_constat       TEXT NOT NULL,
    description_constat   TEXT NOT NULL,
    description_resolution TEXT,
    date_creation         TEXT DEFAULT CURRENT_DATE,
    FOREIGN KEY (id_famille)   REFERENCES familles_equipements(id_famille)    ON DELETE SET NULL,
    FOREIGN KEY (id_equipement) REFERENCES equipements(id_equipement)         ON DELETE SET NULL
) STRICT;


-- =========================================================================
-- PARTIE 1 : SCHÉMA — GAMMES DE MAINTENANCE (PROCÉDURES)
-- =========================================================================

-- MODIFIÉ v13 : id_famille remplacé par id_famille_gamme (FK → familles_gammes),
-- id_equipement supprimé (remplacé par la table de liaison gammes_equipements)
CREATE TABLE gammes (
    id_gamme          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_gamme         TEXT NOT NULL,
    description       TEXT,
    est_reglementaire INTEGER NOT NULL DEFAULT 0,
    id_batiment_calc       INTEGER,
    id_niveau_calc         INTEGER,
    id_local_calc          INTEGER,
    nom_localisation_calc  TEXT,
    id_periodicite    INTEGER NOT NULL,
    id_famille_gamme  INTEGER NOT NULL,
    id_prestataire    INTEGER NOT NULL DEFAULT 1,
    id_image          INTEGER,
    date_creation     TEXT DEFAULT CURRENT_DATE,
    date_modification TEXT DEFAULT CURRENT_TIMESTAMP,
    est_active        INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (id_batiment_calc) REFERENCES batiments(id_batiment)             ON DELETE SET NULL,
    FOREIGN KEY (id_niveau_calc)   REFERENCES niveaux(id_niveau)                 ON DELETE SET NULL,
    FOREIGN KEY (id_local_calc)    REFERENCES locaux(id_local)                   ON DELETE SET NULL,
    FOREIGN KEY (id_periodicite)   REFERENCES periodicites(id_periodicite)          ON DELETE RESTRICT,
    FOREIGN KEY (id_famille_gamme) REFERENCES familles_gammes(id_famille_gamme)     ON DELETE RESTRICT,
    FOREIGN KEY (id_prestataire)   REFERENCES prestataires(id_prestataire)          ON DELETE RESTRICT,
    FOREIGN KEY (id_image)         REFERENCES images(id_image)                      ON DELETE SET NULL,
    CHECK (est_reglementaire IN (0, 1)),
    CHECK (est_active IN (0, 1)),
    CHECK (LENGTH(TRIM(nom_gamme)) > 0)  -- AJOUT v12
) STRICT;

CREATE TABLE operations (
    id_operation      INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_operation     TEXT NOT NULL,
    description       TEXT,
    id_type_operation INTEGER NOT NULL,
    id_gamme          INTEGER NOT NULL,
    seuil_minimum     REAL,
    seuil_maximum     REAL,
    id_unite          INTEGER,
    FOREIGN KEY (id_gamme)          REFERENCES gammes(id_gamme)                    ON DELETE CASCADE,
    FOREIGN KEY (id_type_operation) REFERENCES types_operations(id_type_operation) ON DELETE RESTRICT,
    FOREIGN KEY (id_unite)          REFERENCES unites(id_unite)                    ON DELETE RESTRICT,
    CHECK (seuil_minimum IS NULL OR seuil_maximum IS NULL OR seuil_minimum <= seuil_maximum),
    CHECK (LENGTH(TRIM(nom_operation)) > 0)  -- AJOUT v12
) STRICT;

CREATE TABLE gamme_modeles (
    id_gamme_modele INTEGER PRIMARY KEY,
    id_gamme        INTEGER NOT NULL,
    id_modele_operation   INTEGER NOT NULL,
    date_ajout      TEXT DEFAULT CURRENT_DATE,
    FOREIGN KEY (id_gamme)      REFERENCES gammes(id_gamme)           ON DELETE CASCADE,
    FOREIGN KEY (id_modele_operation) REFERENCES modeles_operations(id_modele_operation) ON DELETE CASCADE,
    UNIQUE(id_gamme, id_modele_operation)
) STRICT;

-- AJOUT v13 : liaison N↔N gammes ↔ équipements
-- Remplace l'ancien lien direct gammes.id_equipement
-- Optionnel des deux côtés : une gamme peut couvrir 0, 1 ou N équipements.
-- CASCADE côté gamme (suppression gamme → retrait liaisons).
-- RESTRICT côté équipement (empêche suppression d'un équipement lié — dissocier d'abord).
CREATE TABLE gammes_equipements (
    id_gamme_equipement INTEGER PRIMARY KEY AUTOINCREMENT,
    id_gamme            INTEGER NOT NULL,
    id_equipement       INTEGER NOT NULL,
    date_liaison        TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_gamme)      REFERENCES gammes(id_gamme)           ON DELETE CASCADE,
    FOREIGN KEY (id_equipement) REFERENCES equipements(id_equipement) ON DELETE RESTRICT,
    UNIQUE(id_gamme, id_equipement)
) STRICT;


-- =========================================================================
-- PARTIE 1 : SCHÉMA — EXÉCUTION ET WORKFLOW (OT + OPÉRATIONS)
-- =========================================================================

CREATE TABLE ordres_travail (
    id_ordre_travail  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Snapshots descriptifs (figés à la création, traçabilité historique)
    nom_gamme                  TEXT NOT NULL,
    description_gamme          TEXT,
    est_reglementaire          INTEGER NOT NULL,
    nom_localisation           TEXT,
    nom_famille                TEXT,
    nom_prestataire            TEXT,            -- CORRIGÉ : ajout snapshot prestataire

    -- Références vivantes
    id_gamme                   INTEGER NOT NULL, -- CORRIGÉ : renommé depuis id_gamme_modele
    id_prestataire             INTEGER NOT NULL, -- CORRIGÉ : snapshot figé à la création
    id_statut_ot               INTEGER NOT NULL DEFAULT 1,
    id_priorite                INTEGER NOT NULL DEFAULT 3,

    -- Snapshots de périodicité (traçabilité historique)
    libelle_periodicite        TEXT NOT NULL DEFAULT '',
    jours_periodicite          INTEGER NOT NULL DEFAULT 0,
    periodicite_jours_valides  INTEGER NOT NULL DEFAULT 0,

    -- Référence image (via la gamme)
    id_image                   INTEGER,

    -- Dates métier
    date_prevue                TEXT NOT NULL,
    est_automatique            INTEGER NOT NULL DEFAULT 0,
    date_debut                 TEXT,
    date_cloture               TEXT,
    commentaires               TEXT,

    -- Liaisons optionnelles
    id_di                      INTEGER,
    id_technicien              INTEGER,
    nom_technicien             TEXT,
    nom_poste                  TEXT,            -- snapshot figé, renseigné uniquement si intervention interne
    nom_equipement             TEXT,

    date_creation              TEXT DEFAULT CURRENT_TIMESTAMP,
    date_modification          TEXT DEFAULT CURRENT_TIMESTAMP,

    -- CORRIGÉ : FK vers gammes(id_gamme) directement (id_gamme = référence à la gamme)
    -- gamme_modeles est une table de configuration, pas le pivot de l'OT
    FOREIGN KEY (id_gamme)        REFERENCES gammes(id_gamme)               ON DELETE RESTRICT,
    FOREIGN KEY (id_prestataire)  REFERENCES prestataires(id_prestataire)   ON DELETE RESTRICT,
    FOREIGN KEY (id_statut_ot)    REFERENCES statuts_ot(id_statut_ot)       ON DELETE RESTRICT,
    FOREIGN KEY (id_priorite)     REFERENCES priorites_ot(id_priorite)      ON DELETE RESTRICT,
    FOREIGN KEY (id_image)        REFERENCES images(id_image)               ON DELETE SET NULL,
    FOREIGN KEY (id_di)           REFERENCES demandes_intervention(id_di)   ON DELETE SET NULL,
    FOREIGN KEY (id_technicien)   REFERENCES techniciens(id_technicien)     ON DELETE SET NULL,
    CHECK (est_automatique IN (0, 1)),
    CHECK (est_reglementaire IN (0, 1)),
    CHECK (date_debut IS NULL OR date_cloture IS NULL OR date_debut <= date_cloture)
) STRICT;

CREATE TABLE operations_execution (
    id_operation_execution INTEGER PRIMARY KEY AUTOINCREMENT,
    id_ordre_travail       INTEGER NOT NULL,
    id_type_source         INTEGER NOT NULL,
    id_source              INTEGER NOT NULL,
    nom_operation          TEXT NOT NULL,
    description_operation  TEXT,
    type_operation         TEXT NOT NULL,
    seuil_minimum          REAL,
    seuil_maximum          REAL,
    unite_nom              TEXT,
    unite_symbole          TEXT,
    id_statut_operation    INTEGER NOT NULL DEFAULT 1,
    valeur_mesuree         REAL,
    est_conforme           INTEGER,
    date_execution         TEXT,
    commentaires           TEXT,
    FOREIGN KEY (id_ordre_travail)     REFERENCES ordres_travail(id_ordre_travail)      ON DELETE CASCADE,
    FOREIGN KEY (id_type_source)       REFERENCES types_sources(id_type_source)         ON DELETE RESTRICT,
    FOREIGN KEY (id_statut_operation)  REFERENCES statuts_operations(id_statut_operation) ON DELETE RESTRICT,
    CHECK (est_conforme IS NULL OR est_conforme IN (0, 1)),
    CHECK (
        (id_statut_operation = 1 AND date_execution IS NULL)
        OR (id_statut_operation IN (2, 3) AND date_execution IS NOT NULL)
        OR (id_statut_operation IN (4, 5))  -- Annulée (système) / Non applicable (utilisateur) : date optionnelle
    )
) STRICT;


-- =========================================================================
-- PARTIE 2 : DONNÉES DE RÉFÉRENCE
-- =========================================================================

--------------------------------------------------------------------------------
-- 2.1 Référentiel ERP
--------------------------------------------------------------------------------
INSERT INTO types_erp (code, libelle) VALUES
    ('J',   'Structures d''accueil pour personnes âgées ou personnes handicapées'),
    ('L',   'Salles d''auditions, de conférences, de réunions, de spectacles ou à usage multiple'),
    ('M',   'Magasins de vente, centres commerciaux'),
    ('N',   'Restaurants et débits de boisson'),
    ('O',   'Hôtels et pensions de famille'),
    ('P',   'Salles de danse et salles de jeux'),
    ('R',   'Établissements d''éveil, d''enseignement, de formation, centres de vacances, centres de loisirs sans hébergement'),
    ('S',   'Bibliothèques, centres de documentation'),
    ('T',   'Salles d''exposition à vocation commerciale'),
    ('U',   'Établissements de soins'),
    ('V',   'Établissements de divers cultes'),
    ('W',   'Administrations, banques, bureaux'),
    ('X',   'Établissements sportifs couverts'),
    ('Y',   'Musées'),
    ('PA',  'Établissements de Plein Air'),
    ('CTS', 'Chapiteaux, Tentes et Structures toile'),
    ('SG',  'Structures Gonflables'),
    ('PS',  'Parcs de Stationnement couverts'),
    ('OA',  'Hôtels-restaurants d''Altitude'),
    ('GA',  'Gares Accessibles au public (chemins de fer, téléphériques, remonte-pentes...)'),
    ('EF',  'Établissements flottants (eaux intérieures)'),
    ('REF', 'Refuges de montagne');

INSERT INTO categories_erp (libelle, description) VALUES
    ('1ère catégorie', 'Plus de 1 500 personnes'),
    ('2ème catégorie', 'De 701 à 1 500 personnes'),
    ('3ème catégorie', 'De 301 à 700 personnes'),
    ('4ème catégorie', 'Jusqu''à 300 personnes'),
    ('5ème catégorie', 'Selon seuil du type d''établissement');

--------------------------------------------------------------------------------
-- 2.2 Unités de mesure
--------------------------------------------------------------------------------
INSERT INTO unites (nom, symbole, description) VALUES
    ('Degrés Celsius',   '°C',  'Température'),
    ('Pourcentage',      '%',   'Pourcentage'),
    ('Titre Hydrotimérique', 'TH', 'Dureté de l''eau'),
    ('Mètre Cube',       'm³',  'Volume'),
    ('Kilovolt-Ampère',  'kVA', 'Puissance électrique'),
    ('Kilowatt-Heure',   'kWh', 'Énergie électrique'),
    ('Heure',            'h',   'Durée ou compteur horaire de fonctionnement');

--------------------------------------------------------------------------------
-- 2.3 Périodicités (tolérance intelligente)
--------------------------------------------------------------------------------
INSERT INTO periodicites (libelle, description, jours_periodicite, jours_valide, tolerance_jours) VALUES
    ('Hebdomadaire',   'Chaque semaine',       7,    5,    2),
    ('Bihebdomadaire', 'Toutes les 2 semaines', 14,  10,   3),
    ('Mensuel',        'Chaque mois',          30,   25,   7),
    ('Sesquimestriel', 'Toutes les six semaines', 42, 32,  10),
    ('Bimestriel',     'Tous les 2 mois',      60,   45,  14),
    ('Trimestriel',    'Tous les 3 mois',      90,   60,  21),
    ('Quadrimestriel', 'Tous les 4 mois',      120,  90,  26),
    ('Semestriel',     'Tous les 6 mois',      180,  120, 30),
    ('Annuel',         'Chaque année',         365,  270, 45),
    ('Biennale',       'Tous les 2 ans',       730,  540, 60),
    ('Triennal',       'Tous les 3 ans',       1095, 730, 90),
    ('Quinquennal',    'Tous les 5 ans',       1825, 1200, 120),
    ('Décennal',       'Tous les 10 ans',      3650, 2920, 180);

--------------------------------------------------------------------------------
-- 2.4 Types d'opérations, sources, DI
--------------------------------------------------------------------------------
INSERT INTO types_sources (libelle, description) VALUES
    ('Specifique',   'Opération spécifique à une gamme'),
    ('Gamme type',   'Opération issue d''une gamme type réutilisable');

INSERT INTO types_operations (id_type_operation, libelle, description, necessite_seuils) VALUES
    (1, 'Vérification',        'Contrôle fonctionnel par le personnel',          0),
    (2, 'Contrôle réglementaire', 'Intervention par organisme agréé',            0),
    (3, 'Entretien',           'Nettoyage, graissage, remplacement préventif',   0),
    (4, 'Mesure',              'Relevé quantitatif avec seuils et unités',       1),
    (5, 'Réglage',             'Ajustement de paramètres techniques',            0);

-- AJOUT v10 : statuts DI
-- 1=Ouverte, 2=Résolue (immutable sauf réouverture), 3=Réouverte
INSERT INTO statuts_di (id_statut_di, nom_statut, description) VALUES
    (1, 'Ouverte',   'Demande en cours de traitement'),
    (2, 'Résolue',   'Demande résolue — immutable sauf réouverture'),
    (3, 'Réouverte', 'Demande rouverte pour correction ou complément');

--------------------------------------------------------------------------------
-- 2.5 Types de documents
--------------------------------------------------------------------------------
-- 3 types système universels — valables tous secteurs confondus.
-- L'utilisateur crée ses propres types (VGP, CERFA, PV, etc.) selon son métier.
-- est_systeme = 1 : signal pour l'UI (avertissement avant suppression), pas de protection base.
INSERT INTO types_documents (nom, description, est_systeme) VALUES
    ('Attestation', 'Certificat de conformité, d''assurance, d''habilitation ou de formation', 1),
    ('Rapport',     'Compte-rendu d''intervention, de contrôle ou de maintenance',              1),
    ('Contrat',     'Document contractuel ou de prestation de service',                         1);

--------------------------------------------------------------------------------
-- 2.6 Types contractuels
--------------------------------------------------------------------------------
INSERT INTO types_contrats (id_type_contrat, libelle, description) VALUES
    (1, 'Déterminé',   'Contrat à durée fixe sans reconduction'),
    (2, 'Tacite',      'Contrat avec reconduction automatique par cycles'),
    (3, 'Indéterminé', 'Contrat sans date de fin, résiliable avec préavis');

--------------------------------------------------------------------------------
-- 2.7 Prestataire interne + contrat système
--------------------------------------------------------------------------------
INSERT INTO prestataires (id_prestataire, libelle, description) VALUES
    (1, 'Mon Entreprise', 'Maintenance interne');

INSERT INTO contrats (id_prestataire, id_type_contrat, reference, date_signature, date_debut, delai_preavis_jours, commentaires)
VALUES (1, 3, 'Maintenance interne', '2024-11-28', '2024-12-01', 60, 'Contrat du responsable technique');

--------------------------------------------------------------------------------
-- 2.8 Postes + Technicien par défaut
--------------------------------------------------------------------------------
INSERT INTO postes (libelle, description) VALUES
    ('Responsable Technique',  'Responsable de la maintenance et de la conformité réglementaire'),
    ('Technicien de Maintenance', 'Réalise les interventions et contrôles terrain'),
    ('Agent de Sécurité',      'Responsable des vérifications liées à la sécurité incendie et des ERP'),
    ('Chargé d''Exploitation', 'Supervise l''exploitation technique du site');


--------------------------------------------------------------------------------
-- 2.9 Statuts, priorités
--------------------------------------------------------------------------------
-- Statuts opérations :
-- 1=En attente, 2=En cours, 3=Terminée → statuts UTILISATEUR
-- 4=Annulée → SYSTÈME UNIQUEMENT (cascade OT annulé), jamais sélectionnable manuellement
-- 5=Non applicable → UTILISATEUR (opération hors contexte ce cycle, ne bloque pas la clôture)
-- CORRIGÉ v11 : IDs explicites — les triggers hardcodent ces valeurs (1-5).
-- Sans IDs explicites, un changement d'ordre d'INSERT casserait tous les triggers.
INSERT INTO statuts_operations (id_statut_operation, nom_statut, description) VALUES
    (1, 'En attente',      'À réaliser — statut par défaut à la création'),
    (2, 'En cours',        'En cours de réalisation — peut s''étendre sur plusieurs jours'),
    (3, 'Terminée',        'Réalisée avec succès'),
    (4, 'Annulée',         'Annulée par le système (cascade OT annulé) — non sélectionnable manuellement'),
    (5, 'Non applicable',  'Opération non pertinente dans ce contexte ou ce cycle — ne bloque pas la clôture de l''OT');

-- Statuts 3 (Clôturé) et 4 (Annulé) = IMMUTABLES
-- CORRIGÉ v11 : IDs explicites — les triggers hardcodent ces valeurs (1-5).
INSERT INTO statuts_ot (id_statut_ot, nom_statut, description) VALUES
    (1, 'Planifié',  'Ordre de travail planifié, en attente de réalisation'),
    (2, 'En Cours',  'Ordre de travail en cours de réalisation'),
    (3, 'Clôturé',   'Ordre de travail réalisé et clôturé - IMMUTABLE'),
    (4, 'Annulé',    'Ordre de travail annulé - IMMUTABLE'),
    (5, 'Réouvert',  'Ordre de travail réouvert pour correction ou mise à jour');

INSERT INTO priorites_ot (nom_priorite, niveau, description) VALUES
    ('Urgente', 1, 'Intervention immédiate requise'),
    ('Haute',   2, 'Intervention à planifier en priorité'),
    ('Normale', 3, 'Intervention standard selon planning'),
    ('Basse',   4, 'Intervention non prioritaire');


-- =========================================================================
-- PARTIE 3 : INDEX DE PERFORMANCE
-- =========================================================================

-- Ordres de travail
-- SUPPRIMÉ v7 : idx_ot_gamme — redondant avec idx_ot_gamme_statut (composite couvre le simple)
CREATE INDEX idx_ot_statut            ON ordres_travail(id_statut_ot);
CREATE INDEX idx_ot_prestataire       ON ordres_travail(id_prestataire);
CREATE INDEX idx_ot_date_prevue       ON ordres_travail(date_prevue);
CREATE INDEX idx_ot_gamme_statut      ON ordres_travail(id_gamme, id_statut_ot);
CREATE INDEX idx_ot_periodicite_snapshot ON ordres_travail(libelle_periodicite, jours_periodicite);
CREATE INDEX idx_ot_image             ON ordres_travail(id_image);
CREATE INDEX idx_ot_priorite          ON ordres_travail(id_priorite);
CREATE INDEX idx_ot_date_cloture      ON ordres_travail(date_cloture);
CREATE INDEX idx_ot_gamme_statut_date ON ordres_travail(id_gamme, id_statut_ot, date_prevue);
CREATE INDEX idx_ot_technicien        ON ordres_travail(id_technicien);
CREATE INDEX idx_ot_di                ON ordres_travail(id_di);

-- Opérations d'exécution
CREATE INDEX idx_ops_exec_ordre            ON operations_execution(id_ordre_travail);
CREATE INDEX idx_ops_exec_statut           ON operations_execution(id_statut_operation);
CREATE INDEX idx_ops_exec_conformite       ON operations_execution(est_conforme, date_execution);
-- SUPPRIMÉ v7 : idx_ops_exec_source — redondant avec idx_ops_exec_source_composite
CREATE INDEX idx_ops_exec_source_composite ON operations_execution(id_type_source, id_source, id_ordre_travail);
CREATE INDEX idx_ops_exec_ordre_statut     ON operations_execution(id_ordre_travail, id_statut_operation);

-- Contrats
CREATE INDEX idx_contrats_prestataire ON contrats(id_prestataire);
CREATE INDEX idx_contrats_dates       ON contrats(date_debut, date_fin);
CREATE INDEX idx_contrats_resiliation ON contrats(date_resiliation);
CREATE INDEX idx_contrats_validite    ON contrats(id_prestataire, date_debut, date_fin, date_resiliation);
CREATE INDEX idx_contrats_parent      ON contrats(id_contrat_parent);  -- navigation chaîne de versions
CREATE INDEX idx_contrats_archive     ON contrats(est_archive);        -- filtrer les actifs rapidement
CREATE INDEX idx_contrats_gammes_contrat ON contrats_gammes(id_contrat);
CREATE INDEX idx_contrats_gammes_gamme   ON contrats_gammes(id_gamme);

-- Documents (hash_sha256 UNIQUE crée déjà un index implicite)
CREATE INDEX idx_documents_type ON documents(id_type_document, date_upload);

-- Liaisons documentaires
CREATE INDEX idx_doc_prestataires_doc  ON documents_prestataires(id_document);
CREATE INDEX idx_doc_prestataires_prest ON documents_prestataires(id_prestataire);
CREATE INDEX idx_doc_ot_doc            ON documents_ordres_travail(id_document);
CREATE INDEX idx_doc_ot_ot             ON documents_ordres_travail(id_ordre_travail);
CREATE INDEX idx_doc_gammes_doc        ON documents_gammes(id_document);
CREATE INDEX idx_doc_gammes_gamme      ON documents_gammes(id_gamme);
CREATE INDEX idx_doc_contrats_doc      ON documents_contrats(id_document);
CREATE INDEX idx_doc_contrats_ctr      ON documents_contrats(id_contrat);
CREATE INDEX idx_doc_di_doc            ON documents_di(id_document);
CREATE INDEX idx_doc_di_di             ON documents_di(id_di);
CREATE INDEX idx_doc_localisations_doc ON documents_localisations(id_document);
CREATE INDEX idx_doc_localisations_local ON documents_localisations(id_local);
CREATE INDEX idx_doc_equipements_doc   ON documents_equipements(id_document);
CREATE INDEX idx_doc_equipements_equip ON documents_equipements(id_equipement);

-- Gammes et gammes types
CREATE INDEX idx_gammes_prestataire      ON gammes(id_prestataire, est_active);
CREATE INDEX idx_gammes_periodicite      ON gammes(id_periodicite, est_active);
CREATE INDEX idx_gammes_batiment_calc ON gammes(id_batiment_calc);
CREATE INDEX idx_gammes_niveau_calc   ON gammes(id_niveau_calc);
CREATE INDEX idx_gammes_local_calc    ON gammes(id_local_calc);
CREATE INDEX idx_gammes_famille_gamme    ON gammes(id_famille_gamme);           -- MODIFIÉ v13 : remplace idx_gammes_famille
CREATE INDEX idx_gammes_image            ON gammes(id_image);
CREATE INDEX idx_modeles_operations_creation   ON modeles_operations(date_creation);
CREATE INDEX idx_modeles_operations_image     ON modeles_operations(id_image);
CREATE INDEX idx_gamme_modeles_composite ON gamme_modeles(id_gamme, id_modele_operation);
CREATE INDEX idx_modeles_operations_items_gamme_type ON modeles_operations_items(id_modele_operation);
CREATE INDEX idx_modeles_operations_items_type   ON modeles_operations_items(id_type_operation);

-- AJOUT v13 : liaison N↔N gammes ↔ équipements
CREATE INDEX idx_gammes_equipements_gamme ON gammes_equipements(id_gamme);
CREATE INDEX idx_gammes_equipements_equip ON gammes_equipements(id_equipement);

-- Modèles de DI
CREATE INDEX idx_modeles_di_creation ON modeles_di(date_creation);

-- Demandes d'intervention
CREATE INDEX idx_di_statut_di          ON demandes_intervention(id_statut_di);  -- AJOUT v10
CREATE INDEX idx_di_prestataire        ON demandes_intervention(id_prestataire);
CREATE INDEX idx_di_dates              ON demandes_intervention(date_constat, date_resolution);
CREATE INDEX idx_di_statut             ON demandes_intervention(date_resolution);
CREATE INDEX idx_di_gammes_di          ON di_gammes(id_di);
CREATE INDEX idx_di_gammes_gamme       ON di_gammes(id_gamme);
CREATE INDEX idx_di_gammes_composite   ON di_gammes(id_gamme, id_di);
CREATE INDEX idx_di_localisations_di   ON di_localisations(id_di);
CREATE INDEX idx_di_localisations_local ON di_localisations(id_local);
CREATE INDEX idx_di_localisations_composite ON di_localisations(id_local, id_di);
-- AJOUT v18 : index DI ↔ équipements
CREATE INDEX idx_di_equipements_di         ON di_equipements(id_di);
CREATE INDEX idx_di_equipements_equip      ON di_equipements(id_equipement);
CREATE INDEX idx_di_equipements_composite  ON di_equipements(id_equipement, id_di);

-- Images
-- MODIFIÉ v13 : renommé depuis domaines_techniques
CREATE INDEX idx_domaines_equipements_image ON domaines_equipements(id_image);
CREATE INDEX idx_familles_image             ON familles_equipements(id_image);

-- AJOUT v13 : index images pour nouvelles tables gammes
CREATE INDEX idx_domaines_gammes_image  ON domaines_gammes(id_image);
CREATE INDEX idx_familles_gammes_image  ON familles_gammes(id_image);

-- Localisations structurées (v14)
CREATE INDEX idx_niveaux_batiment      ON niveaux(id_batiment);
CREATE INDEX idx_niveaux_image         ON niveaux(id_image);
CREATE INDEX idx_locaux_niveau         ON locaux(id_niveau);
CREATE INDEX idx_locaux_image          ON locaux(id_image);
CREATE INDEX idx_batiments_image       ON batiments(id_image);

-- Prestataires
CREATE INDEX idx_prestataires_image ON prestataires(id_image);

-- Techniciens
CREATE INDEX idx_techniciens_poste ON techniciens(id_poste);
CREATE INDEX idx_techniciens_image ON techniciens(id_image);

-- Établissements — AJOUT v7 : FK sans index
CREATE INDEX idx_etablissements_type_erp      ON etablissements(id_type_erp);
CREATE INDEX idx_etablissements_categorie_erp ON etablissements(id_categorie_erp);

-- Équipements
CREATE INDEX idx_equipements_famille      ON equipements(id_famille);
CREATE INDEX idx_equipements_local     ON equipements(id_local);
CREATE INDEX idx_equipements_actif        ON equipements(est_actif);
CREATE INDEX idx_equipements_image        ON equipements(id_image);
CREATE INDEX idx_equipements_nom_affichage ON equipements(nom_affichage);
CREATE INDEX idx_champs_modele            ON champs_modele(id_modele_equipement);
CREATE INDEX idx_valeurs_equipement       ON valeurs_equipements(id_equipement);
CREATE INDEX idx_valeurs_champ            ON valeurs_equipements(id_champ);
CREATE INDEX idx_familles_modele          ON familles_equipements(id_modele_equipement);

-- Opérations — AJOUT v7 : CRITIQUE, utilisé par ~8 triggers
CREATE INDEX idx_operations_gamme ON operations(id_gamme);
CREATE INDEX idx_operations_type  ON operations(id_type_operation);

-- Contrats — AJOUT v7 : FK sans index
CREATE INDEX idx_contrats_type ON contrats(id_type_contrat);

-- Familles — AJOUT v7 : FK sans index
CREATE INDEX idx_familles_domaine ON familles_equipements(id_domaine);

-- AJOUT v13 : FK sans index pour familles_gammes
CREATE INDEX idx_familles_gammes_domaine ON familles_gammes(id_domaine_gamme);

-- Gamme modèles — AJOUT v7 : lookup par id_modele_operation dans les triggers
CREATE INDEX idx_gamme_modeles_gamme_type ON gamme_modeles(id_modele_operation);

-- Index partiels — AJOUT v7 : accélère les triggers de propagation sur OT actifs
-- Ne contient que les OT non-terminaux (Planifié, En Cours, Réouvert)
CREATE INDEX idx_ot_gamme_actifs ON ordres_travail(id_gamme)
    WHERE id_statut_ot NOT IN (3, 4);
-- Ne contient que les contrats actifs (non archivés, non résiliés)
CREATE INDEX idx_contrats_actifs ON contrats(id_prestataire, date_debut, date_fin)
    WHERE est_archive = 0 AND date_resiliation IS NULL;


--------------------------------------------------------------------------------
-- 3.x CASCADE SUPPRESSION GAMME
-- Avant de supprimer une gamme, on supprime tous les OT liés.
-- Les FK CASCADE existantes s'occupent de : operations_execution,
-- documents_ordres_travail, documents_gammes, gammes_equipements, etc.
-- Les triggers orphelins documents ne se déclenchent PAS lors des cascades FK
-- (comportement SQLite), donc les documents eux-mêmes sont préservés.
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS cascade_suppression_gamme;
CREATE TRIGGER cascade_suppression_gamme
BEFORE DELETE ON gammes
BEGIN
    DELETE FROM ordres_travail WHERE id_gamme = OLD.id_gamme;
    DELETE FROM contrats_gammes WHERE id_gamme = OLD.id_gamme;
END;


-- =========================================================================
-- PARTIE 4 : TRIGGERS SYSTÈME
-- =========================================================================
-- Statuts OT : 1=Planifié, 2=En Cours, 3=Clôturé, 4=Annulé, 5=Réouvert
-- Terminaux (immutables) : 3, 4
-- Actifs : 1, 2, 5
-- =========================================================================

--------------------------------------------------------------------------------
-- 4.1 PROTECTION DES OT ET OPÉRATIONS TERMINAUX
--------------------------------------------------------------------------------

-- Protection des OT terminaux (Clôturé=3, Annulé=4)
-- Approche BLACKLIST : les champs listés sont PROTÉGÉS.
-- IMPORTANT MAINTENANCE : si une nouvelle colonne est ajoutée à ordres_travail
-- et doit être protégée sur les OT terminaux, l'ajouter explicitement ici.
-- Les champs système (date_debut, date_cloture, commentaires, snapshots périodicité)
-- ne sont PAS listés → modifiables par triggers internes.
DROP TRIGGER IF EXISTS protection_ot_terminaux;
CREATE TRIGGER protection_ot_terminaux
BEFORE UPDATE ON ordres_travail
FOR EACH ROW
WHEN OLD.id_statut_ot IN (3, 4)
    AND NEW.id_statut_ot != 5                              -- Sauf réouverture (Clôturé→Réouvert)
    AND NOT (OLD.id_statut_ot = 4 AND NEW.id_statut_ot = 1) -- Sauf résurrection (Annulé→Planifié)
    AND (
        OLD.id_statut_ot          IS NOT NEW.id_statut_ot
        OR OLD.nom_gamme           IS NOT NEW.nom_gamme
        OR OLD.description_gamme   IS NOT NEW.description_gamme
        OR OLD.est_reglementaire   IS NOT NEW.est_reglementaire
        OR OLD.nom_localisation    IS NOT NEW.nom_localisation
        OR OLD.nom_famille         IS NOT NEW.nom_famille
        OR OLD.nom_prestataire     IS NOT NEW.nom_prestataire  -- CORRIGÉ : ajout
        OR OLD.id_prestataire      IS NOT NEW.id_prestataire
        OR OLD.id_gamme            IS NOT NEW.id_gamme          -- CORRIGÉ : renommé
        OR OLD.date_prevue         IS NOT NEW.date_prevue
        OR OLD.est_automatique     IS NOT NEW.est_automatique
        OR OLD.id_priorite         IS NOT NEW.id_priorite
        OR (OLD.id_image IS NOT NEW.id_image AND NEW.id_image IS NOT NULL)  -- CORRIGÉ v11 : autorise SET NULL (comme id_di et id_technicien)
        OR (OLD.id_di IS NOT NEW.id_di AND NEW.id_di IS NOT NULL)
        OR (OLD.id_technicien IS NOT NEW.id_technicien AND NEW.id_technicien IS NOT NULL)
        OR OLD.nom_technicien      IS NOT NEW.nom_technicien
        OR OLD.nom_poste           IS NOT NEW.nom_poste          -- AJOUT v5
        OR OLD.nom_equipement      IS NOT NEW.nom_equipement
    )
BEGIN
    SELECT RAISE(ABORT, 'Modification interdite : OT terminé. Utilisez la réouverture si une correction est nécessaire.');
END;

DROP TRIGGER IF EXISTS protection_operations_ot_terminaux;
CREATE TRIGGER protection_operations_ot_terminaux
BEFORE UPDATE ON operations_execution
FOR EACH ROW
WHEN (
    SELECT id_statut_ot FROM ordres_travail WHERE id_ordre_travail = NEW.id_ordre_travail
) IN (3, 4)
AND NOT (
    -- Exception : auto-annulation système lors annulation OT
    -- Seuls les statuts 1 (En attente) et 2 (En cours) peuvent être annulés par cascade
    -- Le statut 5 (Non applicable) n'est jamais modifié par le système
    OLD.id_statut_operation IN (1, 2)
    AND NEW.id_statut_operation = 4
    AND (SELECT id_statut_ot FROM ordres_travail WHERE id_ordre_travail = NEW.id_ordre_travail) = 4
)
BEGIN
    SELECT RAISE(ABORT, 'Modification interdite : cette opération appartient à un OT terminé');
END;

DROP TRIGGER IF EXISTS protection_suppression_operations_terminaux;
CREATE TRIGGER protection_suppression_operations_terminaux
BEFORE DELETE ON operations_execution
FOR EACH ROW
WHEN (
    SELECT id_statut_ot FROM ordres_travail WHERE id_ordre_travail = OLD.id_ordre_travail
) IN (3, 4)
BEGIN
    SELECT RAISE(ABORT, 'Suppression interdite : cette opération appartient à un OT terminé');
END;

DROP TRIGGER IF EXISTS protection_ajout_operations_terminaux;
CREATE TRIGGER protection_ajout_operations_terminaux
BEFORE INSERT ON operations_execution
FOR EACH ROW
WHEN (
    SELECT id_statut_ot FROM ordres_travail WHERE id_ordre_travail = NEW.id_ordre_travail
) IN (3, 4)
BEGIN
    SELECT RAISE(ABORT, 'Ajout interdit : impossible d''ajouter des opérations à un OT terminé');
END;


--------------------------------------------------------------------------------
-- 4.2 VALIDATION DES TRANSITIONS DE STATUTS
--------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS validation_transitions_manuelles;
CREATE TRIGGER validation_transitions_manuelles
BEFORE UPDATE OF id_statut_ot ON ordres_travail
FOR EACH ROW
WHEN OLD.id_statut_ot != NEW.id_statut_ot
BEGIN
    SELECT CASE
        WHEN OLD.id_statut_ot = 1 AND NEW.id_statut_ot NOT IN (2, 3, 4)
            THEN RAISE(ABORT, 'Transition interdite depuis Planifié')
        WHEN OLD.id_statut_ot = 2 AND NEW.id_statut_ot NOT IN (1, 3, 4)
            THEN RAISE(ABORT, 'Transition interdite depuis En Cours')
        WHEN OLD.id_statut_ot = 3 AND NEW.id_statut_ot != 5
            THEN RAISE(ABORT, 'Transition interdite depuis Clôturé : seule la Réouverture est autorisée')
        WHEN OLD.id_statut_ot = 4 AND NEW.id_statut_ot != 1
            THEN RAISE(ABORT, 'Transition interdite depuis Annulé : seul Planifié est autorisé')
        WHEN OLD.id_statut_ot = 4 AND NEW.id_statut_ot = 1
            AND NOT EXISTS (
                SELECT 1 FROM gammes WHERE id_gamme = NEW.id_gamme AND est_active = 1
            )
            THEN RAISE(ABORT, 'Résurrection impossible : la gamme est inactive')
        -- SUPPRIMÉ v16 : validation contractuelle à la résurrection supprimée.
        -- La résurrection utilise reinitialisation_resurrection qui prend le prestataire
        -- actuel de la gamme. Pas de blocage lié au réglementaire.
        -- AJOUT v11 : clôture manuelle bloquée si des opérations ne sont pas terminées.
        -- Clôturer = "le travail est fait". Si des ops sont en attente (1) ou en cours (2),
        -- c'est incohérent. Pour sauter un OT sans l'exécuter, utiliser l'annulation (→4).
        -- Note : gestion_statut_ot (auto-clôture) vérifie déjà cette condition,
        -- donc ce garde ne bloque que les clôtures MANUELLES prématurées.
        WHEN NEW.id_statut_ot = 3
            AND EXISTS (
                SELECT 1 FROM operations_execution
                WHERE id_ordre_travail = NEW.id_ordre_travail
                  AND id_statut_operation IN (1, 2)
            )
            THEN RAISE(ABORT, 'Clôture impossible : des opérations sont encore en attente ou en cours. Terminez-les ou annulez l''OT.')
        WHEN OLD.id_statut_ot = 5 AND NEW.id_statut_ot NOT IN (1, 2, 3, 4)
            THEN RAISE(ABORT, 'Transition interdite depuis Réouvert')
    END;
END;

DROP TRIGGER IF EXISTS validation_gamme_avec_operations;
CREATE TRIGGER validation_gamme_avec_operations
BEFORE INSERT ON ordres_travail
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM gammes WHERE id_gamme = NEW.id_gamme AND est_active = 1
        )
            THEN RAISE(ABORT, 'Impossible de créer un OT : cette gamme est inactive ou inexistante')
        WHEN NOT EXISTS (
            SELECT 1 FROM operations WHERE id_gamme = NEW.id_gamme
        )
        AND NOT EXISTS (
            SELECT 1 FROM gamme_modeles gm
            JOIN modeles_operations_items gti ON gm.id_modele_operation = gti.id_modele_operation
            WHERE gm.id_gamme = NEW.id_gamme
        )
            THEN RAISE(ABORT, 'Impossible de créer un OT : cette gamme n''a aucune opération exécutable')
    END;
END;

-- Protection suppression type document : bloque si des documents y sont rattachés.
-- L'interface doit intercepter ce message et proposer le workflow de reclassification.
-- est_systeme = 1 est un signal UI uniquement — la base ne protège pas différemment
-- les types système, c'est à l'interface d'afficher un avertissement supplémentaire.
-- Protection : 'Annulée' (id=4) est réservé au système.
-- L'utilisateur doit utiliser 'Non applicable' (id=5) pour écarter manuellement une opération.
-- Exception autorisée : cascade système lors de l'annulation d'un OT.
-- Validation : un technicien interne ne peut être assigné qu'à un OT interne.
-- Les OT externes (prestataire != 1) sont réalisés par l'entreprise externe —
-- le nom du technicien externe n'est pas géré dans cette base.
DROP TRIGGER IF EXISTS validation_technicien_interne_uniquement;
CREATE TRIGGER validation_technicien_interne_uniquement
BEFORE UPDATE OF id_technicien ON ordres_travail
FOR EACH ROW
WHEN NEW.id_technicien IS NOT NULL
  AND NEW.id_prestataire != 1
BEGIN
    SELECT RAISE(ABORT,
        'Assignation impossible : un technicien interne ne peut être assigné à un OT externe. Le prestataire externe gère ses propres intervenants.'
    );
END;

-- AJOUT v10 : validation INSERT — complète le trigger UPDATE ci-dessus
-- Sans ce trigger, un INSERT d'OT externe avec id_technicien renseigné passe.
DROP TRIGGER IF EXISTS validation_technicien_interne_insert;
CREATE TRIGGER validation_technicien_interne_insert
BEFORE INSERT ON ordres_travail
FOR EACH ROW
WHEN NEW.id_technicien IS NOT NULL
  AND NEW.id_prestataire != 1
BEGIN
    SELECT RAISE(ABORT,
        'Assignation impossible : un technicien interne ne peut être assigné à un OT externe. Le prestataire externe gère ses propres intervenants.'
    );
END;

-- AJOUT v12 : un technicien inactif (est_actif=0) ne peut pas être assigné à un OT.
-- L'inactivation = le technicien n'est plus disponible. L'application doit d'abord
-- le réactiver ou choisir un autre technicien.
DROP TRIGGER IF EXISTS validation_technicien_actif_insert;
CREATE TRIGGER validation_technicien_actif_insert
BEFORE INSERT ON ordres_travail
FOR EACH ROW
WHEN NEW.id_technicien IS NOT NULL
    AND (SELECT est_actif FROM techniciens WHERE id_technicien = NEW.id_technicien) = 0
BEGIN
    SELECT RAISE(ABORT,
        'Assignation impossible : ce technicien est inactif. Réactivez-le ou choisissez un autre technicien.'
    );
END;

DROP TRIGGER IF EXISTS validation_technicien_actif_update;
CREATE TRIGGER validation_technicien_actif_update
BEFORE UPDATE OF id_technicien ON ordres_travail
FOR EACH ROW
WHEN NEW.id_technicien IS NOT NULL
    AND OLD.id_technicien IS NOT NEW.id_technicien
    AND (SELECT est_actif FROM techniciens WHERE id_technicien = NEW.id_technicien) = 0
BEGIN
    SELECT RAISE(ABORT,
        'Assignation impossible : ce technicien est inactif. Réactivez-le ou choisissez un autre technicien.'
    );
END;

-- AJOUT v11 : id_gamme est une référence figée à la création.
-- Le modifier sur un OT actif désynchronise les snapshots et les opérations :
-- les operations_execution pointent vers les sources de la gamme d'origine,
-- et la reprogrammation utiliserait la nouvelle gamme. État corrompu.
-- Note : id_prestataire n'est PAS protégé ici car il est légitimement modifié
-- par creation_ot_complet (résolution) et reinitialisation_resurrection (refresh).
DROP TRIGGER IF EXISTS protection_id_gamme_ot;
CREATE TRIGGER protection_id_gamme_ot
BEFORE UPDATE OF id_gamme ON ordres_travail
FOR EACH ROW
WHEN OLD.id_gamme IS NOT NEW.id_gamme
BEGIN
    SELECT RAISE(ABORT,
        'Modification interdite : id_gamme est figé à la création. Annulez cet OT et créez-en un nouveau.'
    );
END;

DROP TRIGGER IF EXISTS protection_statut_annulee_manuel;
CREATE TRIGGER protection_statut_annulee_manuel
BEFORE UPDATE OF id_statut_operation ON operations_execution
FOR EACH ROW
WHEN NEW.id_statut_operation = 4
AND NOT (
    -- Exception 1 : auto-annulation système — OT vient d'être annulé
    OLD.id_statut_operation IN (1, 2)
    AND (SELECT id_statut_ot FROM ordres_travail WHERE id_ordre_travail = NEW.id_ordre_travail) = 4
)
AND NOT (
    -- Exception 2 : nettoyage système — la source de l'opération a été supprimée ou dissociée
    -- Couvre : suppression d'opération spécifique, suppression de gamme_type_item,
    -- dissociation gamme_type/gamme (DELETE gamme_modeles)
    OLD.id_statut_operation IN (2, 3)
    AND (
        (OLD.id_type_source = 1 AND NOT EXISTS (
            SELECT 1 FROM operations o
            WHERE o.id_operation = OLD.id_source
              AND o.id_gamme = (SELECT id_gamme FROM ordres_travail WHERE id_ordre_travail = OLD.id_ordre_travail)
        ))
        OR (OLD.id_type_source = 2 AND NOT EXISTS (
            SELECT 1 FROM modeles_operations_items gti
            JOIN gamme_modeles gm ON gti.id_modele_operation = gm.id_modele_operation
            WHERE gti.id_modele_operation_item = OLD.id_source
              AND gm.id_gamme = (SELECT id_gamme FROM ordres_travail WHERE id_ordre_travail = OLD.id_ordre_travail)
        ))
    )
)
BEGIN
    SELECT RAISE(ABORT,
        'Le statut Annulée est réservé au système. Utilisez Non applicable pour écarter manuellement une opération.'
    );
END;

-- Versioning contrats : archivage automatique du parent quand une nouvelle version est créée.
-- Règle : créer un contrat avec id_contrat_parent renseigné = créer un avenant.
-- Le parent est automatiquement marqué est_archive = 1 et ne peut plus être modifié.
DROP TRIGGER IF EXISTS archivage_contrat_parent;
CREATE TRIGGER archivage_contrat_parent
AFTER INSERT ON contrats
FOR EACH ROW
WHEN NEW.id_contrat_parent IS NOT NULL
BEGIN
    -- Vérifier que le parent n'est pas déjà archivé
    SELECT CASE
        WHEN (SELECT est_archive FROM contrats WHERE id_contrat = NEW.id_contrat_parent) = 1
        THEN RAISE(ABORT, 'Impossible : ce contrat est déjà archivé — il a déjà une version plus récente')
        WHEN (SELECT id_prestataire FROM contrats WHERE id_contrat = NEW.id_contrat_parent) != NEW.id_prestataire
        THEN RAISE(ABORT, 'Impossible : le prestataire de l''avenant doit être identique au contrat parent')
    END;
    -- Archiver le parent
    UPDATE contrats
    SET est_archive = 1
    WHERE id_contrat = NEW.id_contrat_parent;
END;

-- Protection : un contrat archivé est figé — exactement comme un OT clôturé.
-- Seul est_archive lui-même peut être modifié (pour une annulation d'avenant éventuelle).
DROP TRIGGER IF EXISTS protection_contrat_archive;
CREATE TRIGGER protection_contrat_archive
BEFORE UPDATE ON contrats
FOR EACH ROW
WHEN OLD.est_archive = 1
    AND (
        OLD.id_prestataire            IS NOT NEW.id_prestataire
        OR OLD.id_type_contrat        IS NOT NEW.id_type_contrat
        OR OLD.id_contrat_parent      IS NOT NEW.id_contrat_parent
        OR OLD.date_signature         IS NOT NEW.date_signature
        OR OLD.date_debut             IS NOT NEW.date_debut
        OR OLD.date_fin               IS NOT NEW.date_fin
        OR OLD.date_resiliation       IS NOT NEW.date_resiliation
        OR OLD.date_notification      IS NOT NEW.date_notification
        OR OLD.duree_cycle_mois       IS NOT NEW.duree_cycle_mois
        OR OLD.delai_preavis_jours    IS NOT NEW.delai_preavis_jours
        OR OLD.fenetre_resiliation_jours IS NOT NEW.fenetre_resiliation_jours
        OR OLD.commentaires           IS NOT NEW.commentaires
        OR OLD.objet_avenant          IS NOT NEW.objet_avenant
        OR OLD.reference              IS NOT NEW.reference
        OR OLD.est_archive            IS NOT NEW.est_archive
    )
BEGIN
    SELECT RAISE(ABORT,
        'Modification interdite : ce contrat est archivé — une version plus récente existe. Créez un nouvel avenant si nécessaire.'
    );
END;

DROP TRIGGER IF EXISTS protection_suppression_type_document;
CREATE TRIGGER protection_suppression_type_document
BEFORE DELETE ON types_documents
WHEN EXISTS (
    SELECT 1 FROM documents WHERE id_type_document = OLD.id_type_document
)
BEGIN
    SELECT RAISE(ABORT,
        'Suppression impossible : des documents utilisent ce type. Reclassifiez-les d''abord.'
    );
END;

DROP TRIGGER IF EXISTS protection_prestataire_interne;
CREATE TRIGGER protection_prestataire_interne
BEFORE DELETE ON prestataires
WHEN OLD.id_prestataire = 1
BEGIN
    SELECT RAISE(ABORT, 'Le prestataire interne (id=1) ne peut pas être supprimé');
END;

-- AJOUT v12 : message clair si suppression prestataire avec contrats actifs
-- FK RESTRICT bloque déjà, mais le message est cryptique ("FOREIGN KEY constraint failed").
-- Ce trigger donne un message actionnable.
DROP TRIGGER IF EXISTS protection_suppression_prestataire_contrats;
CREATE TRIGGER protection_suppression_prestataire_contrats
BEFORE DELETE ON prestataires
FOR EACH ROW
WHEN OLD.id_prestataire != 1
    AND EXISTS (
        SELECT 1 FROM contrats
        WHERE id_prestataire = OLD.id_prestataire
          AND est_archive = 0
    )
BEGIN
    SELECT RAISE(ABORT,
        'Suppression impossible : ce prestataire a des contrats actifs. Archivez ou supprimez les contrats d''abord.'
    );
END;

DROP TRIGGER IF EXISTS protection_desactivation_gamme;
CREATE TRIGGER protection_desactivation_gamme
BEFORE UPDATE OF est_active ON gammes
FOR EACH ROW
WHEN OLD.est_active = 1 AND NEW.est_active = 0
    AND EXISTS (
        SELECT 1 FROM ordres_travail
        WHERE id_gamme = OLD.id_gamme AND id_statut_ot IN (1, 2, 5)
    )
BEGIN
    SELECT RAISE(ABORT, 'Désactivation impossible : des OT actifs existent encore pour cette gamme');
END;

-- AJOUT v11 : protection passage réglementaire avec OT actifs externes
-- Si la gamme a des OT actifs avec un prestataire externe, passer en réglementaire
-- sans contrat valide créerait un état incohérent. Bloquer le changement.
-- L'utilisateur doit d'abord clôturer/annuler les OT actifs, ou lier un contrat.
-- SUPPRIMÉ v16 : protection_passage_reglementaire supprimé.
-- Le flag est_reglementaire est purement informatif, il ne conditionne plus
-- la validité contractuelle. Le passage 0→1 est libre.

-- SUPPRIMÉ v14 : protection_cycle_localisation_insert et protection_cycle_localisation_update
-- Plus nécessaires — la hiérarchie localisations est désormais à 3 niveaux fixes (batiments > niveaux > locaux)
-- sans auto-référence possible.
DROP TRIGGER IF EXISTS protection_cycle_localisation_insert;
DROP TRIGGER IF EXISTS protection_cycle_localisation_update;


--------------------------------------------------------------------------------
-- 4.3 VALIDATION COHÉRENCE TYPES D'OPÉRATIONS / SEUILS / UNITÉS
--------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS validation_coherence_type_operation_gamme_type;
CREATE TRIGGER validation_coherence_type_operation_gamme_type
BEFORE INSERT ON modeles_operations_items
BEGIN
    SELECT CASE
        WHEN (SELECT necessite_seuils FROM types_operations WHERE id_type_operation = NEW.id_type_operation) = 1
            AND NEW.id_unite IS NULL
            THEN RAISE(ABORT, 'Les opérations de type mesure nécessitent une unité')
        WHEN (SELECT necessite_seuils FROM types_operations WHERE id_type_operation = NEW.id_type_operation) = 0
            AND (NEW.seuil_minimum IS NOT NULL OR NEW.seuil_maximum IS NOT NULL OR NEW.id_unite IS NOT NULL)
            THEN RAISE(ABORT, 'Les opérations qualitatives ne peuvent pas avoir de seuils ni d''unité')
    END;
END;

DROP TRIGGER IF EXISTS validation_coherence_type_operation_specifique;
CREATE TRIGGER validation_coherence_type_operation_specifique
BEFORE INSERT ON operations
BEGIN
    SELECT CASE
        WHEN (SELECT necessite_seuils FROM types_operations WHERE id_type_operation = NEW.id_type_operation) = 1
            AND NEW.id_unite IS NULL
            THEN RAISE(ABORT, 'Les opérations de type mesure nécessitent une unité')
        WHEN (SELECT necessite_seuils FROM types_operations WHERE id_type_operation = NEW.id_type_operation) = 0
            AND (NEW.seuil_minimum IS NOT NULL OR NEW.seuil_maximum IS NOT NULL OR NEW.id_unite IS NOT NULL)
            THEN RAISE(ABORT, 'Les opérations qualitatives ne peuvent pas avoir de seuils ni d''unité')
    END;
END;

DROP TRIGGER IF EXISTS validation_coherence_type_operation_gamme_type_update;
CREATE TRIGGER validation_coherence_type_operation_gamme_type_update
BEFORE UPDATE ON modeles_operations_items
WHEN OLD.id_type_operation != NEW.id_type_operation
  OR OLD.id_unite IS NOT NEW.id_unite
  OR OLD.seuil_minimum IS NOT NEW.seuil_minimum
  OR OLD.seuil_maximum IS NOT NEW.seuil_maximum
BEGIN
    SELECT CASE
        WHEN (SELECT necessite_seuils FROM types_operations WHERE id_type_operation = NEW.id_type_operation) = 1
            AND NEW.id_unite IS NULL
            THEN RAISE(ABORT, 'Les opérations de type mesure nécessitent une unité')
        WHEN (SELECT necessite_seuils FROM types_operations WHERE id_type_operation = NEW.id_type_operation) = 0
            AND (NEW.seuil_minimum IS NOT NULL OR NEW.seuil_maximum IS NOT NULL OR NEW.id_unite IS NOT NULL)
            THEN RAISE(ABORT, 'Les opérations qualitatives ne peuvent pas avoir de seuils ni d''unité')
    END;
END;

DROP TRIGGER IF EXISTS validation_coherence_type_operation_specifique_update;
CREATE TRIGGER validation_coherence_type_operation_specifique_update
BEFORE UPDATE ON operations
WHEN OLD.id_type_operation != NEW.id_type_operation
  OR OLD.id_unite IS NOT NEW.id_unite
  OR OLD.seuil_minimum IS NOT NEW.seuil_minimum
  OR OLD.seuil_maximum IS NOT NEW.seuil_maximum
BEGIN
    SELECT CASE
        WHEN (SELECT necessite_seuils FROM types_operations WHERE id_type_operation = NEW.id_type_operation) = 1
            AND NEW.id_unite IS NULL
            THEN RAISE(ABORT, 'Les opérations de type mesure nécessitent une unité')
        WHEN (SELECT necessite_seuils FROM types_operations WHERE id_type_operation = NEW.id_type_operation) = 0
            AND (NEW.seuil_minimum IS NOT NULL OR NEW.seuil_maximum IS NOT NULL OR NEW.id_unite IS NOT NULL)
            THEN RAISE(ABORT, 'Les opérations qualitatives ne peuvent pas avoir de seuils ni d''unité')
    END;
END;


--------------------------------------------------------------------------------
-- 4.4 PROTECTION DES SOURCES D'OPÉRATIONS
--------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS validation_suppression_operation_specifique;
CREATE TRIGGER validation_suppression_operation_specifique
BEFORE DELETE ON operations
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM ordres_travail ot
            WHERE ot.id_gamme = OLD.id_gamme
              AND ot.id_statut_ot IN (1, 2, 5)
              AND NOT EXISTS (
                  SELECT 1 FROM (
                      SELECT 1 FROM operations o
                      WHERE o.id_gamme = OLD.id_gamme
                        AND o.id_operation != OLD.id_operation
                      UNION ALL
                      SELECT 1 FROM gamme_modeles gm
                      JOIN modeles_operations_items gti ON gm.id_modele_operation = gti.id_modele_operation
                      WHERE gm.id_gamme = OLD.id_gamme
                  ) sources_restantes
              )
        )
        THEN RAISE(ABORT, 'Suppression impossible : cette opération est la dernière source pour une gamme ayant des OT actifs.')
    END;
END;

DROP TRIGGER IF EXISTS validation_suppression_association_gamme_type;
CREATE TRIGGER validation_suppression_association_gamme_type
BEFORE DELETE ON gamme_modeles
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM ordres_travail ot
            WHERE ot.id_gamme = OLD.id_gamme
              AND ot.id_statut_ot IN (1, 2, 5)
              AND NOT EXISTS (
                  SELECT 1 FROM (
                      SELECT 1 FROM operations o WHERE o.id_gamme = OLD.id_gamme
                      UNION ALL
                      SELECT 1 FROM gamme_modeles gm
                      JOIN modeles_operations_items gti ON gm.id_modele_operation = gti.id_modele_operation
                      WHERE gm.id_gamme = OLD.id_gamme
                        AND gm.id_modele_operation != OLD.id_modele_operation
                  ) sources_restantes
              )
        )
        THEN RAISE(ABORT, 'Déassociation impossible : cette gamme type est la dernière source pour une gamme ayant des OT actifs.')
    END;
END;

DROP TRIGGER IF EXISTS protection_dernier_item_gamme_type;
CREATE TRIGGER protection_dernier_item_gamme_type
BEFORE DELETE ON modeles_operations_items
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM modeles_operations_items gti
            WHERE gti.id_modele_operation = OLD.id_modele_operation
              AND gti.id_modele_operation_item != OLD.id_modele_operation_item
        )
        AND EXISTS (
            SELECT 1 FROM gamme_modeles gm
            JOIN ordres_travail ot ON ot.id_gamme = gm.id_gamme
            WHERE gm.id_modele_operation = OLD.id_modele_operation
              AND ot.id_statut_ot IN (1, 2, 5)
              AND NOT EXISTS (
                  SELECT 1 FROM (
                      SELECT 1 FROM operations o WHERE o.id_gamme = gm.id_gamme
                      UNION ALL
                      SELECT 1 FROM gamme_modeles gm2
                      JOIN modeles_operations_items gti2 ON gm2.id_modele_operation = gti2.id_modele_operation
                      WHERE gm2.id_gamme = gm.id_gamme
                        AND gm2.id_modele_operation != OLD.id_modele_operation
                  ) sources_alternatives
              )
        )
        THEN RAISE(ABORT, 'Suppression impossible : dernière opération de sa gamme type, seule source pour des gammes ayant des OT actifs.')
    END;
END;

DROP TRIGGER IF EXISTS validation_suppression_gamme_type_globale;
CREATE TRIGGER validation_suppression_gamme_type_globale
BEFORE DELETE ON modeles_operations
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM gamme_modeles gm
            JOIN ordres_travail ot ON ot.id_gamme = gm.id_gamme
            WHERE gm.id_modele_operation = OLD.id_modele_operation
              AND ot.id_statut_ot IN (1, 2, 5)
              AND NOT EXISTS (
                  SELECT 1 FROM (
                      SELECT 1 FROM operations o WHERE o.id_gamme = gm.id_gamme
                      UNION ALL
                      SELECT 1 FROM gamme_modeles gm2
                      JOIN modeles_operations_items gti ON gm2.id_modele_operation = gti.id_modele_operation
                      WHERE gm2.id_gamme = gm.id_gamme
                        AND gm2.id_modele_operation != OLD.id_modele_operation
                  ) autres_sources
              )
        )
        THEN RAISE(ABORT, 'Suppression impossible : cette gamme type est la dernière source pour des gammes ayant des OT actifs.')
    END;
END;

DROP TRIGGER IF EXISTS validation_gamme_type_non_vide;
CREATE TRIGGER validation_gamme_type_non_vide
BEFORE INSERT ON gamme_modeles
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM modeles_operations_items gti WHERE gti.id_modele_operation = NEW.id_modele_operation
        )
        THEN RAISE(ABORT, 'Association impossible : cette gamme type ne contient aucune opération.')
    END;
END;


--------------------------------------------------------------------------------
-- 4.5 TRIGGERS FONCTIONNELS (workflow, génération)
--------------------------------------------------------------------------------

-- SUPPRIMÉ v16 : validation_contrat_creation supprimé.
-- Le réglementaire est une info, pas un verrou. La bascule sur interne dans
-- creation_ot_complet couvre tous les cas (réglementaire ou non) :
-- pas de contrat valide → id_prestataire = 1 (interne) + trace commentaire.

-- Initialisation complète de l'OT après création.
-- Gère : snapshots descriptifs, résolution et snapshot prestataire,
--        bascule sur interne si pas de contrat (gamme non réglementaire),
--        génération des opérations depuis gammes types et opérations spécifiques.
-- MODIFIÉ v13 : nom_famille résolu depuis familles_gammes (plus familles_equipements),
--               nom_equipement résolu depuis gammes_equipements (si exactement 1 lié).
DROP TRIGGER IF EXISTS creation_ot_complet;
CREATE TRIGGER creation_ot_complet
AFTER INSERT ON ordres_travail
BEGIN
    -- Étape 1 : Snapshots descriptifs + résolution et snapshot prestataire
    -- Le prestataire effectif est calculé ici et figé (snapshot).
    -- Pour les gammes réglementaires sans contrat, le BEFORE INSERT a déjà bloqué.
    -- Pour les gammes non réglementaires sans contrat, bascule sur interne + trace.
    UPDATE ordres_travail
    SET
        id_statut_ot = 1,

        -- Snapshots depuis la gamme
        nom_gamme = (
            SELECT g.nom_gamme FROM gammes g WHERE g.id_gamme = NEW.id_gamme
        ),
        description_gamme = (
            SELECT g.description FROM gammes g WHERE g.id_gamme = NEW.id_gamme
        ),
        est_reglementaire = (
            SELECT g.est_reglementaire FROM gammes g WHERE g.id_gamme = NEW.id_gamme
        ),
        -- MODIFIÉ v15 : localisation héritée depuis gammes.nom_localisation_calc
        nom_localisation = (SELECT nom_localisation_calc FROM gammes WHERE id_gamme = NEW.id_gamme),
        -- MODIFIÉ v13 : résolution depuis familles_gammes (plus familles_equipements)
        nom_famille = (
            SELECT fg.nom_famille
            FROM gammes g
            JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme
            WHERE g.id_gamme = NEW.id_gamme
        ),

        -- Snapshots périodicité
        libelle_periodicite = (
            SELECT p.libelle
            FROM periodicites p
            JOIN gammes g ON p.id_periodicite = g.id_periodicite
            WHERE g.id_gamme = NEW.id_gamme
        ),
        jours_periodicite = (
            SELECT p.jours_periodicite
            FROM periodicites p
            JOIN gammes g ON p.id_periodicite = g.id_periodicite
            WHERE g.id_gamme = NEW.id_gamme
        ),
        periodicite_jours_valides = (
            SELECT p.jours_valide
            FROM periodicites p
            JOIN gammes g ON p.id_periodicite = g.id_periodicite
            WHERE g.id_gamme = NEW.id_gamme
        ),

        -- Image depuis la gamme
        id_image = (
            SELECT g.id_image FROM gammes g WHERE g.id_gamme = NEW.id_gamme
        ),

        -- Technicien + poste (snapshot conditionnel : interne uniquement)
        nom_technicien = CASE
            WHEN NEW.id_prestataire = 1
            THEN (SELECT t.nom || ' ' || t.prenom FROM techniciens t WHERE t.id_technicien = NEW.id_technicien)
            ELSE NULL
        END,
        nom_poste = CASE
            WHEN NEW.id_prestataire = 1
            THEN (
                SELECT p.libelle FROM techniciens t
                JOIN postes p ON t.id_poste = p.id_poste
                WHERE t.id_technicien = NEW.id_technicien
            )
            ELSE NULL
        END,

        -- MODIFIÉ v17 : nom_affichage au lieu de nom, numero_serie_equipement supprimé
        -- Rempli uniquement si exactement 1 équipement est lié à la gamme, sinon NULL.
        nom_equipement = CASE
            WHEN (SELECT COUNT(*) FROM gammes_equipements WHERE id_gamme = NEW.id_gamme) = 1
            THEN (
                SELECT e.nom_affichage
                FROM gammes_equipements ge
                JOIN equipements e ON ge.id_equipement = e.id_equipement
                WHERE ge.id_gamme = NEW.id_gamme
            )
            ELSE NULL
        END,

        -- CORRIGÉ v16 : Résolution et snapshot du prestataire
        -- Règle : prestataire externe valide → conservé | pas de contrat → bascule sur interne
        -- MODIFIÉ v16 : contrats tacites (id_type_contrat = 2) considérés valides tant que non résiliés
        id_prestataire = CASE
            WHEN NEW.id_prestataire = 1 THEN 1
            WHEN EXISTS(SELECT 1 FROM contrats_gammes WHERE id_gamme = NEW.id_gamme)
                AND EXISTS(
                    SELECT 1 FROM contrats_gammes cg
                    JOIN contrats c ON c.id_contrat = cg.id_contrat
                    WHERE cg.id_gamme = NEW.id_gamme
                      AND c.id_prestataire = NEW.id_prestataire
                      AND c.date_debut <= NEW.date_prevue
                      AND (c.date_fin IS NULL OR c.date_fin >= NEW.date_prevue OR c.id_type_contrat = 2)
                      AND c.date_resiliation IS NULL
                      AND c.est_archive = 0
                ) THEN NEW.id_prestataire
            WHEN NOT EXISTS(SELECT 1 FROM contrats_gammes WHERE id_gamme = NEW.id_gamme)
                AND EXISTS(
                    SELECT 1 FROM contrats c
                    WHERE c.id_prestataire = NEW.id_prestataire
                      AND c.date_debut <= NEW.date_prevue
                      AND (c.date_fin IS NULL OR c.date_fin >= NEW.date_prevue OR c.id_type_contrat = 2)
                      AND c.date_resiliation IS NULL
                      AND c.est_archive = 0
                ) THEN NEW.id_prestataire
            ELSE 1
        END,

        -- CORRIGÉ v16 : Snapshot nom_prestataire — tacite pris en compte
        nom_prestataire = (
            SELECT p.libelle FROM prestataires p WHERE p.id_prestataire =
            CASE
                WHEN NEW.id_prestataire = 1 THEN 1
                WHEN EXISTS(SELECT 1 FROM contrats_gammes WHERE id_gamme = NEW.id_gamme)
                    AND EXISTS(
                        SELECT 1 FROM contrats_gammes cg
                        JOIN contrats c ON c.id_contrat = cg.id_contrat
                        WHERE cg.id_gamme = NEW.id_gamme
                          AND c.id_prestataire = NEW.id_prestataire
                          AND c.date_debut <= NEW.date_prevue
                          AND (c.date_fin IS NULL OR c.date_fin >= NEW.date_prevue OR c.id_type_contrat = 2)
                          AND c.date_resiliation IS NULL
                          AND c.est_archive = 0
                    ) THEN NEW.id_prestataire
                WHEN NOT EXISTS(SELECT 1 FROM contrats_gammes WHERE id_gamme = NEW.id_gamme)
                    AND EXISTS(
                        SELECT 1 FROM contrats c
                        WHERE c.id_prestataire = NEW.id_prestataire
                          AND c.date_debut <= NEW.date_prevue
                          AND (c.date_fin IS NULL OR c.date_fin >= NEW.date_prevue OR c.id_type_contrat = 2)
                          AND c.date_resiliation IS NULL
                          AND c.est_archive = 0
                    ) THEN NEW.id_prestataire
                ELSE 1
            END
        ),

        -- CORRIGÉ v16 : Trace bascule — tacite pris en compte
        commentaires = CASE
            WHEN NEW.id_prestataire != 1
            AND NOT (
                (EXISTS(SELECT 1 FROM contrats_gammes WHERE id_gamme = NEW.id_gamme)
                 AND EXISTS(
                     SELECT 1 FROM contrats_gammes cg
                     JOIN contrats c ON c.id_contrat = cg.id_contrat
                     WHERE cg.id_gamme = NEW.id_gamme
                       AND c.id_prestataire = NEW.id_prestataire
                       AND c.date_debut <= NEW.date_prevue
                       AND (c.date_fin IS NULL OR c.date_fin >= NEW.date_prevue OR c.id_type_contrat = 2)
                       AND c.date_resiliation IS NULL
                       AND c.est_archive = 0
                 ))
                OR
                (NOT EXISTS(SELECT 1 FROM contrats_gammes WHERE id_gamme = NEW.id_gamme)
                 AND EXISTS(
                     SELECT 1 FROM contrats c
                     WHERE c.id_prestataire = NEW.id_prestataire
                       AND c.date_debut <= NEW.date_prevue
                       AND (c.date_fin IS NULL OR c.date_fin >= NEW.date_prevue OR c.id_type_contrat = 2)
                       AND c.date_resiliation IS NULL
                       AND c.est_archive = 0
                 ))
            )
            THEN COALESCE(NEW.commentaires, '') || ' [Prestataire basculé sur interne : aucun contrat valide]'
            ELSE NEW.commentaires
        END

    WHERE id_ordre_travail = NEW.id_ordre_travail;

    -- Étape 2 : Génération des opérations depuis les gammes types associées
    INSERT INTO operations_execution (
        id_ordre_travail, id_type_source, id_source,
        nom_operation, description_operation, type_operation,
        seuil_minimum, seuil_maximum, unite_nom, unite_symbole, id_statut_operation
    )
    SELECT
        NEW.id_ordre_travail, 2, gti.id_modele_operation_item,
        gti.nom_operation, gti.description, t.libelle,
        gti.seuil_minimum, gti.seuil_maximum, u.nom, u.symbole, 1
    FROM gamme_modeles gm
    JOIN modeles_operations gt  ON gm.id_modele_operation = gt.id_modele_operation
    JOIN modeles_operations_items gti ON gt.id_modele_operation = gti.id_modele_operation
    JOIN types_operations t ON gti.id_type_operation = t.id_type_operation
    LEFT JOIN unites u ON gti.id_unite = u.id_unite
    WHERE gm.id_gamme = NEW.id_gamme;

    -- Étape 3 : Génération des opérations spécifiques
    INSERT INTO operations_execution (
        id_ordre_travail, id_type_source, id_source,
        nom_operation, description_operation, type_operation,
        seuil_minimum, seuil_maximum, unite_nom, unite_symbole, id_statut_operation
    )
    SELECT
        NEW.id_ordre_travail, 1, o.id_operation,
        o.nom_operation, o.description, t.libelle,
        o.seuil_minimum, o.seuil_maximum, u.nom, u.symbole, 1
    FROM operations o
    JOIN types_operations t ON o.id_type_operation = t.id_type_operation
    LEFT JOIN unites u ON o.id_unite = u.id_unite
    WHERE o.id_gamme = NEW.id_gamme;
END;

DROP TRIGGER IF EXISTS propagation_periodicite_vers_ot;
CREATE TRIGGER propagation_periodicite_vers_ot
AFTER UPDATE ON periodicites
FOR EACH ROW
WHEN OLD.libelle != NEW.libelle
  OR OLD.jours_periodicite != NEW.jours_periodicite
  OR OLD.jours_valide != NEW.jours_valide
BEGIN
    -- CORRIGÉ : restreint aux OT Planifiés (statut 1) uniquement.
    -- Un OT En Cours (2) ou Réouvert (5) est en cours d'exécution ;
    -- modifier sa périodicité sous les pieds du technicien est incohérent.
    -- La prochaine occurrence sera calculée depuis la gamme à jour par reprogrammation_auto.
    UPDATE ordres_travail
    SET
        libelle_periodicite       = NEW.libelle,
        jours_periodicite         = NEW.jours_periodicite,
        periodicite_jours_valides = NEW.jours_valide
    WHERE id_gamme IN (
        SELECT id_gamme FROM gammes WHERE id_periodicite = NEW.id_periodicite
    )
    AND id_statut_ot = 1;  -- CORRIGÉ : était IN (1, 2, 5)
END;

-- Gestion automatique du statut OT selon l'état des opérations
DROP TRIGGER IF EXISTS gestion_statut_ot;
CREATE TRIGGER gestion_statut_ot
AFTER UPDATE ON operations_execution
WHEN OLD.id_statut_operation != NEW.id_statut_operation
BEGIN
    -- 1. Date début à la première exécution
    UPDATE ordres_travail
    SET date_debut = NEW.date_execution
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND date_debut IS NULL
      AND NEW.id_statut_operation IN (2, 3)
      AND OLD.id_statut_operation = 1
      AND id_statut_ot = 1;

    -- 2. Passage En Cours
    UPDATE ordres_travail
    SET id_statut_ot = 2
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND id_statut_ot IN (1, 5)
      AND EXISTS (
          SELECT 1 FROM operations_execution
          WHERE id_ordre_travail = NEW.id_ordre_travail
            AND id_statut_operation IN (2, 3)
      );

    -- 3. Retour Planifié si toutes les opérations repassent en attente
    UPDATE ordres_travail
    SET id_statut_ot = 1
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND id_statut_ot IN (2, 5)
      AND NOT EXISTS (
          SELECT 1 FROM operations_execution
          WHERE id_ordre_travail = NEW.id_ordre_travail
            AND id_statut_operation IN (2, 3)
      );

    -- 4. Clôture automatique (toutes opérations terminées, annulées ou non applicables)
    -- Statuts bloquants : 1 (En attente), 2 (En cours)
    -- Statuts non bloquants : 3 (Terminée), 4 (Annulée système), 5 (Non applicable)
    -- CORRIGÉ : COALESCE pour éviter date_cloture NULL si toutes les ops sont
    -- annulées/non applicables sans avoir de date_execution (MAX retournerait NULL sinon).
    UPDATE ordres_travail
    SET
        date_cloture = COALESCE(
            (SELECT MAX(date_execution)
             FROM operations_execution
             WHERE id_ordre_travail = NEW.id_ordre_travail
               AND date_execution IS NOT NULL),
            date('now')
        ),
        id_statut_ot = CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM operations_execution
                WHERE id_ordre_travail = NEW.id_ordre_travail
                  AND id_statut_operation = 3
            ) THEN 4  -- Aucune Terminée (toutes Annulées ou Non applicables) → OT Annulé
            ELSE 3    -- Au moins une Terminée → OT Clôturé
        END
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND date_cloture IS NULL
      AND id_statut_ot IN (1, 2, 5)
      AND NOT EXISTS (
          SELECT 1 FROM operations_execution
          WHERE id_ordre_travail = NEW.id_ordre_travail
            AND id_statut_operation IN (1, 2)
      );
END;


--------------------------------------------------------------------------------
-- 4.6 VALIDATION CHRONOLOGIQUE ET REPROGRAMMATION
--------------------------------------------------------------------------------

-- Note : pas de validation chronologique sur la clôture.
-- Raison : impossible de distinguer clôture manuelle et auto-clôture système
-- (gestion_statut_ot). Bloquer l'auto-clôture quand les travaux sont faits
-- en avance est pire que laisser passer une clôture manuelle anticipée.
-- Le recalage est géré par reprogrammation_auto (tolérance).
-- En cas de clôture erronée, la réouverture (3→5) est toujours disponible.
DROP TRIGGER IF EXISTS validation_chronologie_cloture;

-- CORRIGÉ v10 : WHEN élargi pour reprogrammer aussi sur annulation avec ops NA
-- SIMPLIFIÉ v10 : retrait des colonnes nullable écrasées par creation_ot_complet
-- (description_gamme, nom_localisation, nom_famille et JOINs associés)
DROP TRIGGER IF EXISTS reprogrammation_auto;
CREATE TRIGGER reprogrammation_auto
AFTER UPDATE ON ordres_travail
WHEN OLD.date_cloture IS NULL
  AND NEW.date_cloture IS NOT NULL
  AND (
      NEW.id_statut_ot = 3
      OR (NEW.id_statut_ot = 4 AND EXISTS(
          SELECT 1 FROM operations_execution
          WHERE id_ordre_travail = NEW.id_ordre_travail
            AND id_statut_operation = 5
      ))
  )
BEGIN
    INSERT INTO ordres_travail (
        id_gamme, id_prestataire,
        date_prevue, est_automatique,
        -- NOT NULL : valeurs temporaires, écrasées par creation_ot_complet
        nom_gamme, est_reglementaire,
        libelle_periodicite, jours_periodicite, periodicite_jours_valides
    )
    SELECT
        NEW.id_gamme,
        g.id_prestataire,
        CASE
            WHEN ABS(julianday(NEW.date_cloture) - julianday(NEW.date_prevue)) > p.tolerance_jours
                THEN date(NEW.date_cloture, '+' || NEW.jours_periodicite || ' days')
            ELSE
                date(NEW.date_prevue, '+' || NEW.jours_periodicite || ' days')
        END,
        1,
        g.nom_gamme,
        g.est_reglementaire,
        p.libelle,
        p.jours_periodicite,
        p.jours_valide
    FROM gammes g
    JOIN periodicites p ON g.id_periodicite = p.id_periodicite
    WHERE g.id_gamme = NEW.id_gamme
      AND g.est_active = 1
      AND NEW.jours_periodicite > 0
      -- Pas d'OT actif existant pour cette gamme
      AND NOT EXISTS (
          SELECT 1 FROM ordres_travail ot
          WHERE ot.id_gamme = NEW.id_gamme
            AND ot.id_statut_ot NOT IN (3, 4)
            AND ot.date_prevue IS NOT NULL
      )
      -- Pas d'OT futur ACTIF déjà créé
      -- CORRIGÉ v11 : ajout filtre statut NOT IN (3, 4)
      -- Sans ce filtre, un OT annulé avec une date future bloquait la reprogrammation,
      -- rompant silencieusement la chaîne de maintenance.
      AND NOT EXISTS (
          SELECT 1 FROM ordres_travail ot2
          WHERE ot2.id_gamme = NEW.id_gamme
            AND ot2.id_ordre_travail != NEW.id_ordre_travail
            AND ot2.id_statut_ot NOT IN (3, 4)
            AND date(ot2.date_prevue) > date(NEW.date_prevue)
      );
END;


--------------------------------------------------------------------------------
-- 4.7 NETTOYAGE ET COHÉRENCE DES DATES
--------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS nettoyage_dates_coherentes;
CREATE TRIGGER nettoyage_dates_coherentes
AFTER UPDATE OF id_statut_ot ON ordres_travail
FOR EACH ROW
WHEN OLD.id_statut_ot != NEW.id_statut_ot
BEGIN
    -- Nettoyage date_debut pour Planifié
    UPDATE ordres_travail
    SET date_debut = NULL
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND NEW.id_statut_ot = 1
      AND date_debut IS NOT NULL;

    -- Nettoyage date_cloture pour statuts non-terminaux
    UPDATE ordres_travail
    SET date_cloture = NULL
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND NEW.id_statut_ot IN (1, 2, 5)
      AND date_cloture IS NOT NULL;

    -- Réouvert → Clôturé : recalcul des dates depuis les opérations
    UPDATE ordres_travail
    SET
        date_debut = (
            SELECT MIN(date_execution)
            FROM operations_execution
            WHERE id_ordre_travail = NEW.id_ordre_travail
              AND date_execution IS NOT NULL
        ),
        date_cloture = (
            SELECT MAX(date_execution)
            FROM operations_execution
            WHERE id_ordre_travail = NEW.id_ordre_travail
              AND date_execution IS NOT NULL
        )
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND OLD.id_statut_ot = 5
      AND NEW.id_statut_ot = 3
      AND EXISTS (
          SELECT 1 FROM operations_execution
          WHERE id_ordre_travail = NEW.id_ordre_travail
            AND date_execution IS NOT NULL
      );

    -- Clôturé (pas depuis Réouvert) : date_cloture = today
    UPDATE ordres_travail
    SET date_cloture = date('now')
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND NEW.id_statut_ot = 3
      AND OLD.id_statut_ot != 5
      AND date_cloture IS NULL;

    -- Annulé : date_cloture = MAX(date_execution) ou today
    UPDATE ordres_travail
    SET date_cloture = COALESCE(
        (SELECT MAX(date_execution)
         FROM operations_execution
         WHERE id_ordre_travail = NEW.id_ordre_travail
           AND date_execution IS NOT NULL),
        date('now')
    )
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND NEW.id_statut_ot = 4
      AND date_cloture IS NULL;

    -- Auto-annulation des opérations en attente/en cours pour OT annulé
    -- IMPORTANT : statut 5 (Non applicable) n'est PAS touché — c'est un choix utilisateur
    UPDATE operations_execution
    SET id_statut_operation = 4
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND NEW.id_statut_ot = 4
      AND id_statut_operation IN (1, 2);  -- Annulée système : uniquement En attente et En cours
END;

-- Résurrection d'OT annulé : réinitialisation + régénération
-- MODIFIÉ v13 : nom_famille résolu depuis familles_gammes, nom_equipement depuis gammes_equipements
DROP TRIGGER IF EXISTS reinitialisation_resurrection;
CREATE TRIGGER reinitialisation_resurrection
AFTER UPDATE OF id_statut_ot ON ordres_travail
FOR EACH ROW
WHEN OLD.id_statut_ot = 4 AND NEW.id_statut_ot = 1
BEGIN
    -- Étape 1 : Reset des opérations existantes
    -- Statut 5 (Non applicable) est préservé — c'était un choix utilisateur délibéré.
    -- Seules les opérations Annulées (système, id=4) sont réinitialisées en En attente.
    UPDATE operations_execution
    SET
        id_statut_operation = 1,
        valeur_mesuree  = NULL,
        est_conforme    = NULL,
        date_execution  = NULL,
        commentaires    = NULL
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND id_statut_operation != 5;  -- Préserver Non applicable

    -- Étape 2 : Régénération complète des snapshots (CORRIGÉ : renumérotation)
    -- Inclut nom_prestataire et id_prestataire (snapshot figé)
    UPDATE ordres_travail
    SET
        nom_gamme = (
            SELECT g.nom_gamme FROM gammes g WHERE g.id_gamme = NEW.id_gamme
        ),
        description_gamme = (
            SELECT g.description FROM gammes g WHERE g.id_gamme = NEW.id_gamme
        ),
        est_reglementaire = (
            SELECT g.est_reglementaire FROM gammes g WHERE g.id_gamme = NEW.id_gamme
        ),
        -- MODIFIÉ v15 : localisation héritée depuis gammes.nom_localisation_calc
        nom_localisation = (SELECT nom_localisation_calc FROM gammes WHERE id_gamme = NEW.id_gamme),
        -- MODIFIÉ v13 : résolution depuis familles_gammes (plus familles_equipements)
        nom_famille = (
            SELECT fg.nom_famille
            FROM gammes g
            JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme
            WHERE g.id_gamme = NEW.id_gamme
        ),
        id_prestataire = (
            SELECT g.id_prestataire FROM gammes g WHERE g.id_gamme = NEW.id_gamme
        ),
        nom_prestataire = (
            SELECT p.libelle
            FROM gammes g
            JOIN prestataires p ON g.id_prestataire = p.id_prestataire
            WHERE g.id_gamme = NEW.id_gamme
        ),
        libelle_periodicite = (
            SELECT p.libelle
            FROM periodicites p
            JOIN gammes g ON p.id_periodicite = g.id_periodicite
            WHERE g.id_gamme = NEW.id_gamme
        ),
        jours_periodicite = (
            SELECT p.jours_periodicite
            FROM periodicites p
            JOIN gammes g ON p.id_periodicite = g.id_periodicite
            WHERE g.id_gamme = NEW.id_gamme
        ),
        periodicite_jours_valides = (
            SELECT p.jours_valide
            FROM periodicites p
            JOIN gammes g ON p.id_periodicite = g.id_periodicite
            WHERE g.id_gamme = NEW.id_gamme
        ),
        id_image = (
            SELECT g.id_image FROM gammes g WHERE g.id_gamme = NEW.id_gamme
        ),
        -- CORRIGÉ v10 (W-22) : sous-requête gamme au lieu de NEW.id_prestataire
        -- NEW.id_prestataire = valeur AVANT resurrection, pas la valeur fraîche de la gamme
        nom_technicien = CASE
            WHEN (SELECT g.id_prestataire FROM gammes g WHERE g.id_gamme = NEW.id_gamme) = 1
            THEN (SELECT t.nom || ' ' || t.prenom FROM techniciens t WHERE t.id_technicien = NEW.id_technicien)
            ELSE NULL
        END,
        nom_poste = CASE
            WHEN (SELECT g.id_prestataire FROM gammes g WHERE g.id_gamme = NEW.id_gamme) = 1
            THEN (
                SELECT p.libelle FROM techniciens t
                JOIN postes p ON t.id_poste = p.id_poste
                WHERE t.id_technicien = NEW.id_technicien
            )
            ELSE NULL
        END,
        -- MODIFIÉ v17 : nom_affichage au lieu de nom, numero_serie_equipement supprimé
        -- Rempli uniquement si exactement 1 équipement est lié à la gamme, sinon NULL.
        nom_equipement = CASE
            WHEN (SELECT COUNT(*) FROM gammes_equipements WHERE id_gamme = NEW.id_gamme) = 1
            THEN (
                SELECT e.nom_affichage
                FROM gammes_equipements ge
                JOIN equipements e ON ge.id_equipement = e.id_equipement
                WHERE ge.id_gamme = NEW.id_gamme
            )
            ELSE NULL
        END,
        commentaires = commentaires
    WHERE id_ordre_travail = NEW.id_ordre_travail;

    -- Étape 3 : Suppression des opérations obsolètes
    DELETE FROM operations_execution
    WHERE id_ordre_travail = NEW.id_ordre_travail
      AND (
          (id_type_source = 1 AND NOT EXISTS (
              SELECT 1 FROM operations o
              WHERE o.id_operation = operations_execution.id_source
                AND o.id_gamme = NEW.id_gamme
          ))
          OR
          (id_type_source = 2 AND NOT EXISTS (
              SELECT 1 FROM modeles_operations_items gti
              JOIN gamme_modeles gm ON gti.id_modele_operation = gm.id_modele_operation
              WHERE gti.id_modele_operation_item = operations_execution.id_source
                AND gm.id_gamme = NEW.id_gamme
          ))
      );

    -- Étape 4 : Injection des nouvelles opérations spécifiques
    INSERT INTO operations_execution (
        id_ordre_travail, id_type_source, id_source,
        nom_operation, description_operation, type_operation,
        seuil_minimum, seuil_maximum, unite_nom, unite_symbole, id_statut_operation
    )
    SELECT
        NEW.id_ordre_travail, 1, o.id_operation,
        o.nom_operation, o.description, t.libelle,
        o.seuil_minimum, o.seuil_maximum, u.nom, u.symbole, 1
    FROM operations o
    JOIN types_operations t ON o.id_type_operation = t.id_type_operation
    LEFT JOIN unites u ON o.id_unite = u.id_unite
    WHERE o.id_gamme = NEW.id_gamme
      AND NOT EXISTS (
          SELECT 1 FROM operations_execution oe
          WHERE oe.id_ordre_travail = NEW.id_ordre_travail
            AND oe.id_type_source = 1
            AND oe.id_source = o.id_operation
      );

    -- Étape 5 : Injection des nouvelles opérations gamme type
    INSERT INTO operations_execution (
        id_ordre_travail, id_type_source, id_source,
        nom_operation, description_operation, type_operation,
        seuil_minimum, seuil_maximum, unite_nom, unite_symbole, id_statut_operation
    )
    SELECT
        NEW.id_ordre_travail, 2, gti.id_modele_operation_item,
        gti.nom_operation, gti.description, t.libelle,
        gti.seuil_minimum, gti.seuil_maximum, u.nom, u.symbole, 1
    FROM gamme_modeles gm
    JOIN modeles_operations gt  ON gm.id_modele_operation = gt.id_modele_operation
    JOIN modeles_operations_items gti ON gt.id_modele_operation = gti.id_modele_operation
    JOIN types_operations t ON gti.id_type_operation = t.id_type_operation
    LEFT JOIN unites u ON gti.id_unite = u.id_unite
    WHERE gm.id_gamme = NEW.id_gamme
      AND NOT EXISTS (
          SELECT 1 FROM operations_execution oe
          WHERE oe.id_ordre_travail = NEW.id_ordre_travail
            AND oe.id_type_source = 2
            AND oe.id_source = gti.id_modele_operation_item
      );
END;


--------------------------------------------------------------------------------
-- 4.8 SYNCHRONISATION MÉTIER (dates de modification)
--------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS maj_date_modification_gamme;
CREATE TRIGGER maj_date_modification_gamme
AFTER UPDATE ON gammes FOR EACH ROW
BEGIN
    UPDATE gammes SET date_modification = CURRENT_TIMESTAMP WHERE id_gamme = NEW.id_gamme;
END;

DROP TRIGGER IF EXISTS maj_date_modification_etablissement;
CREATE TRIGGER maj_date_modification_etablissement
AFTER UPDATE ON etablissements FOR EACH ROW
BEGIN
    UPDATE etablissements SET date_modification = CURRENT_TIMESTAMP WHERE id_etablissement = NEW.id_etablissement;
END;

DROP TRIGGER IF EXISTS maj_date_modification_contrat;
CREATE TRIGGER maj_date_modification_contrat
AFTER UPDATE ON contrats FOR EACH ROW
BEGIN
    UPDATE contrats SET date_modification = CURRENT_TIMESTAMP WHERE id_contrat = NEW.id_contrat;
END;

DROP TRIGGER IF EXISTS maj_date_modification_di;
CREATE TRIGGER maj_date_modification_di
AFTER UPDATE ON demandes_intervention FOR EACH ROW
BEGIN
    UPDATE demandes_intervention SET date_modification = CURRENT_TIMESTAMP WHERE id_di = NEW.id_di;
END;

--------------------------------------------------------------------------------
-- 4.8b MACHINE À ÉTATS DI (AJOUT v10)
--------------------------------------------------------------------------------
-- Statuts DI : 1=Ouverte, 2=Résolue, 3=Réouverte
-- Résolue (2) = immutable sauf réouverture (comme OT Clôturé)

-- AJOUT v11 : une DI doit toujours commencer en statut 1 (Ouverte).
-- Sans ce trigger, un INSERT avec id_statut_di=2 ou 3 contourne
-- la machine à états (même pattern que le bug technicien INSERT corrigé en v10).
DROP TRIGGER IF EXISTS validation_statut_initial_di;
CREATE TRIGGER validation_statut_initial_di
BEFORE INSERT ON demandes_intervention
FOR EACH ROW
WHEN NEW.id_statut_di != 1
BEGIN
    SELECT RAISE(ABORT,
        'Création impossible : une DI doit commencer en statut Ouverte (1). Utilisez les transitions pour changer le statut.'
    );
END;

-- Validation des transitions
DROP TRIGGER IF EXISTS validation_transitions_di;
CREATE TRIGGER validation_transitions_di
BEFORE UPDATE OF id_statut_di ON demandes_intervention
FOR EACH ROW
WHEN OLD.id_statut_di != NEW.id_statut_di
BEGIN
    SELECT CASE
        WHEN OLD.id_statut_di = 1 AND NEW.id_statut_di != 2
            THEN RAISE(ABORT, 'Transition DI interdite depuis Ouverte : seule la Résolution est autorisée')
        WHEN OLD.id_statut_di = 2 AND NEW.id_statut_di != 3
            THEN RAISE(ABORT, 'Transition DI interdite depuis Résolue : seule la Réouverture est autorisée')
        WHEN OLD.id_statut_di = 3 AND NEW.id_statut_di NOT IN (1, 2)
            THEN RAISE(ABORT, 'Transition DI interdite depuis Réouverte')
    END;
END;

-- Validation résolution : date_resolution et description_resolution requises
DROP TRIGGER IF EXISTS validation_resolution_di;
CREATE TRIGGER validation_resolution_di
BEFORE UPDATE OF id_statut_di ON demandes_intervention
FOR EACH ROW
WHEN NEW.id_statut_di = 2
BEGIN
    SELECT CASE
        WHEN NEW.date_resolution IS NULL
            THEN RAISE(ABORT, 'Résolution impossible : date_resolution requise')
        WHEN NEW.description_resolution IS NULL
            THEN RAISE(ABORT, 'Résolution impossible : description_resolution requise')
    END;
END;

-- Protection DI résolue (immutable sauf réouverture)
-- Approche BLACKLIST comme protection_ot_terminaux
DROP TRIGGER IF EXISTS protection_di_resolue;
CREATE TRIGGER protection_di_resolue
BEFORE UPDATE ON demandes_intervention
FOR EACH ROW
WHEN OLD.id_statut_di = 2
    AND NEW.id_statut_di != 3  -- sauf réouverture
    AND (
        OLD.libelle_constat              IS NOT NEW.libelle_constat
        OR OLD.description_constat       IS NOT NEW.description_constat
        OR OLD.date_constat              IS NOT NEW.date_constat
        OR OLD.description_resolution    IS NOT NEW.description_resolution
        OR OLD.date_resolution           IS NOT NEW.date_resolution
        OR OLD.description_resolution_suggeree IS NOT NEW.description_resolution_suggeree
    )
BEGIN
    SELECT RAISE(ABORT,
        'Modification interdite : DI résolue. Utilisez la réouverture si une correction est nécessaire.'
    );
END;

DROP TRIGGER IF EXISTS maj_date_modification_modele_equipement;
CREATE TRIGGER maj_date_modification_modele_equipement
AFTER UPDATE ON modeles_equipements FOR EACH ROW
BEGIN
    UPDATE modeles_equipements SET date_modification = CURRENT_TIMESTAMP WHERE id_modele_equipement = NEW.id_modele_equipement;
END;

-- ── AJOUT v17 : Triggers de protection modèles d'équipement ──

-- Empêche le changement de modèle sur une famille qui contient des équipements
DROP TRIGGER IF EXISTS protection_changement_modele;
CREATE TRIGGER protection_changement_modele
BEFORE UPDATE ON familles_equipements
FOR EACH ROW
WHEN OLD.id_modele_equipement != NEW.id_modele_equipement
  AND EXISTS (SELECT 1 FROM equipements WHERE id_famille = NEW.id_famille)
BEGIN
    SELECT RAISE(ABORT, 'Impossible de changer le modèle : des équipements sont rattachés à cette famille');
END;

-- Empêche la suppression d'un champ s'il possède des valeurs — sinon autorisé
DROP TRIGGER IF EXISTS protection_suppression_champ;
CREATE TRIGGER protection_suppression_champ
BEFORE DELETE ON champs_modele
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM valeurs_equipements WHERE id_champ = OLD.id_champ)
BEGIN
    SELECT RAISE(ABORT, 'Ce champ possède des valeurs sur des équipements. Archivez-le (est_archive = 1) au lieu de le supprimer.');
END;

DROP TRIGGER IF EXISTS maj_date_modification_equipement;
CREATE TRIGGER maj_date_modification_equipement
AFTER UPDATE ON equipements FOR EACH ROW
BEGIN
    UPDATE equipements SET date_modification = CURRENT_TIMESTAMP WHERE id_equipement = NEW.id_equipement;
END;

DROP TRIGGER IF EXISTS maj_date_modification_batiment;
CREATE TRIGGER maj_date_modification_batiment
AFTER UPDATE ON batiments FOR EACH ROW
BEGIN
    UPDATE batiments SET date_modification = CURRENT_TIMESTAMP WHERE id_batiment = NEW.id_batiment;
END;

DROP TRIGGER IF EXISTS maj_date_modification_niveau;
CREATE TRIGGER maj_date_modification_niveau
AFTER UPDATE ON niveaux FOR EACH ROW
BEGIN
    UPDATE niveaux SET date_modification = CURRENT_TIMESTAMP WHERE id_niveau = NEW.id_niveau;
END;

DROP TRIGGER IF EXISTS maj_date_modification_local;
CREATE TRIGGER maj_date_modification_local
AFTER UPDATE ON locaux FOR EACH ROW
BEGIN
    UPDATE locaux SET date_modification = CURRENT_TIMESTAMP WHERE id_local = NEW.id_local;
END;

DROP TRIGGER IF EXISTS maj_date_modification_ot;
CREATE TRIGGER maj_date_modification_ot
AFTER UPDATE ON ordres_travail FOR EACH ROW
BEGIN
    UPDATE ordres_travail SET date_modification = CURRENT_TIMESTAMP WHERE id_ordre_travail = NEW.id_ordre_travail;
END;

-- SUPPRIMÉ : validation_prestataire_temporel
-- Raison : id_prestataire est désormais un snapshot figé à la création (comme nom_technicien).
-- Il ne peut plus être modifié manuellement après création.
-- La protection est assurée par protection_ot_terminaux (pour les OT terminaux)
-- et par l'immutabilité de fait du snapshot (aucun chemin de modification normal).
DROP TRIGGER IF EXISTS validation_prestataire_temporel;


--------------------------------------------------------------------------------
-- 4.9 PROPAGATION DES SNAPSHOTS
--------------------------------------------------------------------------------

-- A. Propagation gamme → OT actifs
-- CORRIGÉ : suppression du bloc de propagation id_prestataire
-- (id_prestataire dans OT est désormais un snapshot figé, non synchronisé en temps réel)
-- MODIFIÉ v13 : bloc famille résolu depuis familles_gammes, bloc équipement supprimé
-- (gammes n'ont plus de id_equipement, la liaison est N↔N via gammes_equipements)
DROP TRIGGER IF EXISTS a_propagation_gamme_vers_ot;
CREATE TRIGGER a_propagation_gamme_vers_ot
AFTER UPDATE ON gammes
FOR EACH ROW
BEGIN
    -- Données générales + image
    UPDATE ordres_travail
    SET
        nom_gamme         = NEW.nom_gamme,
        description_gamme = NEW.description,
        est_reglementaire = NEW.est_reglementaire,
        id_image          = NEW.id_image
    WHERE id_gamme = NEW.id_gamme
      AND id_statut_ot NOT IN (3, 4);

    -- Périodicité (si modifiée)
    UPDATE ordres_travail
    SET
        libelle_periodicite       = (SELECT p.libelle           FROM periodicites p WHERE p.id_periodicite = NEW.id_periodicite),
        jours_periodicite         = (SELECT p.jours_periodicite FROM periodicites p WHERE p.id_periodicite = NEW.id_periodicite),
        periodicite_jours_valides = (SELECT p.jours_valide      FROM periodicites p WHERE p.id_periodicite = NEW.id_periodicite)
    WHERE id_gamme = NEW.id_gamme
      AND id_statut_ot NOT IN (3, 4)
      AND OLD.id_periodicite != NEW.id_periodicite;

    -- MODIFIÉ v15 : localisation héritée directement depuis nom_localisation_calc
    UPDATE ordres_travail
    SET nom_localisation = NEW.nom_localisation_calc
    WHERE id_gamme = NEW.id_gamme
      AND id_statut_ot NOT IN (3, 4)
      AND (OLD.nom_localisation_calc IS NOT NEW.nom_localisation_calc);

    -- MODIFIÉ v13 : famille résolue depuis familles_gammes (plus familles_equipements)
    UPDATE ordres_travail
    SET nom_famille = (
        SELECT fg.nom_famille FROM familles_gammes fg WHERE fg.id_famille_gamme = NEW.id_famille_gamme
    )
    WHERE id_gamme = NEW.id_gamme
      AND id_statut_ot NOT IN (3, 4)
      AND OLD.id_famille_gamme != NEW.id_famille_gamme;

    -- AJOUT v16 : propagation prestataire vers OT actifs
    -- Quand le prestataire de la gamme change, les OT modifiables suivent.
    -- Les OT clôturés/annulés restent figés (snapshot historique).
    UPDATE ordres_travail
    SET
        id_prestataire = NEW.id_prestataire,
        nom_prestataire = (
            SELECT p.libelle FROM prestataires p WHERE p.id_prestataire = NEW.id_prestataire
        )
    WHERE id_gamme = NEW.id_gamme
      AND id_statut_ot NOT IN (3, 4)
      AND OLD.id_prestataire != NEW.id_prestataire;

    -- SUPPRIMÉ v13 : bloc équipement — gammes n'ont plus de id_equipement.
    -- La propagation équipement est gérée par propagation_equipement_vers_ot
    -- qui utilise la table de liaison gammes_equipements.
END;

-- B. Opérations spécifiques → opérations d'exécution
DROP TRIGGER IF EXISTS b_propagation_operations_vers_execution;
CREATE TRIGGER b_propagation_operations_vers_execution
AFTER UPDATE ON operations
WHEN OLD.nom_operation    IS NOT NEW.nom_operation
  OR OLD.description       IS NOT NEW.description
  OR OLD.id_type_operation IS NOT NEW.id_type_operation
  OR OLD.seuil_minimum     IS NOT NEW.seuil_minimum
  OR OLD.seuil_maximum     IS NOT NEW.seuil_maximum
  OR OLD.id_unite          IS NOT NEW.id_unite
BEGIN
    UPDATE operations_execution
    SET
        nom_operation        = NEW.nom_operation,
        description_operation = NEW.description,
        type_operation       = (SELECT libelle FROM types_operations WHERE id_type_operation = NEW.id_type_operation),
        seuil_minimum        = NEW.seuil_minimum,
        seuil_maximum        = NEW.seuil_maximum,
        unite_nom            = (SELECT nom     FROM unites WHERE id_unite = NEW.id_unite),
        unite_symbole        = (SELECT symbole FROM unites WHERE id_unite = NEW.id_unite)
    WHERE id_type_source = 1
      AND id_source = NEW.id_operation
      AND id_ordre_travail IN (
          SELECT id_ordre_travail FROM ordres_travail WHERE id_statut_ot NOT IN (3, 4)
      );
END;

-- C. Gamme type items → opérations d'exécution
DROP TRIGGER IF EXISTS c_propagation_gamme_type_vers_execution;
CREATE TRIGGER c_propagation_gamme_type_vers_execution
AFTER UPDATE ON modeles_operations_items
WHEN OLD.nom_operation    IS NOT NEW.nom_operation
  OR OLD.description       IS NOT NEW.description
  OR OLD.id_type_operation IS NOT NEW.id_type_operation
  OR OLD.seuil_minimum     IS NOT NEW.seuil_minimum
  OR OLD.seuil_maximum     IS NOT NEW.seuil_maximum
  OR OLD.id_unite          IS NOT NEW.id_unite
BEGIN
    UPDATE operations_execution
    SET
        nom_operation         = NEW.nom_operation,
        description_operation = NEW.description,
        type_operation        = (SELECT libelle FROM types_operations WHERE id_type_operation = NEW.id_type_operation),
        seuil_minimum         = NEW.seuil_minimum,
        seuil_maximum         = NEW.seuil_maximum,
        unite_nom             = (SELECT nom     FROM unites WHERE id_unite = NEW.id_unite),
        unite_symbole         = (SELECT symbole FROM unites WHERE id_unite = NEW.id_unite)
    WHERE id_type_source = 2
      AND id_source = NEW.id_modele_operation_item
      AND id_ordre_travail IN (
          SELECT id_ordre_travail FROM ordres_travail WHERE id_statut_ot NOT IN (3, 4)
      );
END;

-- D. Nouveau gamme type item → injection dans OT existants
DROP TRIGGER IF EXISTS d_ajout_gamme_type_item_vers_ot;
CREATE TRIGGER d_ajout_gamme_type_item_vers_ot
AFTER INSERT ON modeles_operations_items
BEGIN
    INSERT INTO operations_execution (
        id_ordre_travail, id_type_source, id_source,
        nom_operation, description_operation, type_operation,
        seuil_minimum, seuil_maximum, unite_nom, unite_symbole, id_statut_operation
    )
    SELECT
        ot.id_ordre_travail, 2, NEW.id_modele_operation_item,
        NEW.nom_operation, NEW.description, t.libelle,
        NEW.seuil_minimum, NEW.seuil_maximum, u.nom, u.symbole, 1
    FROM ordres_travail ot
    JOIN gamme_modeles gm  ON ot.id_gamme = gm.id_gamme
    JOIN modeles_operations gt   ON gm.id_modele_operation = gt.id_modele_operation
    JOIN types_operations t ON NEW.id_type_operation = t.id_type_operation
    LEFT JOIN unites u ON NEW.id_unite = u.id_unite
    WHERE NEW.id_modele_operation = gt.id_modele_operation
      AND ot.id_statut_ot NOT IN (3, 4);
END;

-- E. Association gamme type / gamme → injection dans OT existants
DROP TRIGGER IF EXISTS e_ajout_gamme_type_vers_ot_existants;
CREATE TRIGGER e_ajout_gamme_type_vers_ot_existants
AFTER INSERT ON gamme_modeles
BEGIN
    INSERT INTO operations_execution (
        id_ordre_travail, id_type_source, id_source,
        nom_operation, description_operation, type_operation,
        seuil_minimum, seuil_maximum, unite_nom, unite_symbole, id_statut_operation
    )
    SELECT
        ot.id_ordre_travail, 2, gti.id_modele_operation_item,
        gti.nom_operation, gti.description, t.libelle,
        gti.seuil_minimum, gti.seuil_maximum, u.nom, u.symbole, 1
    FROM ordres_travail ot
    JOIN modeles_operations gt  ON NEW.id_modele_operation = gt.id_modele_operation
    JOIN modeles_operations_items gti ON gt.id_modele_operation = gti.id_modele_operation
    JOIN types_operations t ON gti.id_type_operation = t.id_type_operation
    LEFT JOIN unites u ON gti.id_unite = u.id_unite
    WHERE ot.id_gamme = NEW.id_gamme
      AND ot.id_statut_ot NOT IN (3, 4)
      AND NOT EXISTS (
          SELECT 1 FROM operations_execution oe
          WHERE oe.id_ordre_travail = ot.id_ordre_travail
            AND oe.id_type_source = 2
            AND oe.id_source = gti.id_modele_operation_item
      );
END;

-- F. Nouvelle opération spécifique → injection dans OT existants
DROP TRIGGER IF EXISTS f_ajout_operation_specifique_vers_ot;
CREATE TRIGGER f_ajout_operation_specifique_vers_ot
AFTER INSERT ON operations
BEGIN
    INSERT INTO operations_execution (
        id_ordre_travail, id_type_source, id_source,
        nom_operation, description_operation, type_operation,
        seuil_minimum, seuil_maximum, unite_nom, unite_symbole, id_statut_operation
    )
    SELECT
        ot.id_ordre_travail, 1, NEW.id_operation,
        NEW.nom_operation, NEW.description, t.libelle,
        NEW.seuil_minimum, NEW.seuil_maximum, u.nom, u.symbole, 1
    FROM ordres_travail ot
    JOIN types_operations t ON NEW.id_type_operation = t.id_type_operation
    LEFT JOIN unites u ON NEW.id_unite = u.id_unite
    WHERE ot.id_gamme = NEW.id_gamme
      AND ot.id_statut_ot NOT IN (3, 4)
      AND NOT EXISTS (
          SELECT 1 FROM operations_execution oe
          WHERE oe.id_ordre_travail = ot.id_ordre_travail
            AND oe.id_type_source = 1
            AND oe.id_source = NEW.id_operation
      );
END;

-- G0. Synchronisation snapshot technicien quand id_technicien change sur OT actif
DROP TRIGGER IF EXISTS sync_snapshot_technicien_ot;
CREATE TRIGGER sync_snapshot_technicien_ot
AFTER UPDATE OF id_technicien ON ordres_travail
FOR EACH ROW
WHEN OLD.id_technicien IS NOT NEW.id_technicien
  AND NEW.id_statut_ot NOT IN (3, 4)
BEGIN
    UPDATE ordres_travail
    SET
        nom_technicien = CASE
            WHEN NEW.id_prestataire = 1
            THEN (SELECT t.nom || ' ' || t.prenom FROM techniciens t WHERE t.id_technicien = NEW.id_technicien)
            ELSE NULL
        END,
        nom_poste = CASE
            WHEN NEW.id_prestataire = 1
            THEN (
                SELECT p.libelle FROM techniciens t
                JOIN postes p ON t.id_poste = p.id_poste
                WHERE t.id_technicien = NEW.id_technicien
            )
            ELSE NULL
        END
    WHERE id_ordre_travail = NEW.id_ordre_travail;
END;

-- G. Propagation renommage technicien vers OT actifs
-- Propage aussi nom_poste si le poste du technicien a changé
DROP TRIGGER IF EXISTS propagation_renommage_technicien;
CREATE TRIGGER propagation_renommage_technicien
AFTER UPDATE ON techniciens
FOR EACH ROW
WHEN OLD.nom != NEW.nom OR OLD.prenom != NEW.prenom OR OLD.id_poste IS NOT NEW.id_poste
BEGIN
    UPDATE ordres_travail
    SET
        nom_technicien = NEW.nom || ' ' || NEW.prenom,
        nom_poste = (
            SELECT p.libelle FROM postes p WHERE p.id_poste = NEW.id_poste
        )
    WHERE id_technicien = NEW.id_technicien
      AND id_statut_ot NOT IN (3, 4)
      AND id_prestataire = 1;  -- Propagation uniquement sur OT internes
END;

-- H. Propagation renommage famille gamme vers OT actifs
-- MODIFIÉ v13 : renommé depuis propagation_renommage_famille,
-- résolution via familles_gammes au lieu de familles_equipements
DROP TRIGGER IF EXISTS propagation_renommage_famille;
DROP TRIGGER IF EXISTS propagation_renommage_famille_gamme;
CREATE TRIGGER propagation_renommage_famille_gamme
AFTER UPDATE OF nom_famille ON familles_gammes
FOR EACH ROW
WHEN OLD.nom_famille != NEW.nom_famille
BEGIN
    UPDATE ordres_travail
    SET nom_famille = NEW.nom_famille
    WHERE id_statut_ot NOT IN (3, 4)
      AND id_gamme IN (
          SELECT id_gamme FROM gammes WHERE id_famille_gamme = NEW.id_famille_gamme
      );
END;

-- MODIFIÉ v15 : renommage → recalcul nom_localisation_calc des gammes affectées
DROP TRIGGER IF EXISTS propagation_renommage_localisation;
DROP TRIGGER IF EXISTS propagation_renommage_batiment;
CREATE TRIGGER propagation_renommage_batiment
AFTER UPDATE OF nom ON batiments
FOR EACH ROW
WHEN OLD.nom != NEW.nom
BEGIN
    UPDATE gammes SET nom_localisation_calc = (
        SELECT CASE
            WHEN cnt_bat > 1 THEN NULL
            WHEN cnt_bat = 1 AND cnt_niv > 1 THEN bat_nom
            WHEN cnt_niv = 1 AND cnt_loc > 1 THEN
                CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom ELSE niv_nom END
            WHEN cnt_loc = 1 THEN
                CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom || ' - ' || loc_nom ELSE niv_nom || ' - ' || loc_nom END
            ELSE NULL
        END
        FROM (
            SELECT
                COUNT(DISTINCT b.id_batiment) AS cnt_bat,
                COUNT(DISTINCT n.id_niveau) AS cnt_niv,
                COUNT(DISTINCT l.id_local) AS cnt_loc,
                (SELECT COUNT(DISTINCT id_batiment) FROM batiments) AS cnt_bat_total,
                MAX(b.nom) AS bat_nom, MAX(n.nom) AS niv_nom, MAX(l.nom) AS loc_nom
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            JOIN niveaux n ON l.id_niveau = n.id_niveau
            JOIN batiments b ON n.id_batiment = b.id_batiment
            WHERE ge.id_gamme = gammes.id_gamme
        )
    )
    WHERE id_batiment_calc = NEW.id_batiment;
END;

DROP TRIGGER IF EXISTS propagation_renommage_niveau;
CREATE TRIGGER propagation_renommage_niveau
AFTER UPDATE OF nom ON niveaux
FOR EACH ROW
WHEN OLD.nom != NEW.nom
BEGIN
    UPDATE gammes SET nom_localisation_calc = (
        SELECT CASE
            WHEN cnt_bat > 1 THEN NULL
            WHEN cnt_bat = 1 AND cnt_niv > 1 THEN bat_nom
            WHEN cnt_niv = 1 AND cnt_loc > 1 THEN
                CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom ELSE niv_nom END
            WHEN cnt_loc = 1 THEN
                CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom || ' - ' || loc_nom ELSE niv_nom || ' - ' || loc_nom END
            ELSE NULL
        END
        FROM (
            SELECT
                COUNT(DISTINCT b.id_batiment) AS cnt_bat,
                COUNT(DISTINCT n.id_niveau) AS cnt_niv,
                COUNT(DISTINCT l.id_local) AS cnt_loc,
                (SELECT COUNT(DISTINCT id_batiment) FROM batiments) AS cnt_bat_total,
                MAX(b.nom) AS bat_nom, MAX(n.nom) AS niv_nom, MAX(l.nom) AS loc_nom
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            JOIN niveaux n ON l.id_niveau = n.id_niveau
            JOIN batiments b ON n.id_batiment = b.id_batiment
            WHERE ge.id_gamme = gammes.id_gamme
        )
    )
    WHERE id_niveau_calc = NEW.id_niveau;
END;

DROP TRIGGER IF EXISTS propagation_renommage_local;
CREATE TRIGGER propagation_renommage_local
AFTER UPDATE OF nom ON locaux
FOR EACH ROW
WHEN OLD.nom != NEW.nom
BEGIN
    UPDATE gammes SET nom_localisation_calc = (
        SELECT CASE
            WHEN cnt_bat > 1 THEN NULL
            WHEN cnt_bat = 1 AND cnt_niv > 1 THEN bat_nom
            WHEN cnt_niv = 1 AND cnt_loc > 1 THEN
                CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom ELSE niv_nom END
            WHEN cnt_loc = 1 THEN
                CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom || ' - ' || loc_nom ELSE niv_nom || ' - ' || loc_nom END
            ELSE NULL
        END
        FROM (
            SELECT
                COUNT(DISTINCT b.id_batiment) AS cnt_bat,
                COUNT(DISTINCT n.id_niveau) AS cnt_niv,
                COUNT(DISTINCT l.id_local) AS cnt_loc,
                (SELECT COUNT(DISTINCT id_batiment) FROM batiments) AS cnt_bat_total,
                MAX(b.nom) AS bat_nom, MAX(n.nom) AS niv_nom, MAX(l.nom) AS loc_nom
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            JOIN niveaux n ON l.id_niveau = n.id_niveau
            JOIN batiments b ON n.id_batiment = b.id_batiment
            WHERE ge.id_gamme = gammes.id_gamme
        )
    )
    WHERE id_local_calc = NEW.id_local;
END;

-- AJOUT v15 : recalcul quand le nombre de bâtiments change (affecte le format mono/multi)
DROP TRIGGER IF EXISTS recalcul_localisation_gamme_delete_batiment;
CREATE TRIGGER recalcul_localisation_gamme_delete_batiment
AFTER DELETE ON batiments
BEGIN
    UPDATE gammes SET nom_localisation_calc = (
        SELECT CASE
            WHEN cnt_bat > 1 THEN NULL
            WHEN cnt_bat = 1 AND cnt_niv > 1 THEN bat_nom
            WHEN cnt_niv = 1 AND cnt_loc > 1 THEN
                CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom ELSE niv_nom END
            WHEN cnt_loc = 1 THEN
                CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom || ' - ' || loc_nom ELSE niv_nom || ' - ' || loc_nom END
            ELSE NULL
        END
        FROM (
            SELECT
                COUNT(DISTINCT b.id_batiment) AS cnt_bat,
                COUNT(DISTINCT n.id_niveau) AS cnt_niv,
                COUNT(DISTINCT l.id_local) AS cnt_loc,
                (SELECT COUNT(DISTINCT id_batiment) FROM batiments) AS cnt_bat_total,
                MAX(b.nom) AS bat_nom, MAX(n.nom) AS niv_nom, MAX(l.nom) AS loc_nom
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            JOIN niveaux n ON l.id_niveau = n.id_niveau
            JOIN batiments b ON n.id_batiment = b.id_batiment
            WHERE ge.id_gamme = gammes.id_gamme
        )
    )
    WHERE nom_localisation_calc IS NOT NULL;
END;

-- Idem pour l'ajout d'un bâtiment (passe de mono à multi)
DROP TRIGGER IF EXISTS recalcul_localisation_gamme_insert_batiment;
CREATE TRIGGER recalcul_localisation_gamme_insert_batiment
AFTER INSERT ON batiments
BEGIN
    UPDATE gammes SET nom_localisation_calc = (
        SELECT CASE
            WHEN cnt_bat > 1 THEN NULL
            WHEN cnt_bat = 1 AND cnt_niv > 1 THEN bat_nom
            WHEN cnt_niv = 1 AND cnt_loc > 1 THEN
                CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom ELSE niv_nom END
            WHEN cnt_loc = 1 THEN
                CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom || ' - ' || loc_nom ELSE niv_nom || ' - ' || loc_nom END
            ELSE NULL
        END
        FROM (
            SELECT
                COUNT(DISTINCT b.id_batiment) AS cnt_bat,
                COUNT(DISTINCT n.id_niveau) AS cnt_niv,
                COUNT(DISTINCT l.id_local) AS cnt_loc,
                (SELECT COUNT(DISTINCT id_batiment) FROM batiments) AS cnt_bat_total,
                MAX(b.nom) AS bat_nom, MAX(n.nom) AS niv_nom, MAX(l.nom) AS loc_nom
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            JOIN niveaux n ON l.id_niveau = n.id_niveau
            JOIN batiments b ON n.id_batiment = b.id_batiment
            WHERE ge.id_gamme = gammes.id_gamme
        )
    )
    WHERE nom_localisation_calc IS NOT NULL;
END;

-- J. Propagation équipement vers OT actifs (via gammes_equipements)
-- MODIFIÉ v17 : utilise nom_affichage, numero_serie_equipement supprimé
-- Propage uniquement si l'équipement est le SEUL lié à la gamme
DROP TRIGGER IF EXISTS propagation_equipement_vers_ot;
CREATE TRIGGER propagation_equipement_vers_ot
AFTER UPDATE ON equipements
FOR EACH ROW
WHEN OLD.nom_affichage != NEW.nom_affichage
BEGIN
    UPDATE ordres_travail
    SET nom_equipement = NEW.nom_affichage
    WHERE id_statut_ot NOT IN (3, 4)
      AND id_gamme IN (
          SELECT ge.id_gamme FROM gammes_equipements ge
          WHERE ge.id_equipement = NEW.id_equipement
            AND (SELECT COUNT(*) FROM gammes_equipements ge2 WHERE ge2.id_gamme = ge.id_gamme) = 1
      );
END;


-- K. Propagation renommage prestataire vers OT actifs
-- AJOUT v7 (W-08) : seule entité de première classe qui n'avait pas de propagation.
DROP TRIGGER IF EXISTS propagation_renommage_prestataire;
CREATE TRIGGER propagation_renommage_prestataire
AFTER UPDATE OF libelle ON prestataires
FOR EACH ROW
WHEN OLD.libelle != NEW.libelle
BEGIN
    UPDATE ordres_travail
    SET nom_prestataire = NEW.libelle
    WHERE id_prestataire = NEW.id_prestataire
      AND id_statut_ot NOT IN (3, 4);
END;

-- L. Protection suppression technicien assigné à un OT actif
-- AJOUT v7 (W-10) : un technicien ne peut pas être supprimé s'il est assigné à un OT actif.
DROP TRIGGER IF EXISTS protection_suppression_technicien_assigne;
CREATE TRIGGER protection_suppression_technicien_assigne
BEFORE DELETE ON techniciens
FOR EACH ROW
WHEN EXISTS (
    SELECT 1 FROM ordres_travail
    WHERE id_technicien = OLD.id_technicien
      AND id_statut_ot NOT IN (3, 4)
)
BEGIN
    SELECT RAISE(ABORT,
        'Suppression impossible : ce technicien est assigné à des OT actifs. Réassignez-le d''abord.'
    );
END;


--------------------------------------------------------------------------------
-- 4.10 NETTOYAGE DE SYNCHRONISATION
--------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS nettoyage_deliaison_gamme_type;
CREATE TRIGGER nettoyage_deliaison_gamme_type
AFTER DELETE ON gamme_modeles
BEGIN
    -- Supprimer les opérations en attente
    DELETE FROM operations_execution
    WHERE id_type_source = 2
      AND id_source IN (
          SELECT gti.id_modele_operation_item
          FROM modeles_operations_items gti
          WHERE gti.id_modele_operation = OLD.id_modele_operation
      )
      AND id_statut_operation = 1
      AND id_ordre_travail IN (
          SELECT ot.id_ordre_travail FROM ordres_travail ot
          WHERE ot.id_gamme = OLD.id_gamme
            AND ot.id_statut_ot NOT IN (3, 4)
      );

    -- Annuler les opérations déjà commencées/terminées
    UPDATE operations_execution
    SET id_statut_operation = 4
    WHERE id_type_source = 2
      AND id_source IN (
          SELECT gti.id_modele_operation_item
          FROM modeles_operations_items gti
          WHERE gti.id_modele_operation = OLD.id_modele_operation
      )
      AND id_statut_operation IN (2, 3)
      AND id_ordre_travail IN (
          SELECT ot.id_ordre_travail FROM ordres_travail ot
          WHERE ot.id_gamme = OLD.id_gamme
            AND ot.id_statut_ot NOT IN (3, 4)
      );
END;

DROP TRIGGER IF EXISTS synchronisation_suppression_gamme_type_item;
CREATE TRIGGER synchronisation_suppression_gamme_type_item
AFTER DELETE ON modeles_operations_items
BEGIN
    -- Supprimer les opérations en attente
    DELETE FROM operations_execution
    WHERE id_type_source = 2
      AND id_source = OLD.id_modele_operation_item
      AND id_statut_operation = 1
      AND id_ordre_travail IN (
          SELECT id_ordre_travail FROM ordres_travail WHERE id_statut_ot NOT IN (3, 4)
      );

    -- Annuler les opérations déjà commencées/terminées
    UPDATE operations_execution
    SET id_statut_operation = 4
    WHERE id_type_source = 2
      AND id_source = OLD.id_modele_operation_item
      AND id_statut_operation IN (2, 3)
      AND id_ordre_travail IN (
          SELECT id_ordre_travail FROM ordres_travail WHERE id_statut_ot NOT IN (3, 4)
      );
END;

DROP TRIGGER IF EXISTS synchronisation_suppression_operation;
CREATE TRIGGER synchronisation_suppression_operation
AFTER DELETE ON operations
BEGIN
    -- Supprimer les opérations en attente
    DELETE FROM operations_execution
    WHERE id_type_source = 1
      AND id_source = OLD.id_operation
      AND id_statut_operation = 1
      AND id_ordre_travail IN (
          SELECT id_ordre_travail FROM ordres_travail WHERE id_statut_ot NOT IN (3, 4)
      );

    -- Annuler les opérations déjà commencées/terminées
    UPDATE operations_execution
    SET id_statut_operation = 4
    WHERE id_type_source = 1
      AND id_source = OLD.id_operation
      AND id_statut_operation IN (2, 3)
      AND id_ordre_travail IN (
          SELECT id_ordre_travail FROM ordres_travail WHERE id_statut_ot NOT IN (3, 4)
      );
END;


--------------------------------------------------------------------------------
-- 4.11 NETTOYAGE DES DOCUMENTS ORPHELINS (AJOUT v12)
--------------------------------------------------------------------------------
-- Quand une liaison documentaire est supprimée (CASCADE ou manuelle),
-- vérifier si le document a encore au moins une liaison.
-- S'il n'en a plus → le supprimer automatiquement.
-- Logique identique dans les 6 triggers — duplication inévitable (SQLite pas de CREATE FUNCTION).

DROP TRIGGER IF EXISTS nettoyage_document_orphelin_prestataire;
CREATE TRIGGER nettoyage_document_orphelin_prestataire
AFTER DELETE ON documents_prestataires
BEGIN
    DELETE FROM documents WHERE id_document = OLD.id_document
        AND NOT EXISTS (SELECT 1 FROM documents_prestataires WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_ordres_travail WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_gammes WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_contrats WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_di WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_localisations WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_equipements WHERE id_document = OLD.id_document);
END;

DROP TRIGGER IF EXISTS nettoyage_document_orphelin_ot;
CREATE TRIGGER nettoyage_document_orphelin_ot
AFTER DELETE ON documents_ordres_travail
BEGIN
    DELETE FROM documents WHERE id_document = OLD.id_document
        AND NOT EXISTS (SELECT 1 FROM documents_prestataires WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_ordres_travail WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_gammes WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_contrats WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_di WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_localisations WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_equipements WHERE id_document = OLD.id_document);
END;

DROP TRIGGER IF EXISTS nettoyage_document_orphelin_gamme;
CREATE TRIGGER nettoyage_document_orphelin_gamme
AFTER DELETE ON documents_gammes
BEGIN
    DELETE FROM documents WHERE id_document = OLD.id_document
        AND NOT EXISTS (SELECT 1 FROM documents_prestataires WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_ordres_travail WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_gammes WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_contrats WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_di WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_localisations WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_equipements WHERE id_document = OLD.id_document);
END;

DROP TRIGGER IF EXISTS nettoyage_document_orphelin_contrat;
CREATE TRIGGER nettoyage_document_orphelin_contrat
AFTER DELETE ON documents_contrats
BEGIN
    DELETE FROM documents WHERE id_document = OLD.id_document
        AND NOT EXISTS (SELECT 1 FROM documents_prestataires WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_ordres_travail WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_gammes WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_contrats WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_di WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_localisations WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_equipements WHERE id_document = OLD.id_document);
END;

DROP TRIGGER IF EXISTS nettoyage_document_orphelin_di;
CREATE TRIGGER nettoyage_document_orphelin_di
AFTER DELETE ON documents_di
BEGIN
    DELETE FROM documents WHERE id_document = OLD.id_document
        AND NOT EXISTS (SELECT 1 FROM documents_prestataires WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_ordres_travail WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_gammes WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_contrats WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_di WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_localisations WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_equipements WHERE id_document = OLD.id_document);
END;

DROP TRIGGER IF EXISTS nettoyage_document_orphelin_localisation;
CREATE TRIGGER nettoyage_document_orphelin_localisation
AFTER DELETE ON documents_localisations
BEGIN
    DELETE FROM documents WHERE id_document = OLD.id_document
        AND NOT EXISTS (SELECT 1 FROM documents_prestataires WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_ordres_travail WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_gammes WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_contrats WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_di WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_localisations WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_equipements WHERE id_document = OLD.id_document);
END;

DROP TRIGGER IF EXISTS nettoyage_document_orphelin_equipement;
CREATE TRIGGER nettoyage_document_orphelin_equipement
AFTER DELETE ON documents_equipements
BEGIN
    DELETE FROM documents WHERE id_document = OLD.id_document
        AND NOT EXISTS (SELECT 1 FROM documents_prestataires WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_ordres_travail WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_gammes WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_contrats WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_di WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_localisations WHERE id_document = OLD.id_document)
        AND NOT EXISTS (SELECT 1 FROM documents_equipements WHERE id_document = OLD.id_document);
END;

-- =========================================================================
-- AJOUT v15 : calcul automatique de la localisation héritée
-- Recalcule id_batiment_calc, id_niveau_calc, id_local_calc, nom_localisation_calc
-- à chaque modification de la liaison gamme ↔ équipement
-- =========================================================================

DROP TRIGGER IF EXISTS calcul_localisation_gamme_after_link;
CREATE TRIGGER calcul_localisation_gamme_after_link
AFTER INSERT ON gammes_equipements
FOR EACH ROW
BEGIN
    UPDATE gammes SET
        id_batiment_calc = (
            SELECT CASE WHEN COUNT(DISTINCT b.id_batiment) = 1 THEN MAX(b.id_batiment) ELSE NULL END
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            JOIN niveaux n ON l.id_niveau = n.id_niveau
            JOIN batiments b ON n.id_batiment = b.id_batiment
            WHERE ge.id_gamme = NEW.id_gamme
        ),
        id_niveau_calc = (
            SELECT CASE WHEN COUNT(DISTINCT n.id_niveau) = 1 THEN MAX(n.id_niveau) ELSE NULL END
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            JOIN niveaux n ON l.id_niveau = n.id_niveau
            WHERE ge.id_gamme = NEW.id_gamme
        ),
        id_local_calc = (
            SELECT CASE WHEN COUNT(DISTINCT l.id_local) = 1 THEN MAX(l.id_local) ELSE NULL END
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            WHERE ge.id_gamme = NEW.id_gamme
        ),
        nom_localisation_calc = (
            SELECT CASE
                WHEN cnt_bat > 1 THEN NULL
                WHEN cnt_bat = 1 AND cnt_niv > 1 THEN bat_nom
                WHEN cnt_niv = 1 AND cnt_loc > 1 THEN
                    CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom ELSE niv_nom END
                WHEN cnt_loc = 1 THEN
                    CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom || ' - ' || loc_nom ELSE niv_nom || ' - ' || loc_nom END
                ELSE NULL
            END
            FROM (
                SELECT
                    COUNT(DISTINCT b.id_batiment) AS cnt_bat,
                    COUNT(DISTINCT n.id_niveau) AS cnt_niv,
                    COUNT(DISTINCT l.id_local) AS cnt_loc,
                    (SELECT COUNT(DISTINCT id_batiment) FROM batiments) AS cnt_bat_total,
                    MAX(b.nom) AS bat_nom, MAX(n.nom) AS niv_nom, MAX(l.nom) AS loc_nom
                FROM gammes_equipements ge
                JOIN equipements e ON ge.id_equipement = e.id_equipement
                JOIN locaux l ON e.id_local = l.id_local
                JOIN niveaux n ON l.id_niveau = n.id_niveau
                JOIN batiments b ON n.id_batiment = b.id_batiment
                WHERE ge.id_gamme = NEW.id_gamme
            )
        )
    WHERE id_gamme = NEW.id_gamme;
END;

DROP TRIGGER IF EXISTS calcul_localisation_gamme_after_unlink;
CREATE TRIGGER calcul_localisation_gamme_after_unlink
AFTER DELETE ON gammes_equipements
FOR EACH ROW
BEGIN
    UPDATE gammes SET
        id_batiment_calc = (
            SELECT CASE WHEN COUNT(DISTINCT b.id_batiment) = 1 THEN MAX(b.id_batiment) ELSE NULL END
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            JOIN niveaux n ON l.id_niveau = n.id_niveau
            JOIN batiments b ON n.id_batiment = b.id_batiment
            WHERE ge.id_gamme = OLD.id_gamme
        ),
        id_niveau_calc = (
            SELECT CASE WHEN COUNT(DISTINCT n.id_niveau) = 1 THEN MAX(n.id_niveau) ELSE NULL END
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            JOIN niveaux n ON l.id_niveau = n.id_niveau
            WHERE ge.id_gamme = OLD.id_gamme
        ),
        id_local_calc = (
            SELECT CASE WHEN COUNT(DISTINCT l.id_local) = 1 THEN MAX(l.id_local) ELSE NULL END
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            WHERE ge.id_gamme = OLD.id_gamme
        ),
        nom_localisation_calc = (
            SELECT CASE
                WHEN cnt_bat > 1 THEN NULL
                WHEN cnt_bat = 1 AND cnt_niv > 1 THEN bat_nom
                WHEN cnt_niv = 1 AND cnt_loc > 1 THEN
                    CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom ELSE niv_nom END
                WHEN cnt_loc = 1 THEN
                    CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom || ' - ' || loc_nom ELSE niv_nom || ' - ' || loc_nom END
                ELSE NULL
            END
            FROM (
                SELECT
                    COUNT(DISTINCT b.id_batiment) AS cnt_bat,
                    COUNT(DISTINCT n.id_niveau) AS cnt_niv,
                    COUNT(DISTINCT l.id_local) AS cnt_loc,
                    (SELECT COUNT(DISTINCT id_batiment) FROM batiments) AS cnt_bat_total,
                    MAX(b.nom) AS bat_nom, MAX(n.nom) AS niv_nom, MAX(l.nom) AS loc_nom
                FROM gammes_equipements ge
                JOIN equipements e ON ge.id_equipement = e.id_equipement
                JOIN locaux l ON e.id_local = l.id_local
                JOIN niveaux n ON l.id_niveau = n.id_niveau
                JOIN batiments b ON n.id_batiment = b.id_batiment
                WHERE ge.id_gamme = OLD.id_gamme
            )
        )
    WHERE id_gamme = OLD.id_gamme;
END;

-- Trigger quand un équipement change de local → recalculer toutes ses gammes
DROP TRIGGER IF EXISTS calcul_localisation_gamme_equip_move;
CREATE TRIGGER calcul_localisation_gamme_equip_move
AFTER UPDATE OF id_local ON equipements
FOR EACH ROW
WHEN OLD.id_local IS NOT NEW.id_local
BEGIN
    UPDATE gammes SET
        id_batiment_calc = (
            SELECT CASE WHEN COUNT(DISTINCT b.id_batiment) = 1 THEN MAX(b.id_batiment) ELSE NULL END
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            JOIN niveaux n ON l.id_niveau = n.id_niveau
            JOIN batiments b ON n.id_batiment = b.id_batiment
            WHERE ge.id_gamme = gammes.id_gamme
        ),
        id_niveau_calc = (
            SELECT CASE WHEN COUNT(DISTINCT n.id_niveau) = 1 THEN MAX(n.id_niveau) ELSE NULL END
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            JOIN niveaux n ON l.id_niveau = n.id_niveau
            WHERE ge.id_gamme = gammes.id_gamme
        ),
        id_local_calc = (
            SELECT CASE WHEN COUNT(DISTINCT l.id_local) = 1 THEN MAX(l.id_local) ELSE NULL END
            FROM gammes_equipements ge
            JOIN equipements e ON ge.id_equipement = e.id_equipement
            JOIN locaux l ON e.id_local = l.id_local
            WHERE ge.id_gamme = gammes.id_gamme
        ),
        nom_localisation_calc = (
            SELECT CASE
                WHEN cnt_bat > 1 THEN NULL
                WHEN cnt_bat = 1 AND cnt_niv > 1 THEN bat_nom
                WHEN cnt_niv = 1 AND cnt_loc > 1 THEN
                    CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom ELSE niv_nom END
                WHEN cnt_loc = 1 THEN
                    CASE WHEN cnt_bat_total > 1 THEN bat_nom || ' - ' || niv_nom || ' - ' || loc_nom ELSE niv_nom || ' - ' || loc_nom END
                ELSE NULL
            END
            FROM (
                SELECT
                    COUNT(DISTINCT b.id_batiment) AS cnt_bat,
                    COUNT(DISTINCT n.id_niveau) AS cnt_niv,
                    COUNT(DISTINCT l.id_local) AS cnt_loc,
                    (SELECT COUNT(DISTINCT id_batiment) FROM batiments) AS cnt_bat_total,
                    MAX(b.nom) AS bat_nom, MAX(n.nom) AS niv_nom, MAX(l.nom) AS loc_nom
                FROM gammes_equipements ge
                JOIN equipements e ON ge.id_equipement = e.id_equipement
                JOIN locaux l ON e.id_local = l.id_local
                JOIN niveaux n ON l.id_niveau = n.id_niveau
                JOIN batiments b ON n.id_batiment = b.id_batiment
                WHERE ge.id_gamme = gammes.id_gamme
            )
        )
    WHERE id_gamme IN (SELECT id_gamme FROM gammes_equipements WHERE id_equipement = NEW.id_equipement);
END;
