-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║                                                                           ║
-- ║   DÉDALE — Schéma PostgreSQL complet (Supabase)                           ║
-- ║   GMAO mono-entreprise (single-tenant) pour Établissements Recevant      ║
-- ║   du Public (ERP)                                                         ║
-- ║                                                                           ║
-- ║   Tout-en-un : exécutable directement sur une base Supabase neuve.        ║
-- ║   Concaténation ordonnée des 36 fichiers de migrations/*.sql              ║
-- ║                                                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LECTURE PAR UNE IA — points d'entrée recommandés
-- ─────────────────────────────────────────────────────────────────────────────
-- Avant toute modification, lire :
--   1. CLAUDE.md à la racine (contexte projet + doctrines techniques)
--   2. .claude/rules/supabase-*.md (7 rules thématiques : RLS, plpgsql,
--      schéma, auth, storage, edge-functions, perf-patterns, security)
--   3. docs/domaines/*.md (cartographie fonctionnelle ERP)
--
-- La majorité des fonctions/triggers/tables sont commentées via COMMENT ON
-- au moment de leur définition. Les marqueurs `Fxx (audit sécu)` dans le code
-- identifient des durcissements de sécurité appliqués lors des audits (voir
-- note ci-dessous).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HISTORIQUE — passage en single-tenant (2026-05-20)
-- ─────────────────────────────────────────────────────────────────────────────
-- Dédale a été refondu de multi-tenant vers mono-entreprise : une instance
-- Supabase = une seule entreprise. Suppressions liées au multi-tenant :
--   - tables clients et user_clients (plus d'isolation par client)
--   - rôles super_admin et gestionnaire (transverses multi-clients)
--   - colonne client_id sur toutes les tables métier
--   - helpers Auth cross-tenant (can_access_client, current_client_id)
--   - provisioning par client (bucket Storage, prestataire interne)
--
-- RBAC actuel — 5 rôles : admin, manager, technicien, lecteur, demandeur.
-- La sécurité repose désormais sur deux dimensions seulement : le RÔLE et le
-- SCOPE SITE (public.has_site_access via user_sites).
--
-- Sécurité : plusieurs audits sécurité ont été menés sur l'architecture
-- (référentiel .claude/rules/supabase-security.md). Les durcissements retenus
-- restent en place (search_path = '' sur toutes les fonctions, audit_log
-- append-only avec FORCE RLS, CHECK anti-traversal sur documents.storage_path,
-- whitelist MIME, triggers de cohérence en SECURITY DEFINER, etc.). Les
-- findings détaillés des audits antérieurs concernaient l'ancienne
-- architecture multi-tenant et ne sont pas recopiés ici.
--
-- À valider en intégration (hors périmètre du schéma) :
--   - Rate limiting Supabase Auth (Dashboard, pas SQL)
--   - Config bucket Storage : MIME types et max file size (Dashboard)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE DES MATIÈRES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ▶ BLOC 1 — FONDATIONS (001 à 008b)
--    001  Extensions Postgres (pgcrypto, pg_cron, uuid-ossp)
--    002  Types ENUM (6 types : gamme_nature, ot_origine, observation_*, categorie_scope — user_role, ot_statut, op_statut passés en tables de référence)
--    003  Tables référentielles SMALLINT (unites, periodicites, statuts_di, roles...)
--    004  Seed des référentiels (36 lignes)
--    005  Tables users + user_sites (avec CHECK cohérence rôle)
--    006  Fonctions auth helpers (helpers RLS rôle + scope site)
--    007  Table audit_log + log_audit() (FORCE RLS + append-only)
--    008  Fonction set_updated_at() générique
--    008b Trigger on_auth_user_created (provisioning public.users)
--
-- ▶ BLOC 2 — ESPACE (010 à 013c)
--    010  Table sites
--    011  Tables batiments → niveaux → locaux + VIEW v_locaux_chemin
--    012  Table categories récursive (scope entreprise / site)
--    013  Table equipements (JSONB specifications + CHECK structure) + VIEW
--    013b Table modeles_equipements (bibliothèque entreprise/site — chantier C 2026-05-25)
--    013c Fonctions instancier_equipement + copier_modele_equipement
--
-- ▶ BLOC 3 — ACTEURS (020 à 028)
--    020  Table prestataires (CHECK email POSIX) + seed prestataire interne
--    021  Table contrats (avec versioning + archivage parent)
--    022  Table prestataires_sites (liaison flexibilité)
--    023  Table gammes (ENUM nature : controle_reglementaire / maintenance)
--    024  Table operations (spécifiques)
--    025  Tables modeles_operations + items (scope entreprise / site)
--    026  Tables gamme_modeles + gammes_equipements
--    027  Fonction resolve_prestataire_effectif() (portée du legacy)
--    028  Table contrats_gammes (placée après gammes)
--
-- ▶ BLOC 4 — DEMANDES D'INTERVENTION (030 à 031)
--    030  Table demandes_intervention + liaisons di_*
--    030b Table interventions_chantier + liaisons (machine à états — v0.33)
--    030c Table investissements / CapEx (statut libre — v0.33 ; vue v_capex reportée)
--    031  Table modeles_di (bibliothèque entreprise/site — commun + site 2026-06-11)
--
-- ▶ BLOC 5 — EXÉCUTION (032 à 034)
--    032  Table ordres_travail (snapshots figés — Option B) + orchestration
--    033  Table operations_execution (snapshots ops)
--    034  Table observations + VIEW v_registre_securite + v_observations_dashboard
--
-- ▶ BLOC 6 — DOCUMENTS & STORAGE (040 à 041)
--    040  Table documents (CHECK path + MIME) + 9 tables de liaison (+chantier, +capex v0.33)
--    041  Bucket Storage unique 'documents' + 5 policies
--
-- ▶ BLOC 7 — LOGIQUE EN BASE (050 à 055)
--    050  Triggers de validation et protection (18 triggers)
--    051  Triggers workflow OT (creation_ot_complet décomposé, gestion_statut)
--    052  Triggers audit (4 tables auditées)
--    055  Triggers protection snapshots (opex + OT)
--
-- ▶ BLOC 8 — SÉCURITÉ & AUTOMATION (060 à 070)
--    060  Toutes les policies RLS (rôle + scope site)
--    061  Fix compartimentage (override doc_*_select + triggers cohérence site)
--    070  Cron job Supabase (purge corbeille 90 j)
--
-- COMPTEURS (single-tenant, 2026-06-03 — patch v0.33, interventions de chantier + CapEx) :
--   56 tables (+statuts_chantier, statuts_capex, interventions_chantier,
--   chantier_localisations, chantier_equipements, investissements,
--   documents_interventions_chantier, documents_investissements en v0.33),
--   6 ENUMs, 108 fonctions, 110 triggers, 214 policies RLS (209 public
--   + 5 storage ; inclut les policies générées par boucle DO sur les référentiels),
--   160 index (dont 1 UNIQUE partiel uq_ot_gamme_date_actifs anti-TOCTOU ; +idx_locaux_type ;
--   +14 index chantier/capex en v0.33, dont les 4 index de FK ajoutés post-audit),
--   4 cron jobs (purge_corbeille_90j quotidien + cleanup_storage_orphans
--   mensuel + deactivate_inactive_users mensuel + detect_security_anomalies
--   horaire), 4 VIEWs (toutes en security_invoker), 5 rôles utilisateur.
--   Bibliothèque de gammes : gammes.site_id (scope 2 niveaux) +
--   copier_gamme() + check_ot_gamme_site() (modèle inerte).
--   Soft-delete unifié (refonte 2026-05-23 ; 025 : code de restauration retiré) :
--     - Verrou de structure sur catégories : suppression bloquée si
--       sous-catégorie ou gamme vivante (check_categorie_suppression).
--       Suppression bas → haut, étape par étape.
--     - Cascade gamme → OT (cascade_corbeille_gamme) : supprimer une gamme
--       entraîne ses OT en corbeille.
--     - OT en statut 'cloture' : preuve légale, jamais purgés
--       automatiquement par le cron.
--     - Lien souple OT → gamme (ON DELETE SET NULL) : un OT clôturé
--       survit à la purge de sa gamme via snapshots figés (Pattern 1).
--     - Pas de restauration : l'app n'expose aucun chemin pour ressortir un
--       élément de la corbeille (025 : code de restauration retiré).
--
-- Patch v0.4 — 2026-05-27 (F28 audit sécu, suite des 8 vagues de questions) :
--   - OT : motif_annulation obligatoire + motif_reouverture obligatoire +
--     RPC reouvrir_ot(ot_id, motif) accessible admin/manager(sites)/tech(sites)
--     en SECURITY INVOKER (la RLS gère l'autorisation).
--   - OT : UNIQUE partiel uq_ot_gamme_date_actifs anti-TOCTOU sur
--     (gamme_id, date_prevue) WHERE non terminal AND non corbeille.
--   - protection_ot_terminaux : fige motif_annulation comme preuve légale.
--   - get_user_telephone : règle hiérarchique calquée sur l'accès prestataires
--     (self / admin / site commun via user_sites).
--   - users.photo_path : nouvelle colonne avatar (Storage WebP 1 Mo,
--     préfixe users/{uuid}/avatar.webp avec CHECK format).
--   - users_self_update : policy permettant la mise à jour profil par self
--     (les colonnes sensibles restent protégées par le trigger
--     protect_users_sensitive_columns).
--
-- Patch v0.5 — 2026-05-27 (F29, suite des 4 décisions de questions ciblées) :
--   - RPC anonymize_user(uuid) : droit à l'effacement RGPD. Remplace PII
--     (nom_complet, telephone, photo_path) par valeurs neutres, coupe l'accès
--     (est_actif = false), conserve la trace métier (NF EN 13306). Réservée
--     admin, auto-anonymisation interdite, trace explicite dans audit_log.
--   - handle_new_auth_user étendu : lecture app_metadata.created_by +
--     app_metadata.site_ids[]. Validation cascade (admin → tous, manager →
--     tech/lecteur/demandeur, tech → lecteur/demandeur). Auto-rattachement
--     user_sites + vérif scope inviteur. L'Edge Function future n'a qu'à
--     poser ces 4 clés dans app_metadata, le trigger fait le reste.
--   - cleanup_storage_orphans : 2e cron mensuel (1er à 04h) qui supprime
--     du bucket documents tout objet non référencé en base
--     (documents.storage_path + users.photo_path). Trace dans audit_log
--     avant suppression (forensic). Réintroduction validée v0.5 après que
--     la doctrine V1 l'avait initialement reporté.
--   - DEPLOY.md créé à la racine du projet : checklist 12 sections
--     ordonnées pour déploiement client (création projet, schéma, Auth,
--     Storage, Realtime, 1er admin, tests d'étanchéité, 2FA, rollback,
--     monitoring 30 premiers jours).
--
-- Patch v0.6 — 2026-05-27 (F30, 3 chantiers : hygiène comptes + monitoring) :
--   - Cron deactivate_inactive_users : désactive (est_actif=false) les comptes
--     non-admin sans connexion depuis 6 mois (auth.users.last_sign_in_at).
--     Exclut les admins (anti-lockout). Bypass contrôlé du trigger
--     protect_users_sensitive_columns via GUC app.system_deactivation
--     (Pattern 3). Cron mensuel.
--   - Table security_alerts + fonction detect_security_anomalies (cron horaire)
--     : monitoring d'intrusion SQL-feasible (croissance audit_log anormale,
--     pic de création de comptes, anonymisation RGPD en masse). Les autres
--     indicateurs (logins échoués, erreurs RLS, edge 500) sont hors SQL
--     (logs Supabase + Grafana/Logflare).
--   - protect_users_sensitive_columns scindé : role modifiable par admin
--     uniquement (aucun bypass) ; est_actif modifiable par admin OU cron
--     système (GUC).
--   - docs/domaines/ resynchronisés single-tenant (14 fichiers) — la doc
--     fonctionnelle avait pris du retard depuis le pivot single-tenant.
--
-- Patch v0.7 — 2026-05-28 (suite pgTAP tests/ + corrections révélées à la 1re
-- exécution réelle du schéma sur Supabase local) :
--   - F31a : get_my_sites() était défini avant la table sites (RETURNS SETOF
--     public.sites) → déplacé dans le bloc 010_sites (ordre des dépendances).
--   - F31b : récursion RLS infinie sur users. Les policies
--     users_manager_select_peers / users_same_client_select faisaient un EXISTS
--     inline sur user_sites rebouclant vers users. Encapsulé dans le helper
--     public.shares_site_with(uuid) SECURITY DEFINER (casse la récursion).
--   - Portabilité (v0.34) : les 8 helpers RLS (current_role, has_site_access,
--     shares_site_with, can_access_*, miniature_scope_ok) vivent dans le schéma
--     PUBLIC (et non auth) → le script s'applique sur Supabase hébergé via le
--     SQL Editor / postgres (qui n'a PAS le droit de créer dans auth). Seul reste
--     dans auth le trigger on_auth_user_created sur auth.users (pattern Supabase
--     standard). Les helpers étant SECURITY DEFINER, ils sont ré-grantés à
--     authenticated dans le bloc GRANT final (sinon la RLS casse).
--
-- Patch v0.9 — 2026-05-28 (audit sécurité poussé multi-agent + tests d'intrusion
-- dynamiques sur base locale) :
--   - F32a : cloisonnement par site de contrats / contrats_gammes /
--     gammes_equipements (étaient transverses cross-site). 3 helpers
--     SECURITY DEFINER anti-récursion : public.can_access_prestataire,
--     can_access_gamme, can_access_equipement. Policies SELECT + write
--     réécrites (manager + technicien).
--   - F32b : trigger Pattern 6 check_gamme_equipement_site (cohérence
--     gamme/équipement même site ; gamme bibliothèque exemptée) — manquait.
--   - F32c : garde-fou bootstrap admin dans handle_new_auth_user (création
--     sans created_by refusée si un admin existe déjà).
--   - Validé : schéma s'applique sans erreur + 45/45 tests pgTAP + tests
--     d'intrusion dynamiques (cloisonnement + garde-fou confirmés).
--
-- Patches v0.10 → v0.19 (2026-05-28 → 2026-05-30) — détail dans CLAUDE.md
-- (« Décisions structurantes déjà actées ») et patchnotes/. Résumé :
--   v0.10 : suite pgTAP portée à 84 assertions + runners durcis (schéma inchangé).
--   v0.11 : DI = signalement curatif autonome (coupure DI↔OT : retrait de la
--           valeur 'di' de ot_origine, de ordres_travail.di_id, de di_gammes) +
--           resolved_by ; demandeur élargi en lecture ; RPC get_audit_trail.
--   v0.12 : durcissements (SECURITY DEFINER sur check_equipement_categorie_scope,
--           suppression types_sources, renommage statut_di_id, +index, génération
--           OT calée semaine ISO + échec tracé dans security_alerts).
--   v0.13 : perf RLS — auth.uid()/current_role() en (SELECT …) (InitPlan) +
--           helper public.can_access_local. Kill-switch est_actif conservé.
--   v0.14a : normalisation image_url → image_path (+ cron orphelins étendu).
--   v0.14b : bibliothèques de fichiers (document_chapitres + miniatures), dédup
--            hash SCOPÉE par site, miniature_id + count_*_refs.
--   v0.14c : Pattern 6 de cohérence de site sur miniature_id (6 triggers).
--   v0.15 : nettoyage racine (un seul script SQL ; schéma inchangé).
--   v0.16 : durcissement post-audit (écriture documents_* scopée site, anti-cycle
--           document_chapitres, +index idx_di_resolved_by).
--   v0.17 : durcissement privilèges (anon neutralisé, REVOKE EXECUTE sur les
--           fonctions SECURITY DEFINER + ré-autorisation ciblée des RPC métier).
--   v0.18 : count_*_refs converties plpgsql + garde de rôle ; audit_log /
--           security_alerts retirés de l'API (RPC get_audit_log/get_security_alerts).
--   v0.19 : couverture d'index FK (12 index ajoutés — Advisor 0001).
--   v0.20 : cloisonnement complet des fichiers par site — RLS lecture/écriture
--           de documents (scope site_id) + storage.objects aligné sur la
--           visibilité de l'entité porteuse (documents, miniatures, avatars,
--           *.image_path) : un fichier n'est lisible que si on voit son entité.
--           +13 index sur les colonnes pointeur Storage.
--
-- ═════════════════════════════════════════════════════════════════════════════


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  001_extensions.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 001 — Extensions Postgres
-- Active les extensions nécessaires au projet Dédale :
--   - pgcrypto   : gen_random_uuid() pour les PK UUID
--   - pg_cron    : planification des jobs (Edge Functions, cleanup, etc.)
--   - uuid-ossp  : générateurs UUID alternatifs (filet de sécurité)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  002_enums.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 002 — ENUMs Postgres (catalogue exhaustif du projet)
-- Centralise tous les types énumérés utilisés par les tables métier.
-- Les autres migrations référencent ces types — ne pas modifier sans coordination.
-- =============================================================================

-- Rôles applicatifs (5 rôles) — instance single-tenant (1 instance = 1 entreprise).
-- Vision directrice : le technicien sur place est le centre de l'app, c'est
-- lui qui produit la donnée. Les rôles "supervision" (admin, manager) sont des
-- superviseurs de loin qui n'utiliseront peut-être pas l'app au quotidien.
-- L'app change de visage selon le rôle.
--
-- 1. admin — Administrateur de l'entreprise.
--    Pilote l'instance, voit tout, crée les comptes. Accès transverse complet
--    sur tous les sites, sans scope.
--    Définit le patrimoine. Le 1er admin est créé via le Dashboard Supabase.
--
-- 2. manager — Responsable de plusieurs sites.
--    Cadre opérationnel intermédiaire qui prend en charge 1 à N sites
--    (user_sites). Mission : organiser les techniciens, créer leurs comptes,
--    attribuer les sites, superviser le métier. A le même pouvoir métier que
--    le technicien sur ses sites + responsabilités d'équipe.
--
-- 3. technicien — Responsable technique d'établissement.
--    Le rôle CENTRAL de Dédale. C'est lui qui maîtrise sa réglementation,
--    crée ses gammes, prend ses rendez-vous, organise, exécute, clôture.
--    Plein pouvoir métier sur ses sites assignés (peut avoir 1 à N sites).
--    Sa seule limite : il ne crée pas d'autres techniciens (réservé manager).
--
-- 4. lecteur — Direction sur site / observateur.
--    Clone du technicien en lecture seule. Cas usage : directeur d'hôtel qui
--    consulte les rapports de son site sans rien toucher, auditeur ponctuel.
--    Voit tout sur ses sites, n'écrit nulle part.
--
-- 5. demandeur — Gouvernante / résident / personnel d'accueil.
--    Rôle ultra-restreint. Pour lui Dédale est une app de tickets de
--    maintenance. Crée des DI sur ses sites, voit UNIQUEMENT ses propres DI.
--    Aucun accès au reste (équipements détaillés, OT, prestataires…).
--
-- Cascade création comptes (qui peut créer qui) :
--   admin      → manager, technicien, lecteur, demandeur
--   manager    → technicien, lecteur, demandeur
--   technicien → lecteur, demandeur (PAS d'autres techniciens)
--   lecteur/demandeur → ∅
-- user_role : ENUM REMPLACÉ par la table de référence public.roles (décision PO
-- 2026-06-01). Les codes restent stables ; public.current_role() renvoie le code TEXT,
-- donc toutes les comparaisons RLS « = 'admin' » / « IN (...) » restent valables.

-- Nature d'une gamme de maintenance
CREATE TYPE gamme_nature AS ENUM (
    'controle_reglementaire',
    'maintenance_preventive'
);

-- Statuts OT et opérations : désormais des TABLES de référence statuts_ot /
-- statuts_operations (v0.27, ex-ENUM ot_statut/op_statut — cohérence avec statuts_di,
-- décision PO). Voir bloc 003. Le `code` reste STABLE (utilisé par les machines à états).

-- Origine d'un OT (programmé, planifié à la main, issu d'une DI)
CREATE TYPE ot_origine AS ENUM (
    'programme',
    'planifie'
);

-- PAS de niveau de priorité sur les OT (décision PO 2026-06-01) : un système de
-- priorité dérive toujours vers « tout en urgent ». Le pilotage se fait par la date
-- prévue (semaine ISO) et la nature de la gamme, pas par un drapeau d'urgence.

-- Source d'une observation terrain
CREATE TYPE observation_source AS ENUM (
    'controle_reglementaire',
    'commission_securite',
    'inspection_interne'
);

-- Gravité d'une observation
CREATE TYPE observation_gravite AS ENUM (
    'mineure',
    'majeure',
    'bloquante'
);

-- Statut d'une observation
-- F24 (audit 3e passe) : valeur 'caduque' supprimée — non utile au métier Dédale.
-- L'UI peut afficher un filtre "obs en retard" basé sur echeance < CURRENT_DATE
-- sans qu'on ait besoin d'un statut écrit en base ni d'un cron pour le poser.
CREATE TYPE observation_statut AS ENUM (
    'en_cours',
    'levee'
);

-- Portée d'une catégorie (équipement seul, gamme seule, opération seule, ou mixte)
CREATE TYPE categorie_scope AS ENUM (
    'equipement',
    'gamme',
    'mixte',
    'operation',  -- 015 : catégories des modèles d'opération (racine-only, 1 niveau)
    'parc'        -- 027/028 : catégories des ÉQUIPEMENTS RÉELS (parc), séparées des
                  --           modèles ; 2 niveaux (catégorie → sous-catégorie), comme 'gamme'
);


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  003_referentiels.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 003 — Référentiels systèmes (SMALLINT PK stables)
-- Tables de référence de l'entreprise, partagées par toute l'instance.
-- IDs hardcodés dans le code applicatif et dans les triggers — stabilité requise.
-- statuts_ot / statuts_operations sont des tables de référence (v0.27, ici-même,
-- cohérence avec statuts_di). priorites_ot n'existe pas : pas de priorité OT (PO).
-- =============================================================================

-- Unités de mesure (°C, %, m³, kWh, etc.)
CREATE TABLE unites (
    id SMALLINT PRIMARY KEY,
    nom TEXT NOT NULL UNIQUE,
    symbole TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Périodicités de maintenance avec tolérance intelligente
-- jours_periodicite : intervalle nominal entre deux passages
-- jours_valide      : durée de validité réglementaire après réalisation
-- tolerance_jours   : marge avant/après l'échéance
CREATE TABLE periodicites (
    id SMALLINT PRIMARY KEY,
    libelle TEXT NOT NULL UNIQUE,
    jours_periodicite INT NOT NULL,
    jours_valide INT NOT NULL,
    tolerance_jours INT NOT NULL,
    description TEXT,
    CONSTRAINT periodicites_coherence CHECK (
        jours_periodicite > 0
        AND jours_valide > 0
        AND tolerance_jours >= 0
        AND jours_valide <= jours_periodicite
        AND tolerance_jours <= jours_periodicite
    )
);


-- Types d'opérations (vérification, mesure, réglage, etc.)
-- necessite_seuils : true pour les opérations de type Mesure (valeur + min/max)
CREATE TABLE types_operations (
    id SMALLINT PRIMARY KEY,
    libelle TEXT NOT NULL UNIQUE,
    description TEXT,
    necessite_seuils BOOLEAN NOT NULL DEFAULT false
);

-- Statuts d'une Demande d'Intervention
CREATE TABLE statuts_di (
    id SMALLINT PRIMARY KEY,
    nom TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Types de contrats de maintenance (déterminé, tacite, indéterminé)
CREATE TABLE types_contrats (
    id SMALLINT PRIMARY KEY,
    libelle TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Types de documents — 3 types systèmes universels + types créés par les clients
-- est_systeme : pour l'UI (avertissement avant suppression), pas de protection base
CREATE TABLE types_documents (
    id SMALLINT PRIMARY KEY,
    nom TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    est_systeme BOOLEAN NOT NULL DEFAULT false
);

-- Types de locaux (v0.30) — petite liste ÉDITABLE par l'admin pour qualifier une
-- zone (logement, local technique, circulation…). Purement descriptif : aucune
-- logique métier/RLS/trigger ne dépend de ces valeurs, on peut donc renommer ou
-- ajouter librement. `actif` masque un type obsolète sans casser les locaux qui
-- l'utilisent encore (préférer désactiver plutôt que supprimer).
CREATE TABLE types_locaux (
    id          SMALLINT PRIMARY KEY,
    libelle     TEXT NOT NULL UNIQUE,
    description TEXT,
    actif       BOOLEAN NOT NULL DEFAULT true
);

-- Rôles applicatifs (référentiel) — décision PO 2026-06-01 : TABLE de référence
-- consultable/documentée plutôt qu'un ENUM. Les codes (admin/manager/...) restent
-- STABLES et hardcodés dans les policies/triggers via public.current_role() (qui
-- renvoie le code TEXT). id SMALLINT stable, code TEXT unique, description humaine.
CREATE TABLE roles (
    id          SMALLINT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Statuts d'un Ordre de Travail (v0.27 : table de référence, ex-ENUM ot_statut —
-- cohérence avec statuts_di). Le `code` est STABLE (utilisé par la machine à états).
CREATE TABLE statuts_ot (
    id          SMALLINT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    libelle     TEXT NOT NULL,
    description TEXT
);

-- Statuts d'une opération d'exécution (v0.27 : table de référence, ex-ENUM op_statut).
CREATE TABLE statuts_operations (
    id          SMALLINT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    libelle     TEXT NOT NULL,
    description TEXT
);

-- Statuts d'une intervention de chantier (v0.33). Machine à états (cf trigger
-- validation_transitions_chantier) : les ids sont STABLES car portés par les
-- transitions. Référentiel consultable (libellé/description ajustables).
CREATE TABLE statuts_chantier (
    id          SMALLINT PRIMARY KEY,
    nom         TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Statuts d'un investissement / CapEx (v0.33). Statut LIBRE (aucune machine à
-- états, aucun trigger de transition) : purement descriptif, l'admin ajuste.
CREATE TABLE statuts_capex (
    id          SMALLINT PRIMARY KEY,
    nom         TEXT NOT NULL UNIQUE,
    description TEXT
);


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  004_seed_referentiels.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 004 — Seed des référentiels systèmes
-- Valeurs reprises du legacy schema.sql (lignes 748-855) sans modification
-- de signification. statuts_ot / statuts_operations sont seedés ici (tables de
-- référence v0.27). priorites_ot n'existe pas (pas de priorité OT — décision PO).
-- =============================================================================

-- Unités de mesure
INSERT INTO unites (id, nom, symbole, description) VALUES
    (1, 'Degrés Celsius',         '°C',  'Température'),
    (2, 'Pourcentage',             '%',   'Pourcentage'),
    (3, 'Titre Hydrotimétrique',   'TH',  'Dureté de l''eau'),
    (4, 'Mètre Cube',              'm³',  'Volume'),
    (5, 'Kilovolt-Ampère',         'kVA', 'Puissance électrique'),
    (6, 'Kilowatt-Heure',          'kWh', 'Énergie électrique'),
    (7, 'Heure',                   'h',   'Durée ou compteur horaire de fonctionnement');

-- Périodicités de maintenance avec tolérance intelligente
INSERT INTO periodicites (id, libelle, jours_periodicite, jours_valide, tolerance_jours, description) VALUES
    (1,  'Hebdomadaire',     7,    5,    2,   'Chaque semaine'),
    (2,  'Bihebdomadaire',   14,   10,   3,   'Toutes les 2 semaines'),
    (3,  'Mensuel',          30,   25,   7,   'Chaque mois'),
    (4,  'Sesquimestriel',   42,   32,   10,  'Toutes les six semaines'),
    (5,  'Bimestriel',       60,   45,   14,  'Tous les 2 mois'),
    (6,  'Trimestriel',      90,   60,   21,  'Tous les 3 mois'),
    (7,  'Quadrimestriel',   120,  90,   26,  'Tous les 4 mois'),
    (8,  'Semestriel',       180,  120,  30,  'Tous les 6 mois'),
    (9,  'Annuel',           365,  270,  45,  'Chaque année'),
    (10, 'Biennale',         730,  540,  60,  'Tous les 2 ans'),
    (11, 'Triennal',         1095, 730,  90,  'Tous les 3 ans'),
    (12, 'Quinquennal',      1825, 1200, 120, 'Tous les 5 ans'),
    (13, 'Décennal',         3650, 2920, 180, 'Tous les 10 ans');


-- Types d'opérations
INSERT INTO types_operations (id, libelle, description, necessite_seuils) VALUES
    (1, 'Vérification',          'Contrôle fonctionnel par le personnel',          false),
    (2, 'Contrôle réglementaire', 'Intervention par organisme agréé',              false),
    (3, 'Entretien',             'Nettoyage, graissage, remplacement préventif',   false),
    (4, 'Mesure',                'Relevé quantitatif avec seuils et unités',       true),
    (5, 'Réglage',               'Ajustement de paramètres techniques',            false);

-- Statuts d'une DI
INSERT INTO statuts_di (id, nom, description) VALUES
    (1, 'Ouverte',   'Demande en cours de traitement'),
    (2, 'Résolue',   'Demande résolue — immutable sauf réouverture'),
    (3, 'Réouverte', 'Demande rouverte pour correction ou complément');

-- Rôles applicatifs (codes STABLES — hardcodés dans les policies via current_role).
-- ⚠️ Ne pas renuméroter ni renommer un code : c'est la clé de toute la sécurité RLS.
INSERT INTO roles (id, code, description) VALUES
    (1, 'admin',      'Administrateur de l''entreprise : voit tout, crée les comptes, hérite des bypass système'),
    (2, 'manager',    'Responsable de plusieurs sites : supervise les techniciens, crée les comptes terrain'),
    (3, 'technicien', 'Exécutant terrain : plein pouvoir métier sur ses sites assignés'),
    (4, 'lecteur',    'Lecture seule sur ses sites assignés'),
    (5, 'demandeur',  'Crée des demandes d''intervention, voit uniquement les siennes');

-- Statuts d'un OT (codes STABLES — utilisés par les triggers/transitions, ne pas renommer)
INSERT INTO statuts_ot (id, code, libelle, description) VALUES
    (1, 'planifie', 'Planifié', 'OT créé, en attente d''exécution'),
    (2, 'en_cours', 'En cours', 'Au moins une opération démarrée'),
    (3, 'cloture',  'Clôturé',  'Toutes les opérations traitées (preuve légale NF EN 13306)'),
    (4, 'annule',   'Annulé',   'OT abandonné (motif obligatoire)'),
    (5, 'reouvert', 'Rouvert',  'OT clôturé puis rouvert pour correction');

-- Statuts d'une opération d'exécution (codes STABLES)
INSERT INTO statuts_operations (id, code, libelle, description) VALUES
    (1, 'en_attente',     'En attente',     'Opération pas encore commencée'),
    (2, 'en_cours',       'En cours',       'Opération démarrée'),
    (3, 'terminee',       'Terminée',       'Opération réalisée'),
    (4, 'annulee',        'Annulée',        'Annulée par cascade système (OT annulé)'),
    (5, 'non_applicable', 'Non applicable', 'Opération sans objet sur cet OT');

-- Statuts d'une intervention de chantier (codes/ids STABLES — machine à états)
INSERT INTO statuts_chantier (id, nom, description) VALUES
    (1, 'Ouvert',    'Chantier déclaré, pas encore planifié'),
    (2, 'Planifié',  'Date d''intervention fixée'),
    (3, 'En cours',  'Intervention en cours sur le terrain'),
    (4, 'Terminé',   'Intervention achevée (compte-rendu obligatoire)'),
    (5, 'Annulé',    'Chantier abandonné (état terminal)');

-- Statuts d'un investissement / CapEx (statut LIBRE — aucune transition imposée)
INSERT INTO statuts_capex (id, nom, description) VALUES
    (1, 'Demandé', 'Investissement proposé, en attente d''arbitrage'),
    (2, 'Validé',  'Investissement approuvé / budgété'),
    (3, 'Réalisé', 'Dépense engagée et réalisée'),
    (4, 'Refusé',  'Investissement écarté');

-- Types de contrats
INSERT INTO types_contrats (id, libelle, description) VALUES
    (1, 'Déterminé',   'Contrat à durée fixe sans reconduction'),
    (2, 'Tacite',      'Contrat avec reconduction automatique par cycles'),
    (3, 'Indéterminé', 'Contrat sans date de fin, résiliable avec préavis');

-- Types de documents systèmes (l'utilisateur en crée d'autres : VGP, CERFA, PV…)
INSERT INTO types_documents (id, nom, description, est_systeme) VALUES
    (1, 'Attestation', 'Certificat de conformité, d''assurance, d''habilitation ou de formation', true),
    (2, 'Rapport',     'Compte-rendu d''intervention, de contrôle ou de maintenance',             true),
    (3, 'Contrat',     'Document contractuel ou de prestation de service',                        true),
    (4, 'Devis',       'Devis ou estimation chiffrée (chantiers, investissements)',               false);

-- Types de locaux (liste de départ — l'admin ajuste/complète via l'app)
-- Liste généraliste et volontairement courte (vaut pour copro/bailleur ET hôtel
-- ERP type O). Types regroupés plutôt que pointus → simple à choisir. Chambres
-- en ids consécutifs (2-3-4). Purement descriptif : l'admin ajuste librement.
INSERT INTO types_locaux (id, libelle, description) VALUES
    (1,  'Logement',           'Appartement ou habitation privative'),
    (2,  'Chambre standard',   'Chambre client d''entrée de gamme'),
    (3,  'Chambre confort',    'Chambre client de gamme intermédiaire'),
    (4,  'Chambre premium',    'Chambre ou suite haut de gamme'),
    (5,  'Partie commune',     'Hall, palier, espace partagé'),
    (6,  'Circulation',        'Couloir, escalier, ascenseur'),
    (7,  'Local technique',    'Chaufferie, local électrique, machinerie'),
    (8,  'Local à risque',     'Poubelles, stockage, archives, réserve'),
    (9,  'Parking',            'Stationnement, box, garage'),
    (10, 'Réception',          'Accueil, hall d''arrivée, conciergerie'),
    (11, 'Restauration',       'Cuisine, salle de restaurant, bar'),
    (12, 'Salle de réunion',   'Séminaire, conférence ou banquet'),
    (13, 'Bien-être & loisirs','Spa, piscine, salle de sport'),
    (14, 'Bureau',             'Espace administratif'),
    (15, 'Commerce',           'Local commercial ou tertiaire'),
    (16, 'Buanderie',          'Lingerie, blanchisserie');


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  005_users.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 005 — Users, User-Sites (fondations single-tenant)
-- 1 instance = 1 entreprise unique : plus de table clients ni d'isolation
-- multi-tenant. Les politiques RLS détaillées sont définies par l'agent dédié
-- RLS. Ici on active simplement ROW LEVEL SECURITY pour garantir que rien
-- n'est exposé tant que les policies ne sont pas créées.
-- Pas de soft-delete sur ces tables en V1 (est_actif = false suffit).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- users — profils applicatifs (extension de auth.users Supabase)
-- created_by trace la cascade d'invitation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id SMALLINT NOT NULL REFERENCES roles(id),
    nom_complet TEXT NOT NULL,
    telephone TEXT,
    -- F28 (audit sécu) — Avatar : chemin vers le bucket Storage 'documents'
    -- sous-arbre 'users/{user_id}/avatar.webp'. Format WebP imposé (compression
    -- front), taille max 1 Mo enforced au niveau bucket (Dashboard Supabase).
    -- Doctrine CLAUDE.md : pas de BLOB en base, uniquement référence Storage.
    photo_path TEXT,
    -- F29 (patch v0.5) — Timestamp d'anonymisation RGPD. NULL = compte normal.
    -- Renseigné UNIQUEMENT par la RPC anonymize_user(). Base d'idempotence
    -- robuste pour la RPC (au lieu de tester nom_complet = 'Utilisateur
    -- supprimé' qui peut être manipulé). Trace explicite côté ligne, en plus
    -- de l'entrée audit_log forensic.
    anonymized_at TIMESTAMPTZ,
    est_actif BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    -- F28 audit sécu : plafonds anti-DOS texte + format téléphone permissif
    -- (accepte E.164 international, formats nationaux avec espaces/tirets/points).
    CONSTRAINT users_nom_complet_non_vide CHECK (length(trim(nom_complet)) > 0),
    CONSTRAINT users_nom_complet_taille  CHECK (length(nom_complet) <= 200),
    CONSTRAINT users_telephone_format    CHECK (
        telephone IS NULL
        OR telephone ~ '^\+?[0-9][0-9 .\-]{4,19}$'
    ),
    -- F28 (audit sécu) — Format du chemin Storage : préfixe users/ +
    -- segment UUID + avatar.webp. Anti-traversal + force convention de nommage.
    CONSTRAINT users_photo_path_format CHECK (
        photo_path IS NULL
        OR photo_path ~ '^users/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.webp$'
    )
);

CREATE INDEX idx_users_role ON users(role_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE users IS 'Profils applicatifs miroir de auth.users (peuplés par trigger handle_new_auth_user F03). Instance single-tenant : tous les users appartiennent à l''unique entreprise.';
COMMENT ON COLUMN users.est_actif IS 'Kill-switch : false révoque tous les droits via les helpers Auth sans attendre l''expiration JWT (F02).';
COMMENT ON COLUMN users.created_by IS 'Trace la cascade d''invitation (Admin -> Manager/Technicien/Lecteur/Demandeur ; Manager -> Technicien/Lecteur/Demandeur ; Technicien -> Lecteur/Demandeur).';
COMMENT ON COLUMN users.photo_path IS 'F28 (audit) : chemin Storage de l''avatar (bucket documents, sous-arbre users/{user_id}/avatar.webp). WebP uniquement, 1 Mo max (à configurer côté bucket Dashboard). Front compresse avant upload. NULL = pas d''avatar, l''UI affiche les initiales.';
COMMENT ON COLUMN users.anonymized_at IS 'F29 (patch v0.5) : timestamp d''anonymisation RGPD posé par la RPC anonymize_user(). NULL = compte normal. NOT NULL = compte anonymisé (idempotence robuste de la RPC).';

-- ─────────────────────────────────────────────────────────────────────────────
-- user_sites — assignation Manager / Technicien / Lecteur / Demandeur à des sites
-- Vide pour les admin (accès transverse via RLS).
-- La FK sites(id) est créée par l'agent qui définit la table sites — on la
-- déclare ici en utilisant le nom seul ; l'agent sites s'assure de l'ordre.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE user_sites (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, site_id)
);

CREATE INDEX idx_user_sites_site ON user_sites(site_id);

ALTER TABLE user_sites ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE user_sites IS 'Scope sites pour les rôles site-scopés (manager, technicien, lecteur, demandeur). Vide pour admin (accès transverse à tous les sites).';

-- NB : la contrainte FK user_sites.site_id -> sites(id) ON DELETE CASCADE sera
-- ajoutée par l'agent qui crée la table sites (ALTER TABLE ADD CONSTRAINT).


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  006_auth_helpers.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 006 — Fonctions auth helpers (fondation de toutes les politiques RLS)
-- Toutes en STABLE SECURITY DEFINER avec search_path = '' (doctrine sécurité) :
--   1. Mettre en cache le résultat sur la durée de la transaction (STABLE)
--   2. Lire public.users en bypassant la RLS (sinon récursion infinie)
--   3. Bloquer search_path hijack via empty search_path + qualifs explicites
-- Signatures contractuelles : les agents RLS les invoquent telles quelles.
-- Tous les helpers filtrent est_actif = true → la désactivation d'un user
-- révoque immédiatement ses droits (kill-switch sans attendre exp du JWT).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- public.current_role() : rôle de l'user connecté ACTIF
-- Renvoie NULL si user désactivé ou inexistant.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_role() RETURNS TEXT
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = ''
AS $$
    SELECT r.code
    FROM public.users u
    JOIN public.roles r ON r.id = u.role_id
    WHERE u.id = (SELECT auth.uid()) AND u.est_actif = true
$$;
COMMENT ON FUNCTION public.current_role() IS 'Helper RLS — code rôle (TEXT) de l''user connecté ACTIF, lu via la table roles. NULL si désactivé (kill-switch F02).';

-- ─────────────────────────────────────────────────────────────────────────────
-- public.has_site_access(target_site_id) : true si l'user peut accéder au site
--   - admin : OK partout (accès transverse à tous les sites de l'instance)
--   - manager / technicien / lecteur / demandeur : OK si user_sites + user actif
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_site_access(target_site_id UUID) RETURNS BOOLEAN
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = ''
AS $$
    SELECT
        EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = (SELECT auth.uid())
              AND u.role_id = (SELECT id FROM public.roles WHERE code = 'admin')
              AND u.est_actif = true
        )
        OR EXISTS (
            SELECT 1
            FROM public.user_sites us
            JOIN public.users u ON u.id = us.user_id
            WHERE us.user_id = (SELECT auth.uid())
              AND us.site_id = target_site_id
              AND u.est_actif = true
        )
$$;
COMMENT ON FUNCTION public.has_site_access(UUID) IS 'Helper RLS — true si l''user a accès au site cible (admin partout, manager/technicien/lecteur/demandeur via user_sites).';

-- ─────────────────────────────────────────────────────────────────────────────
-- public.shares_site_with(target_user_id) : true si l'user connecté partage AU
-- MOINS UN site assigné avec l'user cible (via user_sites).
--
-- F31 (audit exécution) — CRITIQUE anti-récursion RLS. Les policies
-- users_manager_select_peers / users_same_client_select faisaient un EXISTS
-- inline sur user_sites DANS une policy de la table users. Or l'évaluation de
-- ce sous-SELECT déclenche les policies de user_sites, qui rebouclent vers
-- users → « infinite recursion detected in policy for relation users ».
-- En encapsulant la sous-requête dans cette fonction SECURITY DEFINER (qui
-- contourne la RLS, comme current_role/has_site_access), la chaîne récursive
-- est cassée : la lecture de user_sites s'y fait sans RLS.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.shares_site_with(target_user_id UUID) RETURNS BOOLEAN
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_sites us_me
        JOIN public.user_sites us_other ON us_other.site_id = us_me.site_id
        WHERE us_me.user_id    = (SELECT auth.uid())
          AND us_other.user_id = target_user_id
    );
$$;
COMMENT ON FUNCTION public.shares_site_with(UUID) IS 'Helper RLS (F31) — true si le caller et l''user cible partagent ≥1 site (user_sites). SECURITY DEFINER pour casser la récursion RLS sur users (anti infinite recursion).';

-- Note : get_my_sites() était défini ici à l'origine, mais il retourne
-- SETOF public.sites — il doit donc être créé APRÈS la table sites (déplacé
-- dans le bloc 010_sites pour respecter l'ordre des dépendances).


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  007_audit_log.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 007 — Audit log générique (NOUVEAU vs legacy)
-- Table immuable de traçabilité (conformité ERP, NF EN 13306).
-- Pas de FK sur user_id : les logs survivent aux suppressions cascade (RGPD).
-- La fonction log_audit() est attachée aux 4 tables critiques par les agents
-- qui les définissent (ordres_travail, operations_execution,
-- demandes_intervention, observations).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Table audit_log
-- row_pk en TEXT pour supporter UUID, INTEGER, SMALLINT indifféremment.
-- before/after en JSONB complet (lecture humaine simple, pas de diff custom).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID,
    table_name TEXT NOT NULL,
    row_pk TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    before JSONB,
    after JSONB,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_table ON audit_log(table_name);
CREATE INDEX idx_audit_at ON audit_log(at);
CREATE INDEX idx_audit_table_row ON audit_log(table_name, row_pk, at DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id, at DESC) WHERE user_id IS NOT NULL;
-- F09 (audit sécu) — index pour requêtes de monitoring (§6 supabase-security.md) :
-- "croissance anormale audit_log", "lectures massives", scans par action.
CREATE INDEX idx_audit_action_at ON audit_log(action, at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Fix 15 (audit Bloc 7) — FORCE RLS pour que la table soit RLS-protégée même
-- pour le propriétaire (BYPASSRLS exclu). log_audit() reste SECURITY DEFINER
-- et conserve la capacité d'écrire ; aucun autre code ne doit écrire ici.
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE audit_log IS 'Journal append-only des 4 tables critiques (OT, ops_exec, DI, observations) pour conformité NF EN 13306. FORCE RLS + policies UPDATE/DELETE USING (false) + trigger anti-mutation (F04).';

-- ─────────────────────────────────────────────────────────────────────────────
-- log_audit() : fonction trigger générique, SECURITY DEFINER
-- Capture la PK quel que soit l'opérateur (INSERT/UPDATE/DELETE).
-- Toutes les tables auditées doivent exposer la colonne id.
-- search_path = '' + qualifs explicites public.* (doctrine sécurité).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = ''
AS $$
DECLARE
    v_row_pk TEXT;
    v_new_json JSONB;
    v_old_json JSONB;
BEGIN
    -- Sérialise OLD/NEW (NULL en INSERT pour OLD, NULL en DELETE pour NEW)
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old_json := to_jsonb(OLD);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new_json := to_jsonb(NEW);
    END IF;

    -- Récupère la PK depuis le JSON pour éviter les soucis
    -- de typage entre NEW/OLD selon TG_OP.
    v_row_pk := COALESCE(v_new_json->>'id', v_old_json->>'id');

    INSERT INTO public.audit_log (
        user_id, table_name, row_pk, action, before, after
    ) VALUES (
        (SELECT auth.uid()),
        TG_TABLE_NAME,
        v_row_pk,
        TG_OP,
        v_old_json,
        v_new_json
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;
COMMENT ON FUNCTION public.log_audit() IS 'Trigger générique attaché aux 4 tables critiques NF EN 13306 (OT, ops_exec, DI, observations). Sérialise OLD/NEW en JSONB dans audit_log.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 007b — Table security_alerts (monitoring d'intrusion, patch v0.6 F30)
-- ─────────────────────────────────────────────────────────────────────────────
-- Stocke les anomalies de sécurité détectées par le cron horaire
-- detect_security_anomalies() (défini dans le bloc 070). Couvre les indicateurs
-- calculables en SQL pur : croissance anormale audit_log, pic de création de
-- comptes, anonymisation en masse. Les autres indicateurs de la règle
-- supabase-security.md §6 (logins échoués, erreurs RLS, erreurs Edge 500)
-- vivent dans les logs Supabase et nécessitent un outil externe (Logflare /
-- Grafana) — hors périmètre SQL, documenté dans DEPLOY.md (monitoring).
--
-- Lecture réservée admin. Écriture uniquement par la fonction SECURITY DEFINER
-- (aucune policy INSERT/UPDATE/DELETE — bypass via propriétaire postgres).
CREATE TABLE security_alerts (
    id             BIGSERIAL PRIMARY KEY,
    detected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    indicator      TEXT NOT NULL,
    severity       TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    observed_value NUMERIC,
    threshold      NUMERIC,
    details        JSONB
);

CREATE INDEX idx_security_alerts_detected ON security_alerts(detected_at DESC);
CREATE INDEX idx_security_alerts_indicator ON security_alerts(indicator, detected_at DESC);

ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE security_alerts IS 'F30 (patch v0.6) — Alertes de monitoring d''intrusion détectées par detect_security_anomalies() (cron horaire). Lecture admin uniquement, écriture via fonction SECURITY DEFINER.';

CREATE POLICY security_alerts_admin_select ON security_alerts FOR SELECT
    USING ((SELECT public.current_role()) = 'admin');
-- Pas de policy INSERT/UPDATE/DELETE : seule la fonction SECURITY DEFINER écrit.


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  008_set_updated_at.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 008 — Fonction générique set_updated_at()
-- Remplace les 9 triggers maj_date_modification_* du legacy.
-- Chaque table avec une colonne updated_at déclare un trigger BEFORE UPDATE
-- d'une seule ligne pointant sur cette fonction.
-- Exemple côté agent métier :
--   CREATE TRIGGER set_updated_at_sites
--       BEFORE UPDATE ON sites
--       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.set_updated_at() IS 'Trigger générique BEFORE UPDATE — met à jour updated_at. Attaché à toute table avec cette colonne (F13).';

-- Trigger set_updated_at_users (les autres tables sont équipées par les
-- agents qui les définissent — sites, gammes, contrats, etc.)
CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- F28 (audit sécurité 2026-05-25) — anti-escalade de privilège sur users.
-- La RLS users_manager_all autorise un manager à UPDATE sa propre ligne
-- (clause id = (SELECT auth.uid())) pour qu'il puisse modifier son nom_complet /
-- telephone. Sans ce trigger, rien n'empêche le même manager de pousser
-- role = 'admin' ou de se réactiver après désactivation (est_actif). Idem
-- pour un technicien ou tout user qui aurait un accès self-UPDATE via
-- d'autres policies. Postgres ne supporte pas la RLS par colonne — donc
-- défense au niveau trigger.
--
-- Règles :
--   - role et est_actif ne sont modifiables QUE par un admin (public.current_role()).
--   - id est immuable (modification refusée pour tout le monde).
--   - created_by est immuable post-création (trace de cascade d'invitation).
CREATE OR REPLACE FUNCTION public.protect_users_sensitive_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'users.id immuable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'users.created_by immuable (trace cascade d''invitation)'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- role : seul un admin peut le modifier. Aucun bypass système (même le
    -- cron de désactivation ne change JAMAIS le rôle, uniquement est_actif).
    IF NEW.role_id IS DISTINCT FROM OLD.role_id
       AND (SELECT public.current_role()) IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION
            'Modification du rôle réservée à un admin'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- est_actif : modifiable par un admin OU par le cron système de
    -- désactivation des comptes inactifs (F30, Pattern 3 GUC d'exception).
    -- Le cron pose SET LOCAL app.system_deactivation = 'true' le temps de sa
    -- transaction. Aucun autre code ne doit utiliser cette GUC.
    --
    -- Défense en profondeur (audit v0.6) : le bypass système n'est accepté que
    -- si la GUC est posée ET qu'AUCUN utilisateur n'est authentifié
    -- ((SELECT auth.uid()) IS NULL = contexte cron/système). Un user authentifié a
    -- toujours un (SELECT auth.uid()) non NULL — donc même s'il parvenait à poser la
    -- GUC (impossible via PostgREST qui n'expose pas SET), le bypass ne
    -- s'appliquerait pas à lui. Ferme tout risque de régression future.
    IF NEW.est_actif IS DISTINCT FROM OLD.est_actif
       AND (SELECT public.current_role()) IS DISTINCT FROM 'admin'
       AND NOT (
            current_setting('app.system_deactivation', true) = 'true'
            AND (SELECT auth.uid()) IS NULL
       ) THEN
        RAISE EXCEPTION
            'Modification de est_actif réservée à un admin'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.protect_users_sensitive_columns() IS
    'F28/F30 — défense anti-escalade : role modifiable uniquement par admin (aucun bypass) ; est_actif modifiable par admin ou cron système de désactivation (GUC app.system_deactivation) ; id et created_by immuables.';

CREATE TRIGGER trg_protect_users_sensitive
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION public.protect_users_sensitive_columns();


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  008b_auth_user_provisioning.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 008b — Trigger on_auth_user_created (provisioning public.users)
-- Pattern Magic Link Supabase : auth.admin.inviteUserByEmail() insère une ligne
-- dans auth.users (géré par Supabase). On a besoin d'une ligne miroir dans
-- public.users avec role pour que tous les helpers Auth fonctionnent.
--
-- Le tout premier admin est créé via le Dashboard Supabase, avec son rôle posé
-- dans app_metadata ({ "role": "admin" }). Le trigger ci-dessous le provisionne
-- exactement comme un user invité — aucun garde-fou ne bloque le 1er user.
--
-- ⚠️ SÉCURITÉ — SOURCE DES MÉTADONNÉES :
-- On lit les métadonnées dans raw_app_meta_data EN PRIORITÉ, avec REPLI sur
-- raw_user_meta_data (cf. variable v_meta ci-dessous).
--   - raw_app_meta_data = app_metadata : modifiable UNIQUEMENT côté serveur
--     (service_role). Source de vérité préférée pour les claims de sécurité.
--   - raw_user_meta_data = user_metadata : posé par GoTrue DÈS la création
--     (inviteUserByEmail({ data }) / createUser({ user_metadata })) — ce que
--     app_metadata n'est PAS (GoTrue le pose APRÈS l'INSERT, donc trop tard pour
--     ce trigger AFTER INSERT). On lit donc user_metadata en repli.
--
-- POURQUOI C'EST SÛR : l'inscription publique est DÉSACTIVÉE (pas de signUp
-- ouvert). Les seuls chemins de création sont l'Edge Function invite_user
-- (service_role, qui valide la cascade) et le bootstrap admin (SQL direct, qui
-- pose app_metadata). Aucun tiers ne peut donc s'auto-attribuer un rôle via
-- user_metadata. app_metadata reste prioritaire s'il est présent.
--
-- L'Edge Function d'invitation passe role/nom_complet/created_by/site_ids via
-- `data` (= user_metadata) de inviteUserByEmail.
--
-- SECURITY DEFINER : permet d'insérer dans public.users (que l'user n'a pas
-- encore le droit d'écrire car ses helpers retournent NULL avant insertion).
-- search_path = '' : doctrine sécurité, qualifs public.* explicites.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = ''
AS $$
DECLARE
    v_meta        JSONB;
    v_role        TEXT;
    v_nom         TEXT;
    v_created_by  UUID;
    v_site_ids    UUID[];
    v_site_id     UUID;
    v_inviter_role TEXT;
BEGIN
    -- S1 : métadonnées = app_metadata EN PRIORITÉ, repli sur user_metadata.
    -- (app_metadata n'étant pas posé par GoTrue au moment de l'INSERT, l'Edge
    -- Function d'invitation passe les infos via user_metadata ; app_metadata
    -- reste prioritaire s'il est présent — ex. bootstrap admin par SQL direct.)
    v_meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
              || COALESCE(NEW.raw_app_meta_data, '{}'::jsonb);

    -- v0.21 : valider le rôle AVANT le cast — un cast direct lèverait un 22P02 brut
    -- sur un rôle mal orthographié (ex. « Admin »). Message clair à la place.
    IF NULLIF(v_meta->>'role', '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.roles WHERE code = v_meta->>'role') THEN
        RAISE EXCEPTION 'Rôle « % » invalide. Rôles valides : voir public.roles (admin, manager, technicien, lecteur, demandeur).',
            v_meta->>'role'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_role      := NULLIF(v_meta->>'role', '');   -- code rôle (TEXT)
    v_nom       := COALESCE(
                       NULLIF(v_meta->>'nom_complet', ''),
                       NEW.email,
                       'Sans nom'
                   );
    -- F29 (patch v0.5) — created_by et site_ids[] passés par l'Edge Function
    -- pour automatiser la cascade et le rattachement aux sites.
    v_created_by := NULLIF(v_meta->>'created_by', '')::UUID;
    -- site_ids[] : extraction depuis JSONB array → tableau UUID Postgres
    IF v_meta ? 'site_ids' THEN
        SELECT array_agg(value::TEXT::UUID)
        INTO   v_site_ids
        FROM   jsonb_array_elements_text(v_meta->'site_ids') AS value
        WHERE  value IS NOT NULL AND value <> '';
    END IF;

    -- Garde-fou : role est obligatoire. Si absent → on REFUSE la création
    -- (création sans rôle = tentative non autorisée).
    IF v_role IS NULL THEN
        RAISE EXCEPTION
            'handle_new_auth_user : role manquant pour user % — création via Edge Function service_role obligatoire.',
            NEW.id
            USING ERRCODE = 'not_null_violation';
    END IF;

    -- F29 (patch v0.5) — Validation de la cascade de création de comptes.
    -- Le 1er admin (créé via Dashboard Supabase) n'a pas de created_by → on
    -- autorise. Tous les autres comptes DOIVENT avoir un created_by valide
    -- avec un rôle compatible selon la matrice CLAUDE.md :
    --   admin       → admin, manager, technicien, lecteur, demandeur
    --   manager     → technicien, lecteur, demandeur (pas admin/manager)
    --   technicien  → lecteur, demandeur (pas manager/technicien/admin)
    --   lecteur     → ∅
    --   demandeur   → ∅
    --
    -- F32 (audit sécu) — Garde-fou bootstrap : un compte SANS created_by n'est
    -- légitime QUE pour le tout premier admin (créé via Dashboard). Si un admin
    -- existe déjà, refuser toute création sans created_by — empêche une Edge
    -- Function buguée ou compromise de provisionner des admins « parallèles »
    -- en omettant created_by.
    IF v_created_by IS NULL THEN
        IF EXISTS (SELECT 1 FROM public.users u JOIN public.roles r ON r.id = u.role_id WHERE r.code = 'admin') THEN
            RAISE EXCEPTION
                'handle_new_auth_user : un admin existe déjà — création sans created_by réservée au tout premier admin (bootstrap Dashboard).'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    IF v_created_by IS NOT NULL THEN
        SELECT r.code INTO v_inviter_role
        FROM public.users u
        JOIN public.roles r ON r.id = u.role_id
        WHERE u.id = v_created_by AND u.est_actif = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'handle_new_auth_user : created_by % introuvable ou inactif',
                v_created_by
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        -- Matrice de cascade : la création est-elle autorisée ?
        IF NOT (
            (v_inviter_role = 'admin')
            OR (v_inviter_role = 'manager'    AND v_role IN ('technicien', 'lecteur', 'demandeur'))
            OR (v_inviter_role = 'technicien' AND v_role IN ('lecteur', 'demandeur'))
        ) THEN
            RAISE EXCEPTION
                'handle_new_auth_user : un % ne peut pas créer un %',
                v_inviter_role, v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    INSERT INTO public.users (id, role_id, nom_complet, est_actif, created_by)
    VALUES (NEW.id, (SELECT id FROM public.roles WHERE code = v_role), v_nom, true, v_created_by);

    -- F29 (patch v0.5) — Auto-rattachement aux sites passés en app_metadata.
    -- Validation : tous les site_ids doivent exister. Si un site est invalide,
    -- on remonte une erreur claire (la transaction est rollback, y compris
    -- l'INSERT auth.users via la magie du trigger BEFORE/AFTER).
    --
    -- Garde-fou cascade : un manager/technicien qui invite ne peut rattacher
    -- le nouveau user qu'à des sites où LUI-MÊME a accès. Si v_created_by
    -- est NULL (1er admin) ou si v_inviter_role = 'admin', pas de restriction
    -- (l'admin a accès à tous les sites).
    IF v_site_ids IS NOT NULL AND array_length(v_site_ids, 1) > 0 THEN
        FOREACH v_site_id IN ARRAY v_site_ids LOOP
            -- Vérification existence du site (et non en corbeille)
            IF NOT EXISTS (
                SELECT 1 FROM public.sites
                WHERE id = v_site_id AND deleted_at IS NULL
            ) THEN
                RAISE EXCEPTION
                    'handle_new_auth_user : site_id % introuvable ou en corbeille',
                    v_site_id
                    USING ERRCODE = 'foreign_key_violation';
            END IF;

            -- Vérification scope inviteur (sauf admin / 1er admin)
            IF v_inviter_role IS NOT NULL
               AND v_inviter_role <> 'admin'
               AND NOT EXISTS (
                   SELECT 1 FROM public.user_sites
                   WHERE user_id = v_created_by AND site_id = v_site_id
               )
            THEN
                RAISE EXCEPTION
                    'handle_new_auth_user : l''inviteur n''a pas accès au site %',
                    v_site_id
                    USING ERRCODE = 'insufficient_privilege';
            END IF;

            INSERT INTO public.user_sites (user_id, site_id)
            VALUES (NEW.id, v_site_id);
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.handle_new_auth_user() IS 'F03 + F29 (patch v0.5) — peuple public.users + user_sites depuis app_metadata (prioritaire) ou user_metadata (role, nom_complet, created_by, site_ids[]) passés par l''Edge Function d''invitation. Lecture via repli car GoTrue ne pose app_metadata qu''après l''INSERT ; sûr car signup public désactivé. Valide la cascade (admin → tous, manager → tech/lecteur/demandeur, tech → lecteur/demandeur) et le scope sites de l''inviteur.';

-- Trigger sur auth.users : déclenche le miroir public.users après chaque
-- création (via Magic Link ou createUser).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  010_sites.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 010 — Sites
-- Premier niveau de la hiérarchie spatiale Site → Bâtiment → Niveau → ...
-- Décision V1 : un Site reste SIMPLE (nom, adresse, code postal, ville).
-- Pas de categorie_erp / type_erp en V1 (ajoutables sans casser plus tard).
-- Corbeille 90 jours via deleted_at (remplace le legacy est_actif).
-- Dépend de : 001_extensions, 002_enums, set_updated_at() (Agent 1).
-- =============================================================================

CREATE TABLE sites (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom          TEXT NOT NULL,
    adresse      TEXT,
    code_postal  TEXT,
    ville        TEXT,
    deleted_at   TIMESTAMPTZ,                                 -- corbeille 90 j (purge cron Agent 5)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(nom)) > 0)
);

-- Unicité du nom dans l'entreprise (uniquement parmi les sites non supprimés)
CREATE UNIQUE INDEX uq_sites_nom_active
    ON sites (lower(nom))
    WHERE deleted_at IS NULL;

-- Index pour la purge corbeille (cron 90 j)
CREATE INDEX idx_sites_deleted_at ON sites(deleted_at) WHERE deleted_at IS NOT NULL;

-- Trigger horodatage
CREATE TRIGGER trg_sites_updated_at
    BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS : policies définies par l'Agent 5
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE sites IS 'Sites physiques de l''entreprise (résidence, immeuble, complexe).';
COMMENT ON COLUMN sites.deleted_at IS 'Soft-delete. NULL = actif. Purgé physiquement après 90 j (cron Agent 5).';

-- FK manquante ajoutée ici car user_sites créée en 005 avant sites
ALTER TABLE user_sites
    ADD CONSTRAINT user_sites_site_id_fkey
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_my_sites() : RPC publique qui retourne les sites accessibles à l'user
-- authentifié. Utile pour les frontends (dropdowns, navigation) : évite de
-- forcer chaque app à joindre user_sites + sites côté client, et de risquer
-- d'exposer la liste complète des sites par erreur. Admin reçoit tous les
-- sites actifs ; les autres rôles reçoivent ceux de user_sites.
-- SECURITY DEFINER + search_path = '' (doctrine sécurité — schémas qualifiés).
-- Retourne uniquement les sites non supprimés (deleted_at IS NULL).
-- Défini ICI (et non dans le bloc auth helpers) car il retourne SETOF
-- public.sites : la table sites doit exister au préalable.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_sites()
RETURNS SETOF public.sites
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.*
    FROM public.sites s
    WHERE s.deleted_at IS NULL
      AND (
          -- Admin actif : tous les sites
          EXISTS (
              SELECT 1 FROM public.users u
              WHERE u.id = (SELECT auth.uid())
                AND u.role_id = (SELECT id FROM public.roles WHERE code = 'admin')
                AND u.est_actif = true
          )
          -- Autres rôles : sites de user_sites (user actif)
          OR EXISTS (
              SELECT 1
              FROM public.user_sites us
              JOIN public.users u ON u.id = us.user_id
              WHERE us.user_id = (SELECT auth.uid())
                AND us.site_id = s.id
                AND u.est_actif = true
          )
      );
$$;
COMMENT ON FUNCTION public.get_my_sites() IS 'Liste les sites accessibles à l''user connecté (admin = tous, autres rôles = user_sites). Évite aux frontends de faire la jointure et d''exposer la liste complète par erreur.';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  011_batiments_niveaux_locaux.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 011 — Bâtiments / Niveaux / Locaux + VIEW v_locaux_chemin
-- Hiérarchie spatiale (suite) : Site → Bâtiment → Niveau → Local.
-- Corbeille 90 jours sur les 3 tables.
-- La VIEW v_locaux_chemin remplace l'ancien nom_localisation_calc dénormalisé
-- + ses 6 triggers de propagation du legacy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BÂTIMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE batiments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
    nom         TEXT NOT NULL,
    description TEXT,
    image_path   TEXT,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(nom)) > 0)
);

CREATE UNIQUE INDEX uq_batiments_site_nom_active
    ON batiments (site_id, lower(nom))
    WHERE deleted_at IS NULL;

CREATE INDEX idx_batiments_site         ON batiments(site_id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_batiments_deleted_at   ON batiments(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TRIGGER trg_batiments_updated_at
    BEFORE UPDATE ON batiments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE batiments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE batiments IS 'Bâtiments d''un site (A, B, C…).';

-- -----------------------------------------------------------------------------
-- NIVEAUX
-- -----------------------------------------------------------------------------
CREATE TABLE niveaux (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batiment_id UUID NOT NULL REFERENCES batiments(id) ON DELETE RESTRICT,
    nom         TEXT NOT NULL,                          -- "Sous-sol", "RDC", "R+1"…
    ordre       SMALLINT NOT NULL DEFAULT 0,            -- tri logique (SS=-1, RDC=0, R+1=1…)
    description TEXT,
    image_path   TEXT,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(nom)) > 0)
);

CREATE UNIQUE INDEX uq_niveaux_batiment_nom_active
    ON niveaux (batiment_id, lower(nom))
    WHERE deleted_at IS NULL;

CREATE INDEX idx_niveaux_batiment       ON niveaux(batiment_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_niveaux_deleted_at     ON niveaux(deleted_at)  WHERE deleted_at IS NOT NULL;

CREATE TRIGGER trg_niveaux_updated_at
    BEFORE UPDATE ON niveaux
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE niveaux ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE niveaux IS 'Niveaux d''un bâtiment (sous-sol, RDC, étages). Champ ordre pour tri logique.';

-- -----------------------------------------------------------------------------
-- LOCAUX
-- -----------------------------------------------------------------------------
CREATE TABLE locaux (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    niveau_id     UUID NOT NULL REFERENCES niveaux(id) ON DELETE RESTRICT,
    nom           TEXT NOT NULL,
    type_local_id SMALLINT REFERENCES types_locaux(id) ON DELETE RESTRICT,  -- v0.30, facultatif (NULL = non qualifié)
    description   TEXT,
    surface_m2    NUMERIC(8,2),
    image_path    TEXT,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(nom)) > 0),
    CHECK (surface_m2 IS NULL OR surface_m2 > 0)
);

CREATE UNIQUE INDEX uq_locaux_niveau_nom_active
    ON locaux (niveau_id, lower(nom))
    WHERE deleted_at IS NULL;

CREATE INDEX idx_locaux_niveau          ON locaux(niveau_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_locaux_deleted_at      ON locaux(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_locaux_type            ON locaux(type_local_id) WHERE type_local_id IS NOT NULL;  -- FK → index

CREATE TRIGGER trg_locaux_updated_at
    BEFORE UPDATE ON locaux
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE locaux ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE locaux IS 'Locaux (appartement, partie commune, local technique). Feuille de la hiérarchie spatiale.';

-- -----------------------------------------------------------------------------
-- VIEW v_locaux_chemin
-- Libellé contextuel à la volée. Remplace nom_localisation_calc legacy.
-- Filtre uniquement les lignes vivantes (deleted_at IS NULL) à tous les niveaux.
-- Chemin court : on omet le site si l'entreprise n'a qu'un seul site actif.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_locaux_chemin AS
SELECT
    l.id               AS local_id,
    s.id               AS site_id,
    b.id               AS batiment_id,
    n.id               AS niveau_id,
    s.nom              AS site_nom,
    b.nom              AS batiment_nom,
    n.nom              AS niveau_nom,
    l.nom              AS local_nom,
    l.type_local_id    AS type_local_id,
    tl.libelle         AS type_local,
    -- chemin complet (toujours non ambigu)
    s.nom || ' / ' || b.nom || ' / ' || n.nom || ' / ' || l.nom AS chemin_complet,
    -- chemin court : on omet le site si l'entreprise n'en a qu'un seul actif
    CASE
        WHEN (
            SELECT count(*) FROM sites s2
            WHERE s2.deleted_at IS NULL
        ) = 1
            THEN b.nom || ' / ' || n.nom || ' / ' || l.nom
        ELSE     s.nom || ' / ' || b.nom || ' / ' || n.nom || ' / ' || l.nom
    END AS chemin_court
FROM locaux l
JOIN niveaux   n ON n.id = l.niveau_id
JOIN batiments b ON b.id = n.batiment_id
JOIN sites     s ON s.id = b.site_id
LEFT JOIN types_locaux tl ON tl.id = l.type_local_id
WHERE l.deleted_at IS NULL
  AND n.deleted_at IS NULL
  AND b.deleted_at IS NULL
  AND s.deleted_at IS NULL;

COMMENT ON VIEW v_locaux_chemin IS 'Chemin spatial dénormalisé à la volée (remplace nom_localisation_calc legacy + 6 triggers).';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  012_categories.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 012 — Categories (table récursive unifiée)
-- Unifie le legacy domaines_equipements + familles_equipements
--                + domaines_gammes      + familles_gammes (4 tables → 1).
-- Une catégorie peut classer un équipement, une gamme, ou les deux (scope ENUM).
--
-- Scope 2 niveaux (single-tenant) :
--   - site_id NULL     → catégorie ENTREPRISE (globale, tous sites)
--   - site_id NOT NULL → catégorie SITE (un seul site)
--
-- Dépend de : 002_enums (categorie_scope), sites(id), set_updated_at().
-- =============================================================================

CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id         UUID REFERENCES sites(id)   ON DELETE RESTRICT,   -- NULL = scope entreprise
    parent_id       UUID REFERENCES categories(id) ON DELETE RESTRICT,
    -- Étiquette molle : catégorie d'origine si celle-ci est issue d'une copie
    -- bibliothèque. Auto-référence ; ON DELETE SET NULL → la copie survit à la
    -- disparition de l'original (l'étiquette se vide simplement).
    copie_depuis_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    nom             TEXT NOT NULL,
    scope           categorie_scope NOT NULL DEFAULT 'mixte',
    description     TEXT,
    image_path       TEXT,
    ordre           SMALLINT NOT NULL DEFAULT 0,
    est_actif       BOOLEAN NOT NULL DEFAULT true,
    deleted_at      TIMESTAMPTZ,                   -- soft-delete (corbeille 90j)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(nom)) > 0),
    CHECK (parent_id IS NULL OR parent_id <> id),
    -- Scope 'equipement' OU 'operation' = 1 SEUL niveau : une telle catégorie est
    -- toujours une racine (jamais de parent). Le pendant « pas d'enfant » est porté
    -- par le trigger check_categorie_parent_scope. (patch 2026-06-10 ; 015 : operation)
    CONSTRAINT chk_equipement_categorie_racine
        CHECK (scope NOT IN ('equipement', 'operation') OR parent_id IS NULL)
);

-- Unicité du nom (insensible à la casse) par TYPE (scope) dans un même périmètre
-- (entreprise/site) + parent : une catégorie « Sécurité incendie » d'ÉQUIPEMENT et
-- une de GAMME peuvent coexister au même emplacement (scope ajouté à la clé en
-- migration 011). WHERE deleted_at IS NULL : une catégorie mise en corbeille libère
-- son nom, ce qui permet d'en recréer une homonyme sans hack d'archivage.
CREATE UNIQUE INDEX uq_categories_nom
    ON categories (
        COALESCE(site_id::text,   'ALL_SITES'),
        COALESCE(parent_id::text, 'ROOT'),
        scope,
        lower(nom)
    )
    WHERE deleted_at IS NULL;

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_site   ON categories(site_id);
CREATE INDEX idx_categories_scope  ON categories(scope);
-- Index partiel pour le cron purge_corbeille_90j (balayage des catégories en corbeille)
CREATE INDEX idx_categories_deleted ON categories(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Trigger anti-cycle dans la hiérarchie parent_id
-- Empêche A → B → A (et chaînes plus longues).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_categorie_no_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    current_id UUID := NEW.parent_id;
    depth      INT  := 0;
BEGIN
    WHILE current_id IS NOT NULL LOOP
        IF current_id = NEW.id THEN
            RAISE EXCEPTION 'Cycle détecté dans categories.parent_id (id=%, parent_id=%)',
                NEW.id, NEW.parent_id;
        END IF;
        depth := depth + 1;
        IF depth > 100 THEN
            RAISE EXCEPTION 'Profondeur > 100 dans categories.parent_id : abandon (boucle ?)';
        END IF;
        SELECT parent_id INTO current_id FROM public.categories WHERE id = current_id;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_categories_no_cycle
    BEFORE INSERT OR UPDATE OF parent_id ON categories
    FOR EACH ROW
    WHEN (NEW.parent_id IS NOT NULL)
    EXECUTE FUNCTION public.check_categorie_no_cycle();
COMMENT ON FUNCTION public.check_categorie_no_cycle() IS 'Empêche les cycles dans la hiérarchie parent_id (garde-fou profondeur 100).';

-- -----------------------------------------------------------------------------
-- Trigger : cohérence parent (le scope du parent doit englober celui de l'enfant)
-- Règle : un enfant ne peut pas être plus "large" que son parent.
--   - parent entreprise  → enfant entreprise/site OK
--   - parent site        → enfant site (même site) uniquement
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER (2026-06-10) : la fonction porte désormais des règles
-- structurelles (1 niveau equipement, 2 niveaux gamme) en plus de la cohérence de
-- site → la lecture du parent ne doit pas pouvoir être masquée par la RLS, comme
-- ses fonctions sœurs check_equipement_categorie_scope / check_modele_equipement_categorie.
CREATE OR REPLACE FUNCTION public.check_categorie_parent_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    p_site   UUID;
    p_scope  public.categorie_scope;
    p_parent UUID;
BEGIN
    -- 1 niveau equipement — verrou AUSSI sur changement de scope (durcissement
    -- 2026-06-10) : « UPDATE categories SET scope = 'equipement' » sur une racine
    -- gamme/mixte AYANT DÉJÀ des enfants n'était bloqué par rien — le CHECK ne
    -- regarde que le parent_id propre, le verrou ancêtre ne cible que 'gamme'/'mixte',
    -- et le bloc parent_id IS NULL ci-dessous ne teste que les gammes → on obtenait
    -- une catégorie equipement AVEC des sous-catégories. Une catégorie equipement
    -- étant TOUJOURS racine, on contrôle EN TÊTE, avant le RETURN du bloc
    -- parent_id IS NULL. Le trigger surveillant déjà 'scope', ce garde se déclenche
    -- bien sur le passage scope → equipement.
    -- (015 : 'operation' traité comme 'equipement' — 1 seul niveau, racine-only.)
    IF NEW.scope IN ('equipement', 'operation') AND EXISTS (
        SELECT 1 FROM public.categories e
         WHERE e.parent_id = NEW.id
           AND e.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Une catégorie d''équipement ou d''opération ne peut pas avoir de sous-catégories (1 seul niveau).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Garde anti-promotion en racine (durcissement 2026-06-10) : un
    -- « UPDATE categories SET parent_id = NULL » sur une sous-catégorie portant des
    -- gammes la promeut en racine ; check_gamme_categorie ne re-valide PAS la gamme
    -- quand SEULE la catégorie bouge → les gammes filles violeraient silencieusement
    -- « gamme → sous-catégorie ». Le trigger se déclenche désormais aussi sur
    -- parent_id NULL (clause WHEN retirée) pour attraper ce cas. Durcissement
    -- 2026-06-10 (symétrie corbeille) : on NE filtre PLUS g.deleted_at — une
    -- sous-catégorie ne portant que des gammes EN CORBEILLE pouvait être promue en
    -- racine, puis ces gammes ressurgissaient à la restauration en pointant une
    -- racine (le trigger gamme n'écoute pas deleted_at → violation silencieuse). On
    -- bloque donc dès qu'une gamme y est rattachée, VIVANTE OU EN CORBEILLE (il faut
    -- d'abord les réassigner). Cas légitimes préservés : INSERT d'une vraie racine,
    -- ou promotion d'une sous-catégorie SANS aucune gamme (ni vivante ni en
    -- corbeille) → aucun EXISTS → permis.
    IF NEW.parent_id IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.gammes g
             WHERE g.categorie_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Impossible de promouvoir cette catégorie en racine : des gammes (y compris en corbeille) y sont rangées (une gamme doit rester dans une sous-catégorie) — réassignez-les d''abord.'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    SELECT site_id, scope, parent_id
      INTO p_site, p_scope, p_parent
      FROM public.categories WHERE id = NEW.parent_id;

    -- 1 niveau pour les équipements (patch 2026-06-10) : une catégorie d'équipement
    -- est toujours une racine (chk_equipement_categorie_racine) → elle ne peut pas
    -- servir de parent (aucune sous-catégorie d'équipement).
    -- (015 : 'operation' traité comme 'equipement' — ne peut pas servir de parent.)
    IF p_scope IN ('equipement', 'operation') THEN
        RAISE EXCEPTION 'Une catégorie d''équipement ou d''opération ne peut pas avoir de sous-catégorie (1 seul niveau).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2 niveaux pour les gammes (patch 2026-06-10) : une catégorie pouvant accueillir
    -- des gammes (scope 'gamme' OU 'mixte' — check_gamme_categorie accepte les deux)
    -- ne peut pas avoir un parent qui est lui-même un enfant (profondeur > 2).
    -- Arborescence cible : catégorie (racine) → sous-catégorie → gamme.
    -- (028 : 'parc' — catégories des équipements réels — traité comme 'gamme'/'mixte'.)
    IF NEW.scope IN ('gamme', 'mixte', 'parc') AND p_parent IS NOT NULL THEN
        RAISE EXCEPTION 'Une catégorie de gamme/mixte/parc ne peut pas dépasser 2 niveaux (catégorie racine → sous-catégorie).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2 niveaux — verrou côté ANCÊTRE (patch 2026-06-10) : la règle ci-dessus ne
    -- valide que la ligne modifiée. Re-parenter une racine gamme/mixte AYANT déjà
    -- des enfants sous une autre racine la ferait passer en niveau 2 et pousserait
    -- ses enfants en niveau 3 sans contrôle. On l'interdit : une catégorie
    -- gamme/mixte qui DEVIENT une sous-catégorie (NEW.parent_id renseigné → niveau ≥2)
    -- ne peut pas avoir d'enfant vivant. (INSERT : la ligne n'a pas encore d'enfant
    -- → jamais de faux positif. Feuille re-parentée : aucun enfant → permis.)
    IF NEW.scope IN ('gamme', 'mixte', 'parc') AND NEW.parent_id IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM public.categories enfant
            WHERE enfant.parent_id = NEW.id
              AND enfant.deleted_at IS NULL
       ) THEN
        RAISE EXCEPTION 'Une sous-catégorie de gamme/mixte/parc ne peut pas avoir d''enfants : re-parentage interdit (créerait un niveau 3).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Parent site-scopé : l'enfant doit être sur le même site
    IF p_site IS NOT NULL AND NEW.site_id IS DISTINCT FROM p_site THEN
        RAISE EXCEPTION 'Catégorie enfant hors scope du parent site (parent_site=%, enfant_site=%)',
            p_site, NEW.site_id;
    END IF;

    -- Parent entreprise (p_site NULL) : tous les enfants sont permis
    RETURN NEW;
END;
$$;

-- UPDATE OF … scope (patch 2026-06-10) : 'scope' est surveillé pour qu'un
-- « UPDATE … SET scope = … » seul re-déclenche la validation de profondeur
-- (sinon une catégorie de niveau 3 pourrait basculer en 'gamme'/'mixte' sans contrôle).
-- Durcissement (2026-06-10) : la clause « WHEN (NEW.parent_id IS NOT NULL) » est
-- RETIRÉE pour que le trigger se déclenche AUSSI sur un passage parent_id → NULL
-- (promotion en racine), désormais gardé par la fonction (anti-promotion d'une
-- sous-catégorie portant des gammes vivantes).
CREATE TRIGGER trg_categories_parent_scope
    BEFORE INSERT OR UPDATE OF parent_id, site_id, scope ON categories
    FOR EACH ROW
    EXECUTE FUNCTION public.check_categorie_parent_scope();
COMMENT ON FUNCTION public.check_categorie_parent_scope() IS 'Cohérence parent : (1) un enfant n''est jamais plus large que son parent (entreprise englobe site) ; (2) une catégorie d''équipement OU d''opération ne peut pas avoir de sous-catégorie — ni comme parent, ni en basculant son scope alors qu''elle a déjà des enfants vivants (1 niveau) ; (3) une catégorie de gamme/mixte ne peut pas dépasser 2 niveaux ; (4) une sous-catégorie de gamme/mixte (niveau ≥2) ne peut pas avoir d''enfants (re-parentage d''un ancêtre interdit) ; (5) une catégorie portant des gammes (vivantes ou en corbeille) ne peut pas être promue en racine (parent_id → NULL). SECURITY DEFINER pour fiabiliser la lecture du parent. (015 : scope ''operation'' traité comme ''equipement''. 028 : scope ''parc'' — catégories des équipements réels — traité comme ''gamme''/''mixte'' : 2 niveaux.)';

-- -----------------------------------------------------------------------------
-- Trigger : verrou de structure sur la mise en corbeille d'une catégorie
-- Règle métier (validée 2026-05-23) : on supprime du bas vers le haut. Une
-- catégorie (domaine, famille, n'importe quel niveau) ne peut être mise en
-- corbeille que si elle est VIDE — pas de sous-catégorie directe vivante,
-- pas de gamme directement rattachée vivante. L'utilisateur doit vider le
-- contenu d'abord.
--
-- Le blocage sur les enfants DIRECTS suffit à forcer le bas-vers-haut : pour
-- vider un domaine il faut d'abord vider ses familles, et pour vider une
-- famille il faut d'abord vider ses gammes. Pas besoin de descente récursive.
--
-- Note : ce verrou ignore les OT. Les OT descendent désormais en cascade avec
-- leur gamme (trigger cascade_corbeille_gamme), donc une fois la gamme en
-- corbeille la catégorie devient libérable de ce côté.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_categorie_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Verrou de structure (023/024) : sous-catégorie, gamme, modèle d'équipement ou
    -- modèle d'opération encore VIVANT. (Pas equipements : categorie_id SET NULL.)
    IF EXISTS (
        SELECT 1 FROM public.categories c
        WHERE c.parent_id = NEW.id
          AND c.deleted_at IS NULL
    ) OR EXISTS (
        SELECT 1 FROM public.gammes g
        WHERE g.categorie_id = NEW.id
          AND g.deleted_at IS NULL
    ) OR EXISTS (
        SELECT 1 FROM public.modeles_equipements me
        WHERE me.categorie_id = NEW.id
          AND me.deleted_at IS NULL
    ) OR EXISTS (
        SELECT 1 FROM public.modeles_operations mo
        WHERE mo.categorie_id = NEW.id
          AND mo.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'Suppression impossible : cette catégorie contient encore des sous-catégories, des gammes ou des modèles. Videz d''abord son contenu.'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_categorie_suppression() IS
    'BEFORE UPDATE OF deleted_at ON categories : verrou de structure. Bloque la suppression si la catégorie a une sous-catégorie, une gamme, un modèle d''équipement ou un modèle d''opération VIVANT (deleted_at IS NULL). (025 : bypass GUC app.cascade_soft_delete retiré — supprimé avec le code de restauration. cf. 023/024.)';

CREATE TRIGGER trg_check_categorie_suppression
    BEFORE UPDATE OF deleted_at ON categories
    FOR EACH ROW
    WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    EXECUTE FUNCTION public.check_categorie_suppression();

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE categories IS 'Catégories récursives unifiées (équipements + gammes). Scope 2 niveaux : entreprise/site.';
COMMENT ON COLUMN categories.site_id         IS 'NULL = scope entreprise (global). NOT NULL = scope site.';
COMMENT ON COLUMN categories.scope           IS 'Usage : equipement seul, gamme seule, ou mixte (défaut).';
COMMENT ON COLUMN categories.copie_depuis_id IS
    'Étiquette molle : catégorie d''origine si celle-ci provient d''une copie bibliothèque. Auto-référence. ON DELETE SET NULL — si l''originale disparaît, la copie reste intacte (l''étiquette se vide).';
COMMENT ON COLUMN categories.deleted_at      IS
    'Soft-delete (corbeille 90j). Le cron purge_corbeille_90j supprime physiquement après 90 jours.';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  013_equipements.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 013 — Équipements
-- Actifs physiques maintenables (chaudière, ascenseur, extincteur, VMC…).
-- Rattachés à UN local (pas de hiérarchie parent-enfant en V1).
-- Caractéristiques techniques en JSONB specifications (pas d'EAV).
-- Corbeille 90 jours.
-- =============================================================================

CREATE TABLE equipements (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_id             UUID NOT NULL REFERENCES locaux(id)     ON DELETE RESTRICT,
    -- Lien SOUPLE vers la catégorie de classement : si la catégorie est purgée,
    -- l'équipement devient "non classé" (categorie_id NULL) — jamais détruit,
    -- jamais bloquant. Un équipement est un actif physique autonome.
    categorie_id         UUID          REFERENCES categories(id) ON DELETE SET NULL,
    nom                  TEXT NOT NULL,
    code_inventaire      TEXT,                                   -- code-barres / QR scan terrain
    specifications       JSONB NOT NULL DEFAULT '{}'::jsonb,     -- libre, Zod côté app + CHECK ci-dessous
    date_mise_en_service DATE,
    date_fin_garantie    DATE,
    image_path            TEXT,
    commentaires         TEXT,
    deleted_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (length(trim(nom)) > 0),
    CHECK (date_fin_garantie IS NULL OR date_mise_en_service IS NULL
           OR date_fin_garantie >= date_mise_en_service),
    -- F08 (audit sécu) — défense en profondeur sur JSONB libre :
    --   - structure = object (pas array/scalar)
    --   - anti prototype pollution (clés __proto__, constructor, prototype)
    --   - garde-fou taille (10 ko sérialisé) pour éviter abus index GIN / DoS
    CONSTRAINT chk_equipements_specs_structure CHECK (
        jsonb_typeof(specifications) = 'object'
        AND NOT (specifications ? '__proto__')
        AND NOT (specifications ? 'constructor')
        AND NOT (specifications ? 'prototype')
        AND length(specifications::text) < 10000
    )
);

-- Unicité du code inventaire dans l'entreprise (uniquement si renseigné et actif)
CREATE UNIQUE INDEX uq_equipements_code_inv_active
    ON equipements (code_inventaire)
    WHERE code_inventaire IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_equipements_local      ON equipements(local_id)     WHERE deleted_at IS NULL;
CREATE INDEX idx_equipements_categorie  ON equipements(categorie_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_equipements_specs_gin  ON equipements USING GIN (specifications jsonb_path_ops);
CREATE INDEX idx_equipements_deleted_at ON equipements(deleted_at)   WHERE deleted_at IS NOT NULL;

CREATE TRIGGER trg_equipements_updated_at
    BEFORE UPDATE ON equipements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Trigger : cohérence equipements.local_id ↔ hiérarchie spatiale
-- Garde-fou : le local doit exister et sa hiérarchie spatiale (niveau →
-- bâtiment → site) doit être complète.
-- -----------------------------------------------------------------------------
-- F06 (audit sécu) : SECURITY DEFINER pour garantir l'accès aux tables parentes
-- (sites, batiments) même si la RLS du caller ne permet pas le SELECT direct.
-- search_path = '' + qualifs public.* (doctrine sécurité).
CREATE OR REPLACE FUNCTION public.check_equipement_local_coherence()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    local_site UUID;
BEGIN
    SELECT s.id INTO local_site
    FROM public.locaux    l
    JOIN public.niveaux   n ON n.id = l.niveau_id
    JOIN public.batiments b ON b.id = n.batiment_id
    JOIN public.sites     s ON s.id = b.site_id
    WHERE l.id = NEW.local_id;

    IF local_site IS NULL THEN
        RAISE EXCEPTION 'local_id % introuvable ou hiérarchie spatiale incomplète', NEW.local_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_equipements_check_local_coherence
    BEFORE INSERT OR UPDATE OF local_id ON equipements
    FOR EACH ROW EXECUTE FUNCTION public.check_equipement_local_coherence();
COMMENT ON FUNCTION public.check_equipement_local_coherence() IS 'Defense in depth — vérifie que le local d''un équipement existe et que sa hiérarchie spatiale est complète.';

-- -----------------------------------------------------------------------------
-- Trigger : cohérence equipements.categorie_id (scope categorie compatible)
-- Une catégorie scope 'gamme' ne doit pas classer un équipement.
-- Une catégorie scopée site doit cibler le même site que l'équipement.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_equipement_categorie_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_scope      public.categorie_scope;
    c_site       UUID;
    eq_site      UUID;
BEGIN
    IF NEW.categorie_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT scope, site_id INTO c_scope, c_site
    FROM public.categories WHERE id = NEW.categorie_id;

    -- Scope d'usage : catégorie de PARC obligatoire (028 — séparée des catégories
    -- de modèles, scope 'equipement').
    IF c_scope <> 'parc' THEN
        RAISE EXCEPTION 'Catégorie % de scope ''%'' : un équipement se range dans une catégorie de parc (scope ''parc'').', NEW.categorie_id, c_scope
            USING ERRCODE = 'check_violation';
    END IF;

    -- Cohérence site (si catégorie scopée site)
    IF c_site IS NOT NULL THEN
        SELECT s.id INTO eq_site
        FROM public.locaux    l
        JOIN public.niveaux   n ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        JOIN public.sites     s ON s.id = b.site_id
        WHERE l.id = NEW.local_id;

        IF eq_site IS DISTINCT FROM c_site THEN
            RAISE EXCEPTION 'Catégorie % scopée site % mais equipement sur site %',
                NEW.categorie_id, c_site, eq_site;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_equipements_check_categorie
    BEFORE INSERT OR UPDATE OF categorie_id, local_id ON equipements
    FOR EACH ROW EXECUTE FUNCTION public.check_equipement_categorie_scope();
COMMENT ON FUNCTION public.check_equipement_categorie_scope() IS 'Un équipement réel se range uniquement dans une catégorie de PARC (scope ''parc'', séparée des catégories de modèles — 028) et sur le même site que son local.';
COMMENT ON COLUMN equipements.specifications IS 'JSONB libre validé Zod côté app + CHECK F08 base (object, anti prototype pollution, taille < 10ko).';
COMMENT ON COLUMN equipements.deleted_at IS 'Soft-delete corbeille 90 jours (purge cron purge_corbeille_90j).';

ALTER TABLE equipements ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- VIEW v_equipements_complet — équipement + contexte spatial + catégorie
-- Évite à l'app de refaire 4 JOIN à chaque liste d'équipements.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_equipements_complet AS
SELECT
    e.*,
    c.nom              AS categorie_nom,
    c.scope            AS categorie_scope,
    v.chemin_court     AS localisation_courte,
    v.chemin_complet   AS localisation_complete,
    v.site_id,
    v.batiment_id,
    v.niveau_id,
    v.site_nom,
    v.batiment_nom,
    v.niveau_nom,
    v.local_nom
FROM equipements e
-- Une catégorie en corbeille (deleted_at) compte comme "non classé" :
-- l'équipement reste visible, mais sans libellé de catégorie fantôme.
LEFT JOIN categories       c ON c.id = e.categorie_id AND c.deleted_at IS NULL
LEFT JOIN v_locaux_chemin  v ON v.local_id = e.local_id
WHERE e.deleted_at IS NULL;

COMMENT ON TABLE equipements         IS 'Actifs physiques maintenables. JSONB specifications libre (validé Zod côté app).';
COMMENT ON COLUMN equipements.specifications IS 'Caractéristiques techniques libres (marque, modèle, puissance…). Indexé GIN.';
COMMENT ON COLUMN equipements.deleted_at     IS 'Soft-delete corbeille 90 j (purge cron Agent 5).';
COMMENT ON VIEW  v_equipements_complet IS 'Équipement enrichi du chemin spatial + libellé catégorie. Filtre auto les supprimés.';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  013b_modeles_equipements.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 013b — Modèles d'équipements (chantier C 2026-05-25)
-- =============================================================================
-- Bibliothèque de modèles pré-remplis pour instancier rapidement des
-- équipements répétitifs (ex: 30 BAES identiques sur un site).
-- Scope 2 niveaux (règle universelle des modèles) :
--   - site_id NULL  → modèle entreprise (bibliothèque centrale)
--   - site_id = Y   → modèle propre au site Y
--
-- Droits (RLS bloc 060/061) :
--   - admin       : tout, partout
--   - manager     : tout, sur la bibliothèque entreprise ET ses sites
--   - technicien  : tout, sur ses sites uniquement (bibliothèque en lecture)
--   - lecteur     : SELECT
--   - demandeur   : aucun accès
--
-- Usage : la fonction instancier_equipement() copie un modèle PAR VALEUR
-- dans equipements (Pattern 1 — snapshot). L'équipement instancié est
-- totalement indépendant : le tech peut le modifier librement après. La
-- fonction copier_modele_equipement() permet la copie inter-scope
-- (site ↔ entreprise) — pendant pour les équipements de copier_gamme.
--
-- Dépendances : 010_sites, 012_categories, 013_equipements, 005_users.
-- =============================================================================

CREATE TABLE modeles_equipements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope 2 niveaux (NULL = bibliothèque entreprise)
    site_id         UUID REFERENCES sites(id) ON DELETE CASCADE,

    nom             TEXT NOT NULL,
    description     TEXT,
    image_path      TEXT,
    -- NOT NULL + ON DELETE RESTRICT (patch 2026-06-10) : la catégorie est désormais
    -- obligatoire (le front l'exige). RESTRICT (au lieu de SET NULL) pour rester
    -- compatible avec NOT NULL ; la purge des catégories garde un NOT EXISTS
    -- modeles_equipements (cf. purge_corbeille_90j). Nom de contrainte =
    -- modeles_equipements_categorie_id_fkey (auto-généré par Postgres).
    categorie_id    UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    specifications  JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Activation (peut être désactivé sans suppression)
    est_actif       BOOLEAN NOT NULL DEFAULT true,

    -- Corbeille 90j
    deleted_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT modeles_equipements_nom_non_vide CHECK (length(trim(nom)) > 0),

    -- Mêmes garde-fous que equipements.specifications (F08 audit sécu) :
    --   - structure = object (pas array/scalar)
    --   - anti prototype pollution
    --   - taille max 10 ko
    CONSTRAINT chk_modeles_equipements_specs_structure CHECK (
        jsonb_typeof(specifications) = 'object'
        AND NOT (specifications ? '__proto__')
        AND NOT (specifications ? 'constructor')
        AND NOT (specifications ? 'prototype')
        AND length(specifications::text) < 10000
    )
);

COMMENT ON TABLE modeles_equipements IS
    'Bibliothèque de modèles d''équipements (chantier C 2026-05-25). Scope 2 niveaux : entreprise (site_id NULL) / site. Copie par valeur via instancier_equipement() ou copier_modele_equipement().';
COMMENT ON COLUMN modeles_equipements.site_id IS
    'NULL = modèle entreprise (visible partout, écriture admin + manager). Renseigné = modèle propre au site (écriture admin + manager + technicien si has_site_access).';
COMMENT ON COLUMN modeles_equipements.specifications IS
    'JSONB libre (mêmes CHECK que equipements.specifications). Pré-rempli au modèle, copié à l''instanciation.';
COMMENT ON COLUMN modeles_equipements.est_actif IS
    'Mode "archive" : false = modèle masqué des listes de sélection sans être supprimé. Différent du soft-delete (deleted_at).';
COMMENT ON COLUMN modeles_equipements.deleted_at IS
    'Soft-delete corbeille 90j (purge par cron purge_corbeille_90j).';

-- Index uniques différenciés par scope (NULL distincts en PG → 2 index partiels)
CREATE UNIQUE INDEX uniq_modeles_equipements_entreprise
    ON modeles_equipements (lower(nom))
    WHERE site_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX uniq_modeles_equipements_site
    ON modeles_equipements (site_id, lower(nom))
    WHERE site_id IS NOT NULL AND deleted_at IS NULL;

-- Index de recherche / RLS
CREATE INDEX idx_modeles_equipements_site
    ON modeles_equipements(site_id)
    WHERE site_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_modeles_equipements_categorie
    ON modeles_equipements(categorie_id)
    WHERE categorie_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_modeles_equipements_specs_gin
    ON modeles_equipements USING GIN (specifications jsonb_path_ops);
CREATE INDEX idx_modeles_equipements_deleted_at
    ON modeles_equipements(deleted_at)
    WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_modeles_equipements_actif
    ON modeles_equipements(site_id)
    WHERE est_actif = true AND deleted_at IS NULL;

-- Trigger updated_at
CREATE TRIGGER trg_modeles_equipements_set_updated_at
    BEFORE UPDATE ON modeles_equipements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Trigger : immuabilité du site_id après création
-- Empêche le « déplacement » d'un modèle entre scopes (entreprise ↔ site, ou
-- site A ↔ site B). Pour transférer un modèle, utiliser copier_modele_equipement.
-- Admin bypass autorisé (peut corriger une erreur de saisie initiale).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_modele_equipement_site_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.site_id IS DISTINCT FROM OLD.site_id
       AND (SELECT public.current_role()) <> 'admin' THEN
        RAISE EXCEPTION 'Le site_id d''un modèle d''équipement est immuable. Utiliser copier_modele_equipement() pour transférer entre scopes.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_modeles_equipements_protect_site
    BEFORE UPDATE OF site_id ON modeles_equipements
    FOR EACH ROW EXECUTE FUNCTION public.protect_modele_equipement_site_immutable();

COMMENT ON FUNCTION public.protect_modele_equipement_site_immutable() IS
    'Immutabilité du site_id (cohérent avec gammes.site_id). Admin bypass autorisé pour correction.';

-- -----------------------------------------------------------------------------
-- Trigger : cohérence categorie_id ↔ scope du modèle
-- Refuse une catégorie scope 'gamme' (réservée aux gammes), et impose la
-- compatibilité de site entre le modèle et la catégorie si celle-ci est
-- scopée site.
-- Logique identique à check_equipement_categorie_scope mais adaptée :
--   - modèle entreprise (site_id NULL) → catégorie entreprise OBLIGATOIRE
--     (interdit de référencer une catégorie scopée site sur un modèle global)
--   - modèle site → catégorie entreprise OK, ou catégorie même site
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_modele_equipement_categorie()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_scope public.categorie_scope;
    c_site  UUID;
BEGIN
    IF NEW.categorie_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT scope, site_id INTO c_scope, c_site
      FROM public.categories
     WHERE id = NEW.categorie_id;

    -- Scope d'usage : catégorie 'gamme' interdite sur un modèle d'équipement
    IF c_scope = 'gamme' THEN
        RAISE EXCEPTION 'Catégorie % est de scope ''gamme'' : interdite sur un modèle d''équipement.', NEW.categorie_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Cohérence site : si la catégorie est scopée site, le modèle doit être
    -- soit entreprise (ne référence pas une catégorie de site spécifique : refus),
    -- soit sur le même site
    IF c_site IS NOT NULL THEN
        IF NEW.site_id IS NULL THEN
            RAISE EXCEPTION 'Modèle d''équipement entreprise ne peut pas référencer une catégorie scopée site (catégorie % du site %).',
                NEW.categorie_id, c_site
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.site_id IS DISTINCT FROM c_site THEN
            RAISE EXCEPTION 'Catégorie % scopée site % mais modèle sur site %.',
                NEW.categorie_id, c_site, NEW.site_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_modeles_equipements_check_categorie
    BEFORE INSERT OR UPDATE OF categorie_id, site_id ON modeles_equipements
    FOR EACH ROW EXECUTE FUNCTION public.check_modele_equipement_categorie();

COMMENT ON FUNCTION public.check_modele_equipement_categorie() IS
    'Garantit la compatibilité d''usage (scope ''gamme'' interdit) et la cohérence de site entre le modèle et sa catégorie. Calque check_equipement_categorie_scope adapté aux 2 niveaux de scope du modèle.';

-- -----------------------------------------------------------------------------
-- 029 : modèle FIXÉ sur une sous-catégorie de parc (FK ajoutée ici car elle
-- pointe vers modeles_equipements, créée après categories). Une sous-catégorie de
-- parc = flotte homogène d'équipements issus d'UN modèle de site ; chaque
-- équipement créé dedans en est une copie (instancier_equipement). Le caractère
-- obligatoire est porté par l'UI ; la base valide la cohérence quand un modèle est posé.
-- -----------------------------------------------------------------------------
ALTER TABLE categories
  ADD COLUMN modele_equipement_id UUID
    REFERENCES modeles_equipements(id) ON DELETE RESTRICT;

COMMENT ON COLUMN categories.modele_equipement_id IS
  'Modèle d''équipement FIXÉ sur une sous-catégorie de parc (scope ''parc'') : les équipements créés dedans en sont des copies. NULL ailleurs. Doit être un modèle DU SITE de la catégorie (validé par trigger).';

CREATE OR REPLACE FUNCTION public.check_categorie_modele()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    m_site     UUID;
    m_deleted  TIMESTAMPTZ;
    m_exists   BOOLEAN;
BEGIN
    IF NEW.modele_equipement_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.scope <> 'parc' THEN
        RAISE EXCEPTION 'Un modèle ne peut être fixé que sur une catégorie de parc (scope ''parc'').'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT true, site_id, deleted_at
      INTO m_exists, m_site, m_deleted
      FROM public.modeles_equipements
     WHERE id = NEW.modele_equipement_id;

    IF m_exists IS NULL THEN
        RAISE EXCEPTION 'Modèle % introuvable.', NEW.modele_equipement_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF m_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'Modèle % en corbeille : impossible de le fixer.', NEW.modele_equipement_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF m_site IS NULL OR m_site IS DISTINCT FROM NEW.site_id THEN
        RAISE EXCEPTION 'Le modèle fixé doit être un modèle de CE site (exporte d''abord un modèle commun vers le site).'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_categories_modele
    BEFORE INSERT OR UPDATE OF modele_equipement_id, scope, site_id ON categories
    FOR EACH ROW EXECUTE FUNCTION public.check_categorie_modele();

COMMENT ON FUNCTION public.check_categorie_modele() IS
    'Valide le modèle fixé sur une sous-catégorie de parc : scope ''parc'' obligatoire, modèle vivant et appartenant au MÊME site que la catégorie.';

ALTER TABLE modeles_equipements ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- ALTER equipements : ajout de l'étiquette molle copie_depuis_modele_id
-- (Pattern 1 — référence informative vers le modèle d'origine, ON DELETE SET
-- NULL pour que l'équipement survive à la purge du modèle). Cohérent avec
-- gammes.copie_depuis_id.
-- -----------------------------------------------------------------------------
ALTER TABLE equipements
    ADD COLUMN copie_depuis_modele_id UUID
        REFERENCES modeles_equipements(id) ON DELETE SET NULL;

CREATE INDEX idx_equipements_copie_depuis_modele
    ON equipements(copie_depuis_modele_id)
    WHERE copie_depuis_modele_id IS NOT NULL;

COMMENT ON COLUMN equipements.copie_depuis_modele_id IS
    'Étiquette molle : modèle d''équipement d''origine. ON DELETE SET NULL — l''équipement survit à la purge du modèle (snapshots des specs déjà copiés).';

-- Trigger : immuabilité de copie_depuis_modele_id après création (étiquette
-- figée, Pattern 1). N'interfère PAS avec ON DELETE SET NULL côté FK : la
-- transition vers NULL via la suppression du parent passe par le mécanisme
-- de cascade FK, qui contourne les triggers BEFORE UPDATE par défaut.
CREATE OR REPLACE FUNCTION public.protect_copie_depuis_modele_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Autoriser la transition vers NULL (cas ON DELETE SET NULL de la FK).
    -- Bloquer toute autre modification.
    IF NEW.copie_depuis_modele_id IS NOT NULL
       AND OLD.copie_depuis_modele_id IS DISTINCT FROM NEW.copie_depuis_modele_id THEN
        RAISE EXCEPTION 'copie_depuis_modele_id est immuable après création (étiquette figée Pattern 1).'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_equipements_protect_copie_depuis_modele
    BEFORE UPDATE OF copie_depuis_modele_id ON equipements
    FOR EACH ROW EXECUTE FUNCTION public.protect_copie_depuis_modele_immutable();

COMMENT ON FUNCTION public.protect_copie_depuis_modele_immutable() IS
    'Étiquette d''origine figée après création. Autorise la transition vers NULL (ON DELETE SET NULL côté FK).';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  013c_instancier_equipement.sql + copier_modele_equipement
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 013c — Fonctions de la bibliothèque de modèles d'équipements
-- =============================================================================
-- instancier_equipement(modele, local, code_inventaire) — crée un équipement
--   réel à partir d'un modèle (copie PAR VALEUR, Pattern 1).
--
-- copier_modele_equipement(source, site_cible) — duplique un modèle entre
--   scopes (site → entreprise pour promotion, ou inverse). Calque exact de
--   copier_gamme (matrice de droits identique).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.instancier_equipement(
    p_modele_id        UUID,
    p_local_id         UUID,
    p_code_inventaire  TEXT,
    p_categorie_id     UUID DEFAULT NULL   -- 028 : catégorie de PARC où ranger l'équipement
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role        TEXT := public.current_role();
    v_modele      public.modeles_equipements%ROWTYPE;
    v_local_site  UUID;
    v_new_id      UUID;
BEGIN
    -- 1. Auth caller
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'instancier_equipement : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_role NOT IN ('admin', 'manager', 'technicien') THEN
        RAISE EXCEPTION 'instancier_equipement : rôle % non autorisé.', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Résoudre le site du local cible (via hiérarchie spatiale)
    SELECT s.id INTO v_local_site
      FROM public.locaux    l
      JOIN public.niveaux   n ON n.id = l.niveau_id
      JOIN public.batiments b ON b.id = n.batiment_id
      JOIN public.sites     s ON s.id = b.site_id
     WHERE l.id = p_local_id AND l.deleted_at IS NULL;

    IF v_local_site IS NULL THEN
        RAISE EXCEPTION 'instancier_equipement : local % introuvable ou hiérarchie spatiale incomplète.', p_local_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 3. Vérifier accès du caller au site cible (admin bypass)
    -- F28 audit sécu : message neutralisé — ne pas révéler le site_id du local
    -- (l'attaquant fournit p_local_id sans nécessairement connaître son site).
    IF v_role <> 'admin' AND NOT public.has_site_access(v_local_site) THEN
        RAISE EXCEPTION 'instancier_equipement : accès refusé au local cible.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 4. Lire le modèle source (vivant + actif)
    SELECT * INTO v_modele
      FROM public.modeles_equipements
     WHERE id = p_modele_id
       AND deleted_at IS NULL
       AND est_actif = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'instancier_equipement : modèle % introuvable, archivé ou en corbeille.', p_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 5. Compatibilité scope modèle / site local
    --    - modèle entreprise (site_id NULL) : utilisable partout
    --    - modèle scope site : doit cibler le même site que le local
    -- F28 audit sécu : message sans UUIDs — ne pas révéler le site du modèle
    -- (l'attaquant a peut-être passé p_modele_id sans connaître son scope).
    IF v_modele.site_id IS NOT NULL AND v_modele.site_id IS DISTINCT FROM v_local_site THEN
        RAISE EXCEPTION 'instancier_equipement : modèle incompatible avec le site du local cible.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- 6. INSERT equipements (copie par valeur — snapshot Pattern 1).
    --    description du modèle non copiée dans equipements.commentaires (réservé
    --    aux annotations terrain libres). 028 : la catégorie vient du PARC
    --    (p_categorie_id, scope 'parc' ; NULL = Non classé), PAS du modèle (scope
    --    'equipement') — le trigger check_equipement_categorie_scope la valide.
    INSERT INTO public.equipements (
        id, local_id, categorie_id,
        nom, code_inventaire,
        specifications, image_path,
        copie_depuis_modele_id
    ) VALUES (
        gen_random_uuid(), p_local_id, p_categorie_id,
        v_modele.nom, p_code_inventaire,
        v_modele.specifications, v_modele.image_path,
        p_modele_id
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.instancier_equipement(UUID, UUID, TEXT, UUID) IS
    'Crée un équipement réel à partir d''un modèle (copie PAR VALEUR — snapshot Pattern 1). L''équipement est totalement indépendant du modèle après création. La catégorie vient du PARC (p_categorie_id, scope ''parc'' ; NULL = Non classé), pas du modèle. Droits : admin/manager/technicien ayant accès au site du local cible. Le modèle doit être vivant + est_actif. Si scope site, doit cibler le site du local. Retourne l''id du nouvel équipement.';

-- -----------------------------------------------------------------------------
-- copier_modele_equipement — duplique un modèle entre scopes
-- Matrice de droits identique à copier_gamme. La gestion de CATÉGORIE diverge
-- (migration 009) : on matérialise la catégorie de la source dans le scope cible
-- via copier_categorie_noeud (find-or-create) au lieu de garder la catégorie
-- commune / replier sur « Non classé » → une copie « commun → site » atterrit dans
-- une vraie catégorie de site (visible sous son périmètre).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copier_modele_equipement(
    p_source_modele_id UUID,
    p_site_cible       UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role   TEXT := public.current_role();
    v_source public.modeles_equipements%ROWTYPE;
    v_new_id UUID;
BEGIN
    -- 1. Auth caller
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_modele_equipement : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Droits selon scope cible (calque copier_gamme)
    IF p_site_cible IS NULL THEN
        -- Remontée vers bibliothèque entreprise : admin + manager uniquement
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION 'copier_modele_equipement : seuls admin et manager peuvent copier vers la bibliothèque entreprise.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        -- Descente / transfert vers un site
        IF v_role = 'admin' THEN
            NULL; -- admin : OK partout
        ELSIF v_role IN ('manager', 'technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION 'copier_modele_equipement : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION 'copier_modele_equipement : rôle % non autorisé.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- 3. Lecture du modèle source (vivant — mais peut être archivé : `est_actif = false`)
    --    Choix intentionnel : permettre la copie d'un modèle archivé (la copie sera
    --    réactivée avec est_actif = true, cf étape 5). Cas d'usage : « ressusciter »
    --    un modèle obsolète en le copiant vers un autre scope. Différent de
    --    instancier_equipement() qui refuse un modèle archivé (création d'un actif
    --    physique → on ne veut pas d'instance d'un modèle inactif).
    SELECT * INTO v_source
      FROM public.modeles_equipements
     WHERE id = p_source_modele_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_modele_equipement : modèle source % introuvable ou supprimé.', p_source_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 3bis. Contrôle d'accès à la SOURCE (audit défensif) : lecture en SECURITY
    -- DEFINER (bypass RLS) → revérifier que le caller peut voir le modèle source.
    -- Modèle entreprise (site_id NULL) = bibliothèque partagée, copiable par tous ;
    -- modèle SITE = copiable seulement si le caller a accès à son site (admin
    -- partout). Sans ce garde, un manager/technicien pouvait exfiltrer un modèle
    -- d'un site hors scope vers son propre site (calque du garde de copier_gamme).
    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_modele_equipement : accès refusé au modèle source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 4. CATÉGORIE CIBLE — on matérialise la catégorie de la source dans le scope
    --    cible (find-or-create idempotent via copier_categorie_noeud, comme
    --    copier_categorie) : une copie « commun → site » atterrit dans une VRAIE
    --    catégorie de site (même nom), visible sous le périmètre du site, au lieu
    --    de rester dans la catégorie commune. Réutilise une catégorie homonyme
    --    existante (pas de doublon) ; idempotent si la source est déjà dans le
    --    scope cible. Catégorie d'équipement = toujours une racine → parent NULL.
    --    Garde-fou : catégorie source en corbeille → repli « Non classé (équipements) »
    --    (racine ENTREPRISE de scope equipement) pour ne pas bloquer la copie.
    --    (migration 009)
    IF EXISTS (
        SELECT 1 FROM public.categories
         WHERE id = v_source.categorie_id AND deleted_at IS NULL
    ) THEN
        v_source.categorie_id := public.copier_categorie_noeud(
            v_source.categorie_id, NULL, p_site_cible
        );
    ELSE
        SELECT id INTO v_source.categorie_id
          FROM public.categories
         WHERE site_id IS NULL AND parent_id IS NULL
           AND scope = 'equipement'
           AND lower(nom) = 'non classé (équipements)'
           AND deleted_at IS NULL
         LIMIT 1;
        IF v_source.categorie_id IS NULL THEN
            RAISE EXCEPTION 'copier_modele_equipement : catégorie de secours « Non classé (équipements) » introuvable — recréez-la avant de copier.'
                USING ERRCODE = 'no_data_found';
        END IF;
    END IF;

    -- 5. Copie par valeur (Pattern 1 — snapshot indépendant)
    --    est_actif forcé à true : copie fraîche prête à l'emploi.
    INSERT INTO public.modeles_equipements (
        id, site_id, nom, description, image_path, miniature_id,
        categorie_id, specifications, est_actif, created_by
    ) VALUES (
        gen_random_uuid(), p_site_cible,
        v_source.nom, v_source.description, v_source.image_path,
        CASE WHEN public.miniature_scope_ok(v_source.miniature_id, p_site_cible)
             THEN v_source.miniature_id ELSE NULL END,
        v_source.categorie_id, v_source.specifications,
        true, (SELECT auth.uid())
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.copier_modele_equipement(UUID, UUID) IS
    'Bibliothèque de modèles d''équipements : duplique un modèle PAR VALEUR vers un site (p_site_cible renseigné) ou vers la bibliothèque entreprise (p_site_cible NULL = remontée / "promotion"). Copie indépendante de la source. La catégorie de la source est MATÉRIALISÉE dans le scope cible via copier_categorie_noeud (find-or-create idempotent) → la copie atterrit dans une vraie catégorie du scope cible (visible sous son périmètre), en réutilisant une catégorie homonyme existante. Repli « Non classé (équipements) » si la catégorie source est en corbeille. Droits : copie entreprise = admin/manager ; copie site = admin ou manager/technicien avec accès au site. Retourne l''id du nouveau modèle. (migration 009)';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  020_prestataires.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 020 — Prestataires
-- Table unique pour tous les prestataires (internes et externes).
--   - Pas de distinction COFRAC / organisme agréé (champ `metier TEXT` libre)
--   - Un prestataire "interne" PAR SITE (v0.26 : régie de site, créée auto par trigger)
--   - Protection : impossible de supprimer un interne (sauf cascade de purge de son site)
--   - Corbeille 90j : soft-delete via `deleted_at`
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Table prestataires
-- ----------------------------------------------------------------------------
CREATE TABLE prestataires (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    libelle         TEXT NOT NULL,
    metier          TEXT,                          -- libre : 'Chauffagiste', 'Ascensoriste', 'Contrôle réglementaire'…
    est_interne     BOOLEAN NOT NULL DEFAULT false,
    -- v0.26 : site de l'équipe interne (décision PO : 1 interne PAR site, l'interne
    -- « représente » le site). Renseigné UNIQUEMENT pour les internes ; NULL pour les
    -- externes (transverses, rattachés via prestataires_sites). CASCADE : l'interne
    -- disparaît avec son site à la purge.
    site_id         UUID REFERENCES sites(id) ON DELETE CASCADE,
    image_path       TEXT,                          -- Supabase Storage (chemin relatif au bucket)
    adresse         TEXT,
    code_postal     TEXT,
    ville           TEXT,
    telephone       TEXT,
    email           TEXT,
    siret           TEXT,                          -- optionnel
    commentaires    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,                   -- soft-delete (corbeille 90j, purge cron)
    CONSTRAINT prestataires_libelle_non_vide CHECK (length(trim(libelle)) > 0),
    CONSTRAINT prestataires_code_postal_format CHECK (code_postal IS NULL OR code_postal ~ '^[0-9]{5}$'),
    -- F16 (audit sécu) — POSIX regex ne supporte pas \s : utiliser [:space:]
    CONSTRAINT prestataires_email_format CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    CONSTRAINT prestataires_siret_format CHECK (siret IS NULL OR siret ~ '^[0-9]{14}$'),
    -- v0.26 : un interne A un site, un externe n'en a pas (site_id réservé aux internes).
    CONSTRAINT prestataires_interne_site CHECK (est_interne = (site_id IS NOT NULL))
);

COMMENT ON TABLE prestataires IS
    'Prestataires (internes ou externes) qui réalisent les interventions. Soft-delete via deleted_at.';
COMMENT ON COLUMN prestataires.est_interne IS
    'TRUE = équipe interne de l''entreprise (gardien, technicien maison). Indélétable.';
COMMENT ON COLUMN prestataires.metier IS
    'Libre : la nature réglementaire de l''intervention est portée par la gamme, pas par le prestataire.';

-- ----------------------------------------------------------------------------
-- Index
-- ----------------------------------------------------------------------------
-- v0.26 : un seul prestataire interne vivant PAR SITE (décision PO — l'interne est
-- la régie du site). Remplace l'ancien unique interne global de l'entreprise.
CREATE UNIQUE INDEX uniq_prestataire_interne_site
    ON prestataires(site_id)
    WHERE est_interne = true AND deleted_at IS NULL;
CREATE INDEX idx_prestataires_site ON prestataires(site_id) WHERE site_id IS NOT NULL;

CREATE INDEX idx_prestataires_siret
    ON prestataires(siret)
    WHERE siret IS NOT NULL AND deleted_at IS NULL;

-- Unicité du libellé filtrée par soft-delete : un prestataire en corbeille ne
-- réserve plus son libellé (cohérent avec sites/gammes/categories... — doctrine
-- « index partiel d'unicité avec soft-delete »). Remplace l'ancienne CONSTRAINT
-- prestataires_unique_libelle UNIQUE(libelle), pleine table, qui bloquait la
-- recréation d'un homonyme pendant les 90 j de corbeille.
CREATE UNIQUE INDEX uq_prestataires_libelle_active
    ON prestataires(libelle)
    WHERE deleted_at IS NULL AND est_interne = false;   -- v0.26 : internes hors unicité (identifiés par leur site, pas leur libellé)

-- ----------------------------------------------------------------------------
-- Trigger updated_at
-- ----------------------------------------------------------------------------
CREATE TRIGGER trg_prestataires_set_updated_at
    BEFORE UPDATE ON prestataires
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Prestataire interne : 1 instance = 1 prestataire interne unique.
-- Protections ci-dessous (anti-suppression / anti-bascule du flag), puis seed.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Protection : interdire la suppression (hard ou soft) du prestataire interne
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_prestataire_interne()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- v0.26 : la purge d'un site supprime son interne en cascade (FK site_id CASCADE).
    -- On autorise ce DELETE pendant la purge (GUC app.purge_active) ; hors purge,
    -- l'interne reste indélétable (il disparaît uniquement avec son site).
    IF OLD.est_interne AND current_setting('app.purge_active', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Le prestataire interne (id=%) ne peut pas être supprimé (il disparaît avec son site).', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.protect_prestataire_interne() IS
    'Trigger BEFORE DELETE ON prestataires : interdit la suppression d''un prestataire interne.';

CREATE TRIGGER trg_protect_prestataire_interne
    BEFORE DELETE ON prestataires
    FOR EACH ROW EXECUTE FUNCTION public.protect_prestataire_interne();

-- Protection complémentaire : on n'autorise pas non plus à retirer le flag est_interne
-- ni à transformer un prestataire externe en interne (cohérence du modèle).
CREATE OR REPLACE FUNCTION public.protect_prestataire_interne_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.est_interne <> NEW.est_interne THEN
        RAISE EXCEPTION 'Le flag est_interne d''un prestataire ne peut pas être modifié après création.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    -- Soft-delete du prestataire interne interdit
    IF OLD.est_interne AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Le prestataire interne ne peut pas être placé à la corbeille.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_prestataire_interne_update
    BEFORE UPDATE ON prestataires
    FOR EACH ROW EXECUTE FUNCTION public.protect_prestataire_interne_update();
COMMENT ON FUNCTION public.protect_prestataire_interne_update() IS 'Interdit la bascule du flag est_interne et le soft-delete du prestataire interne (invariant : 1 prestataire interne vivant).';

-- ----------------------------------------------------------------------------
-- Seed du prestataire interne (Vague E)
-- ----------------------------------------------------------------------------
-- En multi-tenant, le prestataire interne était provisionné par trigger à la
-- création de chaque client (provision_prestataire_interne, supprimé).
-- En single-tenant, l'entreprise a UN prestataire interne unique : on l'insère
-- directement en seed. La table prestataires n'a aucune colonne NOT NULL
-- référençant users(id) — pas besoin d'un user existant, le seed passe au
-- moment de l'exécution du script (avant la création du 1er admin).
-- Idempotent : l'index unique uniq_prestataire_interne + le WHERE NOT EXISTS
-- empêchent tout doublon si le script est ré-exécuté.
-- v0.26 : plus de seed d'un interne global unique. L'équipe interne est créée
-- AUTOMATIQUEMENT par site, via le trigger trg_create_interne_for_site (défini
-- juste après la table prestataires_sites). Un site neuf = sa propre régie interne.

-- ----------------------------------------------------------------------------
-- RLS (policies définies par Agent 5)
-- ----------------------------------------------------------------------------
ALTER TABLE prestataires ENABLE ROW LEVEL SECURITY;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  021_contrats.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 021 — Contrats
-- Contrats prestataires versionnés (avenant = nouvelle version + parent archivé).
--   - Versioning via contrat_parent_id + est_archive
--   - Trigger archive_contrat_parent : archive automatique du parent à l'INSERT
--   - Trigger protection_contrat_archive : refuse toute UPDATE d'un contrat archivé
-- NB : la liaison N–N contrats_gammes est définie dans 028_contrats_gammes.sql
--      (après création de la table gammes en 023).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Table contrats
-- ----------------------------------------------------------------------------
CREATE TABLE contrats (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prestataire_id              UUID NOT NULL REFERENCES prestataires(id) ON DELETE RESTRICT,
    type_contrat_id             SMALLINT NOT NULL REFERENCES types_contrats(id),
    -- v0.24 : contrats signés SITE PAR SITE (décision PO 2026-06-01). Rattachement
    -- DIRECT au site (avant : seulement indirect via prestataire/gammes). RESTRICT :
    -- un site avec contrat n'est pas purgé tant que le contrat existe (engagement
    -- légal, même logique que les OT clôturés).
    site_id                     UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,

    -- Versioning
    contrat_parent_id           UUID REFERENCES contrats(id) ON DELETE RESTRICT,
    est_archive                 BOOLEAN NOT NULL DEFAULT false,
    objet_avenant               TEXT,

    -- Métier
    reference                   TEXT NOT NULL,
    date_signature              DATE,
    date_debut                  DATE NOT NULL,
    date_fin                    DATE,
    date_resiliation            DATE,
    date_notification           DATE,
    duree_cycle_mois            INTEGER,
    delai_preavis_jours         INTEGER NOT NULL DEFAULT 30,
    fenetre_resiliation_jours   INTEGER,
    commentaires                TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT contrats_reference_non_vide        CHECK (length(trim(reference)) > 0),
    CONSTRAINT contrats_date_fin_apres_debut      CHECK (date_fin IS NULL OR date_debut <= date_fin),
    CONSTRAINT contrats_date_signature_avant_debut CHECK (date_signature IS NULL OR date_signature <= date_debut),
    CONSTRAINT contrats_date_resiliation_apres_debut CHECK (date_resiliation IS NULL OR date_resiliation >= date_debut),
    CONSTRAINT contrats_date_notification_avant_resiliation
        CHECK (date_notification IS NULL OR date_resiliation IS NULL OR date_notification <= date_resiliation),
    CONSTRAINT contrats_preavis_positif           CHECK (delai_preavis_jours >= 0),
    CONSTRAINT contrats_cycle_positif             CHECK (duree_cycle_mois IS NULL OR duree_cycle_mois > 0),
    CONSTRAINT contrats_fenetre_positive          CHECK (fenetre_resiliation_jours IS NULL OR fenetre_resiliation_jours > 0)
);

COMMENT ON TABLE contrats IS
    'Contrats prestataires. Versionnés : avenant = nouvelle ligne avec contrat_parent_id pointant sur la précédente. Le parent est archivé automatiquement.';
COMMENT ON COLUMN contrats.est_archive IS
    'TRUE = version remplacée par un avenant. Lecture seule, ne génère plus d''OT.';
COMMENT ON COLUMN contrats.type_contrat_id IS
    'Référentiel types_contrats. Type 2 = tacite (valide tant que non résilié, ignore date_fin).';

-- Index
CREATE INDEX idx_contrats_prestataire  ON contrats(prestataire_id);
CREATE INDEX idx_contrats_site         ON contrats(site_id);
CREATE INDEX idx_contrats_parent       ON contrats(contrat_parent_id) WHERE contrat_parent_id IS NOT NULL;
CREATE INDEX idx_contrats_actifs       ON contrats(prestataire_id)
    WHERE est_archive = false AND date_resiliation IS NULL;

-- Trigger updated_at
CREATE TRIGGER trg_contrats_set_updated_at
    BEFORE UPDATE ON contrats
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Trigger : archive automatique du contrat parent à l'INSERT d'un avenant
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_contrat_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_parent_archive   BOOLEAN;
    v_parent_prest     UUID;
    v_parent_site      UUID;
BEGIN
    IF NEW.contrat_parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT est_archive, prestataire_id, site_id
      INTO v_parent_archive, v_parent_prest, v_parent_site
      FROM public.contrats
     WHERE id = NEW.contrat_parent_id;

    IF v_parent_archive THEN
        RAISE EXCEPTION 'Ce contrat est déjà archivé — une version plus récente existe.';
    END IF;

    IF v_parent_prest <> NEW.prestataire_id THEN
        RAISE EXCEPTION 'L''avenant doit garder le même prestataire que le contrat parent.';
    END IF;

    IF v_parent_site <> NEW.site_id THEN
        RAISE EXCEPTION 'L''avenant doit garder le même site que le contrat parent.';
    END IF;

    UPDATE public.contrats SET est_archive = true WHERE id = NEW.contrat_parent_id;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.archive_contrat_parent() IS
    'Trigger AFTER INSERT ON contrats : archive le contrat parent quand un avenant est créé.';

CREATE TRIGGER trg_archive_contrat_parent
    AFTER INSERT ON contrats
    FOR EACH ROW EXECUTE FUNCTION public.archive_contrat_parent();

-- ----------------------------------------------------------------------------
-- Trigger : protection des contrats archivés (lecture seule)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protection_contrat_archive()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Si le contrat était archivé et qu'on tente une modif autre que la levée d'archivage
    IF OLD.est_archive = true AND NEW.est_archive = true THEN
        RAISE EXCEPTION 'Le contrat % est archivé : aucune modification n''est autorisée.', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protection_contrat_archive() IS
    'Trigger BEFORE UPDATE ON contrats : refuse toute modification d''un contrat archivé.';

CREATE TRIGGER trg_protection_contrat_archive
    BEFORE UPDATE ON contrats
    FOR EACH ROW
    WHEN (OLD.est_archive = true)
    EXECUTE FUNCTION public.protection_contrat_archive();

-- ----------------------------------------------------------------------------
-- RLS (policies définies par Agent 5)
-- ----------------------------------------------------------------------------
ALTER TABLE contrats ENABLE ROW LEVEL SECURITY;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  022_prestataires_sites.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 022 — Liaison prestataires ↔ sites (flexibilité multi-sites)
-- Convention : table vide pour un prestataire = actif sur TOUS les sites.
-- Si lignes présentes : périmètre limité aux sites listés.
-- Pas de soft-delete : la liaison vit/meurt avec son prestataire ou son site (CASCADE).
-- =============================================================================

CREATE TABLE prestataires_sites (
    prestataire_id UUID NOT NULL REFERENCES prestataires(id) ON DELETE CASCADE,
    site_id        UUID NOT NULL REFERENCES sites(id)        ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (prestataire_id, site_id)
);

COMMENT ON TABLE prestataires_sites IS
    'Liaison N–N prestataires↔sites. Convention : table vide pour un prestataire = actif sur TOUS les sites. Sinon, périmètre = lignes listées. CASCADE des deux côtés.';

CREATE INDEX idx_prestataires_sites_site ON prestataires_sites(site_id);

-- ----------------------------------------------------------------------------
-- RLS (policies définies par Agent 5)
-- ----------------------------------------------------------------------------
ALTER TABLE prestataires_sites ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- v0.26 — Équipe interne créée AUTOMATIQUEMENT à la création d'un site (décision
-- PO : 1 interne par site). SECURITY DEFINER (l'admin crée le site, le trigger
-- crée la régie sans buter sur la RLS). Le libellé inclut le nom du site ; les
-- internes sont hors de l'unicité de libellé (uq_prestataires_libelle_active).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_interne_for_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_presta_id UUID;
BEGIN
    INSERT INTO public.prestataires (libelle, metier, est_interne, site_id)
    VALUES ('Régie interne — ' || NEW.nom, 'Maintenance interne', true, NEW.id)
    RETURNING id INTO v_presta_id;

    INSERT INTO public.prestataires_sites (prestataire_id, site_id)
    VALUES (v_presta_id, NEW.id);

    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.create_interne_for_site() IS
    'v0.26 — AFTER INSERT ON sites : crée automatiquement l''équipe interne (régie) du site + son rattachement prestataires_sites. Cible du fallback de resolve_prestataire_effectif.';

CREATE TRIGGER trg_create_interne_for_site
    AFTER INSERT ON sites
    FOR EACH ROW EXECUTE FUNCTION public.create_interne_for_site();


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  023_gammes.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 023 — Gammes de maintenance (procédures préventives)
-- Une gamme = procédure récurrente (périodicité + nature + opérations) à exécuter
-- sur un ou plusieurs équipements.
--   - Nature : controle_reglementaire | maintenance_preventive (ENUM gamme_nature)
--   - Soft-delete via deleted_at (corbeille 90j)
--   - Triggers de propagation legacy SUPPRIMÉS (Option B : snapshot figé sur l'OT)
--   - Triggers conservés : protection_desactivation_gamme (validation seule)
--
-- BIBLIOTHÈQUE DE GAMMES — scope 2 niveaux (MVP 2026-05-20) :
--   site_id NULL  → MODÈLE entreprise : gamme inerte, réutilisable, ne génère
--                   JAMAIS d'OT. Vit dans la bibliothèque.
--   site_id Y     → gamme SITE : gamme réelle rattachée à un site, génère ses OT.
-- On copie un modèle entreprise vers un site (= injection) pour l'utiliser, via
-- la fonction copier_gamme(). copie_depuis_id trace l'origine de la copie.
-- =============================================================================

CREATE TABLE gammes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope bibliothèque (cf. chantier bibliothèque de modèles, 2026-05-20)
    site_id         UUID REFERENCES sites(id) ON DELETE CASCADE,

    -- Étiquette molle : gamme d'origine si cette gamme est une copie
    copie_depuis_id UUID REFERENCES gammes(id) ON DELETE SET NULL,

    nom             TEXT NOT NULL,
    description     TEXT,
    nature          gamme_nature NOT NULL,
    -- ON DELETE RESTRICT : aligne sur le verrou de structure
    -- (check_categorie_suppression). Une catégorie ne peut être mise en corbeille
    -- que si elle n'a plus de gamme vivante rattachée. À la purge physique
    -- (purge_corbeille_90j), le garde-fou NOT EXISTS gamme sur le DELETE des
    -- catégories empêche les violations FK.
    -- Note : différent du lien souple equipements.categorie_id (SET NULL) —
    -- pour les équipements le déclassement est autorisé, mais une gamme reste
    -- attachée à sa catégorie tant qu'elle existe.
    -- NOT NULL (patch 2026-06-10) : toute gamme est rangée dans une sous-catégorie
    -- (arborescence stricte, cf. trigger check_gamme_categorie).
    categorie_id    UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,

    periodicite_id  SMALLINT NOT NULL REFERENCES periodicites(id) ON DELETE RESTRICT,
    -- NULLABLE (migration 007) : un template commun (site_id NULL) n'a pas de
    -- prestataire — il dépend du site, renseigné après copie. cf. COMMENT plus bas.
    prestataire_id  UUID REFERENCES prestataires(id) ON DELETE RESTRICT,
    image_path      TEXT,                          -- Supabase Storage

    est_active      BOOLEAN NOT NULL DEFAULT true,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,                   -- soft-delete (corbeille 90j)
    created_by      UUID NOT NULL REFERENCES users(id),

    CONSTRAINT gammes_nom_non_vide CHECK (length(trim(nom)) > 0)
);

COMMENT ON TABLE gammes IS
    'Procédures de maintenance récurrentes. Scope 2 niveaux : site_id NULL = modèle entreprise inerte (bibliothèque, ne génère pas d''OT) ; site_id renseigné = gamme réelle d''un site (génère ses OT). Une gamme tire ses opérations de operations (spécifiques) + gamme_modeles→modeles_operations_items (templates). Snapshot figé à la création OT.';
COMMENT ON COLUMN gammes.site_id IS
    'NULL = modèle entreprise (gamme inerte de la bibliothèque, ne génère JAMAIS d''OT). Renseigné = gamme réelle rattachée à un site, source des OT de ce site.';
COMMENT ON COLUMN gammes.copie_depuis_id IS
    'Étiquette molle : gamme d''origine d''une copie (injection bibliothèque). ON DELETE SET NULL — si l''origine disparaît, la copie reste intacte (l''étiquette se vide simplement).';
COMMENT ON COLUMN gammes.nature IS
    'controle_reglementaire = contrôle externe obligatoire. maintenance_preventive = maintenance interne récurrente. v0.31 : TOUTE gamme générant un OT doit avoir au moins une source d''opération (un OT ne peut exister sans opération).';
COMMENT ON COLUMN gammes.deleted_at IS
    'Soft-delete (corbeille 90j). Le cron de purge supprime physiquement après 90 jours.';
COMMENT ON COLUMN gammes.prestataire_id IS
    'Prestataire par défaut. NULLABLE (migration 007) : un template commun (site_id NULL) n''en a pas — le prestataire dépend du SITE, renseigné après copie sur un site. Les gammes réelles en portent un (imposé côté front) ; la génération d''OT reste protégée par ordres_travail.prestataire_id NOT NULL.';

-- Index
CREATE INDEX idx_gammes_active
    ON gammes(est_active)
    WHERE est_active = true AND deleted_at IS NULL;

CREATE INDEX idx_gammes_periodicite
    ON gammes(periodicite_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_gammes_prestataire
    ON gammes(prestataire_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_gammes_categorie
    ON gammes(categorie_id)
    WHERE categorie_id IS NOT NULL AND deleted_at IS NULL;

-- Index sur le scope site (filtres bibliothèque + colonne RLS)
CREATE INDEX idx_gammes_site
    ON gammes(site_id)
    WHERE site_id IS NOT NULL AND deleted_at IS NULL;

-- Unicité du nom différenciée par scope (NULL distincts en Postgres → 2 index
-- partiels, calque sur modeles_operations). Le nom est unique PAR niveau :
--   - parmi les modèles entreprise (site_id IS NULL)
--   - parmi les gammes d'un même site (site_id, nom)
-- Une copie peut donc garder le nom de sa source, l'unicité étant par niveau.
CREATE UNIQUE INDEX uniq_gammes_entreprise
    ON gammes (lower(nom))
    WHERE site_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX uniq_gammes_site
    ON gammes (site_id, lower(nom))
    WHERE site_id IS NOT NULL AND deleted_at IS NULL;

-- Trigger updated_at
CREATE TRIGGER trg_gammes_set_updated_at
    BEFORE UPDATE ON gammes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Trigger : cohérence categorie_id ↔ gamme (arborescence stricte, patch 2026-06-10)
-- Modèle strict : Catégorie → Sous-catégorie → Gamme. Calque de
-- check_modele_equipement_categorie (SECURITY DEFINER, search_path '').
--   - catégorie de scope 'equipement' INTERDITE ;
--   - la catégorie doit être une SOUS-catégorie (parent_id IS NOT NULL), jamais
--     une racine ;
--   - cohérence de site : gamme entreprise → catégorie entreprise OBLIGATOIRE ;
--                         gamme site → catégorie entreprise OU même site.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_gamme_categorie()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_scope  public.categorie_scope;
    c_site   UUID;
    c_parent UUID;
BEGIN
    IF NEW.categorie_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT scope, site_id, parent_id
      INTO c_scope, c_site, c_parent
      FROM public.categories
     WHERE id = NEW.categorie_id;

    -- Scope d'usage : catégorie 'equipement' interdite sur une gamme.
    IF c_scope = 'equipement' THEN
        RAISE EXCEPTION 'Catégorie % est de scope ''equipement'' : interdite sur une gamme.', NEW.categorie_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Arborescence stricte : la gamme doit être rangée dans une SOUS-catégorie
    -- (catégorie de niveau 2), jamais directement sous une racine.
    IF c_parent IS NULL THEN
        RAISE EXCEPTION 'La gamme doit être rangée dans une sous-catégorie (catégorie de niveau 2), pas dans une racine (catégorie %).', NEW.categorie_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Niveau 2 EXACT (durcissement 2026-06-10) : c_parent IS NOT NULL ne garantit
    -- que « niveau ≥2 ». Une catégorie legacy de niveau ≥3 (dont le parent a lui-même
    -- un parent) resterait une cible valide alors que l'invariant impose EXACTEMENT
    -- 2 niveaux. On vérifie donc que le parent de la catégorie est une RACINE.
    IF (SELECT p.parent_id FROM public.categories p WHERE p.id = c_parent) IS NOT NULL THEN
        RAISE EXCEPTION 'La gamme doit être rangée dans une sous-catégorie de niveau 2 (la catégorie % est plus profonde).', NEW.categorie_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Cohérence site (calque modeles_equipements) : catégorie scopée site →
    -- gamme entreprise refusée, sinon même site obligatoire.
    IF c_site IS NOT NULL THEN
        IF NEW.site_id IS NULL THEN
            RAISE EXCEPTION 'Gamme entreprise ne peut pas référencer une catégorie scopée site (catégorie % du site %).',
                NEW.categorie_id, c_site
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.site_id IS DISTINCT FROM c_site THEN
            RAISE EXCEPTION 'Catégorie % scopée site % mais gamme sur site %.',
                NEW.categorie_id, c_site, NEW.site_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_gamme_categorie() IS
    'Garantit l''arborescence stricte des gammes : catégorie non-''equipement'', obligatoirement une sous-catégorie (niveau 2), cohérente de site. Calque check_modele_equipement_categorie adapté aux gammes.';

CREATE TRIGGER trg_gammes_check_categorie
    BEFORE INSERT OR UPDATE OF categorie_id, site_id ON gammes
    FOR EACH ROW EXECUTE FUNCTION public.check_gamme_categorie();

-- ----------------------------------------------------------------------------
-- Protection : bloque la désactivation d'une gamme avec OT actifs
-- (les statuts OT vivent dans la table de référence statuts_ot.
--  La table ordres_travail est créée par Agent 4. Ce trigger reste valide
--  car il est déclenché à l'UPDATE, donc résolu au runtime.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protection_desactivation_gamme()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_nb_ot_actifs INT;
BEGIN
    IF OLD.est_active = true AND NEW.est_active = false THEN
        -- On compte les OT actifs (statut hors cloture/annule)
        EXECUTE
            'SELECT COUNT(*) FROM public.ordres_travail
              WHERE gamme_id = $1
                AND statut NOT IN (''cloture'', ''annule'')'
            INTO v_nb_ot_actifs
            USING NEW.id;
        IF v_nb_ot_actifs > 0 THEN
            RAISE EXCEPTION 'Impossible de désactiver : % OT actifs existent pour cette gamme. Annulez-les d''abord.', v_nb_ot_actifs
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protection_desactivation_gamme() IS
    'Trigger BEFORE UPDATE OF est_active ON gammes : bloque la désactivation s''il existe des OT actifs.';

CREATE TRIGGER trg_protection_desactivation_gamme
    BEFORE UPDATE OF est_active ON gammes
    FOR EACH ROW EXECUTE FUNCTION public.protection_desactivation_gamme();

-- ----------------------------------------------------------------------------
-- Immuabilité du niveau (site_id) d'une gamme — MVP bibliothèque
-- Le site_id d'une gamme définit son niveau (modèle entreprise vs gamme site).
-- Ce niveau est FIGÉ après création : la seule façon de "changer de niveau"
-- est de COPIER la gamme via copier_gamme() (qui crée une copie indépendante).
-- Sans ce verrou, un UPDATE direct de site_id ferait disparaître un modèle de
-- la bibliothèque ou retirerait furtivement une gamme de son site. Bypass admin
-- (correction manuelle, cohérent avec protect_ot_site_immutable).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_gamme_site_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF (SELECT public.current_role()) = 'admin' THEN
        RETURN NEW;
    END IF;
    IF OLD.site_id IS DISTINCT FROM NEW.site_id THEN
        RAISE EXCEPTION
            'Le niveau (site_id) d''une gamme est figé. Pour changer de niveau, utilisez copier_gamme() qui crée une copie indépendante.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_gamme_site_immutable() IS
    'MVP bibliothèque : interdit la modification de gammes.site_id (le niveau modèle/site est figé). Changement de niveau = copier_gamme(). Bypass admin.';

CREATE TRIGGER trg_protect_gamme_site_immutable
    BEFORE UPDATE OF site_id ON gammes
    FOR EACH ROW EXECUTE FUNCTION public.protect_gamme_site_immutable();

-- ----------------------------------------------------------------------------
-- Cascade corbeille gamme → OT (validée 2026-05-23)
--
-- Mise en corbeille d'une gamme → ses OT vivants descendent en corbeille (même
-- timestamp). (025 : la branche restauration a été retirée — code mort, l'app
-- n'a aucun chemin de restauration.)
--
-- protection_ot_terminaux laisse passer le seul changement de deleted_at : le
-- tuple protégé sur les OT terminaux ne contient pas deleted_at, donc le
-- soft-delete des OT clôturés via cette cascade est autorisé.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cascade_corbeille_gamme()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Suppression : descend les OT vivants de la gamme au même timestamp.
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE public.ordres_travail
        SET deleted_at = NEW.deleted_at
        WHERE gamme_id = NEW.id
          AND deleted_at IS NULL;
    END IF;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.cascade_corbeille_gamme() IS
    'AFTER UPDATE OF deleted_at ON gammes : à la suppression, descend les OT vivants de la gamme (même timestamp). (025 : branche restauration retirée — code mort.)';

CREATE TRIGGER trg_gammes_cascade_corbeille
    AFTER UPDATE OF deleted_at ON gammes
    FOR EACH ROW
    WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
    EXECUTE FUNCTION public.cascade_corbeille_gamme();

-- ----------------------------------------------------------------------------
-- v0.21 — Cascade corbeille SPATIALE (décision 2026-05-31 : « cascade automatique »).
-- Mettre un parent à la corbeille y descend ses enfants (même timestamp). Chaîne
-- stricte sans cycle (site→bâtiment→niveau→local→équipement) : chaque niveau a son
-- trigger qui propage au suivant. Pour le SITE, on descend en plus les entités
-- rattachées qui ONT un soft-delete : gammes/catégories/documents/DI + OT de site.
-- Les OT clôturés suivent leur site en corbeille (cohérent avec cascade_corbeille_gamme),
-- mais restent des preuves NF EN 13306 jamais PURGÉES physiquement (statut cloture
-- exclu du cron de purge). SECURITY DEFINER : la cascade reste dans le périmètre du
-- site (l'utilisateur a déjà prouvé son accès en supprimant le parent).
-- (025 : la branche restauration symétrique a été retirée — code mort.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cascade_corbeille_spatial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Suppression (descente du soft-delete vers les enfants).
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        IF TG_TABLE_NAME = 'sites' THEN
            UPDATE public.batiments            SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
            UPDATE public.gammes               SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
            UPDATE public.categories           SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
            UPDATE public.documents            SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
            UPDATE public.demandes_intervention SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
            UPDATE public.ordres_travail        SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
        ELSIF TG_TABLE_NAME = 'batiments' THEN
            UPDATE public.niveaux     SET deleted_at = NEW.deleted_at WHERE batiment_id = NEW.id AND deleted_at IS NULL;
        ELSIF TG_TABLE_NAME = 'niveaux' THEN
            UPDATE public.locaux      SET deleted_at = NEW.deleted_at WHERE niveau_id = NEW.id AND deleted_at IS NULL;
        ELSIF TG_TABLE_NAME = 'locaux' THEN
            UPDATE public.equipements SET deleted_at = NEW.deleted_at WHERE local_id = NEW.id AND deleted_at IS NULL;
        END IF;
    END IF;

    RETURN NULL;
END;
$$;
COMMENT ON FUNCTION public.cascade_corbeille_spatial() IS
    'v0.21 — AFTER UPDATE OF deleted_at sur sites/batiments/niveaux/locaux : cascade descendante du soft-delete à la suppression. Pour sites, descend aussi gammes/categories/documents/DI + OT de site (cohérent avec cascade_corbeille_gamme ; les OT cloture suivent en corbeille mais ne sont jamais purgés physiquement). (025 : branche restauration retirée — code mort.)';

CREATE TRIGGER trg_sites_cascade_corbeille
    AFTER UPDATE OF deleted_at ON sites
    FOR EACH ROW WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
    EXECUTE FUNCTION public.cascade_corbeille_spatial();

CREATE TRIGGER trg_batiments_cascade_corbeille
    AFTER UPDATE OF deleted_at ON batiments
    FOR EACH ROW WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
    EXECUTE FUNCTION public.cascade_corbeille_spatial();

CREATE TRIGGER trg_niveaux_cascade_corbeille
    AFTER UPDATE OF deleted_at ON niveaux
    FOR EACH ROW WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
    EXECUTE FUNCTION public.cascade_corbeille_spatial();

CREATE TRIGGER trg_locaux_cascade_corbeille
    AFTER UPDATE OF deleted_at ON locaux
    FOR EACH ROW WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
    EXECUTE FUNCTION public.cascade_corbeille_spatial();

-- ----------------------------------------------------------------------------
-- RLS (policies définies par Agent 5)
-- ----------------------------------------------------------------------------
ALTER TABLE gammes ENABLE ROW LEVEL SECURITY;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  024_operations.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 024 — Opérations spécifiques à une gamme
-- Pas de soft-delete : opérations CASCADE avec la gamme (parent porte la corbeille).
-- ordre : entier libre (l'UI tri ASC), permet réorganisation sans renumérotation forcée.
-- =============================================================================

CREATE TABLE operations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gamme_id            UUID NOT NULL REFERENCES gammes(id) ON DELETE CASCADE,

    nom                 TEXT NOT NULL,
    description         TEXT,
    type_operation_id   SMALLINT NOT NULL REFERENCES types_operations(id),
    seuil_minimum       NUMERIC,
    seuil_maximum       NUMERIC,
    unite_id            SMALLINT REFERENCES unites(id),
    ordre               INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT operations_nom_non_vide CHECK (length(trim(nom)) > 0),
    CONSTRAINT operations_seuils_coherents CHECK (
        seuil_minimum IS NULL
        OR seuil_maximum IS NULL
        OR seuil_minimum <= seuil_maximum
    )
);

COMMENT ON TABLE operations IS
    'Opérations spécifiques à une gamme (non issues d''un modèle réutilisable). CASCADE depuis la gamme.';
COMMENT ON COLUMN operations.ordre IS
    'Entier libre pour l''affichage. Permet réorganisation sans renumérotation forcée.';

CREATE INDEX idx_operations_gamme         ON operations(gamme_id, ordre);
CREATE INDEX idx_operations_type          ON operations(type_operation_id);

CREATE TRIGGER set_updated_at_operations
    BEFORE UPDATE ON operations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS (policies définies par Agent 5)
-- ----------------------------------------------------------------------------
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  025_modeles_operations.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 025 — Modèles d'opérations réutilisables
-- Scope 2 niveaux :
--   site_id NULL  → modèle entreprise (global, tous sites)
--   site_id Y     → modèle site spécifique
-- =============================================================================

CREATE TABLE modeles_operations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope (cf. feedback_principe_flexibilite)
    site_id         UUID REFERENCES sites(id)   ON DELETE CASCADE,

    nom             TEXT NOT NULL,
    description     TEXT,
    image_path      TEXT,

    -- Catégorie de rangement (scope 'operation', racine-only / 1 niveau). NOT NULL
    -- + ON DELETE RESTRICT, à parité de modeles_equipements.categorie_id. (016)
    categorie_id    UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,

    -- Image : vignette du pool partagé (miniature_id), scope entreprise/site
    -- garanti par le trigger check_miniature_site_direct. (019)
    miniature_id    UUID REFERENCES miniatures(id) ON DELETE SET NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,   -- corbeille (soft-delete 90j) — 024

    CONSTRAINT modeles_operations_nom_non_vide CHECK (length(trim(nom)) > 0)
);

COMMENT ON TABLE modeles_operations IS
    'Bibliothèque de modèles d''opérations réutilisables. Scope entreprise (site_id NULL) ou site spécifique.';
COMMENT ON COLUMN modeles_operations.site_id IS
    'NULL = modèle global à l''entreprise. Renseigné = modèle restreint à un site spécifique.';
COMMENT ON COLUMN modeles_operations.deleted_at IS
    'Corbeille (soft-delete) : NULL = vivant, renseigné = en corbeille (purge physique à 90 j). (024)';

-- Index uniques différenciés par scope (NULL distincts en Postgres → 2 index partiels).
-- 024 : + deleted_at IS NULL → la corbeille libère le nom.
CREATE UNIQUE INDEX uniq_modeles_operations_entreprise
    ON modeles_operations (nom)
    WHERE site_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX uniq_modeles_operations_site
    ON modeles_operations (site_id, nom)
    WHERE site_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_modeles_operations_site   ON modeles_operations(site_id)   WHERE site_id   IS NOT NULL;

-- Index de la catégorie de rangement (016)
CREATE INDEX idx_modeles_operations_categorie ON modeles_operations(categorie_id);

-- Index de la vignette (019)
CREATE INDEX idx_modeles_operations_miniature ON modeles_operations(miniature_id)
    WHERE miniature_id IS NOT NULL;

-- Index de balayage de la corbeille (024)
CREATE INDEX idx_modeles_operations_deleted ON modeles_operations(deleted_at)
    WHERE deleted_at IS NOT NULL;

-- Trigger updated_at
CREATE TRIGGER trg_modeles_operations_set_updated_at
    BEFORE UPDATE ON modeles_operations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger : cohérence categorie_id <-> modèle d'opération (016).
-- Calque de check_modele_equipement_categorie : scope STRICT 'operation' + site.
CREATE OR REPLACE FUNCTION public.check_modele_operation_categorie()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_scope public.categorie_scope;
    c_site  UUID;
BEGIN
    IF NEW.categorie_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT scope, site_id INTO c_scope, c_site
      FROM public.categories
     WHERE id = NEW.categorie_id;

    -- Scope d'usage : seule une catégorie 'operation' classe un modèle d'opération.
    IF c_scope <> 'operation' THEN
        RAISE EXCEPTION 'Catégorie % de scope % : interdite sur un modèle d''opération (scope ''operation'' requis).',
            NEW.categorie_id, c_scope
            USING ERRCODE = 'check_violation';
    END IF;

    -- Cohérence site : catégorie de site -> modèle sur le même site (jamais commun).
    IF c_site IS NOT NULL THEN
        IF NEW.site_id IS NULL THEN
            RAISE EXCEPTION 'Modèle d''opération entreprise ne peut pas référencer une catégorie de site (catégorie % du site %).',
                NEW.categorie_id, c_site
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.site_id IS DISTINCT FROM c_site THEN
            RAISE EXCEPTION 'Catégorie % du site % mais modèle sur site %.',
                NEW.categorie_id, c_site, NEW.site_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_modeles_operations_check_categorie
    BEFORE INSERT OR UPDATE OF categorie_id, site_id ON modeles_operations
    FOR EACH ROW EXECUTE FUNCTION public.check_modele_operation_categorie();

COMMENT ON FUNCTION public.check_modele_operation_categorie() IS
    'Garantit qu''un modèle d''opération est classé dans une catégorie de scope ''operation'' et que la cohérence de site est respectée (catégorie de site -> modèle du même site). Calque de check_modele_equipement_categorie (scope strict ''operation''). (016)';

-- Verrou de mise en corbeille (024) : refuse le soft-delete tant qu'une gamme
-- VIVANTE référence le modèle via gamme_modeles (force le détachement).
CREATE OR REPLACE FUNCTION public.check_modele_operation_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.gamme_modeles gm
        JOIN public.gammes g ON g.id = gm.gamme_id
        WHERE gm.modele_operation_id = NEW.id
          AND g.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'Mise en corbeille impossible : ce modèle d''opération est encore rattaché à une gamme. Dissociez-le d''abord.'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_modeles_operations_check_suppression
    BEFORE UPDATE OF deleted_at ON modeles_operations
    FOR EACH ROW
    WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    EXECUTE FUNCTION public.check_modele_operation_suppression();

COMMENT ON FUNCTION public.check_modele_operation_suppression() IS
    'BEFORE UPDATE OF deleted_at ON modeles_operations : refuse la mise en corbeille tant qu''une gamme VIVANTE référence le modèle via gamme_modeles (force le détachement, fait par detacher_et_supprimer_modele_operation). (024)';

-- ----------------------------------------------------------------------------
-- modeles_operations_items
-- ----------------------------------------------------------------------------
CREATE TABLE modeles_operations_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modele_operation_id UUID NOT NULL REFERENCES modeles_operations(id) ON DELETE CASCADE,

    nom                 TEXT NOT NULL,
    description         TEXT,
    type_operation_id   SMALLINT NOT NULL REFERENCES types_operations(id),
    seuil_minimum       NUMERIC,
    seuil_maximum       NUMERIC,
    unite_id            SMALLINT REFERENCES unites(id),
    ordre               INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT modeles_operations_items_nom_non_vide CHECK (length(trim(nom)) > 0),
    CONSTRAINT modeles_operations_items_seuils_coherents CHECK (
        seuil_minimum IS NULL
        OR seuil_maximum IS NULL
        OR seuil_minimum <= seuil_maximum
    )
);

COMMENT ON TABLE modeles_operations_items IS
    'Items (étapes) d''un modèle d''opération. CASCADE depuis le modèle parent.';

CREATE INDEX idx_modeles_operations_items_modele ON modeles_operations_items(modele_operation_id, ordre);
CREATE INDEX idx_modeles_operations_items_type   ON modeles_operations_items(type_operation_id);

CREATE TRIGGER set_updated_at_modeles_operations_items
    BEFORE UPDATE ON modeles_operations_items
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS (policies définies par Agent 5)
-- ----------------------------------------------------------------------------
ALTER TABLE modeles_operations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE modeles_operations_items ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RPC copier_modele_operation : copie commun -> site (calque copier_modele_equipement)
-- Duplique un modèle d'opération PAR VALEUR (avec ses items) ; matérialise la
-- catégorie dans le scope cible (copier_categorie_noeud) ; repli « Non classé
-- (opérations) » si catégorie source en corbeille. (017)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copier_modele_operation(
    p_source_modele_id UUID,
    p_site_cible       UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role   TEXT := public.current_role();
    v_source public.modeles_operations%ROWTYPE;
    v_new_id UUID;
BEGIN
    -- 1. Auth caller
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_modele_operation : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Droits selon scope cible
    IF p_site_cible IS NULL THEN
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION 'copier_modele_operation : seuls admin et manager peuvent copier vers la bibliothèque entreprise.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        IF v_role = 'admin' THEN
            NULL;
        ELSIF v_role IN ('manager', 'technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION 'copier_modele_operation : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION 'copier_modele_operation : rôle % non autorisé.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- 3. Lecture du modèle source VIVANT (024 : on ne copie pas un modèle en corbeille).
    SELECT * INTO v_source
      FROM public.modeles_operations
     WHERE id = p_source_modele_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_modele_operation : modèle source % introuvable.', p_source_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 3bis. Contrôle d'accès à la source (audit défensif)
    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_modele_operation : accès refusé au modèle source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 4. Catégorie cible : matérialisation (find-or-create) ; repli si en corbeille
    IF EXISTS (
        SELECT 1 FROM public.categories
         WHERE id = v_source.categorie_id AND deleted_at IS NULL
    ) THEN
        v_source.categorie_id := public.copier_categorie_noeud(
            v_source.categorie_id, NULL, p_site_cible
        );
    ELSE
        SELECT id INTO v_source.categorie_id
          FROM public.categories
         WHERE site_id IS NULL AND parent_id IS NULL
           AND scope = 'operation'
           AND lower(nom) = 'non classé (opérations)'
           AND deleted_at IS NULL
         LIMIT 1;
        IF v_source.categorie_id IS NULL THEN
            RAISE EXCEPTION 'copier_modele_operation : catégorie de secours « Non classé (opérations) » introuvable — recréez-la avant de copier.'
                USING ERRCODE = 'no_data_found';
        END IF;
    END IF;

    -- 5. Copie du modèle PAR VALEUR
    INSERT INTO public.modeles_operations (
        id, site_id, nom, description, image_path, miniature_id, categorie_id
    ) VALUES (
        gen_random_uuid(), p_site_cible,
        v_source.nom, v_source.description, v_source.image_path,
        CASE WHEN public.miniature_scope_ok(v_source.miniature_id, p_site_cible)
             THEN v_source.miniature_id ELSE NULL END,
        v_source.categorie_id
    )
    RETURNING id INTO v_new_id;

    -- 6. Copie des items rattachés au NOUVEAU modèle
    INSERT INTO public.modeles_operations_items (
        id, modele_operation_id, nom, description,
        type_operation_id, seuil_minimum, seuil_maximum, unite_id, ordre
    )
    SELECT gen_random_uuid(), v_new_id, nom, description,
           type_operation_id, seuil_minimum, seuil_maximum, unite_id, ordre
      FROM public.modeles_operations_items
     WHERE modele_operation_id = p_source_modele_id;

    RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.copier_modele_operation(UUID, UUID) IS
    'Bibliothèque de modèles d''opérations : duplique un modèle VIVANT PAR VALEUR (avec ses items) vers un site (p_site_cible renseigné) ou vers la bibliothèque entreprise (p_site_cible NULL). Copie indépendante de la source. La catégorie de la source est MATÉRIALISÉE dans le scope cible via copier_categorie_noeud (find-or-create idempotent). Repli « Non classé (opérations) » si la catégorie source est en corbeille. Droits : copie entreprise = admin/manager ; copie site = admin ou manager/technicien avec accès au site. Retourne l''id du nouveau modèle. Calque de copier_modele_equipement. (017 ; 024 : source filtrée deleted_at IS NULL.)';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  026_liaisons_gammes.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 026 — Liaisons gammes ↔ modèles & gammes ↔ équipements
-- Pas de soft-delete : les liaisons vivent/meurent avec leur parent (CASCADE depuis
-- gamme). RESTRICT depuis modeles_operations/equipements (forcer la dissociation
-- explicite côté ressource maître).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- gamme_modeles : liaison N–N gamme ↔ modèle d'opérations
-- ----------------------------------------------------------------------------
CREATE TABLE gamme_modeles (
    gamme_id            UUID NOT NULL REFERENCES gammes(id) ON DELETE CASCADE,
    modele_operation_id UUID NOT NULL REFERENCES modeles_operations(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (gamme_id, modele_operation_id)
);

COMMENT ON TABLE gamme_modeles IS
    'Liaison N–N entre gammes et modèles d''opérations réutilisables. CASCADE depuis gammes, RESTRICT depuis modeles_operations.';

CREATE INDEX idx_gamme_modeles_modele ON gamme_modeles(modele_operation_id);

-- ----------------------------------------------------------------------------
-- gammes_equipements : liaison N–N gamme ↔ équipement
-- ----------------------------------------------------------------------------
CREATE TABLE gammes_equipements (
    gamme_id        UUID NOT NULL REFERENCES gammes(id) ON DELETE CASCADE,
    equipement_id   UUID NOT NULL REFERENCES equipements(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (gamme_id, equipement_id)
);

COMMENT ON TABLE gammes_equipements IS
    'Liaison N–N entre gammes et équipements. CASCADE depuis gammes, RESTRICT depuis équipements.';

CREATE INDEX idx_gammes_equipements_eq    ON gammes_equipements(equipement_id);
CREATE INDEX idx_gammes_equipements_gamme ON gammes_equipements(gamme_id);

-- ----------------------------------------------------------------------------
-- RLS (policies définies par Agent 5)
-- ----------------------------------------------------------------------------
ALTER TABLE gamme_modeles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gammes_equipements  ENABLE ROW LEVEL SECURITY;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  027_resolve_prestataire.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 027 — resolve_prestataire_effectif (logique métier centrale)
-- Porte le bloc CASE du legacy (creation_ot_complet, schema.sql 1637-1689) dans
-- une fonction PL/pgSQL nommée, testable et réutilisable.
--
-- Règles (inchangées du legacy, type_contrat_id = 2 = tacite) :
--   1. Si le prestataire demandé est l'interne → on garde l'interne (pas de contrat requis)
--   2. Si la gamme est contractualisée (≥1 ligne dans contrats_gammes) :
--        chercher un contrat actif liant la gamme au prestataire demandé à la date prévue
--        contrat actif = est_archive=false AND date_resiliation IS NULL
--                        AND date_debut <= date_prevue
--                        AND (date_fin IS NULL OR date_fin >= date_prevue OR type_contrat_id=2 tacite)
--   3. Sinon : chercher tout contrat actif du prestataire (couvrant la date)
--   4. Si pas valide → bascule sur le prestataire interne de l'entreprise
--
-- Appelée par : Agent 4 (création OT — snapshot), planning prévisionnel, rapports.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_prestataire_effectif(
    p_gamme_id            UUID,
    p_prestataire_demande UUID,
    p_date_prevue         DATE
)
RETURNS UUID
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
    v_prest_existe BOOLEAN;
    v_interne_id   UUID;
    v_has_gammes   BOOLEAN;
    v_valide       BOOLEAN;
BEGIN
    -- Cas trivial : prestataire demandé inconnu
    SELECT EXISTS (
        SELECT 1 FROM public.prestataires
         WHERE id = p_prestataire_demande
           AND deleted_at IS NULL
    ) INTO v_prest_existe;

    IF NOT v_prest_existe THEN
        -- v0.21 : message métier clair — distingue « supprimé » d'« inexistant ».
        IF EXISTS (SELECT 1 FROM public.prestataires WHERE id = p_prestataire_demande) THEN
            RAISE EXCEPTION 'Ce prestataire a été supprimé : choisissez-en un autre avant de créer cet ordre de travail.'
                USING ERRCODE = 'foreign_key_violation';
        ELSE
            RAISE EXCEPTION 'Prestataire introuvable (id %).', p_prestataire_demande
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    -- Récupère le prestataire interne (cible de fallback)
    -- v0.26 : l'interne est désormais PAR SITE → on prend la régie du site de la gamme.
    SELECT pr.id INTO v_interne_id
      FROM public.prestataires pr
      JOIN public.gammes g ON g.id = p_gamme_id
     WHERE pr.est_interne = true
       AND pr.deleted_at IS NULL
       AND pr.site_id = g.site_id;

    IF v_interne_id IS NULL THEN
        RAISE EXCEPTION 'Aucune équipe interne pour le site de la gamme % (régie de site manquante).', p_gamme_id;
    END IF;

    -- Cas 1 : prestataire demandé EST l'interne → on garde, pas de contrat requis
    IF p_prestataire_demande = v_interne_id THEN
        RETURN v_interne_id;
    END IF;

    -- La gamme est-elle rattachée à au moins un contrat ?
    SELECT EXISTS (
        SELECT 1 FROM public.contrats_gammes WHERE gamme_id = p_gamme_id
    ) INTO v_has_gammes;

    IF v_has_gammes THEN
        -- Cas 2 : gamme contractualisée → contrat valide liant gamme ↔ prestataire
        SELECT EXISTS (
            SELECT 1
              FROM public.contrats_gammes cg
              JOIN public.contrats c ON c.id = cg.contrat_id
             WHERE cg.gamme_id = p_gamme_id
               AND c.prestataire_id = p_prestataire_demande
               AND c.date_debut <= p_date_prevue
               AND (
                    c.date_fin IS NULL
                    OR c.date_fin >= p_date_prevue
                    OR c.type_contrat_id = 2          -- tacite : valide tant que non résilié
               )
               AND c.date_resiliation IS NULL
               AND c.est_archive = false
        ) INTO v_valide;
    ELSE
        -- Cas 3 : gamme non contractualisée → contrat global actif du prestataire
        SELECT EXISTS (
            SELECT 1
              FROM public.contrats c
             WHERE c.prestataire_id = p_prestataire_demande
               AND c.date_debut <= p_date_prevue
               AND (
                    c.date_fin IS NULL
                    OR c.date_fin >= p_date_prevue
                    OR c.type_contrat_id = 2          -- tacite
               )
               AND c.date_resiliation IS NULL
               AND c.est_archive = false
        ) INTO v_valide;
    END IF;

    -- Si pas de contrat valide → bascule sur l'interne
    RETURN CASE
        WHEN v_valide THEN p_prestataire_demande
        ELSE v_interne_id
    END;
END;
$$;

COMMENT ON FUNCTION public.resolve_prestataire_effectif(UUID, UUID, DATE) IS
    'Résout le prestataire effectif d''un OT à partir du prestataire demandé, de la gamme et de la date prévue. Bascule sur le prestataire interne si aucun contrat valide ne couvre l''intervention. Type 2 = tacite (valide tant que non résilié). Utilisée à la création d''OT (snapshot figé), au planning prévisionnel et aux rapports d''engagement.';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  028_contrats_gammes.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 028 — Liaison contrats ↔ gammes
-- Table N–N reliant les contrats (021) aux gammes (023).
-- Placée APRÈS la création de la table gammes pour respecter l'ordre des FK :
--   - contrats créée en 021
--   - gammes   créée en 023
--   - contrats_gammes créée ici (028), une fois les deux tables disponibles.
-- Dépend de : 021_contrats, 023_gammes.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Table contrats_gammes (N–N)
-- ----------------------------------------------------------------------------
CREATE TABLE contrats_gammes (
    contrat_id   UUID NOT NULL REFERENCES contrats(id) ON DELETE RESTRICT,
    gamme_id     UUID NOT NULL REFERENCES gammes(id)   ON DELETE CASCADE,
    commentaire  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (contrat_id, gamme_id)
);

COMMENT ON TABLE contrats_gammes IS
    'Liaison N–N contrats↔gammes. ON DELETE CASCADE depuis gammes (la liaison disparaît avec la gamme), RESTRICT depuis contrats (forcer une dissociation explicite).';

CREATE INDEX idx_contrats_gammes_gamme    ON contrats_gammes(gamme_id);
CREATE INDEX idx_contrats_gammes_contrat  ON contrats_gammes(contrat_id);

-- v0.24 — Cohérence de site (Pattern 6) : un contrat (signé site par site) ne peut
-- couvrir qu'une gamme de SON site, ou une gamme bibliothèque (site_id NULL, partagée).
-- SECURITY DEFINER : lit contrats/gammes sous RLS sans être bloqué.
CREATE OR REPLACE FUNCTION public.check_contrat_gamme_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_contrat_site UUID;
    v_gamme_site   UUID;
BEGIN
    SELECT site_id INTO v_contrat_site FROM public.contrats WHERE id = NEW.contrat_id;
    SELECT site_id INTO v_gamme_site   FROM public.gammes   WHERE id = NEW.gamme_id;
    -- Gamme bibliothèque (site_id NULL) : autorisée pour tout contrat.
    IF v_gamme_site IS NOT NULL AND v_gamme_site IS DISTINCT FROM v_contrat_site THEN
        RAISE EXCEPTION 'Incohérence : contrat sur le site %, gamme couverte sur le site % (un contrat ne couvre que des gammes de son site ou des gammes bibliothèque).',
            v_contrat_site, v_gamme_site
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.check_contrat_gamme_site() IS
    'v0.24 — Pattern 6 : une liaison contrats_gammes ne lie un contrat qu''à une gamme de son site (ou gamme bibliothèque). Empêche un contrat de site A de couvrir une gamme de site B.';

CREATE TRIGGER trg_check_contrat_gamme_site
    BEFORE INSERT OR UPDATE ON contrats_gammes
    FOR EACH ROW EXECUTE FUNCTION public.check_contrat_gamme_site();

-- ----------------------------------------------------------------------------
-- RLS (policies définies par Agent 5)
-- ----------------------------------------------------------------------------
ALTER TABLE contrats_gammes ENABLE ROW LEVEL SECURITY;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  029_copier_gamme.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 029 — Bibliothèque de gammes : fonction de copie (MVP 2026-05-20)
-- copier_gamme(source, site_cible) duplique une gamme PAR VALEUR (snapshot
-- Pattern 1) : la copie est indépendante de la source.
--   - p_site_cible NULL    → remontée : crée/remonte un MODÈLE entreprise.
--   - p_site_cible renseigné → injection : crée une gamme rattachée à un site.
-- copie_depuis_id trace la gamme d'origine (étiquette molle).
-- Sont copiés : les colonnes métier de la gamme, ses operations, ses liens
-- gamme_modeles (les modeles_operations restent partagés, seule la liaison
-- est dupliquée).
--
-- Matrice de droits (bibliothèque, validée 2026-05-20) :
--   - copie vers entreprise (site_cible NULL) : admin + manager.
--   - copie vers un site                      : admin, ou manager/technicien
--                                               ayant accès au site cible.
-- SECURITY DEFINER : la copie écrit dans gammes/operations/gamme_modeles ;
-- les droits du caller sont vérifiés explicitement en tête de fonction.
-- Dépend de : gammes (023), operations (024), gamme_modeles (026),
--             public.current_role / public.has_site_access (006).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.copier_gamme(
    p_source_gamme_id UUID,
    p_site_cible      UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role     TEXT := public.current_role();
    v_source   public.gammes%ROWTYPE;
    v_new_id   UUID;
BEGIN
    -- ----------------------------------------------------------------------
    -- 1. Contrôle des droits du caller
    -- ----------------------------------------------------------------------
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_gamme : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_site_cible IS NULL THEN
        -- Copie vers le niveau entreprise (créer / remonter un modèle).
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION
                'copier_gamme : seuls admin et manager peuvent copier une gamme vers le niveau entreprise (bibliothèque).'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        -- Injection vers un site : admin partout, manager/technicien si accès.
        IF v_role = 'admin' THEN
            NULL; -- admin : OK partout
        ELSIF v_role IN ('manager', 'technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION
                    'copier_gamme : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION
                'copier_gamme : rôle % non autorisé à injecter une gamme sur un site.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- ----------------------------------------------------------------------
    -- 2. Lecture de la gamme source
    -- ----------------------------------------------------------------------
    SELECT * INTO v_source
    FROM public.gammes
    WHERE id = p_source_gamme_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_gamme : gamme source % introuvable ou supprimée.', p_source_gamme_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 2bis. Contrôle d'accès à la SOURCE (audit défensif) : la lecture étant
    -- faite en SECURITY DEFINER (bypass RLS), il faut revérifier que le caller
    -- a le droit de voir la gamme source. Une gamme bibliothèque (site_id NULL)
    -- est partagée → copiable par tous ; une gamme SITE n'est copiable que si le
    -- caller a accès à son site (admin partout). Sans ce garde, un manager/
    -- technicien pouvait exfiltrer le contenu d'une gamme d'un site hors scope
    -- (nom, périodicité, opérations) en la copiant vers son propre site.
    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_gamme : accès refusé à la gamme source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ----------------------------------------------------------------------
    -- 2ter. Cohérence catégorie ↔ scope cible (calque copier_modele_equipement).
    --    Si la catégorie source est scopée site et incompatible avec le site cible
    --    (site cible différent, ou NULL = remontée entreprise), copier categorie_id
    --    brut ferait échouer check_gamme_categorie (catégorie de site référencée par
    --    une gamme d'un autre site / entreprise). categorie_id étant NOT NULL
    --    (chantier 2026-06-10), on ne peut pas la nuller : on réassigne la
    --    SOUS-catégorie de secours « Non classé » (enfant de « Non classé (gammes) »,
    --    ENTREPRISE → sous-catégorie valide acceptée pour toute gamme). Le manager
    --    reclassera après.
    DECLARE
        v_cat_site    UUID;
        v_racine_id   UUID;
        v_cat_secours UUID;
    BEGIN
        IF v_source.categorie_id IS NOT NULL THEN
            SELECT site_id INTO v_cat_site FROM public.categories WHERE id = v_source.categorie_id;
            IF v_cat_site IS NOT NULL AND v_cat_site IS DISTINCT FROM p_site_cible THEN
                SELECT id INTO v_racine_id
                  FROM public.categories
                 WHERE site_id IS NULL AND parent_id IS NULL
                   AND lower(nom) = 'non classé (gammes)'
                   AND deleted_at IS NULL
                 LIMIT 1;
                SELECT id INTO v_cat_secours
                  FROM public.categories
                 WHERE site_id IS NULL AND parent_id = v_racine_id
                   AND lower(nom) = 'non classé'
                   AND deleted_at IS NULL
                 LIMIT 1;
                -- Durcissement (2026-06-10) : si la catégorie de secours « Non
                -- classé » a été supprimée/purgée, v_cat_secours est NULL → l'INSERT
                -- ci-dessous violerait le NOT NULL (23502 opaque). On lève à la place
                -- une erreur explicite, actionnable par l'humain.
                IF v_cat_secours IS NULL THEN
                    RAISE EXCEPTION 'copier_gamme : catégorie de secours « Non classé » introuvable — recréez-la avant de copier.'
                        USING ERRCODE = 'no_data_found';
                END IF;
                v_source.categorie_id := v_cat_secours;
            END IF;
        END IF;
    END;

    -- ----------------------------------------------------------------------
    -- 3. Copie de la gamme (snapshot par valeur — copie découplée)
    --    L'unicité du nom étant par niveau, on conserve le nom de la source.
    --    est_active forcé à true : une copie fraîche est prête à l'emploi,
    --    même si la gamme source avait été désactivée.
    --    copie_depuis_id : posé UNIQUEMENT pour une injection descendante
    --    (entreprise → site, p_site_cible renseigné). Pour une remontée
    --    site → entreprise (p_site_cible NULL), la gamme remontée dans la
    --    bibliothèque est neuve et indépendante : pas de lien retour vers la
    --    gamme du technicien (copie_depuis_id reste NULL).
    -- ----------------------------------------------------------------------
    INSERT INTO public.gammes (
        id, site_id, copie_depuis_id,
        nom, description, nature, categorie_id,
        periodicite_id, prestataire_id, image_path, miniature_id,
        est_active, created_by
    ) VALUES (
        gen_random_uuid(), p_site_cible,
        CASE WHEN p_site_cible IS NOT NULL THEN p_source_gamme_id ELSE NULL END,
        v_source.nom, v_source.description, v_source.nature, v_source.categorie_id,
        v_source.periodicite_id, v_source.prestataire_id, v_source.image_path,
        CASE WHEN public.miniature_scope_ok(v_source.miniature_id, p_site_cible)
             THEN v_source.miniature_id ELSE NULL END,
        true, (SELECT auth.uid())
    )
    RETURNING id INTO v_new_id;

    -- ----------------------------------------------------------------------
    -- 4. Copie des opérations spécifiques de la gamme source
    -- ----------------------------------------------------------------------
    INSERT INTO public.operations (
        id, gamme_id,
        nom, description, type_operation_id,
        seuil_minimum, seuil_maximum, unite_id, ordre
    )
    SELECT
        gen_random_uuid(), v_new_id,
        o.nom, o.description, o.type_operation_id,
        o.seuil_minimum, o.seuil_maximum, o.unite_id, o.ordre
    FROM public.operations o
    WHERE o.gamme_id = p_source_gamme_id;

    -- ----------------------------------------------------------------------
    -- 5. Copie des liens gamme_modeles (les modeles_operations restent
    --    partagés — seule la ligne de liaison est dupliquée).
    -- ----------------------------------------------------------------------
    INSERT INTO public.gamme_modeles (gamme_id, modele_operation_id)
    SELECT v_new_id, gm.modele_operation_id
    FROM public.gamme_modeles gm
    WHERE gm.gamme_id = p_source_gamme_id;

    RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.copier_gamme(UUID, UUID) IS
    'Bibliothèque de gammes : duplique une gamme PAR VALEUR vers un site (injection) ou vers le niveau entreprise (remontée modèle, p_site_cible NULL). Copie la gamme, ses operations et ses liens gamme_modeles. copie_depuis_id n''est posé que pour une injection descendante (site cible renseigné) ; une remontée vers la bibliothèque produit une gamme neuve et indépendante (copie_depuis_id NULL). La catégorie est réassignée à la sous-catégorie « Non classé » si son scope est incompatible avec le scope cible (categorie_id NOT NULL → jamais nullifiée ; manager reclasse). La miniature (miniature_id) est conservée si elle est compatible avec le scope cible (pool entreprise ou même site), sinon remise à NULL (garde miniature_scope_ok ; 008). Droits : copie entreprise = admin/manager ; copie site = admin ou manager/technicien avec accès au site. Retourne l''id de la nouvelle gamme.';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  008_copier_categorie.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- ============================================================================
-- (2a) public.copier_categorie_noeud — helper interne FIND-OR-CREATE
--      Matérialise UN nœud de catégorie sur la cible (merge / idempotence) :
--      réutilise une catégorie vivante de même (site, parent, scope, lower(nom)) —
--      clé de uq_categories_nom — sinon crée une copie par valeur. Centralise la logique
--      pour éviter sa triplication (racine, sous-cat sélectionnée, sous-cat d'une
--      gamme). SECURITY DEFINER (écrit hors RLS, comme copier_gamme). NON exposé au
--      client : ré-entrant uniquement depuis copier_categorie (service_role).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.copier_categorie_noeud(
    p_source_cat_id   UUID,
    p_parent_cible_id UUID,
    p_site_cible      UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_src   public.categories%ROWTYPE;
    v_cible UUID;
BEGIN
    -- Lecture de la catégorie source (vivante).
    SELECT * INTO v_src
      FROM public.categories
     WHERE id = p_source_cat_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_categorie_noeud : catégorie source % introuvable ou supprimée.', p_source_cat_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- FIND : un conteneur de même (site, parent, SCOPE, lower(nom)) existe déjà sur
    -- la cible → on le réutilise (merge). IS NOT DISTINCT FROM gère les NULL (commun
    -- / racine). Clé alignée sur l'index unique uq_categories_nom (scope inclus
    -- depuis migration 011, deleted_at IS NULL) → merge dans le MÊME scope uniquement.
    SELECT id INTO v_cible
      FROM public.categories
     WHERE site_id   IS NOT DISTINCT FROM p_site_cible
       AND parent_id IS NOT DISTINCT FROM p_parent_cible_id
       AND scope      = v_src.scope
       AND lower(nom) = lower(v_src.nom)
       AND deleted_at IS NULL
     LIMIT 1;

    IF FOUND THEN
        RETURN v_cible;
    END IF;

    -- CREATE : copie par valeur. scope/ordre conservés (le scope du parent englobe
    -- celui de l'enfant — garanti car on matérialise racine puis sous-cat sur la
    -- cible). miniature conservée si compatible avec le scope cible, sinon NULL
    -- (sinon check_miniature_site_direct lèverait integrity_constraint_violation).
    -- copie_depuis_id : posé seulement pour un EXPORT vers un site (p_site_cible non
    -- NULL) ; NULL pour une duplication vers le commun (symétrie copier_gamme).
    -- NB : public.categories n'a PAS de colonne created_by (≠ gammes) → non renseignée.
    INSERT INTO public.categories (
        id, site_id, parent_id, copie_depuis_id,
        nom, scope, description, image_path, ordre, miniature_id
    ) VALUES (
        gen_random_uuid(), p_site_cible, p_parent_cible_id,
        CASE WHEN p_site_cible IS NOT NULL THEN p_source_cat_id ELSE NULL END,
        v_src.nom, v_src.scope, v_src.description, v_src.image_path, v_src.ordre,
        CASE WHEN public.miniature_scope_ok(v_src.miniature_id, p_site_cible)
             THEN v_src.miniature_id ELSE NULL END
    )
    RETURNING id INTO v_cible;

    RETURN v_cible;
END;
$$;

COMMENT ON FUNCTION public.copier_categorie_noeud(UUID, UUID, UUID) IS
    'Interne (copier_categorie) : FIND-OR-CREATE d''un nœud de catégorie sur la cible. Réutilise une catégorie vivante de même (site, parent, scope, lower(nom)) — clé de uq_categories_nom (scope inclus depuis migration 011) — pour le merge/idempotence dans le même scope ; sinon crée une copie par valeur (nom, scope, description, image_path, ordre ; miniature conservée si miniature_scope_ok, sinon NULL ; copie_depuis_id posé seulement pour un export vers un site). public.categories n''a pas de created_by. SECURITY DEFINER (écrit hors RLS). NON exposé au client (service_role uniquement).';

-- ============================================================================
-- (2b) public.copier_categorie — copie d'un sous-arbre de catégories
-- ============================================================================
CREATE OR REPLACE FUNCTION public.copier_categorie(
    p_source_categorie_id UUID,
    p_site_cible          UUID,
    p_souscat_ids         UUID[] DEFAULT '{}',
    p_gamme_ids           UUID[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role             TEXT := public.current_role();
    v_source           public.categories%ROWTYPE;
    v_root_cible_id    UUID;   -- racine matérialisée sur la cible
    v_souscat_cible_id UUID;   -- sous-cat matérialisée (cas SOURCE = sous-catégorie)
    v_cat_cible        UUID;   -- catégorie cible d'une gamme dans la boucle
    v_ret              UUID;   -- valeur de retour
    v_g                public.gammes%ROWTYPE;
    v_new_gamme_id     UUID;
    v_sc_id            UUID;
BEGIN
    -- ----------------------------------------------------------------------
    -- 1. Contrôle des droits du caller (calque EXACT de copier_gamme)
    -- ----------------------------------------------------------------------
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_categorie : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_site_cible IS NULL THEN
        -- Duplication vers le commun (entreprise) : admin + manager uniquement.
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION
                'copier_categorie : seuls admin et manager peuvent copier une catégorie vers le niveau entreprise (commun).'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        -- Export vers un site : admin partout, manager/technicien si accès.
        IF v_role = 'admin' THEN
            NULL; -- admin : OK partout
        ELSIF v_role IN ('manager', 'technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION
                    'copier_categorie : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION
                'copier_categorie : rôle % non autorisé à exporter une catégorie sur un site.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- ----------------------------------------------------------------------
    -- 2. Lecture de la catégorie source (vivante)
    -- ----------------------------------------------------------------------
    SELECT * INTO v_source
      FROM public.categories
     WHERE id = p_source_categorie_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_categorie : catégorie source % introuvable ou supprimée.', p_source_categorie_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 2bis. Contrôle d'accès à la SOURCE (audit défensif, calque copier_gamme) :
    -- lecture en SECURITY DEFINER (bypass RLS) → revérifier que le caller peut voir
    -- la catégorie source. Catégorie commune (site_id NULL) = partagée, copiable par
    -- tous les rôles autorisés ; catégorie SITE = copiable seulement si accès au site
    -- (admin partout).
    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_categorie : accès refusé à la catégorie source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ----------------------------------------------------------------------
    -- 3. Matérialisation du chemin de catégories sur la cible (find-or-create)
    --    On construit racine puis sous-cat DIRECTEMENT sur la cible → les gammes
    --    pointeront une vraie sous-cat du site (pas besoin du secours « Non classé »
    --    de copier_gamme). check_categorie_parent_scope / check_gamme_categorie
    --    passent (racine cohérente → sous-cat niveau 2 → gamme).
    -- ----------------------------------------------------------------------
    IF v_source.parent_id IS NULL THEN
        -- SOURCE = RACINE -------------------------------------------------------
        -- Matérialiser la racine cible.
        v_root_cible_id := public.copier_categorie_noeud(v_source.id, NULL, p_site_cible);

        -- Sous-catégories VIDES explicitement sélectionnées : seules celles qui
        -- sont des ENFANTS DIRECTS de la source sont matérialisées (filtrage).
        FOR v_sc_id IN
            SELECT c.id
              FROM public.categories c
             WHERE c.id = ANY (p_souscat_ids)
               AND c.parent_id = v_source.id
               AND c.deleted_at IS NULL
               -- Audit défensif (parité copier_gamme 2bis) : une racine COMMUNE peut
               -- légalement héberger des sous-cats scopées site → sans ce filtre, un
               -- manager exfiltrerait nom/description/image d'une sous-cat hors de son
               -- scope. Commun (site_id NULL) et admin passent toujours.
               AND (
                   c.site_id IS NULL
                   OR v_role = 'admin'
                   OR public.has_site_access(c.site_id)
               )
        LOOP
            PERFORM public.copier_categorie_noeud(v_sc_id, v_root_cible_id, p_site_cible);
        END LOOP;

        v_ret := v_root_cible_id;
    ELSE
        -- SOURCE = SOUS-CATÉGORIE ----------------------------------------------
        -- Matérialiser d'abord la racine parente, puis la sous-cat sous celle-ci.
        -- p_souscat_ids est IGNORÉ dans ce cas.
        v_root_cible_id    := public.copier_categorie_noeud(v_source.parent_id, NULL, p_site_cible);
        v_souscat_cible_id := public.copier_categorie_noeud(v_source.id, v_root_cible_id, p_site_cible);

        v_ret := v_souscat_cible_id;
    END IF;

    -- ----------------------------------------------------------------------
    -- 4. Copie des gammes sélectionnées (commun aux deux cas)
    --    Pour chaque gamme vivante de p_gamme_ids :
    --      - SOURCE = racine     → matérialiser SA sous-catégorie (gammes.categorie_id)
    --                              sous la racine cible (auto-inclusion du chemin) ;
    --      - SOURCE = sous-cat   → cible fixe = sous-cat matérialisée ; on n'inclut
    --                              que les gammes dont categorie_id = la source.
    -- ----------------------------------------------------------------------
    FOR v_g IN
        SELECT *
          FROM public.gammes
         WHERE id = ANY (p_gamme_ids)
           AND deleted_at IS NULL
    LOOP
        -- Branche SOURCE = sous-catégorie : on n'inclut que les gammes rattachées à
        -- la sous-cat source. On écarte les AUTRES EN TÊTE (avant l'audit), pour ne
        -- pas faire échouer toute l'opération sur un id de gamme non pertinent et
        -- hors-scope qui aurait de toute façon été ignoré.
        IF v_source.parent_id IS NOT NULL
           AND v_g.categorie_id IS DISTINCT FROM v_source.id THEN
            CONTINUE;
        END IF;

        -- Audit défensif de la SOURCE (calque copier_gamme 2bis) : une catégorie
        -- commune peut héberger des gammes scopées site (check_gamme_categorie
        -- l'autorise) → sans ce garde, copier une catégorie commune permettrait
        -- d'exfiltrer le contenu d'une gamme d'un site hors scope.
        IF v_g.site_id IS NOT NULL
           AND v_role <> 'admin'
           AND NOT public.has_site_access(v_g.site_id) THEN
            RAISE EXCEPTION 'copier_categorie : accès refusé à une gamme source (%).', v_g.id
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        -- Résolution de la catégorie cible de la gamme.
        IF v_source.parent_id IS NULL THEN
            v_cat_cible := public.copier_categorie_noeud(v_g.categorie_id, v_root_cible_id, p_site_cible);
        ELSE
            v_cat_cible := v_souscat_cible_id;
        END IF;

        -- Idempotence : si une gamme VIVANTE de même lower(nom) existe déjà dans
        -- la catégorie cible (typiquement une copie antérieure), on saute — évite
        -- le doublon et le 23505. NB : l'unicité réelle des gammes est par SITE
        -- (uniq_gammes_site / uniq_gammes_entreprise) ; un homonyme dans une AUTRE
        -- catégorie du même site fera donc remonter un 23505 explicite (collision
        -- métier réelle, même comportement que copier_gamme).
        IF EXISTS (
            SELECT 1
              FROM public.gammes g2
             WHERE g2.categorie_id = v_cat_cible
               AND lower(g2.nom) = lower(v_g.nom)
               AND g2.deleted_at IS NULL
        ) THEN
            CONTINUE;
        END IF;

        -- Copie de la gamme (par valeur, snapshot découplé — calque copier_gamme).
        INSERT INTO public.gammes (
            id, site_id, copie_depuis_id,
            nom, description, nature, categorie_id,
            periodicite_id, prestataire_id, image_path, miniature_id,
            est_active, created_by
        ) VALUES (
            gen_random_uuid(), p_site_cible,
            CASE WHEN p_site_cible IS NOT NULL THEN v_g.id ELSE NULL END,
            v_g.nom, v_g.description, v_g.nature, v_cat_cible,
            v_g.periodicite_id, v_g.prestataire_id, v_g.image_path,
            CASE WHEN public.miniature_scope_ok(v_g.miniature_id, p_site_cible)
                 THEN v_g.miniature_id ELSE NULL END,
            true, (SELECT auth.uid())
        )
        RETURNING id INTO v_new_gamme_id;

        -- Opérations spécifiques de la gamme source.
        INSERT INTO public.operations (
            id, gamme_id,
            nom, description, type_operation_id,
            seuil_minimum, seuil_maximum, unite_id, ordre
        )
        SELECT
            gen_random_uuid(), v_new_gamme_id,
            o.nom, o.description, o.type_operation_id,
            o.seuil_minimum, o.seuil_maximum, o.unite_id, o.ordre
        FROM public.operations o
        WHERE o.gamme_id = v_g.id;

        -- Liens gamme_modeles (les modeles_operations restent partagés).
        INSERT INTO public.gamme_modeles (gamme_id, modele_operation_id)
        SELECT v_new_gamme_id, gm.modele_operation_id
        FROM public.gamme_modeles gm
        WHERE gm.gamme_id = v_g.id;
    END LOOP;

    RETURN v_ret;
END;
$$;

COMMENT ON FUNCTION public.copier_categorie(UUID, UUID, UUID[], UUID[]) IS
    'Bibliothèque : copie un SOUS-ARBRE de catégories (racine OU sous-catégorie) vers un site (p_site_cible renseigné = export) ou vers le commun (p_site_cible NULL = duplication), avec sélection fine des sous-catégories (p_souscat_ids) et des gammes (p_gamme_ids). Conteneur seul = arrays vides. IDEMPOTENT / MERGE : chaque catégorie est matérialisée par FIND-OR-CREATE sur (site, parent, scope, lower(nom)) — un conteneur déjà présent est réutilisé ; une gamme vivante homonyme déjà présente dans la catégorie cible est ignorée. Le chemin (racine → sous-cat) est construit directement sur la cible → pas de secours « Non classé ». miniature conservée si compatible (miniature_scope_ok) sinon NULL. copie_depuis_id posé seulement pour un export vers un site. Droits = calque copier_gamme (commun : admin/manager ; site : admin ou manager/technicien avec accès) + audit défensif de la source (catégorie racine et chaque gamme). Si SOURCE = racine : retourne l''id de la racine cible (p_souscat_ids = enfants directs vides à inclure). Si SOURCE = sous-catégorie : retourne l''id de la sous-cat cible (p_souscat_ids ignoré, gammes filtrées sur categorie_id = source).';

-- =============================================================================
-- 005 — detacher_et_supprimer_modele_operation : dissociation totale + suppression
-- atomique d'un modèle d'opération (remplace les 2 DELETE séparés du front).
--
-- SECURITY DEFINER : contourne la RLS de gamme_modeles pour détacher AUSSI les
-- liaisons cross-site (gammes hors scope du caller, que le DELETE direct du front
-- ne peut pas voir → liaisons résiduelles bloquant la FK RESTRICT). DEFINER bypassant
-- la RLS, on REJOUE la règle d'écriture de modeles_operations (modeles_operations_admin_all
-- / _manager_all / _technicien_all) AVANT toute suppression.
--
-- ATOMICITÉ : corps exécuté dans la transaction de l'appel /rpc. Les triggers
-- BEFORE DELETE de gamme_modeles (check_derniere_op_preventive,
-- validation_suppression_association_gamme_type) restent actifs et peuvent lever
-- restrict_violation → roll back intégral, jamais de détachement orphelin.
-- 024 : modeles_operations a désormais une corbeille (deleted_at). La RPC détache
-- les liaisons puis met le modèle EN CORBEILLE (UPDATE deleted_at) au lieu d'un DELETE
-- physique ; ses items restent en base (vivent avec le parent jusqu'à la purge 90 j).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.detacher_et_supprimer_modele_operation(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := public.current_role();
  v_site uuid;
BEGIN
  -- 0. Caller actif ? current_role() = NULL pour un user désactivé (F02) → on rejette
  --    explicitement (un v_role NULL rendrait la logique de droits « ni vrai ni faux »
  --    et laisserait passer ; DEFINER contournant la RLS, c'est notre seul rempart).
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Action non autorisée : utilisateur non authentifié ou désactivé.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 0bis. Rôles jamais autorisés en écriture (lecteur, demandeur) : barrés AVANT
  --       toute lecture, pour ne pas leur offrir un oracle d'existence (calque copier_gamme).
  IF v_role NOT IN ('admin', 'manager', 'technicien') THEN
    RAISE EXCEPTION 'Action non autorisée : droits insuffisants pour supprimer ce modèle d''opération.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 1. Le modèle existe ? On lit son scope (IF NOT FOUND fiable même si site_id NULL).
  SELECT site_id INTO v_site
  FROM public.modeles_operations
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modèle d''opération introuvable.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 2. Re-vérification des droits d'écriture (rejoue les policies de modeles_operations).
  IF NOT (
    v_role = 'admin'
    OR (v_role = 'manager'    AND (v_site IS NULL OR public.has_site_access(v_site)))
    OR (v_role = 'technicien' AND v_site IS NOT NULL AND public.has_site_access(v_site))
  ) THEN
    RAISE EXCEPTION 'Action non autorisée : droits insuffisants pour supprimer ce modèle d''opération.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Détacher TOUTES les liaisons (cross-site inclus, RLS contournée). Triggers
  --    BEFORE DELETE de gamme_modeles actifs → restrict_violation possible (roll back).
  DELETE FROM public.gamme_modeles WHERE modele_operation_id = p_id;

  -- 4. Mettre le modèle EN CORBEILLE (soft-delete, 024 — ex-DELETE physique). Le verrou
  --    check_modele_operation_suppression passe : plus aucune liaison vivante après l'étape 3.
  --    Items conservés (vivent avec le parent). AND deleted_at IS NULL → idempotent.
  UPDATE public.modeles_operations
     SET deleted_at = now()
   WHERE id = p_id
     AND deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.detacher_et_supprimer_modele_operation(uuid) IS
    'Bibliothèque d''opérations : détache TOUTES les liaisons gamme_modeles d''un modèle d''opération PUIS le met EN CORBEILLE (soft-delete, UPDATE deleted_at — 024, ex-DELETE physique), en UNE transaction atomique (plus de détachement orphelin sur échec partiel). SECURITY DEFINER pour détacher aussi les liaisons cross-site masquées au caller par la RLS ; rejoue donc explicitement la règle d''écriture de modeles_operations (admin partout ; manager si entreprise ou site accessible ; technicien si modèle de site accessible). Les triggers BEFORE DELETE de gamme_modeles (dernière op d''une préventive active, OT actifs) restent actifs et peuvent annuler toute la transaction. no_data_found si le modèle n''existe pas, insufficient_privilege si droits insuffisants.';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  030_demandes_intervention.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 030_demandes_intervention.sql
-- Domaine : Demandes d'Intervention (DI)
-- =============================================================================
-- Une DI est un signalement curatif (panne, fuite, dysfonctionnement) émis par
-- un occupant ou un agent terrain. Résolution (DI autonome, aucun lien OT) :
--   - description_resolution + date_resolution (obligatoire au passage Résolue)
--
-- Machine à états (FK statuts_di, IDs stables) :
--   1 = Ouverte → 2 = Résolue → 3 = Réouverte
--   (transitions 1→2, 2→3, 3→2 — gérées par triggers Agent 5)
--
-- Soft-delete (corbeille 90j) : deleted_at TIMESTAMPTZ
-- Pas de champ priorite (décision : simplicité UX)
--
-- Dépendances : 002_enums, 003_referentiels (statuts_di), 005_users,
--               010_sites, 020_prestataires, locaux (Agent 2),
--               equipements + gammes (Agent 3 / migrations ultérieures)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table principale : demandes_intervention
-- -----------------------------------------------------------------------------
CREATE TABLE demandes_intervention (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope site (matérialisé pour RLS Manager/Technicien)
    site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,

    -- Acteurs
    created_by      UUID NOT NULL REFERENCES users(id),
    prestataire_id  UUID REFERENCES prestataires(id) ON DELETE SET NULL,

    -- Machine à états (référentiel SMALLINT, IDs stables)
    statut_di_id    SMALLINT NOT NULL DEFAULT 1 REFERENCES statuts_di(id),

    -- Constat
    constat         TEXT NOT NULL CHECK (length(trim(constat)) > 0),
    date_constat    DATE NOT NULL DEFAULT current_date,

    -- Résolution (obligatoire si statut = Résolue, contrôle par trigger Agent 5)
    description_resolution  TEXT,
    date_resolution         DATE,
    -- Traçabilité : qui a passé la DI en Résolue (équivalent closed_by des OT)
    resolved_by             UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Audit + soft-delete (corbeille 90j)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

COMMENT ON TABLE demandes_intervention IS
    'Signalements curatifs (DI). Machine à états 1→2→3 via statuts_di. Soft-delete 90j.';
COMMENT ON COLUMN demandes_intervention.site_id IS
    'Matérialisé pour RLS Manager/Technicien sans jointure sur locaux.';
COMMENT ON COLUMN demandes_intervention.resolved_by IS
    'Qui a passé la DI en Résolue. Peuplé par trigger trg_di_set_resolved_by (équivalent closed_by des OT). NULL tant que non résolue ou rouverte.';
COMMENT ON COLUMN demandes_intervention.deleted_at IS
    'Soft-delete RGPD : DI = pièce opposable au prestataire, jamais hard-delete.';

-- Index
CREATE INDEX idx_di_site        ON demandes_intervention(site_id);
CREATE INDEX idx_di_statut      ON demandes_intervention(statut_di_id);

CREATE INDEX idx_di_active      ON demandes_intervention(site_id)
    WHERE deleted_at IS NULL;

-- Trigger updated_at standard
CREATE TRIGGER trg_demandes_intervention_set_updated_at
    BEFORE UPDATE ON demandes_intervention
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS (policies par Agent 5)
ALTER TABLE demandes_intervention ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- Liaison N-N : di_localisations (DI ↔ locaux : où c'est cassé)
-- -----------------------------------------------------------------------------
CREATE TABLE di_localisations (
    di_id       UUID NOT NULL REFERENCES demandes_intervention(id) ON DELETE CASCADE,
    local_id    UUID NOT NULL REFERENCES locaux(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (di_id, local_id)
);

COMMENT ON TABLE di_localisations IS
    'Localisations affectées par une DI (peut couvrir plusieurs locaux/bâtiments d''un même site).';

CREATE INDEX idx_di_localisations_local ON di_localisations(local_id);

ALTER TABLE di_localisations ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- Liaison N-N : di_equipements (DI ↔ équipements : quoi est cassé)
-- -----------------------------------------------------------------------------
CREATE TABLE di_equipements (
    di_id           UUID NOT NULL REFERENCES demandes_intervention(id) ON DELETE CASCADE,
    equipement_id   UUID NOT NULL REFERENCES equipements(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (di_id, equipement_id)
);

COMMENT ON TABLE di_equipements IS
    'Équipements ciblés par une DI (ascenseur, VMC, robinetterie...).';

CREATE INDEX idx_di_equipements_equipement ON di_equipements(equipement_id);

ALTER TABLE di_equipements ENABLE ROW LEVEL SECURITY;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  030b_interventions_chantier.sql (v0.33)                                  ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- Interventions de chantier : travaux ponctuels confiés (souvent) à un
-- prestataire, distincts des OT préventifs (cycle réglementaire) et des DI
-- (signalements curatifs). Modèle calqué sur les DI : scope site, machine à
-- états, liaisons locaux/équipements/documents, soft-delete 90j.
-- Machine à états (statuts_chantier) : 1 Ouvert → {2,3,5} ; 2 Planifié → {3,5} ;
-- 3 En cours → {4,5} ; 4 Terminé → {3} (réouverture) ; 5 Annulé = terminal.
-- Dépendances : 010_sites, 020_prestataires, 005_users, statuts_chantier,
--               locaux/equipements (liaisons), set_updated_at()
-- =============================================================================

CREATE TABLE interventions_chantier (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope site (matérialisé pour RLS Manager/Technicien)
    site_id             UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,

    -- Acteurs
    created_by          UUID NOT NULL REFERENCES users(id),
    prestataire_id      UUID REFERENCES prestataires(id) ON DELETE SET NULL,

    -- Machine à états (référentiel SMALLINT, IDs stables)
    statut_chantier_id  SMALLINT NOT NULL DEFAULT 1 REFERENCES statuts_chantier(id),

    -- Contenu
    titre               TEXT NOT NULL CHECK (length(trim(titre)) > 0),
    description         TEXT,

    -- Calendrier
    date_demande        DATE NOT NULL DEFAULT current_date,
    date_prevue         DATE,
    date_fin            DATE,

    -- Clôture (compte-rendu obligatoire au passage Terminé, contrôle par trigger).
    -- cloture_by : qui a passé le chantier en Terminé (équivalent resolved_by des DI).
    compte_rendu        TEXT,
    cloture_by          UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Audit + soft-delete (corbeille 90j)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

COMMENT ON TABLE interventions_chantier IS
    'Travaux de chantier ponctuels (souvent prestataire). Machine à états 1→2/3→4 via statuts_chantier. Soft-delete 90j.';
COMMENT ON COLUMN interventions_chantier.cloture_by IS
    'Qui a passé le chantier en Terminé. Peuplé par trigger set_chantier_cloture_by (valeur forcée serveur). NULL tant que non terminé ou réouvert.';

CREATE INDEX idx_chantier_site   ON interventions_chantier(site_id);
CREATE INDEX idx_chantier_statut ON interventions_chantier(statut_chantier_id);
CREATE INDEX idx_chantier_active ON interventions_chantier(site_id)
    WHERE deleted_at IS NULL;
-- Index des FK (règle « indexer toute FK » — v0.33 corrigé post-audit)
CREATE INDEX idx_chantier_created_by  ON interventions_chantier(created_by);
CREATE INDEX idx_chantier_prestataire ON interventions_chantier(prestataire_id);
CREATE INDEX idx_chantier_cloture_by  ON interventions_chantier(cloture_by);

CREATE TRIGGER trg_interventions_chantier_set_updated_at
    BEFORE UPDATE ON interventions_chantier
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE interventions_chantier ENABLE ROW LEVEL SECURITY;


-- Liaison N-N : chantier_localisations (chantier ↔ locaux)
CREATE TABLE chantier_localisations (
    chantier_id  UUID NOT NULL REFERENCES interventions_chantier(id) ON DELETE CASCADE,
    local_id     UUID NOT NULL REFERENCES locaux(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chantier_id, local_id)
);
COMMENT ON TABLE chantier_localisations IS
    'Localisations concernées par un chantier (locaux du même site).';
CREATE INDEX idx_chantier_localisations_local ON chantier_localisations(local_id);
ALTER TABLE chantier_localisations ENABLE ROW LEVEL SECURITY;


-- Liaison N-N : chantier_equipements (chantier ↔ équipements)
CREATE TABLE chantier_equipements (
    chantier_id    UUID NOT NULL REFERENCES interventions_chantier(id) ON DELETE CASCADE,
    equipement_id  UUID NOT NULL REFERENCES equipements(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chantier_id, equipement_id)
);
COMMENT ON TABLE chantier_equipements IS
    'Équipements concernés par un chantier (équipements du même site).';
CREATE INDEX idx_chantier_equipements_equipement ON chantier_equipements(equipement_id);
ALTER TABLE chantier_equipements ENABLE ROW LEVEL SECURITY;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  030c_investissements.sql (v0.33)                                         ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- Investissements / CapEx : suivi budgétaire des dépenses d'investissement
-- d'un site (remplacement chaudière, réfection toiture…). Statut LIBRE (aucune
-- machine à états, aucun trigger de transition) : l'utilisateur passe le statut
-- de Demandé à Validé/Réalisé/Refusé sans contrainte. Scope site, soft-delete.
-- Dépendances : 010_sites, 005_users, statuts_capex, set_updated_at()
-- =============================================================================

CREATE TABLE investissements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
    created_by        UUID NOT NULL REFERENCES users(id),

    -- Statut LIBRE (référentiel, pas de machine à états)
    statut_capex_id   SMALLINT NOT NULL DEFAULT 1 REFERENCES statuts_capex(id),

    libelle           TEXT NOT NULL CHECK (length(trim(libelle)) > 0),
    description       TEXT,

    -- Montants (NUMERIC pour la précision financière, jamais FLOAT)
    montant_demande   NUMERIC(12,2) CHECK (montant_demande IS NULL OR montant_demande >= 0),
    montant_prevu     NUMERIC(12,2) CHECK (montant_prevu   IS NULL OR montant_prevu   >= 0),
    depense_reelle    NUMERIC(12,2) CHECK (depense_reelle  IS NULL OR depense_reelle  >= 0),

    date_demande      DATE NOT NULL DEFAULT current_date,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);

COMMENT ON TABLE investissements IS
    'Suivi budgétaire CapEx par site. Statut LIBRE (statuts_capex, sans machine à états). Soft-delete 90j.';

CREATE INDEX idx_capex_site   ON investissements(site_id);
CREATE INDEX idx_capex_statut ON investissements(statut_capex_id);
CREATE INDEX idx_capex_active ON investissements(site_id)
    WHERE deleted_at IS NULL;
-- Index de la FK created_by (règle « indexer toute FK » — v0.33 corrigé post-audit)
CREATE INDEX idx_capex_created_by ON investissements(created_by);

CREATE TRIGGER trg_investissements_set_updated_at
    BEFORE UPDATE ON investissements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE investissements ENABLE ROW LEVEL SECURITY;



-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  031_modeles_di.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 031_modeles_di.sql
-- Domaine : Modèles de Demandes d'Intervention (templates réutilisables)
-- =============================================================================
-- "DI fuite robinet", "DI panne éclairage cage d'escalier"...
--
-- Scope COMMUN + SITE (aligné sur la règle universelle des modèles le
-- 2026-06-11 — on revient sur l'exception site-only du 2026-05-25) : un modèle
-- de DI peut être commun (site_id NULL = bibliothèque entreprise, rédigé par
-- admin/manager, lisible et utilisable par tous) OU propre à un site précis.
--
-- RLS (bloc 060) : admin partout ; manager sur le commun + ses sites ;
-- technicien sur ses sites uniquement (commun exclu) ; demandeur + lecteur en
-- SELECT seul sur le commun + leurs sites assignés.
--
-- Immuabilité : le trigger trg_modeles_di_protect_site interdit à tout rôle
-- non-admin de reclasser un modèle entre scopes (commun ↔ site, site A ↔ site B)
-- après création — calque exact de modeles_equipements (admin bypass conservé).
--
-- Dépendances : 010_sites
-- =============================================================================

CREATE TABLE modeles_di (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope 2 niveaux : NULL = modèle commun (bibliothèque entreprise) / site
    site_id         UUID REFERENCES sites(id) ON DELETE CASCADE,

    -- Contenu du template
    libelle         TEXT NOT NULL CHECK (length(trim(libelle)) > 0),
    constat_modele  TEXT NOT NULL CHECK (length(trim(constat_modele)) > 0),

    -- Image : vignette du pool partagé (miniature_id), scope entreprise/site
    -- garanti par le trigger check_miniature_site_direct. (018)
    miniature_id    UUID REFERENCES miniatures(id) ON DELETE SET NULL,

    -- Activation (un modèle peut être désactivé sans être supprimé)
    est_actif       BOOLEAN NOT NULL DEFAULT true,

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID NOT NULL REFERENCES users(id),

    -- Corbeille (soft-delete 90j) — 024
    deleted_at      TIMESTAMPTZ
);

COMMENT ON TABLE modeles_di IS
    'Templates de DI réutilisables. Scope 2 niveaux : commun (site_id NULL = bibliothèque entreprise, rédigé par admin/manager, visible et utilisable par tous) ou site. Le constat_modele est copié dans demandes_intervention.constat à l''usage (snapshot Pattern 1).';
COMMENT ON COLUMN modeles_di.site_id IS
    'NULL = modèle commun (bibliothèque entreprise, visible partout, écriture admin + manager). Renseigné = modèle propre au site (écriture admin + manager + technicien si has_site_access). Aligné sur la règle universelle des modèles le 2026-06-11.';
COMMENT ON COLUMN modeles_di.constat_modele IS
    'Constat pré-rédigé qui sera injecté dans demandes_intervention.constat à l''utilisation (copie par valeur).';
COMMENT ON COLUMN modeles_di.deleted_at IS
    'Corbeille (soft-delete) : NULL = vivant, renseigné = en corbeille (purge physique à 90 j). (024)';

-- Index : recherche par site + libellé
CREATE INDEX idx_modeles_di_site   ON modeles_di(site_id, libelle);
CREATE INDEX idx_modeles_di_actifs ON modeles_di(site_id)
    WHERE est_actif = true;
-- Image : index partiel sur la vignette (018)
CREATE INDEX idx_modeles_di_miniature ON modeles_di(miniature_id)
    WHERE miniature_id IS NOT NULL;

-- Index de balayage de la corbeille (024)
CREATE INDEX idx_modeles_di_deleted ON modeles_di(deleted_at)
    WHERE deleted_at IS NOT NULL;

-- Trigger updated_at
CREATE TRIGGER trg_modeles_di_set_updated_at
    BEFORE UPDATE ON modeles_di
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Trigger : immuabilité du site_id après création (calque EXACT de
-- modeles_equipements / protect_modele_equipement_site_immutable).
-- Empêche le « déplacement » d'un modèle de DI entre scopes (commun ↔ site, ou
-- site A ↔ site B) par un rôle non-admin. Admin bypass autorisé (peut corriger
-- une erreur de saisie initiale).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_modele_di_site_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.site_id IS DISTINCT FROM OLD.site_id
       AND (SELECT public.current_role()) <> 'admin' THEN
        RAISE EXCEPTION 'Le site_id d''un modèle de DI est immuable. Recréer le modèle dans le scope cible pour le transférer.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_modeles_di_protect_site
    BEFORE UPDATE OF site_id ON modeles_di
    FOR EACH ROW EXECUTE FUNCTION public.protect_modele_di_site_immutable();

COMMENT ON FUNCTION public.protect_modele_di_site_immutable() IS
    'Immutabilité du site_id (calque de modeles_equipements). Admin bypass autorisé pour correction.';

-- RLS (policies par Agent 5)
ALTER TABLE modeles_di ENABLE ROW LEVEL SECURITY;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  032_ordres_travail.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 032_ordres_travail.sql
-- Domaine : Ordres de Travail (OT) — CŒUR MÉTIER
-- =============================================================================
-- Un OT est l'instance datée d'une gamme : "Contrôle ascenseur APAVE prévu le
-- 12/06/2026 sur la résidence Mirabeau". C'est la pièce justificative légale.
--
-- DÉCISION TRANCHÉE : Snapshots figés (Option B).
--   À l'INSERT, les colonnes nom_gamme, description_gamme, nom_prestataire,
--   nom_equipement, etc. sont copiées depuis les tables vivantes. Si la gamme
--   est modifiée par la suite, l'OT garde son snapshot historique.
--   → Triggers métier (snapshot_ot_from_gamme, resolve_prestataire_ot,
--     generate_operations_execution, creation_ot_complet, gestion_statut_ot,
--     cascade_annulation_ot, reinitialisation_resurrection, protection_ot_*) :
--     attachés par Agent 5.
--
-- Machine à états (statut TEXT, codes de la table statuts_ot) :
--   planifie → en_cours → cloture (terminal)
--                       → annule  (terminal)
--   cloture → reouvert → {planifie, en_cours, cloture, annule}
--   annule  → planifie (résurrection : refresh snapshots + régénère ops)
--
-- Dates métier : DATE civile (PAS TIMESTAMPTZ) pour date_prevue.
-- Soft-delete obligatoire (preuve légale, jamais hard-delete).
--
-- Dépendances : statuts_ot (réf.), 002_enums (ot_origine, gamme_nature),
--               005_users, 010_sites, 020_prestataires,
--               030_demandes_intervention, gammes (Agent 3)
-- =============================================================================

CREATE TABLE ordres_travail (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope site
    site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,

    -- Références vivantes (figées après création par trigger protection_ot_terminaux).
    -- gamme_id : nullable au niveau colonne mais OBLIGATOIRE à l'INSERT (garde dans
    -- validation_gamme_avec_operations). ON DELETE SET NULL : la purge d'une gamme
    -- qui laisse un OT clôturé conservé déclasse l'OT (gamme_id → NULL). L'OT
    -- survit en autonomie grâce aux snapshots figés (Pattern 1).
    gamme_id        UUID REFERENCES gammes(id) ON DELETE SET NULL,
    prestataire_id  UUID NOT NULL REFERENCES prestataires(id) ON DELETE RESTRICT,

    -- État (ENUMs Postgres natifs, pas de tables référentielles)
    statut          TEXT         NOT NULL DEFAULT 'planifie' REFERENCES statuts_ot(code),
    origine         ot_origine   NOT NULL,

    -- ----------------------------------------------------------------------
    -- SNAPSHOTS FIGÉS (Option B) — copiés à l'INSERT par snapshot_ot_from_gamme
    -- ----------------------------------------------------------------------
    nom_gamme           TEXT NOT NULL,
    description_gamme   TEXT,
    nature_gamme        gamme_nature NOT NULL,
    nom_prestataire     TEXT NOT NULL,
    nom_localisation    TEXT,
    nom_equipement      TEXT,
    nom_categorie       TEXT,
    libelle_periodicite TEXT NOT NULL,
    jours_periodicite   INTEGER NOT NULL DEFAULT 0,
    tolerance_jours     INTEGER NOT NULL DEFAULT 0,
    -- image_path : peuplé depuis la gamme à l'INSERT mais MODIFIABLE ensuite
    -- (image d'illustration, pas une preuve figée — protect_ot_immutable_fields
    -- le liste explicitement comme champ modifiable). N'est PAS un snapshot gelé.
    image_path          TEXT,

    -- ----------------------------------------------------------------------
    -- Dates métier (DATE civile pour date_prevue — décision fixée)
    -- ----------------------------------------------------------------------
    date_prevue     DATE        NOT NULL,
    date_debut      TIMESTAMPTZ,
    date_cloture    TIMESTAMPTZ,

    commentaires    TEXT,

    -- F28 (audit sécu) — Motif d'annulation obligatoire au passage en annule
    -- (traçabilité NF EN 13306). Reste figé même en cas de résurrection
    -- (annule → planifie via validation_transitions_ot) pour conserver la
    -- trace de la décision originelle. Pas d'équivalent côté DI (commentaire
    -- libre, doctrine minimaliste — DI = ticket terrain pas preuve légale).
    motif_annulation TEXT,

    -- F28 (audit sécu) — Motif de réouverture (transition cloture → reouvert).
    -- Renseigné par la RPC reouvrir_ot() qui est la seule voie supportée.
    -- Conserve l'historique sur les OT qui ont fait l'objet d'une réouverture
    -- (rare mais sensible juridiquement : un OT clôturé est une preuve légale).
    motif_reouverture TEXT,

    -- F25 (audit 3e passe) — Traçabilité : qui a clôturé l'OT.
    -- Pas d'assignation (assigned_to retiré). Le technicien voit les OT de ses
    -- sites assignés et clôture lui-même. closed_by est peuplé par trigger au
    -- moment du passage statut → 'cloture'. ON DELETE SET NULL : si le user
    -- quitte l'entreprise, on garde l'OT clôturé mais on perd l'attribution.
    closed_by       UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Audit + soft-delete (corbeille 90j, preuve légale)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID NOT NULL REFERENCES users(id),
    deleted_at      TIMESTAMPTZ,

    -- ----------------------------------------------------------------------
    -- Contraintes CHECK métier
    -- ----------------------------------------------------------------------
    CONSTRAINT dates_coherentes CHECK (
        date_debut IS NULL
        OR date_cloture IS NULL
        OR date_debut <= date_cloture
    ),
    CONSTRAINT statut_terminal_a_date_cloture CHECK (
        statut NOT IN ('cloture', 'annule')
        OR date_cloture IS NOT NULL
    ),
    -- F28 (audit sécu) — Motif d'annulation obligatoire au passage en annule.
    -- Forme : NOT NULL + chaîne non vide (CHECK retombe sur NULL si statut
    -- != 'annule' donc passe trivialement).
    CONSTRAINT motif_annulation_oblig_si_annule CHECK (
        statut <> 'annule'
        OR (motif_annulation IS NOT NULL AND length(trim(motif_annulation)) > 0)
    ),
    -- F28 (audit sécu) — Motif de réouverture obligatoire en statut reouvert.
    -- Posé par la RPC reouvrir_ot() au moment de la transition cloture → reouvert.
    -- Un UPDATE direct sans renseigner ce champ sera donc rejeté par le CHECK.
    CONSTRAINT motif_reouverture_oblig_si_reouvert CHECK (
        statut <> 'reouvert'
        OR (motif_reouverture IS NOT NULL AND length(trim(motif_reouverture)) > 0)
    )
);

COMMENT ON TABLE ordres_travail IS
    'OT = instance datée d''une gamme. Snapshots figés (Option B). Soft-delete obligatoire (pièce légale).';
COMMENT ON COLUMN ordres_travail.gamme_id IS
    'OBLIGATOIRE à la création (snapshots peuplés depuis la gamme — garde dans validation_gamme_avec_operations). Figé après création (protection_ot_terminaux). Peut passer à NULL si la gamme est purgée alors qu''un OT clôturé la référence encore — l''OT survit grâce aux snapshots figés (Pattern 1).';
COMMENT ON COLUMN ordres_travail.nom_gamme IS
    'Snapshot du nom de la gamme à la création. Reste figé même si la gamme est renommée plus tard.';
COMMENT ON COLUMN ordres_travail.nom_prestataire IS
    'Snapshot du libellé prestataire effectif (peut différer du demandé si bascule sur interne — cf resolve_prestataire_ot).';
COMMENT ON COLUMN ordres_travail.date_prevue IS
    'DATE civile (pas TIMESTAMPTZ). Évite les bugs de fuseau horaire sur les plannings.';
COMMENT ON COLUMN ordres_travail.tolerance_jours IS
    'Snapshot. Conservé pour gestion de statut future (cf décision 2026-05-19). F26 audit : ne sert plus au calcul de la prochaine date_prevue (qui est désormais date_cloture + jours_periodicite, logique semaine ISO).';
COMMENT ON COLUMN ordres_travail.closed_by IS
    'F25 (audit) : user qui a clôturé l''OT. Peuplé par trigger trg_ot_set_closed_by au passage statut → cloture. NULL pour OT non encore clos. Sert aussi de created_by pour le prochain OT généré par le trigger de clôture.';
COMMENT ON COLUMN ordres_travail.motif_annulation IS
    'F28 (audit) : motif obligatoire au passage en annule (CHECK motif_annulation_oblig_si_annule). Reste figé en cas de résurrection (annule → planifie) pour conserver la trace de la décision originelle.';
COMMENT ON COLUMN ordres_travail.motif_reouverture IS
    'F28 (audit) : motif de réouverture (cloture → reouvert) renseigné par la RPC reouvrir_ot(). Conserve l''historique sur les OT ayant fait l''objet d''une réouverture (sensible juridiquement : un OT clôturé est une preuve légale NF EN 13306).';
COMMENT ON COLUMN ordres_travail.deleted_at IS
    'Soft-delete uniquement (DELETE physique interdit par trigger protection_ot_terminaux).';

-- ----------------------------------------------------------------------
-- Index
-- ----------------------------------------------------------------------
CREATE INDEX idx_ot_site
    ON ordres_travail(site_id);

CREATE INDEX idx_ot_gamme
    ON ordres_travail(gamme_id);

CREATE INDEX idx_ot_statut_date
    ON ordres_travail(statut, date_prevue);

-- F25 audit : idx_ot_assigned remplacé par idx_ot_closed_by (filtrage par
-- "qui a clôturé tel OT" — utile pour stats par technicien).
CREATE INDEX idx_ot_closed_by
    ON ordres_travail(closed_by)
    WHERE closed_by IS NOT NULL;

-- F28 (audit sécu) — UNIQUE partiel anti-doublon OT préventif (TOCTOU).
-- Cas couvert : deux clôtures concurrentes du même OT pourraient théoriquement
-- déclencher 2 fois generer_prochain_ot et créer 2 OT identiques pour la même
-- (gamme, date_prevue). Le UNIQUE bloque le 2e INSERT en race condition avec
-- une erreur claire au front. Filtre statut + deleted_at : permet de réinsérer
-- une fois l'OT précédent clôturé/annulé/supprimé. Couvre aussi les requêtes
-- de lecture (l'ancien index non-unique idx_ot_actifs_par_gamme est remplacé).
CREATE UNIQUE INDEX uq_ot_gamme_date_actifs
    ON ordres_travail(gamme_id, date_prevue)
    WHERE statut NOT IN ('cloture', 'annule') AND deleted_at IS NULL;


CREATE INDEX idx_ot_actifs
    ON ordres_travail(site_id, date_prevue)
    WHERE deleted_at IS NULL;

-- Trigger updated_at standard (les triggers métier sont posés par Agent 5)
CREATE TRIGGER trg_ordres_travail_set_updated_at
    BEFORE UPDATE ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS (policies par Agent 5)
ALTER TABLE ordres_travail ENABLE ROW LEVEL SECURITY;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  033_operations_execution.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 033_operations_execution.sql
-- Domaine : Opérations d'exécution (snapshots des ops à réaliser sur un OT)
-- =============================================================================
-- Chaque OT contient N opérations à exécuter. Ces opérations proviennent de
-- 2 sources possibles :
--   - source_type = 1 → operations         (op spécifique à la gamme)
--   - source_type = 2 → modeles_operations_items  (op héritée d'un modèle lié)
--
-- Les colonnes nom, description, type_operation, seuil_minimum, seuil_maximum,
-- unite_nom, unite_symbole, ordre sont FIGÉES à la création de l'OT par
-- generate_operations_execution() (trigger Agent 5).
--
-- Machine à états (statut TEXT, codes de la table statuts_operations) :
--   en_attente → en_cours → terminee (terminal)
--                         → non_applicable (terminal, choix utilisateur)
--   annulee = uniquement par cascade système (OT passe en annule)
--
-- Triggers métier (auto_calcul_conformite, gestion_statut_ot) : Agent 5.
--
-- Dépendances : statuts_operations (réf.), 005_users, 032_ordres_travail
-- =============================================================================

CREATE TABLE operations_execution (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent OT
    ordre_travail_id    UUID NOT NULL REFERENCES ordres_travail(id) ON DELETE CASCADE,

    -- ----------------------------------------------------------------------
    -- Provenance traçable mais figée
    -- ----------------------------------------------------------------------
    source_type         SMALLINT NOT NULL,   -- 1 = operations, 2 = modeles_operations_items
    source_id           UUID NOT NULL,       -- id dans la table source
    ordre               INTEGER NOT NULL DEFAULT 0,

    -- ----------------------------------------------------------------------
    -- SNAPSHOTS FIGÉS (copiés au moment de la génération par Agent 5)
    -- ----------------------------------------------------------------------
    nom                 TEXT NOT NULL,
    description         TEXT,
    type_operation      TEXT NOT NULL,
    seuil_minimum       NUMERIC,
    seuil_maximum       NUMERIC,
    unite_nom           TEXT,
    unite_symbole       TEXT,

    -- ----------------------------------------------------------------------
    -- État + résultat d'exécution
    -- ----------------------------------------------------------------------
    statut              TEXT         NOT NULL DEFAULT 'en_attente' REFERENCES statuts_operations(code),
    valeur_mesuree      NUMERIC,
    est_conforme        BOOLEAN,             -- NULL = pas évaluable (no seuils ou no mesure)
    date_execution      TIMESTAMPTZ,
    executed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    commentaires        TEXT,

    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- ----------------------------------------------------------------------
    -- Contraintes CHECK
    -- ----------------------------------------------------------------------
    CONSTRAINT source_type_valide CHECK (source_type IN (1, 2)),

    -- Cohérence statut ↔ date_execution :
    --   en_attente              : date_execution doit être NULL
    --   en_cours / terminee     : date_execution doit être NOT NULL
    --   annulee / non_applicable: indifférent (peut avoir été démarrée puis annulée)
    CONSTRAINT statut_date_coherents CHECK (
        (statut = 'en_attente' AND date_execution IS NULL)
        OR (statut IN ('en_cours', 'terminee') AND date_execution IS NOT NULL)
        OR (statut IN ('annulee', 'non_applicable'))
    )
);

COMMENT ON TABLE operations_execution IS
    'Opérations à exécuter pour un OT. Snapshots figés depuis 2 sources (operations / modeles_operations_items).';
COMMENT ON COLUMN operations_execution.source_type IS
    '1 = operations (spécifique gamme), 2 = modeles_operations_items (héritée d''un modèle).';
COMMENT ON COLUMN operations_execution.est_conforme IS
    'Calculé automatiquement par trigger auto_calcul_conformite (Agent 5) depuis valeur_mesuree vs seuils. NULL si non évaluable.';
COMMENT ON COLUMN operations_execution.statut IS
    'annulee : uniquement par cascade système quand l''OT passe en annule.';

-- ----------------------------------------------------------------------
-- Index
-- ----------------------------------------------------------------------
CREATE INDEX idx_opex_ot
    ON operations_execution(ordre_travail_id, ordre);

CREATE INDEX idx_opex_statut
    ON operations_execution(ordre_travail_id, statut);

-- FK statut → statuts_operations(code) : index dédié (statut en tête), l'index
-- composite ci-dessus ne couvre pas la FK (ordre_travail_id en tête). Doctrine FK→index.
CREATE INDEX idx_opex_statut_code
    ON operations_execution(statut);

CREATE INDEX idx_opex_executed_by
    ON operations_execution(executed_by)
    WHERE executed_by IS NOT NULL;

-- Trigger updated_at standard (auto_calcul_conformite + gestion_statut_ot : Agent 5)
CREATE TRIGGER trg_operations_execution_set_updated_at
    BEFORE UPDATE ON operations_execution
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS (policies par Agent 5)
ALTER TABLE operations_execution ENABLE ROW LEVEL SECURITY;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  034_observations.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 034_observations.sql
-- Domaine : Observations & conformité ERP
-- =============================================================================
-- Cœur de valeur Dédale pour les Établissements Recevant du Public français.
--
-- Source des observations :
--   - controle_reglementaire : remontée par un OT de contrôle (APAVE, Veritas...)
--   - commission_securite    : réserves émises par la commission mairie/préfecture
--   - inspection_interne     : levée par un technicien interne
--
-- Cycle de vie (F24 audit : statut 'caduque' retiré — non utile au métier) :
--   en_cours → levee (nécessite date_levee + levee_by)
-- L'UI affichera un filtre "en retard" basé sur echeance < CURRENT_DATE.
--
-- VIEWs métier (registre de sécurité numérique) :
--   - v_registre_securite      : assemblage par site (OT contrôle clôturés + observations)
--   - v_observations_dashboard : compteurs par site/gravité/échéance
--
-- Dépendances : 002_enums (observation_source, observation_gravite,
--               observation_statut, gamme_nature), 005_users, 010_sites,
--               032_ordres_travail, equipements + documents (autres agents)
-- =============================================================================

CREATE TABLE observations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope site
    site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,

    -- Cible
    equipement_id   UUID REFERENCES equipements(id) ON DELETE SET NULL,
    ot_id           UUID REFERENCES ordres_travail(id) ON DELETE SET NULL,
        -- ot_id NOT NULL si source = controle_reglementaire (rattachement à l'OT)

    -- Classification
    source          observation_source  NOT NULL,
    gravite         observation_gravite NOT NULL,
    description     TEXT NOT NULL CHECK (length(trim(description)) > 0),
    echeance        DATE,

    -- État + traçabilité levée
    statut          observation_statut NOT NULL DEFAULT 'en_cours',
    date_levee          DATE,
    -- FK vers documents(id) ajoutée en 040_documents.sql (ordre de création).
    document_levee_id   UUID,
    levee_by            UUID REFERENCES users(id),  -- NO ACTION (comme created_by) : SET NULL violerait le CHECK observations_levee_coherente (levee_by NOT NULL si statut='levee'). On anonymise, on ne supprime pas un user (cf anonymize_user).
    commentaire_levee   TEXT,

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID NOT NULL REFERENCES users(id),

    -- ----------------------------------------------------------------------
    -- Contraintes CHECK métier
    -- ----------------------------------------------------------------------

    -- Cohérence levée : statut='levee' ⇒ date_levee + levee_by obligatoires
    -- (document_levee_id / commentaire_levee restent optionnels). Inversement,
    -- statut ≠ 'levee' ⇒ les 4 champs de levée doivent être NULL (pas de
    -- document/commentaire de levée résiduel sur une observation non levée).
    CONSTRAINT observations_levee_coherente CHECK (
        (statut = 'levee'
            AND date_levee IS NOT NULL
            AND levee_by  IS NOT NULL)
        OR
        (statut <> 'levee'
            AND date_levee        IS NULL
            AND levee_by          IS NULL
            AND document_levee_id IS NULL
            AND commentaire_levee IS NULL)
    ),

    -- Source contrôle réglementaire ⇒ doit être rattachée à un OT
    CONSTRAINT observations_source_controle_ot CHECK (
        (source = 'controle_reglementaire' AND ot_id IS NOT NULL)
        OR
        (source <> 'controle_reglementaire')
    )
);

COMMENT ON TABLE observations IS
    'Observations de conformité ERP (contrôle réglementaire, commission sécurité, inspection interne). Base du registre de sécurité numérique.';
COMMENT ON COLUMN observations.site_id IS
    'Matérialisé pour RLS Manager/Technicien (filtrage direct sans jointure équipement).';
COMMENT ON COLUMN observations.ot_id IS
    'Obligatoire si source=controle_reglementaire. NULL pour commission_securite / inspection_interne.';
COMMENT ON COLUMN observations.gravite IS
    'mineure / majeure / bloquante. Pilote les alertes dashboard et les délais.';
COMMENT ON COLUMN observations.echeance IS
    'Date limite de levée. Si dépassée et toujours en_cours → l''UI affiche en "retard" (F24 : pas de bascule statut auto, pas de cron).';
COMMENT ON COLUMN observations.document_levee_id IS
    'Preuve unique de levée (photo, PV, attestation). Pour preuves multiples : V1.5 table documents_observations.';

-- ----------------------------------------------------------------------
-- Index
-- ----------------------------------------------------------------------
CREATE INDEX idx_obs_site
    ON observations(site_id);

CREATE INDEX idx_obs_statut_echeance
    ON observations(statut, echeance)
    WHERE statut = 'en_cours';

CREATE INDEX idx_obs_equipement
    ON observations(equipement_id)
    WHERE equipement_id IS NOT NULL;

CREATE INDEX idx_obs_ot
    ON observations(ot_id)
    WHERE ot_id IS NOT NULL;

CREATE INDEX idx_obs_gravite_actives
    ON observations(site_id, gravite)
    WHERE statut = 'en_cours';

-- Trigger updated_at standard
-- (validation_levee_observation + audit_log. F24 : cron caducite supprimé,
--  le statut 'caduque' n'existe plus, l'UI gère l'affichage "en retard" via echeance.)
CREATE TRIGGER trg_observations_set_updated_at
    BEFORE UPDATE ON observations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS (policies par Agent 5)
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- VIEW v_registre_securite
-- =============================================================================
-- Assemblage par site, exportable en PDF.
-- Regroupe :
--   1. Les OT de contrôle réglementaire clôturés (nature_gamme='controle_reglementaire')
--   2. Toutes les observations (toutes sources, tous statuts)
--
-- Note : `nature_gamme` est un SNAPSHOT figé dans ordres_travail (cf 032), donc
-- on n'a pas besoin de jointer la table `gammes` (perfo + immuabilité).
-- =============================================================================
CREATE VIEW v_registre_securite AS
-- 1. OT de contrôle réglementaire clôturés
SELECT
    ot.site_id,
    ot.id                              AS ref_id,
    'ot_controle'::text                AS type_ligne,
    ot.date_cloture::date              AS date_ligne,
    ot.nom_gamme                       AS objet,
    NULL::observation_gravite          AS gravite,
    NULL::observation_statut           AS statut,
    NULL::date                         AS echeance,
    ot.nom_prestataire                 AS intervenant
FROM ordres_travail ot
WHERE ot.statut = 'cloture'
  AND ot.nature_gamme = 'controle_reglementaire'
  AND ot.deleted_at IS NULL

UNION ALL

-- 2. Observations (toutes sources, tous statuts)
SELECT
    o.site_id,
    o.id                                                AS ref_id,
    ('observation_' || o.source::text)                  AS type_ligne,
    COALESCE(o.date_levee, o.created_at::date)          AS date_ligne,
    o.description                                       AS objet,
    o.gravite,
    o.statut,
    o.echeance,
    NULL::text                                          AS intervenant
FROM observations o
;

COMMENT ON VIEW v_registre_securite IS
    'Registre de sécurité numérique par site : OT contrôle clôturés + observations. RLS héritée des tables sous-jacentes.';


-- =============================================================================
-- VIEW v_observations_dashboard
-- =============================================================================
-- Compteurs par site/gravité/échéance pour les badges page d'accueil syndic.
-- =============================================================================
CREATE VIEW v_observations_dashboard AS
SELECT
    site_id,
    count(*) FILTER (WHERE statut = 'en_cours')                                 AS nb_en_cours,
    count(*) FILTER (WHERE statut = 'en_cours' AND gravite = 'bloquante')       AS nb_bloquantes,
    count(*) FILTER (WHERE statut = 'en_cours' AND gravite = 'majeure')         AS nb_majeures,
    count(*) FILTER (WHERE statut = 'en_cours' AND gravite = 'mineure')         AS nb_mineures,
    count(*) FILTER (
        WHERE statut = 'en_cours'
          AND echeance IS NOT NULL
          AND echeance <= current_date + interval '30 days'
    )                                                                            AS nb_echeance_30j,
    -- F24 : nb_en_retard remplace l'ancien nb_caduques (statut supprimé).
    -- L'UI exploite ce compteur pour les badges "obs en retard à lever".
    count(*) FILTER (
        WHERE statut = 'en_cours'
          AND echeance IS NOT NULL
          AND echeance < current_date
    )                                                                            AS nb_en_retard,
    count(*) FILTER (
        WHERE statut = 'levee'
          AND date_levee >= current_date - interval '30 days'
    )                                                                            AS nb_levees_30j
FROM observations
GROUP BY site_id;

COMMENT ON VIEW v_observations_dashboard IS
    'Compteurs conformité par site (en_cours, bloquantes, échéance 30j, en retard, levées 30j). Alimente les badges syndic.';


-- Note (v0.33) : pas de vue de synthèse CapEx pour le moment (décision PO — à
-- voir dans un second temps). Les colonnes montant_demande / montant_prevu /
-- depense_reelle restent sur `investissements` ; l'écart se calcule au besoin
-- (front ou future vue v_capex en security_invoker).


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  040_documents.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 040 — Documents & liaisons polymorphes (7 tables) + protection types_documents
-- Domaine documentaire de Dédale :
--   - 1 table principale `documents` (métadonnées + chemin Storage)
--   - 7 tables de liaison N–N typées (FK déclaratives, ON DELETE CASCADE des 2 côtés)
--   - Dédoublonnage SHA-256 global (un seul bucket d'entreprise)
--   - Protection types_documents (refuse DELETE si docs liés)
-- Dépend de : prestataires, contrats, gammes, demandes_intervention,
--             ordres_travail, equipements, locaux, users, types_documents,
--             set_updated_at()
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- documents : métadonnées + chemin Storage (relatif au bucket unique 'documents')
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE documents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_document_id  SMALLINT NOT NULL REFERENCES types_documents(id) ON DELETE RESTRICT,
    nom_original      TEXT NOT NULL,
    storage_path      TEXT NOT NULL,          -- relatif au bucket : 'documents/{uuid}.pdf'
    hash_sha256       TEXT NOT NULL,
    taille_octets     BIGINT NOT NULL CHECK (taille_octets > 0),
    mime_type         TEXT NOT NULL,
    uploaded_by       UUID NOT NULL REFERENCES users(id),
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ,            -- soft-delete (corbeille 90j)
    CHECK (length(hash_sha256) = 64),
    CHECK (length(trim(nom_original)) > 0),
    CHECK (length(trim(storage_path)) > 0),
    -- F17 (audit sécu) — défense en profondeur path traversal :
    --   pas de "../", pas de path absolu, pas de backslash, longueur < 500.
    --   La RLS Storage filtre déjà par bucket_id, mais on durcit en base au cas
    --   où un chemin malveillant servirait à autre chose (logs, exports, etc.).
    --   F20 (audit 2e passe) : utilisation de position() au lieu de LIKE,
    --   car LIKE traite '\' comme escape par défaut → '%\%' ne matche PAS
    --   les backslashes, il matche "se termine par %". Bug initial corrigé.
    CONSTRAINT documents_storage_path_safe CHECK (
        position('..' in storage_path) = 0
        AND position('\' in storage_path) = 0
        AND storage_path NOT LIKE '/%'
        AND length(storage_path) < 500
    ),
    -- F18 (audit sécu) — whitelist MIME stricte. Cohérent avec la config
    -- Allowed MIME types des buckets Storage (PDF, images bitmap).
    -- Pas de SVG (XSS via HTML embarqué), pas de HTML, pas d'octet-stream.
    CONSTRAINT documents_mime_whitelist CHECK (
        mime_type IN (
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp'
        )
    )
    -- Dédup SHA-256 : la contrainte UNIQUE inline a été transformée en index
    -- partiel documents_unique_hash (WHERE deleted_at IS NULL) — voir ci-dessous.
);

-- Dédup à l'échelle de l'entreprise (un même PDF n'est stocké qu'une fois).
-- WHERE deleted_at IS NULL : un document mis en corbeille libère son hash, ce
-- qui permet de ré-uploader le même fichier sans collision (la dédup ne porte
-- que sur les documents vivants).
-- documents_unique_hash : index unique de dédup DÉPLACÉ en v0.14b (scopé par site_id).


CREATE INDEX idx_documents_type            ON documents(type_document_id);
CREATE INDEX idx_documents_uploaded_at     ON documents(uploaded_at);
CREATE INDEX idx_documents_hash            ON documents(hash_sha256);
-- Index partiel pour le cron purge_corbeille_90j (balayage des documents en corbeille)
CREATE INDEX idx_documents_deleted         ON documents(deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE documents IS
    'Documents (PDF, attestations, rapports, CERFA…). Stockés en Supabase Storage. Dédup par hash_sha256.';
COMMENT ON COLUMN documents.storage_path IS
    'Chemin relatif au bucket Storage (ex: documents/{uuid}.pdf).';
COMMENT ON COLUMN documents.hash_sha256 IS
    'Hash SHA-256 hex (64 chars). Unique parmi les documents vivants (index partiel documents_unique_hash WHERE deleted_at IS NULL) : un PDF n''est stocké qu''une seule fois.';
COMMENT ON COLUMN documents.deleted_at IS
    'Soft-delete (corbeille 90j). Le cron purge_corbeille_90j supprime physiquement après 90 jours.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7 tables de liaison polymorphes
-- Un même document peut être rattaché à plusieurs entités (un PDF de contrat
-- peut référencer le prestataire ET le contrat ET un site). CASCADE des deux
-- côtés : la liaison disparaît avec n''importe lequel des deux parents.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) documents ↔ prestataires
CREATE TABLE documents_prestataires (
    document_id     UUID NOT NULL REFERENCES documents(id)    ON DELETE CASCADE,
    prestataire_id  UUID NOT NULL REFERENCES prestataires(id) ON DELETE CASCADE,
    commentaire     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, prestataire_id)
);
CREATE INDEX idx_doc_prest_prestataire ON documents_prestataires(prestataire_id);
ALTER TABLE documents_prestataires ENABLE ROW LEVEL SECURITY;

-- 2) documents ↔ ordres_travail
CREATE TABLE documents_ordres_travail (
    document_id        UUID NOT NULL REFERENCES documents(id)      ON DELETE CASCADE,
    ordre_travail_id   UUID NOT NULL REFERENCES ordres_travail(id) ON DELETE CASCADE,
    commentaire        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, ordre_travail_id)
);
CREATE INDEX idx_doc_ot_ot ON documents_ordres_travail(ordre_travail_id);
ALTER TABLE documents_ordres_travail ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE documents_ordres_travail IS
    'Liaison N-N OT ↔ document. Volontairement SANS protection statut : ajout et retrait toujours possibles, même si OT cloturé/annulé (cas usage : ajout tardif d''un rapport de contrôle, correction d''une liaison erronée). La suppression de la liaison ne supprime PAS le document (F27 audit : cron cleanup_orphan_documents retiré, les documents orphelins s''accumulent — acceptable V1).';

-- 3) documents ↔ gammes
CREATE TABLE documents_gammes (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    gamme_id    UUID NOT NULL REFERENCES gammes(id)    ON DELETE CASCADE,
    commentaire TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, gamme_id)
);
CREATE INDEX idx_doc_gammes_gamme ON documents_gammes(gamme_id);
ALTER TABLE documents_gammes ENABLE ROW LEVEL SECURITY;

-- 4) documents ↔ contrats
CREATE TABLE documents_contrats (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    contrat_id  UUID NOT NULL REFERENCES contrats(id)  ON DELETE CASCADE,
    commentaire TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, contrat_id)
);
CREATE INDEX idx_doc_contrats_contrat ON documents_contrats(contrat_id);
ALTER TABLE documents_contrats ENABLE ROW LEVEL SECURITY;

-- 5) documents ↔ demandes_intervention
CREATE TABLE documents_di (
    document_id UUID NOT NULL REFERENCES documents(id)              ON DELETE CASCADE,
    di_id       UUID NOT NULL REFERENCES demandes_intervention(id)  ON DELETE CASCADE,
    commentaire TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, di_id)
);
CREATE INDEX idx_doc_di_di ON documents_di(di_id);
ALTER TABLE documents_di ENABLE ROW LEVEL SECURITY;

-- 6) documents ↔ locaux
CREATE TABLE documents_locaux (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    local_id    UUID NOT NULL REFERENCES locaux(id)    ON DELETE CASCADE,
    commentaire TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, local_id)
);
CREATE INDEX idx_doc_locaux_local ON documents_locaux(local_id);
ALTER TABLE documents_locaux ENABLE ROW LEVEL SECURITY;

-- 7) documents ↔ equipements
CREATE TABLE documents_equipements (
    document_id    UUID NOT NULL REFERENCES documents(id)    ON DELETE CASCADE,
    equipement_id  UUID NOT NULL REFERENCES equipements(id)  ON DELETE CASCADE,
    commentaire    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, equipement_id)
);
CREATE INDEX idx_doc_eq_eq ON documents_equipements(equipement_id);
ALTER TABLE documents_equipements ENABLE ROW LEVEL SECURITY;

-- 8) documents ↔ interventions_chantier (v0.33)
CREATE TABLE documents_interventions_chantier (
    document_id UUID NOT NULL REFERENCES documents(id)               ON DELETE CASCADE,
    chantier_id UUID NOT NULL REFERENCES interventions_chantier(id)  ON DELETE CASCADE,
    commentaire TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, chantier_id)
);
CREATE INDEX idx_doc_chantier_chantier ON documents_interventions_chantier(chantier_id);
ALTER TABLE documents_interventions_chantier ENABLE ROW LEVEL SECURITY;

-- 9) documents ↔ investissements (v0.33)
CREATE TABLE documents_investissements (
    document_id      UUID NOT NULL REFERENCES documents(id)        ON DELETE CASCADE,
    investissement_id UUID NOT NULL REFERENCES investissements(id) ON DELETE CASCADE,
    commentaire      TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, investissement_id)
);
CREATE INDEX idx_doc_capex_capex ON documents_investissements(investissement_id);
ALTER TABLE documents_investissements ENABLE ROW LEVEL SECURITY;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  v0.14b — Bibliothèques de fichiers : chapitres documents + pool miniatures ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- 1. document_chapitres : arbre de classement de la bibliothèque de documents.
--    Scope ENTREPRISE uniquement (un seul arbre commun à tous les sites).
CREATE TABLE document_chapitres (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id   UUID REFERENCES document_chapitres(id) ON DELETE RESTRICT,
    nom         TEXT NOT NULL CHECK (length(trim(nom)) > 0),
    ordre       SMALLINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_document_chapitres_parent ON document_chapitres(parent_id);
CREATE TRIGGER set_updated_at_document_chapitres
    BEFORE UPDATE ON document_chapitres FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE document_chapitres ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE document_chapitres IS 'v0.14b — arbre de classement de la bibliothèque de documents (chapitres). Scope entreprise (commun à tous les sites).';

CREATE POLICY document_chapitres_admin_all ON document_chapitres FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');
CREATE POLICY document_chapitres_manager_all ON document_chapitres FOR ALL
    USING ((SELECT public.current_role()) = 'manager')
    WITH CHECK ((SELECT public.current_role()) = 'manager');
CREATE POLICY document_chapitres_select ON document_chapitres FOR SELECT
    USING ((SELECT public.current_role()) IN ('technicien', 'lecteur'));

-- 2. miniatures : pool d'images de style (150px webp), dédupliqué par hash,
--    scope entreprise (site_id NULL) / site. Pas de BLOB : fichier dans Storage,
--    on garde le chemin. Le front produit le webp conforme + le hash.
CREATE TABLE miniatures (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id      UUID REFERENCES sites(id) ON DELETE CASCADE,   -- NULL = pool entreprise
    hash_sha256  TEXT NOT NULL CHECK (length(hash_sha256) = 64),
    storage_path TEXT NOT NULL CHECK (length(trim(storage_path)) > 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT miniatures_storage_path_safe CHECK (
        position('..' in storage_path) = 0
        AND position('\' in storage_path) = 0
        AND storage_path NOT LIKE '/%'
        AND length(storage_path) < 500
    )
);
-- Dédup SCOPÉE par hash (jamais globale) : NULLS NOT DISTINCT pour dédupliquer
-- aussi le pool entreprise (site_id NULL). Un même contenu sur 2 sites = 2 lignes.
CREATE UNIQUE INDEX uq_miniatures_scope_hash ON miniatures (site_id, hash_sha256) NULLS NOT DISTINCT;
CREATE INDEX idx_miniatures_site ON miniatures(site_id);
ALTER TABLE miniatures ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE miniatures IS 'v0.14b — pool de miniatures (images de style 150px webp) dédupliquées par hash, scopées entreprise/site. Référencées par les entités via miniature_id.';

CREATE POLICY miniatures_admin_all ON miniatures FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');
CREATE POLICY miniatures_select ON miniatures FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager','technicien','lecteur')
           AND (site_id IS NULL OR public.has_site_access(site_id)));
CREATE POLICY miniatures_manager_all ON miniatures FOR ALL
    USING ((SELECT public.current_role()) = 'manager'
           AND (site_id IS NULL OR public.has_site_access(site_id)))
    WITH CHECK ((SELECT public.current_role()) = 'manager'
           AND (site_id IS NULL OR public.has_site_access(site_id)));
CREATE POLICY miniatures_technicien_all ON miniatures FOR ALL
    USING ((SELECT public.current_role()) = 'technicien'
           AND site_id IS NOT NULL AND public.has_site_access(site_id))
    WITH CHECK ((SELECT public.current_role()) = 'technicien'
           AND site_id IS NOT NULL AND public.has_site_access(site_id));

-- 3. documents : scope (site_id) + chapitre + dédup hash SCOPÉE (au lieu de globale)
ALTER TABLE documents ADD COLUMN site_id     UUID REFERENCES sites(id) ON DELETE RESTRICT;
ALTER TABLE documents ADD COLUMN chapitre_id UUID REFERENCES document_chapitres(id) ON DELETE SET NULL;
COMMENT ON COLUMN documents.site_id IS 'v0.14b — scope : NULL = bibliothèque entreprise (partagée), renseigné = document de site.';
COMMENT ON COLUMN documents.chapitre_id IS 'v0.14b — rangement dans l''arbre document_chapitres (optionnel : une pièce jointe ponctuelle peut rester non rangée).';
-- Dédup SCOPÉE : on ne refuse un doublon que DANS la portée (entreprise ou un
-- site), jamais à travers des sites qu'un utilisateur ne voit pas.
CREATE UNIQUE INDEX documents_unique_hash
    ON documents (site_id, hash_sha256) NULLS NOT DISTINCT
    WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_chapitre ON documents(chapitre_id) WHERE chapitre_id IS NOT NULL;

-- 4. miniature_id sur les entités illustrées. FK pour un comptage de références
--    propre. ON DELETE SET NULL : supprimer une miniature délie l'entité.
ALTER TABLE categories   ADD COLUMN miniature_id UUID REFERENCES miniatures(id) ON DELETE SET NULL;
ALTER TABLE gammes       ADD COLUMN miniature_id UUID REFERENCES miniatures(id) ON DELETE SET NULL;
ALTER TABLE prestataires ADD COLUMN miniature_id UUID REFERENCES miniatures(id) ON DELETE SET NULL;
ALTER TABLE batiments    ADD COLUMN miniature_id UUID REFERENCES miniatures(id) ON DELETE SET NULL;
ALTER TABLE niveaux      ADD COLUMN miniature_id UUID REFERENCES miniatures(id) ON DELETE SET NULL;
ALTER TABLE locaux       ADD COLUMN miniature_id UUID REFERENCES miniatures(id) ON DELETE SET NULL;
-- Modèles d'équipement (migration 012) : site_id direct comme categories/gammes.
ALTER TABLE modeles_equipements ADD COLUMN miniature_id UUID REFERENCES miniatures(id) ON DELETE SET NULL;
-- Équipements-instances (migration 013) : site dérivé via local → niveau → batiment.
ALTER TABLE equipements ADD COLUMN miniature_id UUID REFERENCES miniatures(id) ON DELETE SET NULL;
CREATE INDEX idx_categories_miniature   ON categories(miniature_id)   WHERE miniature_id IS NOT NULL;
CREATE INDEX idx_gammes_miniature       ON gammes(miniature_id)       WHERE miniature_id IS NOT NULL;
CREATE INDEX idx_prestataires_miniature ON prestataires(miniature_id) WHERE miniature_id IS NOT NULL;
CREATE INDEX idx_batiments_miniature    ON batiments(miniature_id)    WHERE miniature_id IS NOT NULL;
CREATE INDEX idx_niveaux_miniature      ON niveaux(miniature_id)      WHERE miniature_id IS NOT NULL;
CREATE INDEX idx_locaux_miniature       ON locaux(miniature_id)       WHERE miniature_id IS NOT NULL;
CREATE INDEX idx_modeles_equipements_miniature ON modeles_equipements(miniature_id) WHERE miniature_id IS NOT NULL;
CREATE INDEX idx_equipements_miniature ON equipements(miniature_id) WHERE miniature_id IS NOT NULL;

-- 5. Comptage de références : suppression sûre du fichier Storage (refcount = 0).
CREATE OR REPLACE FUNCTION public.count_miniature_refs(p_miniature_id UUID)
RETURNS BIGINT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_role TEXT := public.current_role();
BEGIN
    -- v0.18 : DEFINER (comptage cross-scope pour suppression sûre, donc bypass
    -- RLS) → réservé aux rôles qui gèrent les fichiers (admin/manager/technicien),
    -- aligné sur instancier_equipement et la policy d'insert Storage. Sans ce
    -- garde, un lecteur/demandeur pouvait sonder le refcount d'un UUID deviné.
    IF v_role IS NULL OR v_role NOT IN ('admin','manager','technicien') THEN
        RAISE EXCEPTION 'count_miniature_refs : rôle non autorisé'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN (SELECT count(*) FROM public.categories   WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.gammes       WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.prestataires WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.batiments    WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.niveaux      WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.locaux       WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.modeles_equipements WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.equipements         WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.modeles_di          WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.modeles_operations  WHERE miniature_id = p_miniature_id);
END;
$$;
COMMENT ON FUNCTION public.count_miniature_refs(UUID) IS 'v0.14b — nb d''entités référençant une miniature. Suppression sûre : ne retirer le fichier Storage que si le compte = 0.';

CREATE OR REPLACE FUNCTION public.count_document_refs(p_document_id UUID)
RETURNS BIGINT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_role TEXT := public.current_role();
BEGIN
    -- v0.18 : même garde que count_miniature_refs (DEFINER cross-scope → réservé
    -- aux rôles gestionnaires de fichiers).
    IF v_role IS NULL OR v_role NOT IN ('admin','manager','technicien') THEN
        RAISE EXCEPTION 'count_document_refs : rôle non autorisé'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN (SELECT count(*) FROM public.documents_prestataires   WHERE document_id = p_document_id)
         + (SELECT count(*) FROM public.documents_ordres_travail WHERE document_id = p_document_id)
         + (SELECT count(*) FROM public.documents_gammes         WHERE document_id = p_document_id)
         + (SELECT count(*) FROM public.documents_contrats       WHERE document_id = p_document_id)
         + (SELECT count(*) FROM public.documents_di             WHERE document_id = p_document_id)
         + (SELECT count(*) FROM public.documents_locaux         WHERE document_id = p_document_id)
         + (SELECT count(*) FROM public.documents_equipements    WHERE document_id = p_document_id);
END;
$$;
COMMENT ON FUNCTION public.count_document_refs(UUID) IS 'v0.14b — nb de liaisons référençant un document. « Détacher » = retirer 1 liaison ; « supprimer » le fichier n''est sûr que si le compte = 0.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  v0.14c — Garde-fou de cohérence de site sur miniature_id (Pattern 6)       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Une entité ne peut porter qu'une miniature du POOL ENTREPRISE (site_id NULL,
-- partagé) ou du MÊME site qu'elle. Défense en profondeur (cohérent avec
-- check_gamme_equipement_site). Référencer le pool entreprise reste autorisé.

CREATE OR REPLACE FUNCTION public.miniature_scope_ok(p_miniature_id UUID, p_target_site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT p_miniature_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.miniatures m
            WHERE m.id = p_miniature_id
              AND (m.site_id IS NULL OR m.site_id = p_target_site_id)
        );
$$;
COMMENT ON FUNCTION public.miniature_scope_ok(UUID, UUID) IS
    'v0.14c — true si la miniature est utilisable par une entité du site cible : pool entreprise (site_id NULL) ou même site. SECURITY DEFINER (lit miniatures hors RLS).';

-- Entités à site_id direct : categories, gammes, batiments
CREATE OR REPLACE FUNCTION public.check_miniature_site_direct()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF NOT public.miniature_scope_ok(NEW.miniature_id, NEW.site_id) THEN
        RAISE EXCEPTION
            'Miniature % incompatible : pool entreprise ou même site que l''entité requis.',
            NEW.miniature_id USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_check_miniature_site_categories
    BEFORE INSERT OR UPDATE OF miniature_id ON categories
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_direct();
CREATE TRIGGER trg_check_miniature_site_gammes
    BEFORE INSERT OR UPDATE OF miniature_id ON gammes
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_direct();
CREATE TRIGGER trg_check_miniature_site_batiments
    BEFORE INSERT OR UPDATE OF miniature_id ON batiments
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_direct();
-- Modèles d'équipement (migration 012) : site_id direct.
CREATE TRIGGER trg_check_miniature_site_modeles_equipements
    BEFORE INSERT OR UPDATE OF miniature_id ON modeles_equipements
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_direct();
-- Modèles de DI (migration 018) : site_id direct.
CREATE TRIGGER trg_check_miniature_site_modeles_di
    BEFORE INSERT OR UPDATE OF miniature_id ON modeles_di
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_direct();
-- Modèles d'opération (migration 019) : site_id direct.
CREATE TRIGGER trg_check_miniature_site_modeles_operations
    BEFORE INSERT OR UPDATE OF miniature_id ON modeles_operations
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_direct();
-- Équipements-instances (migration 013) : site DÉRIVÉ via local → niveau → batiment.
CREATE OR REPLACE FUNCTION public.check_miniature_site_equipement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_site UUID;
BEGIN
    IF NEW.miniature_id IS NOT NULL THEN
        SELECT b.site_id INTO v_site
        FROM public.locaux    l
        JOIN public.niveaux   n ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE l.id = NEW.local_id;
        IF NOT public.miniature_scope_ok(NEW.miniature_id, v_site) THEN
            RAISE EXCEPTION 'Miniature % incompatible avec le site de l''équipement.', NEW.miniature_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_check_miniature_site_equipements
    BEFORE INSERT OR UPDATE OF miniature_id ON equipements
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_equipement();

-- Migration 013 : v_equipements_complet RECRÉÉE pour ré-exposer « e.* » incl.
-- miniature_id. Le « SELECT e.* » du bloc 013b (plus haut) a figé la liste des
-- colonnes AVANT l'ajout de la colonne ci-dessus → on recrée la vue ici, une fois
-- la colonne présente. (security_invoker ré-appliqué plus bas en bloc « FIX A ».)
DROP VIEW public.v_equipements_complet;
CREATE VIEW public.v_equipements_complet AS
SELECT
    e.*,
    c.nom              AS categorie_nom,
    c.scope            AS categorie_scope,
    v.chemin_court     AS localisation_courte,
    v.chemin_complet   AS localisation_complete,
    v.site_id,
    v.batiment_id,
    v.niveau_id,
    v.site_nom,
    v.batiment_nom,
    v.niveau_nom,
    v.local_nom
FROM public.equipements e
LEFT JOIN public.categories       c ON c.id = e.categorie_id AND c.deleted_at IS NULL
LEFT JOIN public.v_locaux_chemin  v ON v.local_id = e.local_id
WHERE e.deleted_at IS NULL;
ALTER VIEW public.v_equipements_complet SET (security_invoker = true);
GRANT SELECT ON public.v_equipements_complet TO anon, authenticated;
COMMENT ON VIEW public.v_equipements_complet IS
    'Équipement enrichi du chemin spatial + libellé catégorie + vignette (miniature_id via e.*). Filtre auto les supprimés.';

-- niveaux : site dérivé via batiments
CREATE OR REPLACE FUNCTION public.check_miniature_site_niveau()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_site UUID;
BEGIN
    IF NEW.miniature_id IS NOT NULL THEN
        SELECT b.site_id INTO v_site FROM public.batiments b WHERE b.id = NEW.batiment_id;
        IF NOT public.miniature_scope_ok(NEW.miniature_id, v_site) THEN
            RAISE EXCEPTION 'Miniature % incompatible avec le site du niveau.', NEW.miniature_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_check_miniature_site_niveaux
    BEFORE INSERT OR UPDATE OF miniature_id ON niveaux
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_niveau();

-- locaux : site dérivé via niveaux -> batiments
CREATE OR REPLACE FUNCTION public.check_miniature_site_local()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_site UUID;
BEGIN
    IF NEW.miniature_id IS NOT NULL THEN
        SELECT b.site_id INTO v_site
        FROM public.niveaux n
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE n.id = NEW.niveau_id;
        IF NOT public.miniature_scope_ok(NEW.miniature_id, v_site) THEN
            RAISE EXCEPTION 'Miniature % incompatible avec le site du local.', NEW.miniature_id
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_check_miniature_site_locaux
    BEFORE INSERT OR UPDATE OF miniature_id ON locaux
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_local();

-- prestataires : entité transverse (pas de site_id) -> miniature ENTREPRISE only
CREATE OR REPLACE FUNCTION public.check_miniature_prestataire()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF NEW.miniature_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.miniatures m WHERE m.id = NEW.miniature_id AND m.site_id IS NOT NULL)
    THEN
        RAISE EXCEPTION 'Un prestataire (transverse) ne peut porter qu''une miniature du pool entreprise.'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_check_miniature_prestataire
    BEFORE INSERT OR UPDATE OF miniature_id ON prestataires
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_prestataire();


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  v0.16 — Durcissement post-audit (anti-cycle chapitres + index resolved_by) ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Anti-cycle sur l'arbre document_chapitres (calque check_categorie_no_cycle).
CREATE OR REPLACE FUNCTION public.check_document_chapitre_no_cycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE current_id UUID := NEW.parent_id; depth INT := 0;
BEGIN
    WHILE current_id IS NOT NULL LOOP
        IF current_id = NEW.id THEN
            RAISE EXCEPTION 'Cycle détecté dans document_chapitres.parent_id (id=%, parent_id=%)',
                NEW.id, NEW.parent_id;
        END IF;
        depth := depth + 1;
        IF depth > 100 THEN
            RAISE EXCEPTION 'Profondeur > 100 dans document_chapitres.parent_id : abandon (boucle ?)';
        END IF;
        SELECT parent_id INTO current_id FROM public.document_chapitres WHERE id = current_id;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_document_chapitres_no_cycle
    BEFORE INSERT OR UPDATE OF parent_id ON document_chapitres
    FOR EACH ROW WHEN (NEW.parent_id IS NOT NULL)
    EXECUTE FUNCTION public.check_document_chapitre_no_cycle();
COMMENT ON FUNCTION public.check_document_chapitre_no_cycle() IS 'v0.16 — empêche les cycles dans document_chapitres.parent_id (calque check_categorie_no_cycle, garde-fou profondeur 100).';

-- Index sur la FK resolved_by (cohérence avec created_by/closed_by déjà indexés).
CREATE INDEX idx_di_resolved_by ON demandes_intervention(resolved_by) WHERE resolved_by IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Protection types_documents : refuse DELETE si des documents l'utilisent
-- (porte le legacy protection_suppression_type_document)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_type_document_used()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.documents WHERE type_document_id = OLD.id) THEN
        RAISE EXCEPTION 'Suppression impossible : des documents utilisent ce type. Reclassifiez-les d''abord.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_protect_type_document
    BEFORE DELETE ON types_documents
    FOR EACH ROW EXECUTE FUNCTION public.protect_type_document_used();

COMMENT ON FUNCTION public.protect_type_document_used() IS
    'Trigger BEFORE DELETE ON types_documents : bloque la suppression si des documents y sont rattachés.';

-- ─────────────────────────────────────────────────────────────────────────────
-- FK différée : observations.document_levee_id → documents(id)
-- Déclarée ici car observations (034) est créée avant documents (040).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE observations
    ADD CONSTRAINT observations_document_levee_id_fkey
    FOREIGN KEY (document_levee_id) REFERENCES documents(id) ON DELETE SET NULL;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  041_storage_buckets.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 041 — Storage bucket (instance single-tenant : un bucket unique 'documents')
-- Décision : instance dédiée à UNE entreprise → 1 seul bucket Supabase Storage,
-- nommé 'documents', privé, créé en seed ici.
-- L'étanchéité repose sur la RLS DB (rôle + scope site).
-- Le service_role bypass tout (cf cron jobs, Edge Functions).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed du bucket unique de l'entreprise.
-- storage.buckets : colonnes (id, name, public, allowed_mime_types,
-- file_size_limit). public = false → bucket privé (accès via policies RLS +
-- signed URLs uniquement). allowed_mime_types + file_size_limit (v0.37,
-- 2026-06-09) : durcissement SERVEUR (PDF/WebP, 20 Mo) en plus de la validation
-- front. ON CONFLICT DO UPDATE → ré-exécution idempotente qui (ré)applique aussi
-- les limites sur un bucket déjà créé.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES ('documents', 'documents', false,
        ARRAY['application/pdf','image/webp'], 20971520)  -- 20 Mo (20 * 1024 * 1024)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      file_size_limit    = EXCLUDED.file_size_limit;

-- ─────────────────────────────────────────────────────────────────────────────
-- DURCISSEMENT — scope-gating de l'écriture storage.objects (UPDATE/DELETE).
-- storage_objet_modifiable(name) : TRUE si l'objet est soit référencé par une
-- entité VISIBLE du caller (mêmes EXISTS que la policy SELECT v0.20, soumis à la
-- RLS de chaque table porteuse), soit ORPHELIN (rattaché à aucune entité → permet
-- de nettoyer un upload échoué/non lié). admin est filtré en amont par la policy
-- (court-circuit). SECURITY INVOKER OBLIGATOIRE : on veut justement que les RLS
-- des tables porteuses s'appliquent dans les EXISTS « visible ». Le test
-- « orphelin » (NOT EXISTS) est volontairement global (toutes les lignes, RLS
-- comprise) : un objet visible par personne reste modifiable/supprimable comme
-- orphelin — c'est le comportement voulu pour le nettoyage, et admin gère le reste.
-- storage_objet_rattache : TRUE si une ligne (TOUTES, sans filtre de visibilité)
-- référence l'objet. SECURITY DEFINER (bypass RLS) pour le test d'orphelinage —
-- sinon un objet d'un autre site paraîtrait « orphelin » à un manager et serait
-- supprimable. Distinct de la branche (a) qui, elle, DOIT rester sous RLS.
-- Définie AVANT storage_objet_modifiable qui la référence (résolution au CREATE).
CREATE OR REPLACE FUNCTION public.storage_objet_rattache(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT := public.current_role();
BEGIN
    -- DURCISSEMENT micro-surface : DEFINER (bypass RLS) + ré-accordée à
    -- authenticated (cf §4 GRANT) → sans garde, un lecteur/demandeur pourrait la
    -- rappeler en direct (/rest/v1/rpc/storage_objet_rattache) pour SONDER si une
    -- clé Storage exacte est référencée quelque part (oracle d'existence). Elle
    -- n'est invoquée légitimement que par storage_objet_modifiable() dans les
    -- policies UPDATE/DELETE de storage.objects, déjà gatées admin/manager. On la
    -- réserve donc aux rôles gestionnaires de fichiers (même garde que
    -- count_document_refs / count_miniature_refs). Le chemin policy n'est pas cassé
    -- (le caller y est toujours admin ou manager).
    IF v_role IS NULL OR v_role NOT IN ('admin','manager','technicien') THEN
        RAISE EXCEPTION 'storage_objet_rattache : rôle non autorisé'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN
        EXISTS (SELECT 1 FROM public.documents          d  WHERE d.storage_path = p_name)
        OR EXISTS (SELECT 1 FROM public.miniatures         m  WHERE m.storage_path = p_name)
        OR EXISTS (SELECT 1 FROM public.users              u  WHERE u.photo_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.batiments          b  WHERE b.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.niveaux            n  WHERE n.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.locaux             l  WHERE l.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.categories         c  WHERE c.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.equipements        e  WHERE e.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.prestataires       p  WHERE p.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.gammes             g  WHERE g.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.modeles_operations  mo WHERE mo.image_path = p_name)
        OR EXISTS (SELECT 1 FROM public.modeles_equipements me WHERE me.image_path = p_name)
        OR EXISTS (SELECT 1 FROM public.ordres_travail     ot WHERE ot.image_path  = p_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_objet_modifiable(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT
        -- (a) référencé par une entité VISIBLE (EXISTS soumis à la RLS de chaque table)
        EXISTS (SELECT 1 FROM public.documents          d  WHERE d.storage_path = p_name)
        OR EXISTS (SELECT 1 FROM public.miniatures         m  WHERE m.storage_path = p_name)
        OR EXISTS (SELECT 1 FROM public.users              u  WHERE u.photo_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.batiments          b  WHERE b.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.niveaux            n  WHERE n.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.locaux             l  WHERE l.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.categories         c  WHERE c.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.equipements        e  WHERE e.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.prestataires       p  WHERE p.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.gammes             g  WHERE g.image_path   = p_name)
        OR EXISTS (SELECT 1 FROM public.modeles_operations  mo WHERE mo.image_path = p_name)
        OR EXISTS (SELECT 1 FROM public.modeles_equipements me WHERE me.image_path = p_name)
        OR EXISTS (SELECT 1 FROM public.ordres_travail     ot WHERE ot.image_path  = p_name)
        -- (b) orphelin : rattaché à AUCUNE entité (test global, hors RLS de visibilité)
        OR NOT public.storage_objet_rattache(p_name);
$$;

-- supprimer_blob_orphelin(p_path) : suppression IMMÉDIATE d'un fichier devenu
-- orphelin (appelée par le front après suppression d'une vignette/document, pour
-- ne pas attendre le cron mensuel cleanup_storage_orphans). Même technique que le
-- cron : SECURITY DEFINER (contourne la RLS Storage qui réserve le DELETE à
-- admin/manager + objet visible) + GUC storage.allow_delete_query (contourne le
-- trigger storage.protect_delete, sinon le DELETE est bloqué). Garde de rôle
-- (gestionnaires de fichiers) + ne supprime QUE si l'objet n'est plus rattaché
-- nulle part (test global hors RLS → sûr pour un hash partagé entre portées).
CREATE OR REPLACE FUNCTION public.supprimer_blob_orphelin(p_path TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_role TEXT := public.current_role();
BEGIN
    IF v_role IS NULL OR v_role NOT IN ('admin','manager','technicien') THEN
        RAISE EXCEPTION 'supprimer_blob_orphelin : rôle non autorisé'
            USING ERRCODE = '42501';
    END IF;
    IF public.storage_objet_rattache(p_path) THEN
        RETURN false;   -- encore référencé quelque part → on ne touche pas
    END IF;
    PERFORM set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects WHERE bucket_id = 'documents' AND name = p_path;
    RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.supprimer_blob_orphelin(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Politiques RLS Storage : bucket fixe 'documents'.
-- Pattern : tout user authentifié du bon rôle accède au bucket unique.
-- ─────────────────────────────────────────────────────────────────────────────

-- ⚠️ PORTABILITÉ HÉBERGÉ (v0.36, 2026-06-08) : storage.objects / storage.buckets
-- appartiennent à supabase_storage_admin. On créait historiquement les policies via
-- SET ROLE supabase_storage_admin, mais sur le projet hébergé Dédale ce SET ROLE est
-- REFUSÉ (postgres n'en est pas membre) : le bucket restait SANS policy (deny par
-- défaut, uploads en 400). Or le rôle d'application PEUT créer les policies DIRECTEMENT
-- (constaté en prod) ; en local, supabase_admin (superuser) aussi. On crée donc
-- directement, en restant NON BLOQUANT (NOTICE + fallback Dashboard si refus).
DO $do$
BEGIN
    -- Création DIRECTE (sans SET ROLE) : le rôle d'application peut créer les
    -- policies sur ce projet ; bloc NON BLOQUANT (NOTICE en cas d'échec, cf. ci-dessus).

    -- SELECT : lire les objets du bucket (remplacé plus bas par la version v0.20
    -- alignée sur la visibilité de l'entité porteuse).
    EXECUTE $pol$CREATE POLICY storage_objects_select_documents ON storage.objects FOR SELECT
        USING ((SELECT public.current_role()) IS NOT NULL AND bucket_id = 'documents')$pol$;

    -- INSERT : uploader (admin, manager, technicien, demandeur — pièce jointe DI).
    -- Le filtre uploaded_by = auth.uid() est appliqué côté table documents.
    EXECUTE $pol$CREATE POLICY storage_objects_insert_documents ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'documents' AND (SELECT public.current_role()) IN ('admin','manager','technicien','demandeur'))$pol$;

    -- UPDATE / DELETE : admin/manager + scope-gating via storage_objet_modifiable()
    -- (objet référencé par une entité VISIBLE, ou orphelin) — admin court-circuite.
    EXECUTE $pol$CREATE POLICY storage_objects_update_documents ON storage.objects FOR UPDATE
        USING (bucket_id = 'documents' AND (SELECT public.current_role()) IN ('admin','manager') AND public.storage_objet_modifiable(name))
        WITH CHECK (bucket_id = 'documents' AND (SELECT public.current_role()) IN ('admin','manager') AND public.storage_objet_modifiable(name))$pol$;
    EXECUTE $pol$CREATE POLICY storage_objects_delete_documents ON storage.objects FOR DELETE
        USING (bucket_id = 'documents' AND (SELECT public.current_role()) IN ('admin','manager') AND public.storage_objet_modifiable(name))$pol$;

    -- storage.buckets : lecture seule du bucket 'documents'.
    EXECUTE $pol$CREATE POLICY storage_buckets_select_documents ON storage.buckets FOR SELECT
        USING ((SELECT public.current_role()) IS NOT NULL AND id = 'documents')$pol$;

    EXECUTE $pol$COMMENT ON POLICY storage_objects_select_documents ON storage.objects IS 'Lecture du bucket unique ''documents'' par tout utilisateur authentifié.'$pol$;

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Policies Storage non créées via SQL (% : %). Le rôle d''application ne peut pas créer de policy sur storage.objects → créer les 5 policies via le Dashboard (Storage → Policies), cf DEPLOY.md §4.', SQLSTATE, SQLERRM;
END
$do$;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  050_triggers_validation.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 050 — Triggers de validation & protection (18 triggers PL/pgSQL)
-- Porte les triggers legacy de validation/protection après simplification.
-- Catégories :
--   1. Transitions d'états (OT, DI, opérations) : 6 triggers
--   2. Protection des entités terminales (immutabilité) : 6 triggers
--   3. Cohérence types & seuils (factorisée) : 1 fonction + 4 triggers déclaratifs
--   4. Sources opérations (gammes types) : 5 triggers
--   5. Protection champs/modèles : 2 triggers
-- (les protections contrats / prestataires / types_documents / gammes
--  sont déjà créées dans les fichiers 020/021/023/040)
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TRANSITIONS D'ÉTATS
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.1 validation_transitions_ot : machine à états OT (BEFORE UPDATE OF statut)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validation_transitions_ot()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.statut = NEW.statut THEN
        RETURN NEW;
    END IF;

    -- Transitions autorisées depuis chaque statut
    IF OLD.statut = 'planifie'  AND NEW.statut NOT IN ('en_cours', 'cloture', 'annule') THEN
        RAISE EXCEPTION 'Transition interdite depuis « planifie » vers « % »', NEW.statut;
    END IF;
    IF OLD.statut = 'en_cours'  AND NEW.statut NOT IN ('planifie', 'cloture', 'annule') THEN
        RAISE EXCEPTION 'Transition interdite depuis « en_cours » vers « % »', NEW.statut;
    END IF;
    IF OLD.statut = 'cloture'   AND NEW.statut != 'reouvert' THEN
        RAISE EXCEPTION 'Depuis « cloture », seule la réouverture est autorisée';
    END IF;
    IF OLD.statut = 'annule'    AND NEW.statut != 'planifie' THEN
        RAISE EXCEPTION 'Depuis « annule », seule la résurrection (→ planifie) est autorisée';
    END IF;
    IF OLD.statut = 'reouvert'  AND NEW.statut NOT IN ('planifie', 'en_cours', 'cloture', 'annule') THEN
        RAISE EXCEPTION 'Transition interdite depuis « reouvert » vers « % »', NEW.statut;
    END IF;

    -- Résurrection bloquée si gamme inactive
    IF OLD.statut = 'annule' AND NEW.statut = 'planifie'
       AND NOT EXISTS (SELECT 1 FROM public.gammes WHERE id = NEW.gamme_id AND est_active AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Résurrection impossible : la gamme est inactive ou supprimée';
    END IF;

    -- Clôture manuelle bloquée si des ops sont en attente / en cours
    IF NEW.statut = 'cloture'
       AND EXISTS (
           SELECT 1 FROM public.operations_execution
           WHERE ordre_travail_id = NEW.id AND statut IN ('en_attente', 'en_cours')
       ) THEN
        RAISE EXCEPTION 'Clôture impossible : opérations non terminées. Terminez ou annulez l''OT.';
    END IF;

    -- v0.31 : défense en profondeur — un OT ne peut pas être clôturé sans AUCUNE
    -- opération (pas de contenu d'exécution à prouver, NF EN 13306). La création
    -- exige déjà une source d'opération sur la gamme (validation_gamme_avec_operations).
    IF NEW.statut = 'cloture'
       AND NOT EXISTS (
           SELECT 1 FROM public.operations_execution WHERE ordre_travail_id = NEW.id
       ) THEN
        RAISE EXCEPTION 'Clôture impossible : l''OT ne comporte aucune opération.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validation_transitions_ot
    BEFORE UPDATE OF statut ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.validation_transitions_ot();
COMMENT ON FUNCTION public.validation_transitions_ot() IS 'Machine à états OT : planifie/en_cours/cloture/annule/reouvert. Bloque clôture si ops non terminées OU si aucune opération (v0.31), et résurrection si gamme inactive.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.2 protection_statut_annulee_manuel : op 'annulee' réservé au système
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protection_statut_annulee_manuel()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Le statut 'annulee' ne peut être posé que par cascade système (trigger
    -- cascade_annulation_ot). Si on est dans une session user normale, on bloque.
    -- Astuce : le trigger système exécute via SECURITY DEFINER avec un GUC dédié.
    IF NEW.statut = 'annulee' AND OLD.statut != 'annulee'
       AND current_setting('app.cascade_annulation', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Le statut « annulee » sur une opération est réservé au système (cascade OT).';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protection_statut_annulee_manuel
    BEFORE UPDATE OF statut ON operations_execution
    FOR EACH ROW EXECUTE FUNCTION public.protection_statut_annulee_manuel();
COMMENT ON FUNCTION public.protection_statut_annulee_manuel() IS 'Pattern 3 GUC : statut op ''annulee'' réservé au cascade système (cascade_annulation_ot pose app.cascade_annulation = on).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.3 validation_gamme_avec_operations : refuse OT sur gamme préventive vide
-- (cf creation_ot_complet — on garde la vérification ici aussi avant INSERT)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validation_gamme_avec_operations()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_nature      public.gamme_nature;
    v_a_des_ops   BOOLEAN;
    v_est_active  BOOLEAN;
BEGIN
    -- Garde explicite : gamme_id est OBLIGATOIRE à la création d'un OT.
    -- La colonne est nullable au niveau table pour permettre le ON DELETE SET
    -- NULL à la purge d'une gamme laissant des OT clôturés conservés (preuves
    -- légales survivant via snapshots figés).
    IF NEW.gamme_id IS NULL THEN
        RAISE EXCEPTION 'gamme_id obligatoire à la création d''un OT'
            USING ERRCODE = 'not_null_violation';
    END IF;

    SELECT nature, est_active INTO v_nature, v_est_active
    FROM public.gammes WHERE id = NEW.gamme_id AND deleted_at IS NULL;

    IF v_nature IS NULL THEN
        RAISE EXCEPTION 'Gamme % introuvable ou supprimée', NEW.gamme_id;
    END IF;

    IF NOT v_est_active THEN
        RAISE EXCEPTION 'Gamme % inactive — impossible de créer un OT', NEW.gamme_id;
    END IF;

    -- v0.31 (décision PO) : un OT ne peut PAS exister sans opération, QUELLE QUE
    -- SOIT la nature de la gamme (avant : seules les préventives étaient contrôlées,
    -- les contrôles réglementaires pouvaient être vides → OT sans contenu d'exécution).
    SELECT EXISTS (
        SELECT 1 FROM public.operations WHERE gamme_id = NEW.gamme_id
        UNION ALL
        SELECT 1 FROM public.gamme_modeles gm
        JOIN public.modeles_operations_items moi ON moi.modele_operation_id = gm.modele_operation_id
        WHERE gm.gamme_id = NEW.gamme_id
    ) INTO v_a_des_ops;

    IF NOT v_a_des_ops THEN
        RAISE EXCEPTION 'Gamme % sans opération : un OT doit comporter au moins une opération (ajoutez une opération ou un modèle à la gamme).', NEW.gamme_id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validation_gamme_avec_operations
    BEFORE INSERT ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.validation_gamme_avec_operations();
COMMENT ON FUNCTION public.validation_gamme_avec_operations() IS 'Garde-fou INSERT OT : gamme existante, active et avec au moins une source d''opération (v0.31 : toutes natures — un OT ne peut exister sans opération).';

-- v0.21 — Symétrique du garde-fou ci-dessus : empêche de RETIRER la dernière
-- opération d'une gamme préventive active (sinon elle ne génère plus d'OT, en
-- silence). Une seule fonction pour les 2 sources (operations spécifiques +
-- liaisons gamme_modeles) : to_jsonb(OLD) permet de lire les colonnes propres à
-- chaque table sans planter (id n'existe que sur operations, modele_operation_id
-- que sur gamme_modeles).
CREATE OR REPLACE FUNCTION public.check_derniere_op_preventive()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_old    jsonb := to_jsonb(OLD);
    v_gamme  uuid  := (v_old->>'gamme_id')::uuid;
    v_op_id  uuid  := (v_old->>'id')::uuid;                   -- NULL si gamme_modeles
    v_modele uuid  := (v_old->>'modele_operation_id')::uuid;  -- NULL si operations
    v_nature public.gamme_nature;
    v_active BOOLEAN;
    v_site   uuid;
    v_reste  BOOLEAN;
BEGIN
    SELECT nature, est_active, site_id INTO v_nature, v_active, v_site
    FROM public.gammes WHERE id = v_gamme AND deleted_at IS NULL;

    -- Aucune contrainte si : gamme absente / supprimée / non préventive / inactive
    -- (le retrait accompagne une suppression de gamme ou une désactivation), OU
    -- gamme-TEMPLATE (site_id NULL, inerte : ne génère pas d'OT — 021).
    IF v_nature IS DISTINCT FROM 'maintenance_preventive'
       OR v_active IS NOT TRUE
       OR v_site IS NULL THEN
        RETURN OLD;
    END IF;

    -- Reste-t-il au moins une source d'opération APRÈS ce retrait ?
    SELECT EXISTS (
        SELECT 1 FROM public.operations o
        WHERE o.gamme_id = v_gamme
          AND (v_op_id IS NULL OR o.id <> v_op_id)
        UNION ALL
        SELECT 1 FROM public.gamme_modeles gm
        JOIN public.modeles_operations_items moi ON moi.modele_operation_id = gm.modele_operation_id
        WHERE gm.gamme_id = v_gamme
          AND (v_modele IS NULL OR gm.modele_operation_id <> v_modele)
    ) INTO v_reste;

    IF NOT v_reste THEN
        RAISE EXCEPTION 'Impossible de retirer la dernière opération de la gamme préventive % : une gamme préventive active doit conserver au moins une opération. Ajoutez-en une autre, ou désactivez la gamme d''abord.', v_gamme
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN OLD;
END;
$$;
COMMENT ON FUNCTION public.check_derniere_op_preventive() IS
    'v0.21 — BEFORE DELETE sur operations et gamme_modeles : interdit de retirer la dernière source d''opération d''une gamme préventive active (sinon génération d''OT interrompue silencieusement). (021 : exempte les gammes-templates site_id NULL, inertes.)';

CREATE TRIGGER trg_check_derniere_op_operations
    BEFORE DELETE ON operations
    FOR EACH ROW EXECUTE FUNCTION public.check_derniere_op_preventive();

CREATE TRIGGER trg_check_derniere_op_gamme_modeles
    BEFORE DELETE ON gamme_modeles
    FOR EACH ROW EXECUTE FUNCTION public.check_derniere_op_preventive();

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.4 validation_statut_initial_di : force le statut initial à 'Ouverte' (id=1)
-- (Le champ s'appelle statut_di_id dans la table — cf 030_demandes_intervention.sql)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validation_statut_initial_di()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.statut_di_id IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Le statut initial d''une DI doit être « Ouverte » (id=1)';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validation_statut_initial_di
    BEFORE INSERT ON demandes_intervention
    FOR EACH ROW EXECUTE FUNCTION public.validation_statut_initial_di();
COMMENT ON FUNCTION public.validation_statut_initial_di() IS 'Force toute nouvelle DI à démarrer en statut Ouverte (id=1).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.5 validation_transitions_di : machine à états DI
-- Statuts (référentiel statuts_di) : 1=Ouverte, 2=Résolue, 3=Réouverte
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validation_transitions_di()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.statut_di_id = NEW.statut_di_id THEN
        RETURN NEW;
    END IF;

    -- Ouverte (1) → Résolue (2) OK
    -- Résolue (2) → Réouverte (3) OK
    -- Réouverte (3) → Résolue (2) OK
    -- Tout le reste interdit
    IF OLD.statut_di_id = 1 AND NEW.statut_di_id NOT IN (2) THEN
        RAISE EXCEPTION 'Transition DI interdite depuis « Ouverte » vers statut %', NEW.statut_di_id;
    END IF;
    IF OLD.statut_di_id = 2 AND NEW.statut_di_id NOT IN (3) THEN
        RAISE EXCEPTION 'Transition DI interdite depuis « Résolue » vers statut %', NEW.statut_di_id;
    END IF;
    IF OLD.statut_di_id = 3 AND NEW.statut_di_id NOT IN (2) THEN
        RAISE EXCEPTION 'Transition DI interdite depuis « Réouverte » vers statut %', NEW.statut_di_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validation_transitions_di
    BEFORE UPDATE OF statut_di_id ON demandes_intervention
    FOR EACH ROW EXECUTE FUNCTION public.validation_transitions_di();
COMMENT ON FUNCTION public.validation_transitions_di() IS 'Machine à états DI : Ouverte (1) -> Résolue (2) <-> Réouverte (3). Tout autre passage refusé.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.6 validation_resolution_di : passage à 'Résolue' exige une description_resolution
-- non vide (DI = signalement curatif autonome, aucun lien OT depuis v0.11).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validation_resolution_di()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.statut_di_id = 2 AND OLD.statut_di_id != 2 THEN
        -- DI = signalement curatif autonome (aucun lien OT) : la résolution
        -- exige une description_resolution non vide.
        IF NEW.description_resolution IS NULL OR length(trim(NEW.description_resolution)) = 0 THEN
            RAISE EXCEPTION 'Résolution impossible : une description_resolution non vide est obligatoire.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validation_resolution_di
    BEFORE UPDATE OF statut_di_id ON demandes_intervention
    FOR EACH ROW EXECUTE FUNCTION public.validation_resolution_di();

-- Peuple resolved_by au passage en Résolue (id=2). BEFORE UPDATE : valeur forcée
-- côté serveur (anti-tricherie), calque exact de set_ot_closed_by sur les OT.
CREATE OR REPLACE FUNCTION public.set_di_resolved_by()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Valeurs forcées serveur au passage en Résolue : QUI (resolved_by) et QUAND
    -- (date_resolution, annoncée obligatoire — commentaire colonne). Écrasement
    -- systématique (comme resolved_by) → une re-résolution après réouverture porte
    -- la date courante, pas l'ancienne.
    NEW.resolved_by     := (SELECT auth.uid());
    NEW.date_resolution := current_date;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_di_set_resolved_by
    BEFORE UPDATE OF statut_di_id ON demandes_intervention
    FOR EACH ROW
    WHEN (NEW.statut_di_id = 2 AND OLD.statut_di_id IS DISTINCT FROM 2)
    EXECUTE FUNCTION public.set_di_resolved_by();
COMMENT ON FUNCTION public.set_di_resolved_by() IS
    'Peuple resolved_by = (SELECT auth.uid()) et date_resolution = current_date au passage statut DI -> Résolue (id=2). Valeurs forcées serveur. Équivalent set_ot_closed_by.';
COMMENT ON FUNCTION public.validation_resolution_di() IS 'Passage à Résolue exige une description_resolution non vide (DI curative autonome, sans lien OT).';

-- Réouverture (Résolue 2 → Réouverte 3) : la DI n'est plus résolue → on efface
-- qui/quand de la résolution (resolved_by NULL « ou rouverte » + date_resolution,
-- cohérente avec « obligatoire si Résolue »). description_resolution CONSERVÉE
-- (historique du diagnostic ; une nouvelle résolution pourra la remplacer).
CREATE OR REPLACE FUNCTION public.reset_di_reouverture()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.resolved_by     := NULL;
    NEW.date_resolution := NULL;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_di_reset_reouverture
    BEFORE UPDATE OF statut_di_id ON demandes_intervention
    FOR EACH ROW
    WHEN (NEW.statut_di_id = 3 AND OLD.statut_di_id IS DISTINCT FROM 3)
    EXECUTE FUNCTION public.reset_di_reouverture();
COMMENT ON FUNCTION public.reset_di_reouverture() IS
    'Réouverture DI (→3) : efface resolved_by + date_resolution (la DI n''est plus résolue). description_resolution conservée.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.7 Machine à états des interventions de chantier (v0.33, calque DI)
-- statuts_chantier : 1 Ouvert, 2 Planifié, 3 En cours, 4 Terminé, 5 Annulé.
-- ─────────────────────────────────────────────────────────────────────────────

-- validation_statut_initial_chantier : force le statut initial à 'Ouvert' (id=1)
CREATE OR REPLACE FUNCTION public.validation_statut_initial_chantier()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.statut_chantier_id IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Le statut initial d''un chantier doit être « Ouvert » (id=1)';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validation_statut_initial_chantier
    BEFORE INSERT ON interventions_chantier
    FOR EACH ROW EXECUTE FUNCTION public.validation_statut_initial_chantier();
COMMENT ON FUNCTION public.validation_statut_initial_chantier() IS 'Force tout nouveau chantier à démarrer en statut Ouvert (id=1).';

-- validation_transitions_chantier : machine à états
-- 1→{2,3,5}, 2→{3,5}, 3→{4,5}, 4→{3}, 5=terminal.
CREATE OR REPLACE FUNCTION public.validation_transitions_chantier()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.statut_chantier_id = NEW.statut_chantier_id THEN
        RETURN NEW;
    END IF;

    IF OLD.statut_chantier_id = 1 AND NEW.statut_chantier_id NOT IN (2, 3, 5) THEN
        RAISE EXCEPTION 'Transition chantier interdite depuis « Ouvert » vers statut %', NEW.statut_chantier_id;
    END IF;
    IF OLD.statut_chantier_id = 2 AND NEW.statut_chantier_id NOT IN (3, 5) THEN
        RAISE EXCEPTION 'Transition chantier interdite depuis « Planifié » vers statut %', NEW.statut_chantier_id;
    END IF;
    IF OLD.statut_chantier_id = 3 AND NEW.statut_chantier_id NOT IN (4, 5) THEN
        RAISE EXCEPTION 'Transition chantier interdite depuis « En cours » vers statut %', NEW.statut_chantier_id;
    END IF;
    IF OLD.statut_chantier_id = 4 AND NEW.statut_chantier_id NOT IN (3) THEN
        RAISE EXCEPTION 'Transition chantier interdite depuis « Terminé » vers statut %', NEW.statut_chantier_id;
    END IF;
    IF OLD.statut_chantier_id = 5 THEN
        RAISE EXCEPTION 'Chantier « Annulé » est un état terminal (aucune transition autorisée)';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validation_transitions_chantier
    BEFORE UPDATE OF statut_chantier_id ON interventions_chantier
    FOR EACH ROW EXECUTE FUNCTION public.validation_transitions_chantier();
COMMENT ON FUNCTION public.validation_transitions_chantier() IS 'Machine à états chantier : 1→2/3/5, 2→3/5, 3→4/5, 4→3 (réouverture), 5 terminal.';

-- validation_chantier_compte_rendu : passage à Terminé (4) exige un compte_rendu
-- non vide (miroir de validation_resolution_di).
CREATE OR REPLACE FUNCTION public.validation_chantier_compte_rendu()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.statut_chantier_id = 4 AND OLD.statut_chantier_id <> 4 THEN
        IF NEW.compte_rendu IS NULL OR length(trim(NEW.compte_rendu)) = 0 THEN
            RAISE EXCEPTION 'Clôture impossible : un compte_rendu non vide est obligatoire au passage « Terminé ».';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validation_chantier_compte_rendu
    BEFORE UPDATE OF statut_chantier_id ON interventions_chantier
    FOR EACH ROW EXECUTE FUNCTION public.validation_chantier_compte_rendu();
COMMENT ON FUNCTION public.validation_chantier_compte_rendu() IS 'Passage à Terminé exige un compte_rendu non vide (miroir validation_resolution_di).';

-- set_chantier_cloture_by : peuple cloture_by + date_fin au passage Terminé (4),
-- les efface à la réouverture (4→3). Valeurs forcées serveur (miroir set_di_resolved_by
-- + reset_di_reouverture).
CREATE OR REPLACE FUNCTION public.set_chantier_cloture_by()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.statut_chantier_id = 4 AND OLD.statut_chantier_id IS DISTINCT FROM 4 THEN
        -- Passage en Terminé : QUI (forcé serveur) + QUAND (date_fin si non fournie).
        NEW.cloture_by := (SELECT auth.uid());
        NEW.date_fin   := COALESCE(NEW.date_fin, current_date);
    ELSIF NEW.statut_chantier_id = 3 AND OLD.statut_chantier_id = 4 THEN
        -- Réouverture (Terminé → En cours) : le chantier n'est plus clos.
        NEW.cloture_by := NULL;
        NEW.date_fin   := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chantier_set_cloture_by
    BEFORE UPDATE OF statut_chantier_id ON interventions_chantier
    FOR EACH ROW EXECUTE FUNCTION public.set_chantier_cloture_by();
COMMENT ON FUNCTION public.set_chantier_cloture_by() IS
    'Peuple cloture_by = (SELECT auth.uid()) + date_fin au passage chantier → Terminé (4) ; les efface à la réouverture (4→3). Valeurs forcées serveur.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. PROTECTION DES ENTITÉS TERMINALES
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.1 protection_ot_terminaux : OT clos/annulé = immuable
-- + bloque DELETE physique (soft-delete uniquement) + id_gamme figé
-- (fusionne protection_ot_terminaux + protection_id_gamme_ot legacy)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protection_ot_terminaux()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- DELETE physique interdit (soft-delete uniquement)
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'DELETE physique interdit sur ordres_travail (soft-delete uniquement)';
    END IF;

    -- gamme_id figé après création (sinon snapshots désynchronisés).
    -- Exception : le passage à NULL est autorisé — c'est le déclassement
    -- via ON DELETE SET NULL à la purge d'une gamme laissant un OT clôturé
    -- conservé (preuve légale survivant via les snapshots figés Pattern 1).
    -- Le garde-fou explicite évite la fragilité de `uuid != NULL` (qui
    -- retourne NULL et laisse passer par accident).
    IF NEW.gamme_id IS NOT NULL
       AND OLD.gamme_id IS DISTINCT FROM NEW.gamme_id THEN
        RAISE EXCEPTION 'gamme_id est figé à la création de l''OT — annulez et recréez si nécessaire';
    END IF;

    -- OT terminal : seule la transition de statut (reouvert/resurrection)
    -- ou le soft-delete (deleted_at) sont autorisés.
    -- F25 audit : assigned_to retiré (n'existe plus). closed_by ne fait pas
    -- partie de la liste car il est peuplé par trigger AU MOMENT de la clôture.
    -- F28 audit : motif_annulation ajouté à la liste — il est posé à la
    -- transition vers annule (via CHECK obligatoire) et doit ensuite être figé
    -- comme preuve légale, au même titre que les snapshots Pattern 1.
    -- v0.31 : TOUS les snapshots Pattern 1 sont désormais dans la liste
    -- (nature_gamme, nom_prestataire, libelle_periodicite, jours_periodicite
    -- manquaient → un OT clôturé restait modifiable sur ces preuves). Aucun bypass
    -- admin : pour corriger un OT terminal, l'admin rouvre comme tout le monde.
    IF OLD.statut IN ('cloture', 'annule')
       AND OLD.statut = NEW.statut
       AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at
       AND (OLD.nom_gamme,       OLD.description_gamme, OLD.date_prevue,
            OLD.date_debut,      OLD.date_cloture,      OLD.commentaires,
            OLD.prestataire_id,  OLD.motif_annulation,
            OLD.nature_gamme,    OLD.nom_prestataire,   OLD.libelle_periodicite, OLD.jours_periodicite)
        IS DISTINCT FROM
           (NEW.nom_gamme,       NEW.description_gamme, NEW.date_prevue,
            NEW.date_debut,      NEW.date_cloture,      NEW.commentaires,
            NEW.prestataire_id,  NEW.motif_annulation,
            NEW.nature_gamme,    NEW.nom_prestataire,   NEW.libelle_periodicite, NEW.jours_periodicite)
    THEN
        RAISE EXCEPTION 'Modification interdite : OT en statut terminal (%). Réouvrez-le d''abord.', OLD.statut;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protection_ot_terminaux
    BEFORE UPDATE OR DELETE ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.protection_ot_terminaux();
COMMENT ON FUNCTION public.protection_ot_terminaux() IS 'Immutabilité NF EN 13306 : OT cloture/annule = lecture seule. Réouverture (cloture → reouvert) ou résurrection (annule → planifie) débloque les modifs ; les snapshots Pattern 1 restent figés. gamme_id figé à vie (site_id figé par protect_ot_site_immutable). DELETE physique interdit (soft-delete uniquement).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.2 protection_operations_ot_terminaux : ops d'un OT terminal = lecture seule
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protection_operations_ot_terminaux()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_ot_statut TEXT;
BEGIN
    SELECT statut INTO v_ot_statut
    FROM public.ordres_travail WHERE id = NEW.ordre_travail_id;

    IF v_ot_statut IN ('cloture', 'annule')
       AND current_setting('app.cascade_annulation', true) IS DISTINCT FROM 'on'
       AND current_setting('app.resurrection_ot', true) IS DISTINCT FROM 'on'
    THEN
        RAISE EXCEPTION 'Modification interdite : opération attachée à un OT en statut terminal (%).', v_ot_statut;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protection_operations_ot_terminaux
    BEFORE UPDATE ON operations_execution
    FOR EACH ROW EXECUTE FUNCTION public.protection_operations_ot_terminaux();
COMMENT ON FUNCTION public.protection_operations_ot_terminaux() IS 'Lecture seule sur ops d''un OT cloture/annule, sauf cascade système (GUC app.cascade_annulation ou app.resurrection_ot).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.3 protection_suppression_operations_terminaux : DELETE bloqué sur OT terminal
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protection_suppression_operations_terminaux()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_ot_statut TEXT;
BEGIN
    SELECT statut INTO v_ot_statut
    FROM public.ordres_travail WHERE id = OLD.ordre_travail_id;

    IF v_ot_statut IN ('cloture', 'annule') THEN
        RAISE EXCEPTION 'Suppression interdite : opération attachée à un OT en statut terminal (%).', v_ot_statut;
    END IF;

    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_protection_suppression_operations_terminaux
    BEFORE DELETE ON operations_execution
    FOR EACH ROW EXECUTE FUNCTION public.protection_suppression_operations_terminaux();
COMMENT ON FUNCTION public.protection_suppression_operations_terminaux() IS 'DELETE bloqué sur ops d''un OT cloture/annule (preuves NF EN 13306).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.4 protection_ajout_operations_terminaux : INSERT bloqué sur OT terminal
-- (sauf via cron de résurrection : GUC app.resurrection_ot = 'on')
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protection_ajout_operations_terminaux()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_ot_statut TEXT;
BEGIN
    SELECT statut INTO v_ot_statut
    FROM public.ordres_travail WHERE id = NEW.ordre_travail_id;

    -- À la création de l'OT, l'orchestrateur AFTER INSERT injecte les ops :
    -- v_ot_statut sera 'planifie' à ce moment-là → OK.
    IF v_ot_statut IN ('cloture', 'annule')
       AND current_setting('app.resurrection_ot', true) IS DISTINCT FROM 'on'
    THEN
        RAISE EXCEPTION 'Ajout d''opération interdit : OT en statut terminal (%).', v_ot_statut;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protection_ajout_operations_terminaux
    BEFORE INSERT ON operations_execution
    FOR EACH ROW EXECUTE FUNCTION public.protection_ajout_operations_terminaux();
COMMENT ON FUNCTION public.protection_ajout_operations_terminaux() IS 'INSERT bloqué sur ops d''un OT cloture/annule, sauf résurrection système (GUC app.resurrection_ot).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.5 cascade_suppression_gamme : refuse DELETE gamme si OT non terminaux
-- (le DELETE soft via deleted_at est OK, hard-delete seul bloqué ici)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cascade_suppression_gamme()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_nb_ot_actifs INT;
BEGIN
    SELECT COUNT(*) INTO v_nb_ot_actifs
    FROM public.ordres_travail
    WHERE gamme_id = OLD.id
      AND statut NOT IN ('cloture', 'annule');

    IF v_nb_ot_actifs > 0 THEN
        RAISE EXCEPTION 'Suppression impossible : % OT actifs existent pour cette gamme.', v_nb_ot_actifs
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cascade_suppression_gamme
    BEFORE DELETE ON gammes
    FOR EACH ROW EXECUTE FUNCTION public.cascade_suppression_gamme();
COMMENT ON FUNCTION public.cascade_suppression_gamme() IS 'Hard-DELETE gamme bloqué si OT non terminaux (le soft-delete via deleted_at reste autorisé).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.6 protection_suppression_prestataire_contrats : refuse DELETE prestataire
-- si contrats actifs (non archivés et non résiliés)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protection_suppression_prestataire_contrats()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_nb_contrats INT;
BEGIN
    SELECT COUNT(*) INTO v_nb_contrats
    FROM public.contrats
    WHERE prestataire_id = OLD.id
      AND est_archive = false
      AND date_resiliation IS NULL;

    IF v_nb_contrats > 0 THEN
        RAISE EXCEPTION 'Suppression impossible : % contrats actifs sont rattachés à ce prestataire.', v_nb_contrats
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_protection_suppression_prestataire_contrats
    BEFORE DELETE ON prestataires
    FOR EACH ROW EXECUTE FUNCTION public.protection_suppression_prestataire_contrats();
COMMENT ON FUNCTION public.protection_suppression_prestataire_contrats() IS 'DELETE prestataire bloqué tant qu''au moins un contrat actif (non archivé, non résilié) lui est rattaché.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. COHÉRENCE TYPES & SEUILS (FACTORISÉE)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.1 check_coherence_type_operation : 1 fonction, 4 triggers
-- Le type d'opération (référentiel types_operations) impose des contraintes
-- sur les colonnes seuil_minimum / seuil_maximum / unite_id.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_coherence_type_operation()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_necessite_seuils BOOLEAN;
BEGIN
    SELECT necessite_seuils INTO v_necessite_seuils
    FROM public.types_operations WHERE id = NEW.type_operation_id;

    IF v_necessite_seuils IS NULL THEN
        RAISE EXCEPTION 'type_operation_id % invalide', NEW.type_operation_id;
    END IF;

    -- Type Mesure (necessite_seuils=true) : au moins un seuil + unité requise
    IF v_necessite_seuils THEN
        IF NEW.seuil_minimum IS NULL AND NEW.seuil_maximum IS NULL THEN
            RAISE EXCEPTION 'Opération de type Mesure : au moins un seuil (min ou max) est requis';
        END IF;
        IF NEW.unite_id IS NULL THEN
            RAISE EXCEPTION 'Opération de type Mesure : l''unité est obligatoire';
        END IF;
        IF NEW.seuil_minimum IS NOT NULL AND NEW.seuil_maximum IS NOT NULL
           AND NEW.seuil_minimum > NEW.seuil_maximum THEN
            RAISE EXCEPTION 'seuil_minimum (%) > seuil_maximum (%)', NEW.seuil_minimum, NEW.seuil_maximum;
        END IF;
    ELSE
        -- Type non-Mesure : pas de seuils ni d'unité
        IF NEW.seuil_minimum IS NOT NULL OR NEW.seuil_maximum IS NOT NULL THEN
            RAISE EXCEPTION 'Opération non-Mesure : les seuils doivent être NULL';
        END IF;
        IF NEW.unite_id IS NOT NULL THEN
            RAISE EXCEPTION 'Opération non-Mesure : l''unité doit être NULL';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_coherence_type_operation() IS
    'Trigger factorisé : valide la cohérence type_operation ↔ seuils/unité (4 triggers déclaratifs).';

-- 4 triggers déclaratifs (1 par couple {table, opération})
CREATE TRIGGER trg_coherence_operations_insert
    BEFORE INSERT ON operations
    FOR EACH ROW EXECUTE FUNCTION public.check_coherence_type_operation();

CREATE TRIGGER trg_coherence_operations_update
    BEFORE UPDATE ON operations
    FOR EACH ROW EXECUTE FUNCTION public.check_coherence_type_operation();

CREATE TRIGGER trg_coherence_modeles_items_insert
    BEFORE INSERT ON modeles_operations_items
    FOR EACH ROW EXECUTE FUNCTION public.check_coherence_type_operation();

CREATE TRIGGER trg_coherence_modeles_items_update
    BEFORE UPDATE ON modeles_operations_items
    FOR EACH ROW EXECUTE FUNCTION public.check_coherence_type_operation();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VALIDATION SOURCES OPÉRATIONS (gammes types / modèles)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.1 validation_suppression_operation_specifique : DELETE op spécifique
-- bloqué si une operations_execution la référence (snapshot OT préserve l'historique)
-- → on autorise DELETE même si des ops_exec existent (snapshot indépendant).
-- Mais on bloque si la gamme parente a un OT actif planifie/en_cours non encore
-- réinjecté (résurrection à venir).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validation_suppression_operation_specifique()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_nb_ot_actifs INT;
BEGIN
    SELECT COUNT(*) INTO v_nb_ot_actifs
    FROM public.ordres_travail
    WHERE gamme_id = OLD.gamme_id
      AND statut IN ('planifie', 'en_cours', 'reouvert');

    IF v_nb_ot_actifs > 0 THEN
        RAISE EXCEPTION 'Suppression interdite : % OT actifs (planifie/en_cours/reouvert) utilisent cette gamme. Terminez-les d''abord.', v_nb_ot_actifs
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_validation_suppression_operation_specifique
    BEFORE DELETE ON operations
    FOR EACH ROW EXECUTE FUNCTION public.validation_suppression_operation_specifique();
COMMENT ON FUNCTION public.validation_suppression_operation_specifique() IS 'DELETE op spécifique bloqué si OT actifs (planifie/en_cours/reouvert) sur la gamme parente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.2 validation_suppression_association_gamme_type : dissociation gamme↔modèle
-- bloquée si OT actifs sur cette gamme
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validation_suppression_association_gamme_type()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_nb_ot_actifs INT;
BEGIN
    SELECT COUNT(*) INTO v_nb_ot_actifs
    FROM public.ordres_travail
    WHERE gamme_id = OLD.gamme_id
      AND statut IN ('planifie', 'en_cours', 'reouvert');

    IF v_nb_ot_actifs > 0 THEN
        RAISE EXCEPTION 'Dissociation interdite : % OT actifs utilisent cette gamme.', v_nb_ot_actifs
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_validation_suppression_association_gamme_type
    BEFORE DELETE ON gamme_modeles
    FOR EACH ROW EXECUTE FUNCTION public.validation_suppression_association_gamme_type();
COMMENT ON FUNCTION public.validation_suppression_association_gamme_type() IS 'Dissociation gamme<->modèle bloquée si OT actifs sur la gamme.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.3 protection_dernier_item_gamme_type : interdit de vider un modèle utilisé
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protection_dernier_item_gamme_type()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_nb_items_restants INT;
    v_modele_utilise BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO v_nb_items_restants
    FROM public.modeles_operations_items
    WHERE modele_operation_id = OLD.modele_operation_id
      AND id != OLD.id;

    -- Si on retire le dernier item, vérifier que le modèle n'est pas utilisé
    IF v_nb_items_restants = 0 THEN
        SELECT EXISTS (
            SELECT 1 FROM public.gamme_modeles
            WHERE modele_operation_id = OLD.modele_operation_id
        ) INTO v_modele_utilise;

        IF v_modele_utilise THEN
            RAISE EXCEPTION 'Suppression interdite : ce serait le dernier item du modèle, mais il est utilisé par des gammes.'
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;

    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_protection_dernier_item_gamme_type
    BEFORE DELETE ON modeles_operations_items
    FOR EACH ROW EXECUTE FUNCTION public.protection_dernier_item_gamme_type();
COMMENT ON FUNCTION public.protection_dernier_item_gamme_type() IS 'Empêche de vider un modèle d''opérations encore référencé par des gammes (sinon gamme_modeles pointe sur du vide).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.4 validation_suppression_gamme_type_globale : DELETE modèle bloqué si lié
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validation_suppression_gamme_type_globale()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_nb_gammes_liees INT;
BEGIN
    SELECT COUNT(*) INTO v_nb_gammes_liees
    FROM public.gamme_modeles
    WHERE modele_operation_id = OLD.id;

    IF v_nb_gammes_liees > 0 THEN
        RAISE EXCEPTION 'Suppression interdite : % gammes sont liées à ce modèle. Dissociez-les d''abord.', v_nb_gammes_liees
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_validation_suppression_gamme_type_globale
    BEFORE DELETE ON modeles_operations
    FOR EACH ROW EXECUTE FUNCTION public.validation_suppression_gamme_type_globale();
COMMENT ON FUNCTION public.validation_suppression_gamme_type_globale() IS 'DELETE modèle bloqué tant qu''une gamme y est rattachée (forcer la dissociation explicite).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.5 validation_gamme_type_non_vide : impossible de rattacher modèle vide
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validation_gamme_type_non_vide()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_nb_items INT;
BEGIN
    SELECT COUNT(*) INTO v_nb_items
    FROM public.modeles_operations_items
    WHERE modele_operation_id = NEW.modele_operation_id;

    IF v_nb_items = 0 THEN
        RAISE EXCEPTION 'Rattachement interdit : le modèle d''opérations % est vide. Ajoutez-y des items d''abord.', NEW.modele_operation_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validation_gamme_type_non_vide
    BEFORE INSERT ON gamme_modeles
    FOR EACH ROW EXECUTE FUNCTION public.validation_gamme_type_non_vide();
COMMENT ON FUNCTION public.validation_gamme_type_non_vide() IS 'Bloque le rattachement d''un modèle vide à une gamme (un modèle sans item ne génère aucune opération).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. PROTECTIONS DIVERSES
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.1 protection_changement_modele : bloque UPDATE categorie_id sur equipements
-- (la catégorie joue le rôle de "modèle technique" pour un équipement)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protection_changement_modele()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- On fige le "modèle technique" : interdit de faire passer un équipement
    -- d'une catégorie A à une catégorie B. MAIS le DÉCLASSEMENT (catégorie →
    -- NULL) reste autorisé — c'est ce que fait le ON DELETE SET NULL quand la
    -- catégorie est purgée, et c'est une action légitime (sortir du rangement).
    IF OLD.categorie_id IS DISTINCT FROM NEW.categorie_id
       AND OLD.categorie_id IS NOT NULL
       AND NEW.categorie_id IS NOT NULL THEN
        RAISE EXCEPTION 'Changement de catégorie (modèle technique) interdit après création de l''équipement. Seul le déclassement (catégorie → aucune) est permis.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protection_changement_modele
    BEFORE UPDATE OF categorie_id ON equipements
    FOR EACH ROW EXECUTE FUNCTION public.protection_changement_modele();
COMMENT ON FUNCTION public.protection_changement_modele() IS 'Catégorie d''un équipement figée après création (joue le rôle de modèle technique : changer la catégorie reviendrait à changer l''identité de l''actif).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.2 protection_suppression_champ : refuse DELETE d'un champ specifications
-- utilisé. Ici on garde une fonction générique qui sera attachée à champs_modele
-- si cette table est créée plus tard. Comme les specifications sont JSONB libre,
-- on n'attache PAS de trigger en V1 mais on prépare la fonction.
-- (Le legacy avait une table champs_modele à colonnes EAV → supprimée au profit
--  de specifications JSONB sur equipements. Ce trigger est donc inactif en V1.)
-- ─────────────────────────────────────────────────────────────────────────────
-- (Pas de trigger attaché : la table champs_modele n'existe plus.
--  Si elle est réintroduite en V2, ajouter ici le trigger correspondant.)


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  051_triggers_workflow_ot.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 051 — Triggers métier cœur OT (workflow cycle de vie)
-- Décompose l'énorme trigger legacy creation_ot_complet en 3 fonctions claires
-- + 1 trigger orchestrateur, plus 4 autres triggers métier.
-- Fonctions / triggers :
--   1. snapshot_ot_from_gamme(p_ot_id)       — fige les descripteurs gamme
--   2. resolve_prestataire_for_ot(p_ot_id)   — résout prestataire effectif
--   3. generate_operations_execution(p_ot_id) — crée les ops à faire
--   4. creation_ot_orchestrator()             — trigger AFTER INSERT OT
--   5. gestion_statut_ot()                    — bascule auto statut OT depuis ops
--   6. cascade_annulation_ot()                — annule les ops à l'annulation OT
--   7. reinitialisation_resurrection()        — refresh OT ressuscité
--   8. nettoyage_dates_coherentes()           — force cohérence dates ↔ statut
--   9. auto_calcul_conformite()               — calcule est_conforme depuis valeurs
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. snapshot_ot_from_gamme : fige les descripteurs gamme/équipement/localisation
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.snapshot_ot_from_gamme(p_ot_id UUID)
RETURNS void LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE public.ordres_travail ot
    SET
        nom_gamme           = g.nom,
        description_gamme   = g.description,
        nature_gamme        = g.nature,
        nom_categorie       = c.nom,
        libelle_periodicite = p.libelle,
        jours_periodicite   = p.jours_periodicite,
        tolerance_jours     = p.tolerance_jours,
        image_path          = g.image_path,
        -- nom_equipement : si la gamme cible un seul équipement, snapshot ; sinon NULL.
        -- (Sous-SELECT scalaire : on garde 1 ligne max via LIMIT 1, et on filtre
        --  le cas multi-équipements par CASE/COUNT pour ne pas planter "more than
        --  one row returned by a subquery used as an expression").
        nom_equipement = CASE
            WHEN (SELECT COUNT(*) FROM public.gammes_equipements WHERE gamme_id = g.id) = 1
            THEN (
                SELECT e.nom
                FROM public.gammes_equipements ge
                JOIN public.equipements e ON e.id = ge.equipement_id
                WHERE ge.gamme_id = g.id
                LIMIT 1
            )
            ELSE NULL
        END,
        -- nom_localisation : chemin court du local du 1er équipement (si unique)
        nom_localisation = (
            SELECT v.chemin_court
            FROM public.gammes_equipements ge
            JOIN public.equipements e ON e.id = ge.equipement_id
            JOIN public.v_locaux_chemin v ON v.local_id = e.local_id
            WHERE ge.gamme_id = g.id
            LIMIT 1
        )
    FROM public.gammes g
    LEFT JOIN public.categories  c ON c.id = g.categorie_id
    LEFT JOIN public.periodicites p ON p.id = g.periodicite_id
    WHERE ot.id = p_ot_id
      AND ot.gamme_id = g.id;
END;
$$;

COMMENT ON FUNCTION public.snapshot_ot_from_gamme(UUID) IS
    'Fige les descripteurs gamme/catégorie/périodicité/équipement/localisation sur un OT (Option B).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. resolve_prestataire_for_ot : résout le prestataire effectif via contrat
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_prestataire_for_ot(p_ot_id UUID)
RETURNS void LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_ot                    public.ordres_travail%ROWTYPE;
    v_prestataire_demande   UUID;
    v_prestataire_effectif  UUID;
BEGIN
    SELECT * INTO v_ot FROM public.ordres_travail WHERE id = p_ot_id;

    -- Prestataire demandé : celui spécifié à l'INSERT (déjà résolu via gamme dans
    -- ordres_travail.prestataire_id puisque NOT NULL)
    v_prestataire_demande := v_ot.prestataire_id;

    -- Délègue toute la logique métier à resolve_prestataire_effectif()
    -- (créée par Agent 3 — schéma 027_resolve_prestataire.sql)
    v_prestataire_effectif := public.resolve_prestataire_effectif(
        v_ot.gamme_id,
        v_prestataire_demande,
        v_ot.date_prevue
    );

    -- Trace dans commentaires si fallback sur interne
    IF v_prestataire_effectif <> v_prestataire_demande THEN
        UPDATE public.ordres_travail
        SET commentaires = COALESCE(commentaires, '')
            || ' [Prestataire basculé sur interne : aucun contrat valide trouvé]'
        WHERE id = p_ot_id;
    END IF;

    UPDATE public.ordres_travail
    SET prestataire_id  = v_prestataire_effectif,
        nom_prestataire = (SELECT libelle FROM public.prestataires WHERE id = v_prestataire_effectif)
    WHERE id = p_ot_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_prestataire_for_ot(UUID) IS
    'Wrapper trigger : appelle resolve_prestataire_effectif() (Agent 3) et applique le snapshot prestataire sur l''OT.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. generate_operations_execution : crée les ops_exec depuis les 2 sources
-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER nécessaire — les rôles autorisés à créer un OT
-- (manager, technicien) n'ont PAS de policy INSERT sur operations_execution
-- ("INSERT/DELETE manuels interdits"). Sans SECURITY DEFINER, le trigger
-- d'orchestration creation_ot_orchestrator échouerait silencieusement à
-- l'INSERT cascadé. search_path = '' + qualifs public.*.
CREATE OR REPLACE FUNCTION public.generate_operations_execution(p_ot_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_gamme_id   UUID;
BEGIN
    SELECT gamme_id INTO v_gamme_id
    FROM public.ordres_travail WHERE id = p_ot_id;

    -- Source 1 : opérations spécifiques (source_type = 1)
    INSERT INTO public.operations_execution (
        ordre_travail_id, source_type, source_id, ordre,
        nom, description, type_operation, seuil_minimum, seuil_maximum,
        unite_nom, unite_symbole, statut
    )
    SELECT
        p_ot_id, 1, o.id, COALESCE(o.ordre, 0),
        o.nom, o.description, t.libelle, o.seuil_minimum, o.seuil_maximum,
        u.nom, u.symbole, 'en_attente'
    FROM public.operations o
    JOIN public.types_operations t ON t.id = o.type_operation_id
    LEFT JOIN public.unites u      ON u.id = o.unite_id
    WHERE o.gamme_id = v_gamme_id;

    -- Source 2 : items issus des modèles d'opérations attachés (source_type = 2)
    INSERT INTO public.operations_execution (
        ordre_travail_id, source_type, source_id, ordre,
        nom, description, type_operation, seuil_minimum, seuil_maximum,
        unite_nom, unite_symbole, statut
    )
    SELECT
        p_ot_id, 2, moi.id, COALESCE(moi.ordre, 0),
        moi.nom, moi.description, t.libelle, moi.seuil_minimum, moi.seuil_maximum,
        u.nom, u.symbole, 'en_attente'
    FROM public.gamme_modeles gm
    JOIN public.modeles_operations_items moi ON moi.modele_operation_id = gm.modele_operation_id
    JOIN public.types_operations t           ON t.id = moi.type_operation_id
    LEFT JOIN public.unites u                ON u.id = moi.unite_id
    WHERE gm.gamme_id = v_gamme_id;
END;
$$;

COMMENT ON FUNCTION public.generate_operations_execution(UUID) IS
    'Crée les operations_execution figées d''un OT depuis ses 2 sources (operations + modeles_operations_items).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. creation_ot_orchestrator : trigger AFTER INSERT ON ordres_travail
-- ═══════════════════════════════════════════════════════════════════════════
-- F14 (audit sécu) : SECURITY DEFINER (cohérent avec generate_operations_execution).
CREATE OR REPLACE FUNCTION public.creation_ot_orchestrator()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Anti-doublon : pas d'autre OT actif pour la même gamme
    IF EXISTS (
        SELECT 1 FROM public.ordres_travail
        WHERE gamme_id = NEW.gamme_id
          AND id != NEW.id
          AND statut NOT IN ('cloture', 'annule')
          AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Un OT actif (planifie/en_cours/reouvert) existe déjà pour la gamme %.', NEW.gamme_id;
    END IF;

    -- Pattern 3 GUC (perf-patterns). snapshot_ot_from_gamme et
    -- resolve_prestataire_for_ot font des UPDATE sur les snapshots de l'OT
    -- (TEMP → vraies valeurs). Sans cette GUC, le trigger protect_ot_immutable_fields
    -- bloque ces UPDATE → tout INSERT d'OT par un non-admin échoue
    -- (amorçage 1er OT, OT correctif manuel). On pose la GUC pour signaler que
    -- l'écriture des snapshots est légitime (orchestration système).
    PERFORM set_config('app.system_ot_generation', 'on', true);

    PERFORM public.snapshot_ot_from_gamme(NEW.id);
    PERFORM public.resolve_prestataire_for_ot(NEW.id);
    PERFORM public.generate_operations_execution(NEW.id);

    PERFORM set_config('app.system_ot_generation', 'off', true);

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.creation_ot_orchestrator() IS
    'Trigger AFTER INSERT ON ordres_travail : appelle les 3 fonctions de création (snapshot, prestataire, ops). F50 : pose la GUC app.system_ot_generation pour autoriser l''écriture des snapshots.';

CREATE TRIGGER trg_creation_ot_orchestrator
    AFTER INSERT ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.creation_ot_orchestrator();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. gestion_statut_ot : bascule auto OT depuis l'évolution des ops
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.gestion_statut_ot()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_a_des_demarrees       BOOLEAN;
    v_toutes_terminales     BOOLEAN;
    v_au_moins_une_terminee BOOLEAN;
BEGIN
    -- 1) Pose date_debut à la 1ère op démarrée
    UPDATE public.ordres_travail
    SET date_debut = COALESCE(date_debut, NEW.date_execution, now())
    WHERE id = NEW.ordre_travail_id
      AND date_debut IS NULL
      AND NEW.statut IN ('en_cours', 'terminee');

    -- État global des ops du même OT
    SELECT
        EXISTS (SELECT 1 FROM public.operations_execution
                WHERE ordre_travail_id = NEW.ordre_travail_id
                  AND statut IN ('en_cours', 'terminee')),
        NOT EXISTS (SELECT 1 FROM public.operations_execution
                    WHERE ordre_travail_id = NEW.ordre_travail_id
                      AND statut IN ('en_attente', 'en_cours')),
        EXISTS (SELECT 1 FROM public.operations_execution
                WHERE ordre_travail_id = NEW.ordre_travail_id
                  AND statut = 'terminee')
    INTO v_a_des_demarrees, v_toutes_terminales, v_au_moins_une_terminee;

    -- 2) Passage en_cours
    IF v_a_des_demarrees THEN
        UPDATE public.ordres_travail SET statut = 'en_cours'
        WHERE id = NEW.ordre_travail_id
          AND statut IN ('planifie', 'reouvert');
    END IF;

    -- 3) Retour à planifie si plus aucune op démarrée
    IF NOT v_a_des_demarrees THEN
        UPDATE public.ordres_travail SET statut = 'planifie'
        WHERE id = NEW.ordre_travail_id
          AND statut = 'en_cours';
    END IF;

    -- 4) Auto-clôture si toutes les ops sont en statut terminal
    IF v_toutes_terminales THEN
        UPDATE public.ordres_travail
        SET statut = CASE
                       WHEN v_au_moins_une_terminee THEN 'cloture'
                       ELSE 'annule'
                     END,
            date_cloture = COALESCE(
                date_cloture,
                (SELECT MAX(date_execution) FROM public.operations_execution
                 WHERE ordre_travail_id = NEW.ordre_travail_id
                   AND date_execution IS NOT NULL),
                now()
            ),
            -- Auto-annulation (toutes ops terminales, aucune 'terminee' → toutes
            -- 'non_applicable') : poser un motif système, sinon le CHECK
            -- motif_annulation_oblig_si_annule rejette l'UPDATE et bloque l'user.
            motif_annulation = CASE
                WHEN NOT v_au_moins_une_terminee
                THEN COALESCE(motif_annulation,
                     'Annulation automatique : toutes les opérations ont été marquées « non applicable ».')
                ELSE motif_annulation
            END
        WHERE id = NEW.ordre_travail_id
          AND statut IN ('planifie', 'en_cours', 'reouvert')
          AND date_cloture IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gestion_statut_ot
    AFTER UPDATE OF statut ON operations_execution
    FOR EACH ROW
    WHEN (OLD.statut IS DISTINCT FROM NEW.statut)
    EXECUTE FUNCTION public.gestion_statut_ot();

COMMENT ON FUNCTION public.gestion_statut_ot() IS
    'Bascule automatique du statut OT selon l''évolution de ses opérations (planifie ↔ en_cours, clôture auto).';

-- ─────────────────────────────────────────────────────────────────────────────
-- v0.12 — Index de durcissement : FK created_by/uploaded_by + liaison prestataire
-- (perf des filtres RLS « created_by = (SELECT auth.uid()) » et intégrité FK vers users).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_ot_created_by               ON ordres_travail(created_by);
CREATE INDEX idx_di_created_by               ON demandes_intervention(created_by);
CREATE INDEX idx_gammes_created_by           ON gammes(created_by);
CREATE INDEX idx_observations_created_by     ON observations(created_by);
CREATE INDEX idx_modeles_di_created_by       ON modeles_di(created_by);
CREATE INDEX idx_modeles_equipements_created_by ON modeles_equipements(created_by);
CREATE INDEX idx_documents_uploaded_by       ON documents(uploaded_by);
CREATE INDEX idx_prestataires_sites_prestataire ON prestataires_sites(prestataire_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. cascade_annulation_ot : annule les ops en attente/en_cours quand OT annulé
-- (utilise GUC app.cascade_annulation pour bypasser protection_statut_annulee_manuel)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cascade_annulation_ot()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.statut = 'annule' AND OLD.statut != 'annule' THEN
        PERFORM set_config('app.cascade_annulation', 'on', true);
        UPDATE public.operations_execution
        SET statut = 'annulee'
        WHERE ordre_travail_id = NEW.id
          AND statut IN ('en_attente', 'en_cours');
        PERFORM set_config('app.cascade_annulation', 'off', true);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cascade_annulation_ot
    AFTER UPDATE OF statut ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.cascade_annulation_ot();

COMMENT ON FUNCTION public.cascade_annulation_ot() IS
    'Quand un OT passe en annule, bascule les ops actives en annulee (set_config app.cascade_annulation).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. reinitialisation_resurrection : OT annule → planifie (refresh complet)
-- ═══════════════════════════════════════════════════════════════════════════
-- F14 (audit sécu) : SECURITY DEFINER + search_path = '' (cohérent avec
-- generate_operations_execution + creation_ot_orchestrator).
CREATE OR REPLACE FUNCTION public.reinitialisation_resurrection()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF OLD.statut = 'annule' AND NEW.statut = 'planifie' THEN
        -- GUC pour bypasser protection_operations_ot_terminaux + protection_ajout
        PERFORM set_config('app.resurrection_ot', 'on', true);
        -- F51 (audit 5e passe) : GUC distincte pour bypasser protect_ot_immutable_fields.
        -- La résurrection rafraîchit les snapshots (la gamme a pu changer entre
        -- annulation et résurrection) — ces UPDATE sont légitimes mais protégés.
        PERFORM set_config('app.system_ot_generation', 'on', true);

        -- Reset des opérations (sauf celles explicitement non_applicable)
        UPDATE public.operations_execution
        SET statut         = 'en_attente',
            valeur_mesuree = NULL,
            est_conforme   = NULL,
            date_execution = NULL,
            executed_by    = NULL,
            commentaires   = NULL
        WHERE ordre_travail_id = NEW.id
          AND statut != 'non_applicable';

        -- Refresh des snapshots (la gamme a pu changer entre annulation et résurrection)
        PERFORM public.snapshot_ot_from_gamme(NEW.id);
        PERFORM public.resolve_prestataire_for_ot(NEW.id);

        -- Supprimer les ops dont la source n'existe plus
        DELETE FROM public.operations_execution opex
        WHERE opex.ordre_travail_id = NEW.id
          AND (
              (opex.source_type = 1 AND NOT EXISTS (
                  SELECT 1 FROM public.operations o WHERE o.id = opex.source_id AND o.gamme_id = NEW.gamme_id))
              OR
              (opex.source_type = 2 AND NOT EXISTS (
                  SELECT 1 FROM public.modeles_operations_items moi
                  JOIN public.gamme_modeles gm ON gm.modele_operation_id = moi.modele_operation_id
                  WHERE moi.id = opex.source_id AND gm.gamme_id = NEW.gamme_id))
          );

        -- Réinjecter les ops manquantes (source 1)
        INSERT INTO public.operations_execution (
            ordre_travail_id, source_type, source_id, ordre,
            nom, description, type_operation, seuil_minimum, seuil_maximum,
            unite_nom, unite_symbole, statut
        )
        SELECT NEW.id, 1, o.id, COALESCE(o.ordre, 0),
               o.nom, o.description, t.libelle, o.seuil_minimum, o.seuil_maximum,
               u.nom, u.symbole, 'en_attente'
        FROM public.operations o
        JOIN public.types_operations t ON t.id = o.type_operation_id
        LEFT JOIN public.unites u      ON u.id = o.unite_id
        WHERE o.gamme_id = NEW.gamme_id
          AND NOT EXISTS (
              SELECT 1 FROM public.operations_execution
              WHERE ordre_travail_id = NEW.id AND source_type = 1 AND source_id = o.id
          );

        -- Réinjecter les ops manquantes (source 2)
        INSERT INTO public.operations_execution (
            ordre_travail_id, source_type, source_id, ordre,
            nom, description, type_operation, seuil_minimum, seuil_maximum,
            unite_nom, unite_symbole, statut
        )
        SELECT NEW.id, 2, moi.id, COALESCE(moi.ordre, 0),
               moi.nom, moi.description, t.libelle, moi.seuil_minimum, moi.seuil_maximum,
               u.nom, u.symbole, 'en_attente'
        FROM public.gamme_modeles gm
        JOIN public.modeles_operations_items moi ON moi.modele_operation_id = gm.modele_operation_id
        JOIN public.types_operations t           ON t.id = moi.type_operation_id
        LEFT JOIN public.unites u                ON u.id = moi.unite_id
        WHERE gm.gamme_id = NEW.gamme_id
          AND NOT EXISTS (
              SELECT 1 FROM public.operations_execution
              WHERE ordre_travail_id = NEW.id AND source_type = 2 AND source_id = moi.id
          );

        PERFORM set_config('app.resurrection_ot', 'off', true);
        PERFORM set_config('app.system_ot_generation', 'off', true);  -- F51
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reinitialisation_resurrection
    AFTER UPDATE OF statut ON ordres_travail
    FOR EACH ROW
    WHEN (OLD.statut = 'annule' AND NEW.statut = 'planifie')
    EXECUTE FUNCTION public.reinitialisation_resurrection();

COMMENT ON FUNCTION public.reinitialisation_resurrection() IS
    'Résurrection d''un OT (annule → planifie) : reset ops + refresh snapshots + ré-injection des ops manquantes.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. nettoyage_dates_coherentes : force cohérence dates ↔ statut
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.nettoyage_dates_coherentes()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Retour à 'planifie' depuis en_cours → on conserve date_debut (preuve métier)
    --   (rien à faire)

    -- Annulation : toute transition vers 'annule' (depuis planifie / en_cours /
    -- reouvert — cf machine à états) doit horodater la clôture, sinon le CHECK
    -- statut_terminal_a_date_cloture rejette l'UPDATE direct du statut.
    IF NEW.statut = 'annule' THEN
        -- Annulation depuis 'planifie' alors qu'aucune op n'a démarré → ne pas
        -- conserver une date_debut fantôme.
        IF OLD.statut = 'planifie' AND NOT EXISTS (
            SELECT 1 FROM public.operations_execution
            WHERE ordre_travail_id = NEW.id AND date_execution IS NOT NULL
        ) THEN
            NEW.date_debut := NULL;
        END IF;
        NEW.date_cloture := COALESCE(NEW.date_cloture, now());
    END IF;

    -- Clôture manuelle sans date_cloture → la pose à now()
    IF NEW.statut = 'cloture' AND NEW.date_cloture IS NULL THEN
        NEW.date_cloture := COALESCE(
            (SELECT MAX(date_execution) FROM public.operations_execution
             WHERE ordre_travail_id = NEW.id),
            now()
        );
    END IF;

    -- Réouverture : on efface date_cloture
    IF NEW.statut = 'reouvert' AND OLD.statut = 'cloture' THEN
        NEW.date_cloture := NULL;
    END IF;

    -- Résurrection : on efface date_debut ET date_cloture
    IF NEW.statut = 'planifie' AND OLD.statut = 'annule' THEN
        NEW.date_debut   := NULL;
        NEW.date_cloture := NULL;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nettoyage_dates_coherentes
    BEFORE UPDATE OF statut ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.nettoyage_dates_coherentes();

COMMENT ON FUNCTION public.nettoyage_dates_coherentes() IS
    'Force cohérence date_debut/date_cloture selon les transitions de statut OT.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8bis. reouvrir_ot — RPC standard pour rouvrir un OT clôturé (F28 audit)
--
-- Un OT clôturé est une preuve légale NF EN 13306. La réouverture est rare
-- (correction d'erreur de saisie, complément d'information, retour de
-- prestataire avec nouvelle information). La RPC encapsule le pattern :
--   - validation du motif (non vide, obligatoire)
--   - vérification du statut courant (cloture uniquement)
--   - UPDATE statut → reouvert + motif_reouverture renseigné
--
-- SECURITY INVOKER : la RLS gère naturellement l'autorisation des 3 rôles
-- (admin via ot_admin_all, manager via ot_manager_update, technicien via
-- ot_technicien_all) — chacun limité à ses sites. Le trigger log_audit()
-- AFTER UPDATE existant capte la modification dans audit_log.
--
-- Anti-contournement : un UPDATE direct sans motif_reouverture est rejeté par
-- le CHECK motif_reouverture_oblig_si_reouvert (CREATE TABLE ordres_travail).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reouvrir_ot(
    p_ot_id UUID,
    p_motif TEXT
)
RETURNS public.ordres_travail
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_ot public.ordres_travail;
BEGIN
    -- Validation motif (en plus du CHECK colonne, pour message clair)
    IF p_motif IS NULL OR length(trim(p_motif)) = 0 THEN
        RAISE EXCEPTION 'Motif de réouverture obligatoire'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Lecture filtrée par RLS : si l'utilisateur n'a pas accès au site
    -- (ou n'a pas le bon rôle), aucune ligne ne remonte. On distingue ce cas
    -- de l'OT inexistant via un message neutre (pas de leak de l'existence).
    SELECT * INTO v_ot
    FROM public.ordres_travail
    WHERE id = p_ot_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'OT introuvable ou hors de votre périmètre';
    END IF;

    IF v_ot.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cet ordre de travail a été supprimé : réouverture impossible.';
    END IF;

    IF v_ot.statut <> 'cloture' THEN
        RAISE EXCEPTION 'Seul un OT clôturé peut être rouvert (statut actuel : %)',
            v_ot.statut;
    END IF;

    -- v0.25 : anti-doublon (même règle qu'à la création). Refuser la réouverture
    -- si un autre OT actif existe déjà sur la gamme — typiquement le successeur
    -- préventif généré à la clôture. Sinon on se retrouverait avec 2 OT actifs
    -- sur la même gamme, ce que la création interdit pourtant strictement.
    IF v_ot.gamme_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.ordres_travail
        WHERE gamme_id = v_ot.gamme_id
          AND id <> v_ot.id
          AND statut NOT IN ('cloture', 'annule')
          AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Réouverture impossible : un OT actif existe déjà pour cette gamme. Traitez-le (ou supprimez-le) avant de rouvrir cet OT.'
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- UPDATE : la RLS valide l'autorisation (USING + WITH CHECK),
    -- protection_ot_terminaux autorise la transition cloture → reouvert,
    -- nettoyage_dates_coherentes efface date_cloture, le trigger d'audit
    -- log_audit() AFTER UPDATE trace l'opération.
    UPDATE public.ordres_travail
    SET statut            = 'reouvert',
        motif_reouverture = trim(p_motif)
    WHERE id = p_ot_id
    RETURNING * INTO v_ot;

    -- v0.31 : un rôle en LECTURE SEULE sur l'OT (lecteur, demandeur, ou
    -- manager/technicien hors de son périmètre) voit l'OT via la policy SELECT
    -- mais n'a pas de policy UPDATE → l'UPDATE ci-dessus matche 0 ligne et v_ot
    -- est réinitialisé à NULL (RETURNING * INTO sans ligne). On refuse alors
    -- explicitement au lieu de renvoyer un faux succès muet (OT vide).
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Réouverture non autorisée : vous avez un accès en lecture seule à cet OT.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN v_ot;
END;
$$;

COMMENT ON FUNCTION public.reouvrir_ot(UUID, TEXT) IS
    'F28 (audit) : RPC standard pour rouvrir un OT clôturé. SECURITY INVOKER — la RLS gère l''autorisation (admin / manager(sites) / tech(sites)). Force le motif (CHECK motif_reouverture_oblig_si_reouvert). Le trigger log_audit() AFTER UPDATE trace l''opération dans audit_log.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. auto_calcul_conformite : conformité depuis valeur_mesuree + seuils
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auto_calcul_conformite()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.est_conforme := CASE
        WHEN NEW.valeur_mesuree IS NULL                                       THEN NULL
        WHEN NEW.seuil_minimum IS NULL AND NEW.seuil_maximum IS NULL          THEN NULL
        WHEN NEW.seuil_minimum IS NOT NULL AND NEW.valeur_mesuree < NEW.seuil_minimum THEN false
        WHEN NEW.seuil_maximum IS NOT NULL AND NEW.valeur_mesuree > NEW.seuil_maximum THEN false
        ELSE true
    END;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_calcul_conformite
    BEFORE INSERT OR UPDATE OF valeur_mesuree ON operations_execution
    FOR EACH ROW EXECUTE FUNCTION public.auto_calcul_conformite();

COMMENT ON FUNCTION public.auto_calcul_conformite() IS
    'Calcule est_conforme depuis valeur_mesuree + seuils (NULL si seuils ou valeur absent).';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  052_triggers_audit.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 052 — Triggers d'audit (attachement de log_audit() aux 4 tables critiques)
-- La fonction log_audit() est définie dans 007_audit_log.sql.
-- V1 : on audite les 4 tables où la traçabilité est exigée par la conformité
-- ERP / NF EN 13306 :
--   - ordres_travail
--   - operations_execution
--   - demandes_intervention
--   - observations
-- En V2 : ajouter contrats, equipements, users (changement de rôles).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_ordres_travail
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER audit_ordres_travail
    AFTER INSERT OR UPDATE OR DELETE ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_operations_execution
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER audit_operations_execution
    AFTER INSERT OR UPDATE OR DELETE ON operations_execution
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_demandes_intervention
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER audit_demandes_intervention
    AFTER INSERT OR UPDATE OR DELETE ON demandes_intervention
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_observations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER audit_observations
    AFTER INSERT OR UPDATE OR DELETE ON observations
    FOR EACH ROW EXECUTE FUNCTION public.log_audit();

COMMENT ON TRIGGER audit_ordres_travail        ON ordres_travail        IS 'Trace toutes les opérations CRUD pour conformité ERP.';
COMMENT ON TRIGGER audit_operations_execution  ON operations_execution  IS 'Trace toutes les opérations CRUD pour conformité ERP.';
COMMENT ON TRIGGER audit_demandes_intervention ON demandes_intervention IS 'Trace toutes les opérations CRUD pour conformité ERP.';
COMMENT ON TRIGGER audit_observations          ON observations          IS 'Trace toutes les opérations CRUD pour conformité ERP.';


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  055_triggers_protection_snapshots.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 055 — Triggers de protection des snapshots (post-audit Bloc 6)
-- =============================================================================
-- Deux protections en garde-fou serveur (impossibles à exprimer purement en RLS) :
--
--  Fix 10 — operations_execution : les colonnes snapshots (nom, description,
--           type_operation, seuil_*, unite_*, source_*, ordre, ordre_travail_id)
--           sont FIGÉES à la création. Aucun rôle (sauf admin pour cas
--           exceptionnels) ne peut les modifier après coup.
--
--  Fix 12 — ordres_travail : les snapshots Pattern 1 et champs d'audit
--           (created_at, created_by) sont IMMUABLES pour tous (sauf admin).
--           Les champs métier (date_prevue, prestataire_id,
--           statut, date_debut, date_cloture, commentaires) restent modifiables
--           par les rôles habilités via leurs propres policies RLS.
--
-- Dépendances : 006_auth_helpers (public.current_role),
--               032_ordres_travail, 033_operations_execution
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 10 — Protection des snapshots de operations_execution
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_opex_snapshots()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Admin bypass pour les cas exceptionnels (correction manuelle, hotfix).
    IF (SELECT public.current_role()) = 'admin' THEN
        RETURN NEW;
    END IF;

    IF OLD.nom              IS DISTINCT FROM NEW.nom
       OR OLD.description    IS DISTINCT FROM NEW.description
       OR OLD.type_operation IS DISTINCT FROM NEW.type_operation
       OR OLD.seuil_minimum  IS DISTINCT FROM NEW.seuil_minimum
       OR OLD.seuil_maximum  IS DISTINCT FROM NEW.seuil_maximum
       OR OLD.unite_nom      IS DISTINCT FROM NEW.unite_nom
       OR OLD.unite_symbole  IS DISTINCT FROM NEW.unite_symbole
       OR OLD.source_type    IS DISTINCT FROM NEW.source_type
       OR OLD.source_id      IS DISTINCT FROM NEW.source_id
       OR OLD.ordre          IS DISTINCT FROM NEW.ordre
       OR OLD.ordre_travail_id IS DISTINCT FROM NEW.ordre_travail_id
    THEN
        RAISE EXCEPTION
            'Modification interdite : ces colonnes sont des snapshots figés (operations_execution)'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_opex_snapshots() IS
    'Bloque toute modification des colonnes snapshots de operations_execution (Fix 10 audit Bloc 6). Admin bypass.';

CREATE TRIGGER trg_protect_opex_snapshots
    BEFORE UPDATE ON operations_execution
    FOR EACH ROW EXECUTE FUNCTION public.protect_opex_snapshots();

-- ─────────────────────────────────────────────────────────────────────────────
-- F40 (audit RBAC v2 — 2026-05-19) — Protection des champs IMMUABLES de l'OT
-- ─────────────────────────────────────────────────────────────────────────────
-- L'ancien trigger protect_ot_technicien_fields restreignait SPÉCIFIQUEMENT le
-- technicien. La matrice RBAC v2 lui donne plein pouvoir métier sur son giron,
-- donc cette restriction par rôle est supprimée.
--
-- En revanche, certains champs restent IMMUABLES POUR TOUS (sauf admin) :
--   - Snapshots Pattern 1 (preuves NF EN 13306) : nom_gamme, description_gamme,
--     nature_gamme, nom_prestataire, nom_localisation, nom_equipement,
--     nom_categorie, libelle_periodicite, jours_periodicite, tolerance_jours
--   - Champs audit : created_at, created_by
--   - origine : figée par check_ot_origine_coherence (F19)
--
-- Les champs métier modifiables par tous les rôles habilités (admin,
-- manager, technicien) : date_prevue, prestataire_id,
-- image_path, statut, date_debut, date_cloture, commentaires.
--
-- Bypass GUC app.system_ot_generation pour le trigger snapshot_ot_from_gamme
-- qui peuple les snapshots de TEMP → vraies valeurs juste après l'INSERT.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_ot_immutable_fields()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Bypass système (snapshot orchestrator)
    IF current_setting('app.system_ot_generation', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- Admin bypass (correction manuelle, migration)
    IF (SELECT public.current_role()) = 'admin' THEN
        RETURN NEW;
    END IF;

    -- Champs IMMUABLES pour tous : snapshots + audit
    IF OLD.nom_gamme          IS DISTINCT FROM NEW.nom_gamme
       OR OLD.description_gamme  IS DISTINCT FROM NEW.description_gamme
       OR OLD.nature_gamme       IS DISTINCT FROM NEW.nature_gamme
       OR OLD.nom_prestataire    IS DISTINCT FROM NEW.nom_prestataire
       OR OLD.nom_localisation   IS DISTINCT FROM NEW.nom_localisation
       OR OLD.nom_equipement     IS DISTINCT FROM NEW.nom_equipement
       OR OLD.nom_categorie      IS DISTINCT FROM NEW.nom_categorie
       OR OLD.libelle_periodicite IS DISTINCT FROM NEW.libelle_periodicite
       OR OLD.jours_periodicite  IS DISTINCT FROM NEW.jours_periodicite
       OR OLD.tolerance_jours    IS DISTINCT FROM NEW.tolerance_jours
       OR OLD.created_at         IS DISTINCT FROM NEW.created_at
       OR OLD.created_by         IS DISTINCT FROM NEW.created_by
    THEN
        RAISE EXCEPTION
            'Modification interdite : ces colonnes sont des snapshots figés Pattern 1 (preuves NF EN 13306) ou des champs d''audit immuables.'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_ot_immutable_fields() IS
    'F40 (audit RBAC v2) : protège les snapshots Pattern 1 et champs d''audit de ordres_travail contre toute modification (admin bypass). Remplace protect_ot_technicien_fields qui limitait par rôle.';

CREATE TRIGGER trg_protect_ot_immutable_fields
    BEFORE UPDATE ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.protect_ot_immutable_fields();


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  060_rls_policies.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 060 — Politiques RLS (Row Level Security) sur TOUTES les tables métier
-- Instance SINGLE-TENANT : la sécurité ne repose plus que sur le RÔLE et le
-- SCOPE SITE (has_site_access). Plus de filtre client_id (un seul client).
-- Pattern standard :
--   1. admin                  → FOR ALL (voit/gère TOUT, sans scope)
--   2. <table>_site_scoped_*  FOR ...  → manager/technicien/lecteur (user_sites)
--   3. demandeur : RLS chirurgicale (cf bloc 18bis sur demandes_intervention).
--
-- Convention RLS pour tables sans site_id (référentiels entreprise) : filtre rôle.
-- Convention RLS pour tables référentielles SMALLINT : SELECT = authentifié,
--   écriture = admin uniquement.
-- =============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. users                                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Admin : tout. Autres : voient leurs collègues (utile pour assignation OT/DI).

-- Défense en profondeur : un manager ne peut pas modifier/désactiver un autre
-- manager ni un admin (anti-sabotage entre pairs). Il gère les rôles inférieurs
-- DE SES SITES + se modifie lui-même (self).
-- v0.29 : la branche « rôle inférieur » est bornée par public.shares_site_with(id).
-- Sans ce filtre, users_manager_all (FOR ALL) laissait un manager voir/modifier
-- TOUS les comptes de rôle inférieur de l'entreprise — neutralisant le scope site
-- pourtant posé en F28 sur users_manager_select_peers (policies PERMISSIVE = OR).
CREATE POLICY users_admin_all ON users FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY users_manager_all ON users FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND (
            id = (SELECT auth.uid())
            OR (
                role_id NOT IN (SELECT id FROM public.roles WHERE code IN ('admin', 'manager'))
                AND public.shares_site_with(id)
            )
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND (
            role_id NOT IN (SELECT id FROM public.roles WHERE code IN ('admin', 'manager'))
            OR id = (SELECT auth.uid())
        )
    );

-- Le manager peut VOIR ses pairs sur les sites où il intervient (pour pouvoir
-- coordonner avec les autres managers et techniciens de ses sites). Pas de
-- visibilité cross-site pour ne pas leak l'existence des autres équipes.
-- F28 audit sécu : ajout du filtre site_id (avant on autorisait tout manager
-- à voir TOUS les autres users de l'instance → leak existence cross-site).
CREATE POLICY users_manager_select_peers ON users FOR SELECT
    USING (
        (SELECT public.current_role()) = 'manager'
        AND (
            id = (SELECT auth.uid())
            -- F31 : helper SECURITY DEFINER (anti-récursion RLS — voir
            -- public.shares_site_with). Remplace l'ancien EXISTS inline sur
            -- user_sites qui provoquait « infinite recursion » sur users.
            OR public.shares_site_with(id)
        )
    );

-- F28 audit fonctionnel : technicien et lecteur voient leurs pairs (managers,
-- techs, lecteurs, demandeurs) UNIQUEMENT sur les sites où ils interviennent.
-- Avant : (SELECT public.current_role()) IN ('technicien', 'lecteur') sans filtre →
-- chaque tech/lecteur voyait TOUS les users de l'instance, y compris ceux de
-- sites hors scope. Asymétrique avec le durcissement manager F28 ci-dessus.
CREATE POLICY users_same_client_select ON users FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('technicien', 'lecteur')
        AND (
            id = (SELECT auth.uid())
            -- F31 : helper SECURITY DEFINER (anti-récursion RLS — voir
            -- public.shares_site_with). Remplace l'ancien EXISTS inline.
            OR public.shares_site_with(id)
        )
    );

CREATE POLICY users_self_select ON users FOR SELECT
    USING (id = (SELECT auth.uid()));

-- F28 (audit) — Self-update : tout user actif peut modifier sa propre ligne
-- pour les champs non sensibles (nom_complet, telephone, photo_path). Les
-- colonnes sensibles (id, created_by, role, est_actif) sont verrouillées par
-- le trigger protect_users_sensitive_columns (escalade de privilège bloquée
-- en defense-in-depth, indépendamment de cette policy).
CREATE POLICY users_self_update ON users FOR UPDATE
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

-- F22 (audit 2e passe) — protection RGPD sur users.telephone :
-- Postgres ne supporte pas la RLS par colonne. On retire donc le SELECT direct
-- sur telephone à tous les rôles authentifiés et on expose l'info via une RPC
-- get_user_telephone(uuid) qui contrôle elle-même l'autorisation.
-- Conséquences :
--   - SELECT * FROM users ne renvoie PLUS la colonne telephone aux non-privilégiés.
--   - Les frontends qui ont besoin du téléphone appellent select get_user_telephone('uuid').
--   - Les rôles non autorisés à voir un téléphone reçoivent NULL silencieusement.
REVOKE SELECT (telephone) ON public.users FROM authenticated, anon;

-- F28 (audit sécu) — règle hiérarchique calquée sur l'accès aux prestataires :
--   - self                       : toujours autorisé
--   - admin                      : tous les téléphones
--   - manager/technicien/lecteur : téléphone d'un user uniquement si les
--                                  deux partagent ≥1 site assigné (user_sites)
--   - demandeur                  : self uniquement (rôle ultra-restreint)
-- Pas de logique « rang inférieur » distincte : le simple critère « partage
-- d'au moins un site » couvre les besoins terrain :
--   - manager voit ses subordonnés (tech/lecteur/demandeur) de ses sites,
--     puisqu'ils sont par construction rattachés à ces sites
--   - manager voit ses pairs (autres managers) uniquement s'ils ont un site
--     en commun (cas d'un manager invité ponctuellement sur un autre site)
--   - tech voit tout collègue actif sur un site qu'il opère
CREATE OR REPLACE FUNCTION public.get_user_telephone(p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_telephone   TEXT;
    v_caller_role TEXT;
BEGIN
    SELECT telephone INTO v_telephone
    FROM public.users WHERE id = p_user_id;

    IF v_telephone IS NULL THEN
        RETURN NULL;
    END IF;

    -- Self toujours autorisé (tous les rôles y compris demandeur)
    IF p_user_id = (SELECT auth.uid()) THEN
        RETURN v_telephone;
    END IF;

    v_caller_role := public.current_role();

    -- Admin voit tous les téléphones (rôle transverse, pas de scope site)
    IF v_caller_role = 'admin' THEN
        RETURN v_telephone;
    END IF;

    -- Manager / technicien / lecteur : visible si ≥1 site assigné en commun.
    -- Modèle calqué sur l'accès aux prestataires (visibilité site-scopée).
    -- Note : la lecture de user_sites est faite en SECURITY DEFINER pour
    -- bypasser la RLS user_sites_self_select (qui limiterait les jointures
    -- aux lignes du caller uniquement).
    IF v_caller_role IN ('manager', 'technicien', 'lecteur') THEN
        IF EXISTS (
            SELECT 1
            FROM public.user_sites us_me
            JOIN public.user_sites us_other ON us_other.site_id = us_me.site_id
            WHERE us_me.user_id    = (SELECT auth.uid())
              AND us_other.user_id = p_user_id
        ) THEN
            RETURN v_telephone;
        END IF;
    END IF;

    -- Demandeur ou non-match : NULL silencieux (pas d'info disclosure)
    RETURN NULL;
END;
$$;
COMMENT ON FUNCTION public.get_user_telephone(UUID) IS
    'F28 (audit sécu) : règle hiérarchique. self toujours / admin tout / manager-tech-lecteur si site commun via user_sites / demandeur self uniquement. Renvoie NULL sinon (pas d''info disclosure).';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1bis. anonymize_user — RPC RGPD droit à l'effacement (F29 patch v0.5)    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- L'utilisateur ne peut pas être hard-supprimé : 6 FK NOT NULL vers users
-- (created_by sur OT, DI, observations, modeles_di, gammes, documents.uploaded_by)
-- verrouillent sa fiche pour préserver l'historique métier (preuves NF EN 13306).
--
-- Solution RGPD : anonymiser au lieu de supprimer. On remplace les PII
-- (nom_complet, telephone, photo_path) par des valeurs neutres, on coupe
-- l'accès (est_actif = false) — l'historique reste lisible avec "Utilisateur
-- supprimé" comme auteur, ce qui est l'intérêt légitime de l'entreprise.
--
-- Garde-fous :
--   - Réservée admin ((SELECT public.current_role()) = 'admin')
--   - Auto-anonymisation interdite (passer par un autre admin)
--   - Anonymisation d'un autre admin autorisée mais tracée (risque sabotage
--     entre admins → trace explicite dans audit_log pour forensic)
--   - L'avatar Storage associé sera nettoyé par cleanup_storage_orphans (cron)
--
-- Réversibilité : l'opération est techniquement réversible (un admin pourrait
-- repositionner manuellement nom_complet et est_actif), mais le téléphone et
-- l'email originaux sont perdus définitivement — conforme à l'esprit RGPD.
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id UUID)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_role TEXT;
    v_target      public.users;
BEGIN
    v_caller_role := public.current_role();

    IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
        RAISE EXCEPTION 'Anonymisation RGPD réservée à un admin'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_user_id = (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'Auto-anonymisation interdite — un autre admin doit effectuer l''opération'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Lecture cible (SECURITY DEFINER bypasse la RLS donc on peut récupérer
    -- toutes les colonnes y compris est_actif=false).
    SELECT * INTO v_target FROM public.users WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Utilisateur introuvable';
    END IF;

    -- Idempotence robuste : repose sur la colonne anonymized_at (posée
    -- exclusivement par cette RPC), pas sur le nom_complet qui pourrait être
    -- manipulé. Si l'utilisateur est déjà anonymisé, on retourne sans rien
    -- faire (pas d'erreur, pas de double trace audit_log).
    IF v_target.anonymized_at IS NOT NULL THEN
        RETURN v_target;
    END IF;

    -- Trace explicite AVANT l'UPDATE (préserve les valeurs originales en
    -- "before" dans audit_log même si la modification réussit ensuite).
    -- L'INSERT direct est autorisé via SECURITY DEFINER + propriétaire postgres
    -- qui bypasse FORCE RLS (cf doctrine FORCE RLS supabase-rls.md).
    INSERT INTO public.audit_log (
        user_id, table_name, row_pk, action, before, after
    ) VALUES (
        (SELECT auth.uid()),
        'users',
        p_user_id::TEXT,
        'UPDATE',
        jsonb_build_object(
            'rgpd_action',  'anonymize_user',
            'nom_complet',  v_target.nom_complet,
            'est_actif',    v_target.est_actif,
            'role',         (SELECT code FROM public.roles WHERE id = v_target.role_id)
        ),
        jsonb_build_object(
            'rgpd_action',  'anonymize_user',
            'anonymized_at', now(),
            'anonymized_by', (SELECT auth.uid())
        )
    );

    -- UPDATE : protect_users_sensitive_columns autorise (caller = admin).
    -- Le trigger laisse passer la modification d'est_actif car v_caller_role
    -- = 'admin' (cf condition au sein de protect_users_sensitive_columns).
    UPDATE public.users
    SET nom_complet    = 'Utilisateur supprimé',
        telephone      = NULL,
        photo_path     = NULL,
        est_actif      = false,
        anonymized_at  = now()
    WHERE id = p_user_id
    RETURNING * INTO v_target;

    RETURN v_target;
END;
$$;
COMMENT ON FUNCTION public.anonymize_user(UUID) IS
    'F29 (patch v0.5) : RGPD droit à l''effacement. Remplace PII par valeurs neutres et coupe l''accès, mais conserve la trace métier dans l''historique (NF EN 13306). Réservée admin. Auto-anonymisation interdite. Idempotence robuste via users.anonymized_at. Trace explicite dans audit_log avant modification.';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. user_sites                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY user_sites_admin_all ON user_sites FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY user_sites_self_select ON user_sites FOR SELECT
    USING (user_id = (SELECT auth.uid()));

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. sites                                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY sites_admin_all ON sites FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY sites_site_scoped_select ON sites FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.has_site_access(id)
    );

-- Le demandeur doit voir SES sites assignés (gouvernante voit la liste des sites
-- où elle peut créer une DI). Lecture chirurgicale, pas d'INSERT/UPDATE.
CREATE POLICY sites_demandeur_select ON sites FOR SELECT
    USING (
        (SELECT public.current_role()) = 'demandeur'
        AND public.has_site_access(id)
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. batiments / niveaux / locaux                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- has_site_access via le site_id du bâtiment parent.

-- batiments
CREATE POLICY batiments_admin_all ON batiments FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY batiments_site_scoped_select ON batiments FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.has_site_access(site_id)
    );

CREATE POLICY batiments_site_scoped_write ON batiments FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

CREATE POLICY batiments_site_scoped_update ON batiments FOR UPDATE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

-- Le demandeur voit les bâtiments de ses sites assignés.
CREATE POLICY batiments_demandeur_select ON batiments FOR SELECT
    USING (
        (SELECT public.current_role()) = 'demandeur'
        AND public.has_site_access(site_id)
    );

-- niveaux (remonte au site via batiments)
CREATE POLICY niveaux_admin_all ON niveaux FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY niveaux_site_scoped_select ON niveaux FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND EXISTS (
            SELECT 1 FROM batiments b
            WHERE b.id = niveaux.batiment_id
              AND public.has_site_access(b.site_id)
        )
    );

CREATE POLICY niveaux_site_scoped_write ON niveaux FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND EXISTS (
            SELECT 1 FROM batiments b
            WHERE b.id = niveaux.batiment_id
              AND public.has_site_access(b.site_id)
        )
    );

CREATE POLICY niveaux_site_scoped_update ON niveaux FOR UPDATE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND EXISTS (
            SELECT 1 FROM batiments b
            WHERE b.id = niveaux.batiment_id
              AND public.has_site_access(b.site_id)
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND EXISTS (
            SELECT 1 FROM batiments b
            WHERE b.id = niveaux.batiment_id
              AND public.has_site_access(b.site_id)
        )
    );

-- Le demandeur voit les niveaux de ses sites assignés.
CREATE POLICY niveaux_demandeur_select ON niveaux FOR SELECT
    USING (
        (SELECT public.current_role()) = 'demandeur'
        AND EXISTS (
            SELECT 1 FROM batiments b
            WHERE b.id = niveaux.batiment_id
              AND public.has_site_access(b.site_id)
        )
    );

-- locaux (remonte au site via niveaux → batiments)
CREATE POLICY locaux_admin_all ON locaux FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY locaux_site_scoped_select ON locaux FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND EXISTS (
            SELECT 1 FROM niveaux n
            JOIN batiments b ON b.id = n.batiment_id
            WHERE n.id = locaux.niveau_id
              AND public.has_site_access(b.site_id)
        )
    );

CREATE POLICY locaux_site_scoped_write ON locaux FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND EXISTS (
            SELECT 1 FROM niveaux n
            JOIN batiments b ON b.id = n.batiment_id
            WHERE n.id = locaux.niveau_id
              AND public.has_site_access(b.site_id)
        )
    );

CREATE POLICY locaux_site_scoped_update ON locaux FOR UPDATE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND EXISTS (
            SELECT 1 FROM niveaux n
            JOIN batiments b ON b.id = n.batiment_id
            WHERE n.id = locaux.niveau_id
              AND public.has_site_access(b.site_id)
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND EXISTS (
            SELECT 1 FROM niveaux n
            JOIN batiments b ON b.id = n.batiment_id
            WHERE n.id = locaux.niveau_id
              AND public.has_site_access(b.site_id)
        )
    );

-- Le demandeur voit les locaux de ses sites assignés
-- (utile pour pré-remplir la localisation d'une DI : "fuite chambre 304").
CREATE POLICY locaux_demandeur_select ON locaux FOR SELECT
    USING (
        (SELECT public.current_role()) = 'demandeur'
        AND EXISTS (
            SELECT 1 FROM niveaux n
            JOIN batiments b ON b.id = n.batiment_id
            WHERE n.id = locaux.niveau_id
              AND public.has_site_access(b.site_id)
        )
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. categories (site_id NULLABLE — scope entreprise vs scope site)        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- site_id NULL = scope entreprise : tous les rôles la voient.
-- site_id NOT NULL = scope site : seuls les users avec accès au site la voient.

CREATE POLICY categories_admin_all ON categories FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- Site-scoped (manager/technicien/lecteur) : SELECT sur scope entreprise ou sites accessibles
CREATE POLICY categories_site_scoped_select ON categories FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- Règle universelle des modèles (2026-05-25) : la bibliothèque entreprise
-- (site_id IS NULL) est gérée par admin + manager ; le scope site par les
-- sites assignés. Aligne les catégories sur gammes / modeles_operations.
CREATE POLICY categories_site_scoped_write ON categories FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

CREATE POLICY categories_site_scoped_update ON categories FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- v0.21 — Règle universelle des modèles : le technicien gère aussi les catégories
-- de SES sites (site_id renseigné). La bibliothèque entreprise (site_id NULL) reste
-- admin + manager. Aligné sur gammes_technicien_site_write / modeles_operations.
CREATE POLICY categories_technicien_write ON categories FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    );

CREATE POLICY categories_technicien_update ON categories FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    );

-- v0.13 — accès au site d'un LOCAL (par local_id), utilisable aussi en INSERT
-- (contrairement à can_access_equipement qui exige l'equipement déjà en base).
-- Encapsule le triple JOIN locaux→niveaux→batiments des policies equipements.
CREATE OR REPLACE FUNCTION public.can_access_local(p_local_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.locaux l
        JOIN public.niveaux   n ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE l.id = p_local_id
          AND public.has_site_access(b.site_id)
    );
$$;
COMMENT ON FUNCTION public.can_access_local(UUID) IS 'v0.13 — true si le caller a accès au site du local (via la hiérarchie spatiale). SECURITY DEFINER (anti-récursion). Utilisable en INSERT (prend local_id, pas equipement_id).';
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. equipements (remontée site via local)                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY equipements_admin_all ON equipements FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- Le demandeur peut LIRE (jamais écrire) les équipements de ses sites, pour
-- préciser sa DI (rattacher un équipement). Même remontée site via le local.
CREATE POLICY equipements_demandeur_select ON equipements FOR SELECT
    USING (
        (SELECT public.current_role()) = 'demandeur'
        AND public.can_access_local(local_id)
    );

CREATE POLICY equipements_site_scoped_select ON equipements FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.can_access_local(local_id)
    );

CREATE POLICY equipements_site_scoped_write ON equipements FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.can_access_local(local_id)
    );

CREATE POLICY equipements_site_scoped_update ON equipements FOR UPDATE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.can_access_local(local_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.can_access_local(local_id)
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. prestataires (pas de site_id — référentiel entreprise)                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY prestataires_admin_all ON prestataires FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- Manager/Technicien/Lecteur : voient les prestataires actifs sur leurs sites
-- (via prestataires_sites, ou tous si table de liaison vide)
CREATE POLICY prestataires_site_scoped_select ON prestataires FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND (
            -- Convention : table vide = actif sur TOUS les sites
            NOT EXISTS (SELECT 1 FROM prestataires_sites ps WHERE ps.prestataire_id = prestataires.id)
            OR EXISTS (
                SELECT 1 FROM prestataires_sites ps
                WHERE ps.prestataire_id = prestataires.id
                  AND public.has_site_access(ps.site_id)
            )
        )
    );

-- Manager : INSERT/UPDATE uniquement sur prestataires actifs sur SES sites assignés.
-- Convention : si AUCUN prestataires_sites n'existe pour ce prestataire, on autorise
-- (cas typique : on crée le prestataire avant d'attacher les sites).
CREATE POLICY prestataires_manager_write ON prestataires FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND (
            NOT EXISTS (SELECT 1 FROM prestataires_sites ps WHERE ps.prestataire_id = prestataires.id)
            OR EXISTS (
                SELECT 1 FROM prestataires_sites ps
                WHERE ps.prestataire_id = prestataires.id
                  AND public.has_site_access(ps.site_id)
            )
        )
    );

CREATE POLICY prestataires_manager_update ON prestataires FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'manager'
        AND (
            NOT EXISTS (SELECT 1 FROM prestataires_sites ps WHERE ps.prestataire_id = prestataires.id)
            OR EXISTS (
                SELECT 1 FROM prestataires_sites ps
                WHERE ps.prestataire_id = prestataires.id
                  AND public.has_site_access(ps.site_id)
            )
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND (
            NOT EXISTS (SELECT 1 FROM prestataires_sites ps WHERE ps.prestataire_id = prestataires.id)
            OR EXISTS (
                SELECT 1 FROM prestataires_sites ps
                WHERE ps.prestataire_id = prestataires.id
                  AND public.has_site_access(ps.site_id)
            )
        )
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 8. prestataires_sites (liaison)                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY prestataires_sites_admin_all ON prestataires_sites FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY prestataires_sites_select ON prestataires_sites FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.has_site_access(site_id)
    );

-- v0.21 — Manager : gère les rattachements prestataire↔site sur SES sites (décision
-- 2026-05-31 : le superviseur doit au moins pouvoir en faire autant que le technicien).
CREATE POLICY prestataires_sites_manager_all ON prestataires_sites FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND public.has_site_access(site_id)
    );

-- ═══════════════════════════════════════════════════════════════════════════
-- F32 (audit sécu) — Helpers de scope site pour les tables SANS site_id direct
-- (contrats, contrats_gammes, gammes_equipements). Encapsulés en SECURITY
-- DEFINER (bypass RLS) pour éviter toute récursion RLS quand ils sont appelés
-- depuis une policy (même principe que public.shares_site_with, cf F31).
-- ═══════════════════════════════════════════════════════════════════════════

-- Un prestataire est « accessible » s'il n'a AUCUN site assigné (interne /
-- transverse → visible par tous) OU si le caller a accès à un de ses sites.
-- Réplique exactement la logique de prestataires_site_scoped_select : on voit
-- un contrat si et seulement si on voit son prestataire.
CREATE OR REPLACE FUNCTION public.can_access_prestataire(p_prestataire_id UUID) RETURNS BOOLEAN
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT
        NOT EXISTS (SELECT 1 FROM public.prestataires_sites ps WHERE ps.prestataire_id = p_prestataire_id)
        OR EXISTS (
            SELECT 1 FROM public.prestataires_sites ps
            WHERE ps.prestataire_id = p_prestataire_id AND public.has_site_access(ps.site_id)
        );
$$;
COMMENT ON FUNCTION public.can_access_prestataire(UUID) IS 'F32 — true si prestataire sans site (interne/transverse) ou caller a accès à un de ses sites. SECURITY DEFINER (anti-récursion). Aligné sur prestataires_site_scoped_select.';

-- Une gamme est « accessible » si c'est un modèle bibliothèque (site_id NULL,
-- partagé) OU si le caller a accès à son site.
CREATE OR REPLACE FUNCTION public.can_access_gamme(p_gamme_id UUID) RETURNS BOOLEAN
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.gammes g
        WHERE g.id = p_gamme_id
          AND (g.site_id IS NULL OR public.has_site_access(g.site_id))
    );
$$;
COMMENT ON FUNCTION public.can_access_gamme(UUID) IS 'F32 — true si gamme bibliothèque (site_id NULL) ou caller a accès à son site. SECURITY DEFINER (anti-récursion).';

-- Variante ÉCRITURE : une gamme est « accessible en écriture site » UNIQUEMENT si
-- elle est rattachée à un site (site_id NOT NULL) auquel le caller a accès. Exclut
-- le commun (site_id NULL) — sert aux policies d'écriture technicien pour préserver
-- l'inviolabilité du commun (patch inviolabilité 2026-06-10).
CREATE OR REPLACE FUNCTION public.can_access_gamme_site(p_gamme_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.gammes g
        WHERE g.id = p_gamme_id
          AND g.site_id IS NOT NULL
          AND public.has_site_access(g.site_id)
    );
$$;
COMMENT ON FUNCTION public.can_access_gamme_site(uuid) IS 'F32 — true UNIQUEMENT si la gamme est rattachée à un site (site_id NOT NULL) auquel le caller a accès. Exclut le commun (site_id NULL), contrairement à can_access_gamme. SECURITY DEFINER (anti-récursion). Sert aux policies d''ÉCRITURE technicien pour préserver l''inviolabilité du commun.';

-- Un équipement est « accessible » si le caller a accès au site de son local.
CREATE OR REPLACE FUNCTION public.can_access_equipement(p_equipement_id UUID) RETURNS BOOLEAN
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.equipements e
        JOIN public.locaux    l ON l.id = e.local_id
        JOIN public.niveaux   n ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        WHERE e.id = p_equipement_id
          AND public.has_site_access(b.site_id)
    );
$$;
COMMENT ON FUNCTION public.can_access_equipement(UUID) IS 'F32 — true si caller a accès au site du local de l''équipement. SECURITY DEFINER (anti-récursion).';



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 9. contrats (pas de site_id — scopés via leur prestataire, F32)           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY contrats_admin_all ON contrats FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- v0.24 : cloisonnement par site DIRECT (contrats.site_id). Un contrat n'est
-- visible/modifiable que si le caller a accès à SON site (plus précis que l'ancien
-- via prestataire, F32). Manager : SELECT + INSERT + UPDATE (pas DELETE).
CREATE POLICY contrats_manager_select ON contrats FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.has_site_access(site_id)
    );

CREATE POLICY contrats_manager_insert ON contrats FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND public.has_site_access(site_id)
    );

CREATE POLICY contrats_manager_update ON contrats FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'manager'
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND public.has_site_access(site_id)
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 10. contrats_gammes (liaison — scopée via la gamme, F32)                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY contrats_gammes_admin_all ON contrats_gammes FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- F32 : cloisonnement par site via la gamme liée.
CREATE POLICY contrats_gammes_manager_write ON contrats_gammes FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND public.can_access_gamme(gamme_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND public.can_access_gamme(gamme_id)
    );

-- Lecture pour les rôles internes (les liaisons contrat ↔ gamme sont une info
-- contractuelle interne, pas exposée aux demandeurs). Scopée par site (gamme).
CREATE POLICY contrats_gammes_select ON contrats_gammes FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.can_access_gamme(gamme_id)
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 11. gammes (bibliothèque — scope 2 niveaux : entreprise / site)           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- site_id NULL  = modèle entreprise (bibliothèque, inerte)
-- site_id Y     = gamme réelle d'un site
--
-- SELECT  : rôles internes — modèles entreprise visibles par tous, gammes
--           site filtrées par has_site_access (admin voit tout via le helper).
-- ÉCRITURE niveau entreprise (site_id NULL) : admin + manager.
-- ÉCRITURE niveau site (site_id renseigné)  : admin, ou manager/technicien
--           avec has_site_access.
-- WITH CHECK = USING (anti mass-assignment : pas de bascule de scope furtive).
-- Le technicien voit aussi les modèles entreprise pour pouvoir les injecter
-- via copier_gamme.

DROP POLICY IF EXISTS gammes_admin_all          ON gammes;
DROP POLICY IF EXISTS gammes_site_scoped_select ON gammes;
DROP POLICY IF EXISTS gammes_manager_insert     ON gammes;
DROP POLICY IF EXISTS gammes_manager_update     ON gammes;

-- Admin : plein pouvoir sur les 2 niveaux.
CREATE POLICY gammes_admin_all ON gammes FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- SELECT rôles internes : modèles entreprise (tous) + gammes site scopées.
CREATE POLICY gammes_select ON gammes FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- Niveau ENTREPRISE (site_id NULL) — FOR ALL pour le manager (modèles).
CREATE POLICY gammes_manager_entreprise_write ON gammes FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND site_id IS NULL
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND site_id IS NULL
    );

-- Niveau SITE (site_id renseigné) — FOR ALL pour le manager avec accès au site.
CREATE POLICY gammes_manager_site_write ON gammes FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 12. operations (opérations spécifiques d'une gamme)                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Les opérations suivent leur gamme parente : l'accès reflète celui de la
-- gamme (CASCADE depuis gammes). On résout le scope via la gamme.

CREATE POLICY operations_admin_all ON operations FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- SELECT rôles internes : visible si la gamme parente l'est.
CREATE POLICY operations_select ON operations FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND EXISTS (
            SELECT 1 FROM gammes g
            WHERE g.id = operations.gamme_id
              AND (g.site_id IS NULL OR public.has_site_access(g.site_id))
        )
    );

-- Écriture manager : si la gamme parente est entreprise OU un site accessible.
CREATE POLICY operations_manager_write ON operations FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND EXISTS (
            SELECT 1 FROM gammes g
            WHERE g.id = operations.gamme_id
              AND (g.site_id IS NULL OR public.has_site_access(g.site_id))
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND EXISTS (
            SELECT 1 FROM gammes g
            WHERE g.id = operations.gamme_id
              AND (g.site_id IS NULL OR public.has_site_access(g.site_id))
        )
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 13. modeles_operations (site_id NULL = scope entreprise)                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY modeles_operations_admin_all ON modeles_operations FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- Scope 2 niveaux (Pattern 2) : bibliothèque entreprise (site_id NULL) visible par
-- tous ; modèle de site privé visible seulement des users du site (calque exact de
-- modeles_equipements_select — corrige une fuite cross-site rôle-seul).
CREATE POLICY modeles_operations_select ON modeles_operations FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
           AND (site_id IS NULL OR public.has_site_access(site_id)));

-- Manager : plein pouvoir sur la bibliothèque entreprise (site_id IS NULL) ET
-- sur ses sites assignés. Aligne sur la règle universelle 2026-05-25 :
-- bibliothèque = admin + manager ; scope site = admin + manager + technicien.
CREATE POLICY modeles_operations_manager_all ON modeles_operations FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 14. modeles_operations_items (items d'un modèle)                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY modeles_items_admin_all ON modeles_operations_items FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- Remonte au scope du modèle parent (comme les policies d'écriture) : corrige une
-- fuite cross-site rôle-seul des items d'un modèle de site privé.
CREATE POLICY modeles_items_select ON modeles_operations_items FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
           AND EXISTS (SELECT 1 FROM modeles_operations mo
                       WHERE mo.id = modeles_operations_items.modele_operation_id
                         AND (mo.site_id IS NULL OR public.has_site_access(mo.site_id))));

CREATE POLICY modeles_items_manager_write ON modeles_operations_items FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND EXISTS (
            SELECT 1 FROM modeles_operations mo
            WHERE mo.id = modeles_operations_items.modele_operation_id
              AND (mo.site_id IS NULL OR public.has_site_access(mo.site_id))
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND EXISTS (
            SELECT 1 FROM modeles_operations mo
            WHERE mo.id = modeles_operations_items.modele_operation_id
              AND (mo.site_id IS NULL OR public.has_site_access(mo.site_id))
        )
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 15. gamme_modeles (liaison gammes ↔ modeles_operations)                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY gamme_modeles_admin_all ON gamme_modeles FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- Cloisonné par site via la gamme parente (can_access_gamme : gamme bibliothèque
-- NULL partagée, sinon scope site) — sinon fuite cross-site comme di_*/contrats_gammes.
CREATE POLICY gamme_modeles_select ON gamme_modeles FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.can_access_gamme(gamme_id)
    );

CREATE POLICY gamme_modeles_manager_write ON gamme_modeles FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND public.can_access_gamme(gamme_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND public.can_access_gamme(gamme_id)
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 15bis. modeles_equipements (bibliothèque d'équipements — chantier C)     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Règle universelle des modèles (2026-05-25) :
--   - bibliothèque entreprise (site_id NULL) : admin + manager
--   - scope site (site_id renseigné)         : admin + manager + technicien
--   - lecteur : SELECT
--   - demandeur : aucun accès (pas dans la matrice — deny par défaut)
-- La policy technicien est définie dans le bloc 061 (cohérent avec
-- modeles_operations_technicien_all).

CREATE POLICY modeles_equipements_admin_all ON modeles_equipements FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- SELECT site-scopé : la bibliothèque entreprise (site_id IS NULL) est visible
-- par tous les rôles non-admin (pour pouvoir instancier ses modèles). Les modèles
-- scope site ne sont visibles que pour les sites auxquels le caller a accès.
-- Même filtre que modeles_operations_select (Pattern 2 uniforme).
CREATE POLICY modeles_equipements_select ON modeles_equipements FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- Manager : plein pouvoir sur la bibliothèque entreprise (site_id IS NULL)
-- ET sur ses sites assignés (calque modeles_operations_manager_all post-chantier A).
CREATE POLICY modeles_equipements_manager_all ON modeles_equipements FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 16. gammes_equipements (liaison gammes ↔ equipements)                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY gammes_equipements_admin_all ON gammes_equipements FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- F28 audit fonctionnel : filtre par site via jointure equipements → locaux →
-- niveaux → batiments. Avant : tous les rôles non-admin voyaient TOUTES les
-- liaisons gamme↔équipement, y compris cross-site. Aligné sur la doctrine de
-- visibilité site-scopée (les liaisons héritent du site de leur équipement).
CREATE POLICY gammes_equipements_select ON gammes_equipements FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND EXISTS (
            SELECT 1
            FROM equipements e
            JOIN locaux    l ON l.id = e.local_id
            JOIN niveaux   n ON n.id = l.niveau_id
            JOIN batiments b ON b.id = n.batiment_id
            WHERE e.id = gammes_equipements.equipement_id
              AND public.has_site_access(b.site_id)
        )
    );

-- F32 : cloisonnement par site via l'équipement (la policy SELECT dédiée
-- ci-dessus était court-circuitée par cette policy FOR ALL non scopée).
CREATE POLICY gammes_equipements_manager_write ON gammes_equipements FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND public.can_access_equipement(equipement_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND public.can_access_equipement(equipement_id)
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 17. demandes_intervention (site_id)                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY di_admin_all ON demandes_intervention FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY di_site_scoped_select ON demandes_intervention FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.has_site_access(site_id)
    );

CREATE POLICY di_site_scoped_insert ON demandes_intervention FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

CREATE POLICY di_site_scoped_update ON demandes_intervention FOR UPDATE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- 18bis. demandes_intervention — Rôle DEMANDEUR (RLS chirurgicale)
-- Le demandeur (gouvernante, accueil…) voit TOUTES les DI de ses sites (lecture,
-- pour éviter les doublons et voir l'activité du bâtiment), mais ne peut AGIR
-- (créer / modifier / clore) que sur SES propres DI. INSERT sur ses sites
-- assignés ; UPDATE tant que SA DI est Ouverte (il peut la passer Résolue).
-- Accès lecture aux équipements de ses sites (policy dédiée). Aucun accès OT,
-- gammes, prestataires (pas de policy → RLS bloque par défaut).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY di_demandeur_select ON demandes_intervention FOR SELECT
    USING (
        (SELECT public.current_role()) = 'demandeur'
        AND public.has_site_access(site_id)
    );

CREATE POLICY di_demandeur_insert ON demandes_intervention FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) = 'demandeur'
        AND public.has_site_access(site_id)
        AND created_by = (SELECT auth.uid())
    );

-- UPDATE limité aux DI Ouvertes (statut_di_id = 1).
-- WITH CHECK autorise la transition vers Résolue (2) pour clore soi-même.
CREATE POLICY di_demandeur_update ON demandes_intervention FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'demandeur'
        AND created_by = (SELECT auth.uid())
        AND statut_di_id = 1
    )
    WITH CHECK (
        -- Audit final TROU 2 : le WITH CHECK doit rejouer rôle + scope site,
        -- sinon un demandeur peut déplacer sa DI vers un site hors périmètre.
        (SELECT public.current_role()) = 'demandeur'
        AND created_by = (SELECT auth.uid())
        AND statut_di_id IN (1, 2)
        AND public.has_site_access(site_id)
    );

-- Pas de policy DELETE → demandeur ne peut jamais supprimer (soft-delete réservé admin/manager).

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 17bis. interventions_chantier (site_id) — v0.33, calque DI sans demandeur ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- admin partout ; manager + technicien écrivent sur leurs sites ; lecteur SELECT.
-- Pas de rôle demandeur (les chantiers ne sont pas des tickets terrain ouverts).
-- Suppression = soft-delete via UPDATE deleted_at (pas de policy DELETE).

CREATE POLICY chantier_admin_all ON interventions_chantier FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY chantier_site_scoped_select ON interventions_chantier FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.has_site_access(site_id)
    );

CREATE POLICY chantier_site_scoped_insert ON interventions_chantier FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

CREATE POLICY chantier_site_scoped_update ON interventions_chantier FOR UPDATE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

-- Liaisons chantier_localisations / chantier_equipements : sécurité par
-- existence d'un chantier visible (scope via has_site_access du chantier parent).
-- Calque EXACT des policies de liaison DI (bloc DO $$). admin = court-circuit.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN VALUES ('chantier_localisations'), ('chantier_equipements')
    LOOP
        EXECUTE format($q$
            CREATE POLICY %I ON %I FOR ALL
            USING ((SELECT public.current_role()) = 'admin')
            WITH CHECK ((SELECT public.current_role()) = 'admin')
        $q$, t || '_admin_all', t);

        EXECUTE format($q$
            CREATE POLICY %I ON %I FOR SELECT
            USING (
                (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
                AND EXISTS (
                    SELECT 1 FROM interventions_chantier ic
                    WHERE ic.id = %I.chantier_id
                      AND public.has_site_access(ic.site_id)
                )
            )
        $q$, t || '_select', t, t);

        EXECUTE format($q$
            CREATE POLICY %I ON %I FOR ALL
            USING (
                (SELECT public.current_role()) IN ('manager', 'technicien')
                AND EXISTS (
                    SELECT 1 FROM interventions_chantier ic
                    WHERE ic.id = %I.chantier_id
                      AND public.has_site_access(ic.site_id)
                )
            )
            WITH CHECK (
                (SELECT public.current_role()) IN ('manager', 'technicien')
                AND EXISTS (
                    SELECT 1 FROM interventions_chantier ic
                    WHERE ic.id = %I.chantier_id
                      AND public.has_site_access(ic.site_id)
                )
            )
        $q$, t || '_scoped', t, t, t);
    END LOOP;
END;
$$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 17ter. investissements / CapEx (site_id) — v0.33, statut libre            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- admin partout ; manager + technicien écrivent sur leurs sites ; lecteur SELECT.
-- Suppression = soft-delete via UPDATE deleted_at (pas de policy DELETE).

CREATE POLICY capex_admin_all ON investissements FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY capex_site_scoped_select ON investissements FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.has_site_access(site_id)
    );

CREATE POLICY capex_site_scoped_insert ON investissements FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

CREATE POLICY capex_site_scoped_update ON investissements FOR UPDATE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 18. ordres_travail (site_id)                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY ot_admin_all ON ordres_travail FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- SELECT site-scopés
-- Note : pas de filtre deleted_at — la RLS gère l'AUTORISATION, pas le filtrage
-- actif/corbeille. Aligné sur categories_site_scoped_select et gammes_select.
-- Les lignes en corbeille restent visibles (et donc restaurables via UPDATE).
-- Le filtrage actif vs corbeille est la responsabilité des requêtes / VIEWs
-- applicatives (cf bonne pratique RLS Postgres).
CREATE POLICY ot_site_scoped_select ON ordres_travail FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.has_site_access(site_id)
    );

-- INSERT : manager site (pas technicien)
CREATE POLICY ot_manager_insert ON ordres_travail FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND public.has_site_access(site_id)
    );

-- UPDATE : manager sur ses sites.
CREATE POLICY ot_manager_update ON ordres_travail FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'manager'
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND public.has_site_access(site_id)
    );

-- Le technicien : plein pouvoir métier sur son giron — cf bloc FIX I plus bas
-- (policy ot_technicien_all FOR ALL).

-- DELETE physique interdit par trigger ; pas de policy DELETE site-scoped.

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 19. operations_execution                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Suit la visibilité de l'OT parent.

CREATE POLICY opex_admin_all ON operations_execution FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY opex_site_scoped_select ON operations_execution FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND EXISTS (
            SELECT 1 FROM ordres_travail ot
            WHERE ot.id = operations_execution.ordre_travail_id
              AND public.has_site_access(ot.site_id)
        )
    );

-- UPDATE : manager (ses sites), technicien (OT sur ses sites).
CREATE POLICY opex_manager_update ON operations_execution FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'manager'
        AND EXISTS (
            SELECT 1 FROM ordres_travail ot
            WHERE ot.id = operations_execution.ordre_travail_id
              AND public.has_site_access(ot.site_id)
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND EXISTS (
            SELECT 1 FROM ordres_travail ot
            WHERE ot.id = operations_execution.ordre_travail_id
              AND public.has_site_access(ot.site_id)
        )
    );

-- F25 audit : assigned_to retiré → le technicien peut modifier les ops de
-- TOUT OT sur un de ses sites assignés. Pas d'assignation directe (2026-05-19).
CREATE POLICY opex_technicien_update ON operations_execution FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND EXISTS (
            SELECT 1 FROM ordres_travail ot
            WHERE ot.id = operations_execution.ordre_travail_id
              AND public.has_site_access(ot.site_id)
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND EXISTS (
            SELECT 1 FROM ordres_travail ot
            WHERE ot.id = operations_execution.ordre_travail_id
              AND public.has_site_access(ot.site_id)
        )
    );

-- INSERT/DELETE manuels interdits (gérés par triggers système uniquement).

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 20. observations                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY observations_admin_all ON observations FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY observations_site_scoped_select ON observations FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND public.has_site_access(site_id)
    );

CREATE POLICY observations_site_scoped_insert ON observations FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

CREATE POLICY observations_site_scoped_update ON observations FOR UPDATE
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND public.has_site_access(site_id)
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 21. documents                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY documents_admin_all ON documents FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY documents_site_scoped_select ON documents FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur'));

CREATE POLICY documents_manager_tech_insert ON documents FOR INSERT
    WITH CHECK ((SELECT public.current_role()) IN ('manager', 'technicien'));

CREATE POLICY documents_manager_update ON documents FOR UPDATE
    USING ((SELECT public.current_role()) = 'manager')
    WITH CHECK ((SELECT public.current_role()) = 'manager');

-- Le demandeur (gouvernante…) doit pouvoir attacher une photo à SA DI (cas
-- d'usage métier : photo d'une fuite). Il ne voit QUE les documents qu'il a
-- lui-même uploadés.
CREATE POLICY documents_demandeur_insert ON documents FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) = 'demandeur'
        AND uploaded_by = (SELECT auth.uid())
    );

CREATE POLICY documents_demandeur_select ON documents FOR SELECT
    USING (
        (SELECT public.current_role()) = 'demandeur'
        AND uploaded_by = (SELECT auth.uid())
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 22. Documents — 7 tables de liaison                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Pattern unique pour les 7 : sécurité par rôle (le document parent est lui-même
-- protégé par sa propre RLS). Les *_select de doc_ot/di/eq/locaux sont surchargés
-- plus bas (FIX B) par des variantes site-scopées.

-- documents_prestataires
CREATE POLICY doc_prest_admin_all ON documents_prestataires FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY doc_prest_scoped ON documents_prestataires FOR ALL
    USING ((SELECT public.current_role()) IN ('manager', 'technicien'))
    WITH CHECK ((SELECT public.current_role()) IN ('manager', 'technicien'));

CREATE POLICY doc_prest_select ON documents_prestataires FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur'));

-- documents_ordres_travail
CREATE POLICY doc_ot_admin_all ON documents_ordres_travail FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY doc_ot_scoped ON documents_ordres_travail FOR ALL
    USING ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND EXISTS (SELECT 1 FROM ordres_travail ot
                       WHERE ot.id = documents_ordres_travail.ordre_travail_id
                         AND public.has_site_access(ot.site_id)))
    WITH CHECK ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND EXISTS (SELECT 1 FROM ordres_travail ot
                       WHERE ot.id = documents_ordres_travail.ordre_travail_id
                         AND public.has_site_access(ot.site_id)));

CREATE POLICY doc_ot_select ON documents_ordres_travail FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur'));

-- documents_gammes
CREATE POLICY doc_gammes_admin_all ON documents_gammes FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY doc_gammes_scoped ON documents_gammes FOR ALL
    USING ((SELECT public.current_role()) IN ('manager', 'technicien'))
    WITH CHECK ((SELECT public.current_role()) IN ('manager', 'technicien'));

CREATE POLICY doc_gammes_select ON documents_gammes FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur'));

-- documents_contrats
CREATE POLICY doc_contrats_admin_all ON documents_contrats FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY doc_contrats_scoped ON documents_contrats FOR ALL
    USING ((SELECT public.current_role()) = 'manager')
    WITH CHECK ((SELECT public.current_role()) = 'manager');

CREATE POLICY doc_contrats_select ON documents_contrats FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur'));

-- documents_di
CREATE POLICY doc_di_admin_all ON documents_di FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY doc_di_scoped ON documents_di FOR ALL
    USING ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND EXISTS (SELECT 1 FROM demandes_intervention di
                       WHERE di.id = documents_di.di_id
                         AND public.has_site_access(di.site_id)))
    WITH CHECK ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND EXISTS (SELECT 1 FROM demandes_intervention di
                       WHERE di.id = documents_di.di_id
                         AND public.has_site_access(di.site_id)));

CREATE POLICY doc_di_select ON documents_di FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur'));

-- Le demandeur attache un document à SA DI uniquement. L'INSERT vérifie que la DI
-- cible appartient bien au demandeur (created_by). Le SELECT lui montre les
-- liaisons pour ses propres DI uniquement.
CREATE POLICY doc_di_demandeur_insert ON documents_di FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) = 'demandeur'
        AND EXISTS (
            SELECT 1 FROM demandes_intervention di
            WHERE di.id = documents_di.di_id
              AND di.created_by = (SELECT auth.uid())
        )
    );

CREATE POLICY doc_di_demandeur_select ON documents_di FOR SELECT
    USING (
        (SELECT public.current_role()) = 'demandeur'
        AND EXISTS (
            SELECT 1 FROM demandes_intervention di
            WHERE di.id = documents_di.di_id
              AND di.created_by = (SELECT auth.uid())
        )
    );

-- documents_locaux
CREATE POLICY doc_locaux_admin_all ON documents_locaux FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY doc_locaux_scoped ON documents_locaux FOR ALL
    USING ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND public.can_access_local(documents_locaux.local_id))
    WITH CHECK ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND public.can_access_local(documents_locaux.local_id));

CREATE POLICY doc_locaux_select ON documents_locaux FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur'));

-- documents_equipements
CREATE POLICY doc_eq_admin_all ON documents_equipements FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY doc_eq_scoped ON documents_equipements FOR ALL
    USING ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND public.can_access_equipement(documents_equipements.equipement_id))
    WITH CHECK ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND public.can_access_equipement(documents_equipements.equipement_id));

CREATE POLICY doc_eq_select ON documents_equipements FOR SELECT
    USING ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur'));

-- documents_interventions_chantier (v0.33) — scope via le site du chantier parent.
-- Écriture (manager/technicien) + SELECT (… + lecteur), cloisonnés dès l'origine
-- (pas d'override FIX B nécessaire, tables neuves). admin = court-circuit.
CREATE POLICY doc_chantier_admin_all ON documents_interventions_chantier FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY doc_chantier_scoped ON documents_interventions_chantier FOR ALL
    USING ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND EXISTS (SELECT 1 FROM interventions_chantier ic
                       WHERE ic.id = documents_interventions_chantier.chantier_id
                         AND public.has_site_access(ic.site_id)))
    WITH CHECK ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND EXISTS (SELECT 1 FROM interventions_chantier ic
                       WHERE ic.id = documents_interventions_chantier.chantier_id
                         AND public.has_site_access(ic.site_id)));

CREATE POLICY doc_chantier_select ON documents_interventions_chantier FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND EXISTS (SELECT 1 FROM interventions_chantier ic
                    WHERE ic.id = documents_interventions_chantier.chantier_id
                      AND public.has_site_access(ic.site_id))
    );

-- documents_investissements (v0.33) — scope via le site de l'investissement parent.
CREATE POLICY doc_capex_admin_all ON documents_investissements FOR ALL
    USING ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

CREATE POLICY doc_capex_scoped ON documents_investissements FOR ALL
    USING ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND EXISTS (SELECT 1 FROM investissements i
                       WHERE i.id = documents_investissements.investissement_id
                         AND public.has_site_access(i.site_id)))
    WITH CHECK ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND EXISTS (SELECT 1 FROM investissements i
                       WHERE i.id = documents_investissements.investissement_id
                         AND public.has_site_access(i.site_id)));

CREATE POLICY doc_capex_select ON documents_investissements FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND EXISTS (SELECT 1 FROM investissements i
                    WHERE i.id = documents_investissements.investissement_id
                      AND public.has_site_access(i.site_id))
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 23. DI — tables de liaison polymorphes (di_equipements, di_locaux, etc.) ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Pattern : sécurité par rôle (la DI parente est elle-même protégée par sa RLS).
-- On applique les policies via vérification d'existence. Si une table n'existe
-- pas encore, sa policy est ignorée (le bloc DO est tolérant).

DO $$
DECLARE
    t TEXT;
    fk_col TEXT;
BEGIN
    FOR t, fk_col IN
        SELECT * FROM (VALUES
            ('di_equipements',   'di_id'),
            ('di_localisations', 'di_id')
        ) AS x(tbl, col)
    LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

            EXECUTE format($q$
                CREATE POLICY %I ON %I FOR ALL
                USING ((SELECT public.current_role()) = 'admin')
                WITH CHECK ((SELECT public.current_role()) = 'admin')
            $q$, t || '_admin_all', t);

            -- SELECT pour les rôles internes, CLOISONNÉ PAR SITE via la DI
            -- parente (la liaison hérite du scope de sa DI — sinon fuite cross-site :
            -- un user du site A verrait les équipements/locaux ciblés par une DI du
            -- site B). Miroir du *_demandeur_select. Le 'demandeur' a sa propre
            -- policy chirurgicale (créée juste après).
            EXECUTE format($q$
                CREATE POLICY %I ON %I FOR SELECT
                USING (
                    (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
                    AND EXISTS (
                        SELECT 1 FROM demandes_intervention di
                        WHERE di.id = %I.%I
                          AND public.has_site_access(di.site_id)
                    )
                )
            $q$, t || '_select', t, t, fk_col);

            EXECUTE format($q$
                CREATE POLICY %I ON %I FOR ALL
                USING (
                    (SELECT public.current_role()) IN ('manager', 'technicien')
                    AND EXISTS (
                        SELECT 1 FROM demandes_intervention di
                        WHERE di.id = %I.%I
                          AND public.has_site_access(di.site_id)
                    )
                )
                WITH CHECK (
                    (SELECT public.current_role()) IN ('manager', 'technicien')
                    AND EXISTS (
                        SELECT 1 FROM demandes_intervention di
                        WHERE di.id = %I.%I
                          AND public.has_site_access(di.site_id)
                    )
                )
            $q$, t || '_scoped', t, t, fk_col, t, fk_col);

            -- Demandeur : SELECT sur les sous-éléments de TOUTE DI de ses sites
            -- (cohérent avec di_demandeur_select élargi au scope site) ; INSERT
            -- limité à SES propres DI. Pas d'UPDATE/DELETE.
            EXECUTE format($q$
                CREATE POLICY %I ON %I FOR SELECT
                USING (
                    (SELECT public.current_role()) = 'demandeur'
                    AND EXISTS (
                        SELECT 1 FROM demandes_intervention di
                        WHERE di.id = %I.%I
                          AND public.has_site_access(di.site_id)
                    )
                )
            $q$, t || '_demandeur_select', t, t, fk_col);

            EXECUTE format($q$
                CREATE POLICY %I ON %I FOR INSERT
                WITH CHECK (
                    (SELECT public.current_role()) = 'demandeur'
                    AND EXISTS (
                        SELECT 1 FROM demandes_intervention di
                        WHERE di.id = %I.%I
                          AND di.created_by = (SELECT auth.uid())
                    )
                )
            $q$, t || '_demandeur_insert', t, t, fk_col);
        END IF;
    END LOOP;
END;
$$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 24. modeles_di (modèles de demandes d'intervention — commun + site)       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Scope COMMUN + SITE (cf. table 031 ; aligné 2026-06-11 sur la règle universelle
-- des modèles, calque exact de modeles_equipements). Matrice :
--   admin     : tout, partout
--   manager   : tout, sur le commun (site_id NULL) ET ses sites
--   technicien: tout, sur ses sites UNIQUEMENT (commun exclu)
--   demandeur : SELECT, sur le commun + ses sites (pour piocher un modèle dans
--               son formulaire de création de DI)
--   lecteur   : SELECT, sur le commun + ses sites
-- → écriture commun = admin + manager ; écriture site = admin + manager + technicien.
-- Les écritures de site vérifient has_site_access(site_id) → pas de fuite cross-site.

CREATE POLICY modeles_di_admin_all ON modeles_di FOR ALL
    USING  ((SELECT public.current_role()) = 'admin')
    WITH CHECK ((SELECT public.current_role()) = 'admin');

-- SELECT site-scopé : le commun (site_id IS NULL) est visible par tous les rôles
-- métier (pour piocher un modèle), les modèles de site seulement si has_site_access.
-- Calque modeles_equipements_select, AVEC 'demandeur' en plus (matrice DI).
CREATE POLICY modeles_di_select ON modeles_di FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur', 'demandeur')
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- manager : plein pouvoir sur la bibliothèque entreprise (site_id IS NULL) ET sur
-- ses sites assignés (calque modeles_equipements_manager_all).
CREATE POLICY modeles_di_manager_all ON modeles_di FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- technicien : plein pouvoir sur ses SITES UNIQUEMENT (commun réservé admin +
-- manager). Le tech garde le SELECT du commun via modeles_di_select pour l'utiliser.
-- Calque modeles_equipements_technicien_all (site_id IS NOT NULL AND has_site_access).
CREATE POLICY modeles_di_technicien_all ON modeles_di FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    );

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 25. audit_log (lecture seule pour utilisateurs)                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE POLICY audit_log_admin_select ON audit_log FOR SELECT
    USING ((SELECT public.current_role()) = 'admin');

-- F28 audit sécu : la policy audit_log_manager_select a été RETIRÉE.
-- audit_log est trans-site (pas de colonne site_id) et contient des preuves
-- légales NF EN 13306 + PII. Un manager n'a pas de besoin métier légitime
-- d'accéder à l'historique d'audit ; seul un admin (responsable conformité)
-- en a la charge. Retrait conforme RGPD (minimisation des accès aux PII).

-- F04 (audit sécu) — append-only au niveau policies + trigger défense en
-- profondeur. La RLS DENY-by-default suffit en théorie, mais on rend l'intention
-- explicite : si un futur CREATE POLICY ... FOR ALL est ajouté par erreur, le
-- USING (false) du UPDATE/DELETE reste prioritaire (toutes les policies
-- permissives sont ORées). Le trigger BEFORE UPDATE OR DELETE est la dernière
-- ligne de défense : il intercepte aussi les écritures via SECURITY DEFINER
-- (qui bypassent les policies RLS).
CREATE POLICY audit_log_no_update ON audit_log FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY audit_log_no_delete ON audit_log FOR DELETE USING (false);

CREATE OR REPLACE FUNCTION public.audit_log_block_mutations() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
AS $$
BEGIN
    -- F28 audit sécu : message neutralisé (pas d'(SELECT auth.uid()) en clair pour ne
    -- pas leak l'UUID du caller dans les logs / réponses d'erreur PostgREST).
    RAISE EXCEPTION 'audit_log est append-only : UPDATE et DELETE interdits'
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_audit_log_no_update_delete
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutations();
COMMENT ON FUNCTION public.audit_log_block_mutations() IS 'F04 — defense in depth append-only. Intercepte aussi les écritures SECURITY DEFINER qui bypassent les policies USING (false).';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 26. Référentiels systèmes (lecture authentifiée, écriture admin)         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- unites, periodicites, types_operations, statuts_di,
-- types_contrats, types_documents, roles : seedés une fois, partagés.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN VALUES
        ('unites'), ('periodicites'),
        ('types_operations'), ('statuts_di'), ('types_contrats'),
        ('types_documents'), ('roles'), ('statuts_ot'), ('statuts_operations'),
        ('types_locaux'), ('statuts_chantier'), ('statuts_capex')
    LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
            -- F10 (audit sécu) — exiger un user authentifié plutôt que USING (true).
            -- Évite l'exposition des référentiels au rôle anon (énumération API).
            EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL)',
                           t || '_authenticated_read', t);
            EXECUTE format($q$
                CREATE POLICY %I ON %I FOR ALL
                USING ((SELECT public.current_role()) = 'admin')
                WITH CHECK ((SELECT public.current_role()) = 'admin')
            $q$, t || '_admin_write', t);
        END IF;
    END LOOP;
END;
$$;

-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  061_fix_compartimentage.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =====================================================================
-- 061 — Fix compartimentage (durcissement cross-site + hiérarchie rôles)
-- =====================================================================
-- Placé après 060_rls_policies.sql : DROP+CREATE override les policies
-- vulnérables (doc_*_select) et ajoute triggers + ALTER VIEW.
-- =====================================================================
-- Corrige les fuites cross-site et hiérarchie rôles :
--   A. 4 VIEWs sans security_invoker → bypass RLS
--   B. Documents polymorphes sans filtre site → fuite PJ cross-site
--   C. Triggers cohérence site ↔ entités liées (defense in depth)
--   D. 2 triggers cohérence site pour di_localisations / di_equipements
--   E. Extension protection_ot_terminaux : figer site_id d'un OT
--   F. Policy user_sites_manager_select (gestion d'équipe)
-- =====================================================================


-- =====================================================================
-- FIX A — 4 VIEWs en security_invoker
-- =====================================================================
-- Sans security_invoker, une VIEW s'exécute avec les droits du créateur
-- (souvent superuser) et bypass complètement la RLS des tables sous-jacentes.
-- Pour PostgreSQL ≥ 15, on bascule chaque view en security_invoker=true
-- afin que les RLS des tables de base s'appliquent.
-- =====================================================================
ALTER VIEW v_locaux_chemin           SET (security_invoker = true);
ALTER VIEW v_equipements_complet     SET (security_invoker = true);
ALTER VIEW v_registre_securite       SET (security_invoker = true);
ALTER VIEW v_observations_dashboard  SET (security_invoker = true);


-- =====================================================================
-- FIX B — Documents polymorphes site-scopés
-- =====================================================================
-- Les policies *_select sur documents_{ot, di, eq, locaux} reposaient sur
-- le rôle seul : un technicien site A voyait les PJ d'un OT site B.
-- On ajoute un filtre has_site_access pour les rôles non transverses.
--
-- Convention : l'admin voit tous les documents ; les autres rôles
-- (manager, technicien, lecteur, demandeur) doivent avoir accès au site
-- de l'entité parente.
--
-- B.5/B.6/B.7 : doc_prest, doc_gammes, doc_contrats sont AUSSI site-scopées.
-- (L'ancien commentaire « entités d'entreprise sans rattachement à un site » est
--  périmé depuis v0.9 — cloisonnement gammes/prestataires — et v0.24 — contrats.site_id
--  NOT NULL. Sans scope, un manager/technicien d'un autre site lisait ET écrivait ces
--  liaisons cross-site.) On réutilise les helpers can_access_* / has_site_access.
-- =====================================================================

-- B.1 documents_ordres_travail : remonter au site_id de l'OT
DROP POLICY IF EXISTS doc_ot_select ON documents_ordres_travail;
CREATE POLICY doc_ot_select ON documents_ordres_travail FOR SELECT
    USING (
        (SELECT public.current_role()) = 'admin'
        OR (
            (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
            AND EXISTS (
                SELECT 1 FROM ordres_travail ot
                WHERE ot.id = documents_ordres_travail.ordre_travail_id
                  AND public.has_site_access(ot.site_id)
            )
        )
    );

-- B.2 documents_di : remonter au site_id de la DI
DROP POLICY IF EXISTS doc_di_select ON documents_di;
CREATE POLICY doc_di_select ON documents_di FOR SELECT
    USING (
        (SELECT public.current_role()) = 'admin'
        OR (
            (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
            AND EXISTS (
                SELECT 1 FROM demandes_intervention di
                WHERE di.id = documents_di.di_id
                  AND public.has_site_access(di.site_id)
            )
        )
    );

-- B.3 documents_equipements : remonter au site via equipement → local → niveau → batiment → site
DROP POLICY IF EXISTS doc_eq_select ON documents_equipements;
CREATE POLICY doc_eq_select ON documents_equipements FOR SELECT
    USING (
        (SELECT public.current_role()) = 'admin'
        OR (
            (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
            AND EXISTS (
                SELECT 1
                FROM equipements e
                JOIN locaux    l ON l.id = e.local_id
                JOIN niveaux   n ON n.id = l.niveau_id
                JOIN batiments b ON b.id = n.batiment_id
                WHERE e.id = documents_equipements.equipement_id
                  AND public.has_site_access(b.site_id)
            )
        )
    );

-- B.4 documents_locaux : remonter au site via local → niveau → batiment → site
DROP POLICY IF EXISTS doc_locaux_select ON documents_locaux;
CREATE POLICY doc_locaux_select ON documents_locaux FOR SELECT
    USING (
        (SELECT public.current_role()) = 'admin'
        OR (
            (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
            AND EXISTS (
                SELECT 1
                FROM locaux    l
                JOIN niveaux   n ON n.id = l.niveau_id
                JOIN batiments b ON b.id = n.batiment_id
                WHERE l.id = documents_locaux.local_id
                  AND public.has_site_access(b.site_id)
            )
        )
    );

-- B.5 documents_prestataires : remonter au scope du prestataire (prestataires_sites ;
--     prestataire interne/transverse sans site = visible, via can_access_prestataire).
DROP POLICY IF EXISTS doc_prest_scoped ON documents_prestataires;
CREATE POLICY doc_prest_scoped ON documents_prestataires FOR ALL
    USING ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND public.can_access_prestataire(prestataire_id))
    WITH CHECK ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND public.can_access_prestataire(prestataire_id));

DROP POLICY IF EXISTS doc_prest_select ON documents_prestataires;
CREATE POLICY doc_prest_select ON documents_prestataires FOR SELECT
    USING (
        (SELECT public.current_role()) = 'admin'
        OR ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
            AND public.can_access_prestataire(prestataire_id))
    );

-- B.6 documents_gammes : remonter au scope de la gamme (site_id NULL = bibliothèque
--     entreprise partagée, géré par can_access_gamme).
DROP POLICY IF EXISTS doc_gammes_scoped ON documents_gammes;
CREATE POLICY doc_gammes_scoped ON documents_gammes FOR ALL
    USING ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND public.can_access_gamme(gamme_id))
    WITH CHECK ((SELECT public.current_role()) IN ('manager', 'technicien')
           AND public.can_access_gamme(gamme_id));

DROP POLICY IF EXISTS doc_gammes_select ON documents_gammes;
CREATE POLICY doc_gammes_select ON documents_gammes FOR SELECT
    USING (
        (SELECT public.current_role()) = 'admin'
        OR ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
            AND public.can_access_gamme(gamme_id))
    );

-- B.7 documents_contrats : remonter au site du contrat (contrats.site_id NOT NULL depuis v0.24).
DROP POLICY IF EXISTS doc_contrats_scoped ON documents_contrats;
CREATE POLICY doc_contrats_scoped ON documents_contrats FOR ALL
    USING ((SELECT public.current_role()) = 'manager'
           AND EXISTS (SELECT 1 FROM contrats c
                       WHERE c.id = documents_contrats.contrat_id
                         AND public.has_site_access(c.site_id)))
    WITH CHECK ((SELECT public.current_role()) = 'manager'
           AND EXISTS (SELECT 1 FROM contrats c
                       WHERE c.id = documents_contrats.contrat_id
                         AND public.has_site_access(c.site_id)));

DROP POLICY IF EXISTS doc_contrats_select ON documents_contrats;
CREATE POLICY doc_contrats_select ON documents_contrats FOR SELECT
    USING (
        (SELECT public.current_role()) = 'admin'
        OR ((SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
            AND EXISTS (SELECT 1 FROM contrats c
                        WHERE c.id = documents_contrats.contrat_id
                          AND public.has_site_access(c.site_id)))
    );


-- =====================================================================
-- FIX C — Trigger cohérence site ↔ entités liées
-- =====================================================================
-- Defense in depth : même si la RLS s'effondre, le trigger empêche
-- de rattacher une observation à un OT d'un autre site.
-- Single-tenant : les contrôles cross-tenant historiques (OT/DI/document)
-- sont devenus triviaux et ont été supprimés.
-- =====================================================================

-- F06 (audit sécu) : le trigger de cohérence passe en SECURITY DEFINER
-- + search_path = '' + qualifs public.*. Sans SECURITY DEFINER un user
-- qui n'a pas de SELECT sur la table parente pourrait faire échouer
-- silencieusement le contrôle. La doctrine search_path = '' empêche tout
-- search_path hijack via schéma malveillant.

-- C.1 observations : ot_id lié doit porter le même site que l'observation
CREATE OR REPLACE FUNCTION public.check_obs_coherence_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ot_site UUID;
BEGIN
    IF NEW.ot_id IS NOT NULL THEN
        SELECT site_id INTO v_ot_site
        FROM public.ordres_travail WHERE id = NEW.ot_id;
        IF v_ot_site IS DISTINCT FROM NEW.site_id THEN
            RAISE EXCEPTION 'Observation : ot_id % (site %) incompatible avec obs.site_id %',
                NEW.ot_id, v_ot_site, NEW.site_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_obs_coherence_site
    BEFORE INSERT OR UPDATE OF site_id, ot_id
    ON observations
    FOR EACH ROW EXECUTE FUNCTION public.check_obs_coherence_site();
COMMENT ON FUNCTION public.check_obs_coherence_site() IS 'Defense in depth — une observation rattachée à un OT doit porter le même site que cet OT.';


-- =====================================================================
-- FIX D — Triggers cohérence site sur di_localisations & di_equipements
-- =====================================================================
-- Sans ces triggers, un demandeur (ou bug applicatif) pouvait rattacher
-- une DI du site A à un local / équipement du site B (même client) car
-- la table de liaison ne porte pas site_id.
-- =====================================================================

-- D.1 di_localisations : local doit appartenir au site de la DI (F06)
CREATE OR REPLACE FUNCTION public.check_di_localisation_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_di_site    UUID;
    v_local_site UUID;
BEGIN
    SELECT site_id INTO v_di_site FROM public.demandes_intervention WHERE id = NEW.di_id;
    SELECT b.site_id INTO v_local_site
    FROM public.locaux    l
    JOIN public.niveaux   n ON n.id = l.niveau_id
    JOIN public.batiments b ON b.id = n.batiment_id
    WHERE l.id = NEW.local_id;

    IF v_local_site IS NULL THEN
        RAISE EXCEPTION 'di_localisations : local_id % introuvable ou hiérarchie incomplète', NEW.local_id;
    END IF;
    IF v_local_site <> v_di_site THEN
        RAISE EXCEPTION 'di_localisations : local_id % (site %) n''appartient pas au site % de la DI %',
            NEW.local_id, v_local_site, v_di_site, NEW.di_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_di_localisation_site
    BEFORE INSERT OR UPDATE ON di_localisations
    FOR EACH ROW EXECUTE FUNCTION public.check_di_localisation_site();
COMMENT ON FUNCTION public.check_di_localisation_site() IS 'F06 — un local rattaché à une DI doit appartenir au site de la DI (la table de liaison ne porte pas site_id).';

-- D.2 di_equipements : équipement doit appartenir au site de la DI (F06)
CREATE OR REPLACE FUNCTION public.check_di_equipement_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_di_site UUID;
    v_eq_site UUID;
BEGIN
    SELECT site_id INTO v_di_site FROM public.demandes_intervention WHERE id = NEW.di_id;
    SELECT b.site_id INTO v_eq_site
    FROM public.equipements e
    JOIN public.locaux    l ON l.id = e.local_id
    JOIN public.niveaux   n ON n.id = l.niveau_id
    JOIN public.batiments b ON b.id = n.batiment_id
    WHERE e.id = NEW.equipement_id;

    IF v_eq_site IS NULL THEN
        RAISE EXCEPTION 'di_equipements : equipement_id % introuvable ou hiérarchie incomplète', NEW.equipement_id;
    END IF;
    IF v_eq_site <> v_di_site THEN
        RAISE EXCEPTION 'di_equipements : equipement_id % (site %) n''appartient pas au site % de la DI %',
            NEW.equipement_id, v_eq_site, v_di_site, NEW.di_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_di_equipement_site
    BEFORE INSERT OR UPDATE ON di_equipements
    FOR EACH ROW EXECUTE FUNCTION public.check_di_equipement_site();
COMMENT ON FUNCTION public.check_di_equipement_site() IS 'F06 — un équipement rattaché à une DI doit appartenir au site de la DI.';

-- F32 (audit sécu) — Pattern 6 defense-in-depth pour gammes_equipements
-- (manquant jusqu'ici, contrairement aux autres liaisons cross-domain) : une
-- gamme SITE et son équipement doivent appartenir au même site. Une gamme
-- bibliothèque (site_id NULL = modèle partagé inter-sites) est exemptée — elle
-- peut être liée à un équipement de n'importe quel site. Messages neutres.
CREATE OR REPLACE FUNCTION public.check_gamme_equipement_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_gamme_site UUID;
    v_eq_site    UUID;
BEGIN
    SELECT site_id INTO v_gamme_site FROM public.gammes WHERE id = NEW.gamme_id;

    -- Gamme bibliothèque (site_id NULL) : modèle partagé → pas de contrainte.
    IF v_gamme_site IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT b.site_id INTO v_eq_site
    FROM public.equipements e
    JOIN public.locaux    l ON l.id = e.local_id
    JOIN public.niveaux   n ON n.id = l.niveau_id
    JOIN public.batiments b ON b.id = n.batiment_id
    WHERE e.id = NEW.equipement_id;

    IF v_eq_site IS NULL THEN
        RAISE EXCEPTION 'gammes_equipements : équipement introuvable ou hiérarchie incomplète'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_eq_site IS DISTINCT FROM v_gamme_site THEN
        RAISE EXCEPTION 'gammes_equipements : gamme et équipement sur des sites différents (incohérence cross-site)'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gamme_equipement_site
    BEFORE INSERT OR UPDATE ON gammes_equipements
    FOR EACH ROW EXECUTE FUNCTION public.check_gamme_equipement_site();
COMMENT ON FUNCTION public.check_gamme_equipement_site() IS 'F32 — Pattern 6 : gamme SITE et son équipement sur le même site (gamme bibliothèque site_id NULL exemptée).';


-- =====================================================================
-- FIX D bis — Triggers cohérence site sur les liaisons de chantier (v0.33)
-- =====================================================================
-- Pattern 6 (calque FIX D des liaisons DI) : un local / équipement rattaché à un
-- chantier doit appartenir au site du chantier (la table de liaison ne porte pas
-- site_id). Sans ces triggers, un user pourrait rattacher un chantier du site A à
-- un local / équipement du site B.
-- =====================================================================

-- chantier_localisations : local doit appartenir au site du chantier
CREATE OR REPLACE FUNCTION public.check_chantier_localisation_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_chantier_site UUID;
    v_local_site    UUID;
BEGIN
    SELECT site_id INTO v_chantier_site FROM public.interventions_chantier WHERE id = NEW.chantier_id;
    SELECT b.site_id INTO v_local_site
    FROM public.locaux    l
    JOIN public.niveaux   n ON n.id = l.niveau_id
    JOIN public.batiments b ON b.id = n.batiment_id
    WHERE l.id = NEW.local_id;

    IF v_local_site IS NULL THEN
        RAISE EXCEPTION 'chantier_localisations : local_id % introuvable ou hiérarchie incomplète', NEW.local_id;
    END IF;
    IF v_local_site <> v_chantier_site THEN
        RAISE EXCEPTION 'chantier_localisations : local_id % (site %) n''appartient pas au site % du chantier %',
            NEW.local_id, v_local_site, v_chantier_site, NEW.chantier_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chantier_localisation_site
    BEFORE INSERT OR UPDATE ON chantier_localisations
    FOR EACH ROW EXECUTE FUNCTION public.check_chantier_localisation_site();
COMMENT ON FUNCTION public.check_chantier_localisation_site() IS 'Pattern 6 — un local rattaché à un chantier doit appartenir au site du chantier.';

-- chantier_equipements : équipement doit appartenir au site du chantier
CREATE OR REPLACE FUNCTION public.check_chantier_equipement_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_chantier_site UUID;
    v_eq_site       UUID;
BEGIN
    SELECT site_id INTO v_chantier_site FROM public.interventions_chantier WHERE id = NEW.chantier_id;
    SELECT b.site_id INTO v_eq_site
    FROM public.equipements e
    JOIN public.locaux    l ON l.id = e.local_id
    JOIN public.niveaux   n ON n.id = l.niveau_id
    JOIN public.batiments b ON b.id = n.batiment_id
    WHERE e.id = NEW.equipement_id;

    IF v_eq_site IS NULL THEN
        RAISE EXCEPTION 'chantier_equipements : equipement_id % introuvable ou hiérarchie incomplète', NEW.equipement_id;
    END IF;
    IF v_eq_site <> v_chantier_site THEN
        RAISE EXCEPTION 'chantier_equipements : equipement_id % (site %) n''appartient pas au site % du chantier %',
            NEW.equipement_id, v_eq_site, v_chantier_site, NEW.chantier_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chantier_equipement_site
    BEFORE INSERT OR UPDATE ON chantier_equipements
    FOR EACH ROW EXECUTE FUNCTION public.check_chantier_equipement_site();
COMMENT ON FUNCTION public.check_chantier_equipement_site() IS 'Pattern 6 — un équipement rattaché à un chantier doit appartenir au site du chantier.';


-- =====================================================================
-- FIX E — Figer site_id d'un OT (complément protection_ot_terminaux)
-- =====================================================================
-- protection_ot_terminaux (050_triggers_validation.sql L219) fige déjà
-- gamme_id. On ajoute un trigger complémentaire qui interdit toute
-- modification de site_id après création, sauf admin
-- (qui doit pouvoir corriger un OT mal rattaché).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.protect_ot_site_immutable()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF (SELECT public.current_role()) = 'admin' THEN
        RETURN NEW;
    END IF;

    IF OLD.site_id IS DISTINCT FROM NEW.site_id THEN
        RAISE EXCEPTION 'site_id d''un OT est figé après création (sauf admin)';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_ot_site
    BEFORE UPDATE OF site_id ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.protect_ot_site_immutable();
COMMENT ON FUNCTION public.protect_ot_site_immutable() IS 'site_id d''un OT figé après création (complément à protection_ot_terminaux qui fige gamme_id). Admin bypass.';


-- =====================================================================
-- FIX F — Policy user_sites_manager_select (gestion d'équipe)
-- =====================================================================
-- Le manager doit pouvoir lister les affectations sur SES sites pour
-- gérer ses équipes. Sans cette policy il n'a accès qu'à ses propres
-- lignes (user_sites_self_select). On ajoute une policy SELECT ciblée
-- sur ce rôle, scopée par has_site_access.
-- =====================================================================
CREATE POLICY user_sites_manager_select ON user_sites FOR SELECT
    USING (
        (SELECT public.current_role()) = 'manager'
        AND public.has_site_access(site_id)
    );


-- =====================================================================
-- RPC get_audit_trail — consultation de l'historique d'un enregistrement
-- =====================================================================
-- Réponse au besoin « qui a modifié cette DI / cet OT, et quand ? ».
-- Admin : métadonnées + payloads complets (before/after).
-- Manager : métadonnées seules (action, date, auteur), SANS les payloads PII,
--   et uniquement pour une ligne dont il a le scope site (dérivé de la table
--   métier vivante). audit_log étant transverse (pas de site_id) et FORCE RLS,
--   l'accès passe par cette RPC contrôlée, jamais par une policy brute.
-- SECURITY DEFINER justifié : lecture d'audit_log (FORCE RLS) + logique de
--   scope custom. search_path = '' (doctrine).
CREATE OR REPLACE FUNCTION public.get_audit_trail(p_table_name TEXT, p_row_pk TEXT)
RETURNS TABLE (
    id      BIGINT,
    action  TEXT,
    at      TIMESTAMPTZ,
    user_id UUID,
    before  JSONB,
    after   JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_role     TEXT := public.current_role();
    v_is_admin BOOLEAN := (v_role = 'admin');
    v_site     UUID;
BEGIN
    IF v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'manager' THEN
        RAISE EXCEPTION 'Consultation de l''audit réservée à l''admin et au manager'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT v_is_admin THEN
        IF p_table_name = 'demandes_intervention' THEN
            SELECT site_id INTO v_site FROM public.demandes_intervention WHERE demandes_intervention.id = p_row_pk::uuid;
        ELSIF p_table_name = 'ordres_travail' THEN
            SELECT site_id INTO v_site FROM public.ordres_travail WHERE ordres_travail.id = p_row_pk::uuid;
        ELSIF p_table_name = 'observations' THEN
            SELECT site_id INTO v_site FROM public.observations WHERE observations.id = p_row_pk::uuid;
        ELSIF p_table_name = 'operations_execution' THEN
            SELECT ot.site_id INTO v_site
            FROM public.operations_execution oe
            JOIN public.ordres_travail ot ON ot.id = oe.ordre_travail_id
            WHERE oe.id = p_row_pk::uuid;
        ELSE
            RAISE EXCEPTION 'Table % non consultable via get_audit_trail', p_table_name
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        IF v_site IS NULL OR NOT public.has_site_access(v_site) THEN
            RAISE EXCEPTION 'Accès refusé à l''historique de cet enregistrement'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    RETURN QUERY
    SELECT a.id, a.action, a.at, a.user_id,
           CASE WHEN v_is_admin THEN a.before ELSE NULL END,
           CASE WHEN v_is_admin THEN a.after  ELSE NULL END
    FROM public.audit_log a
    WHERE a.table_name = p_table_name
      AND a.row_pk = p_row_pk
    ORDER BY a.at DESC;
END;
$fn$;

COMMENT ON FUNCTION public.get_audit_trail(TEXT, TEXT) IS
    'Historique audit d''un enregistrement des 4 tables auditées. Admin : métadonnées + payloads before/after. Manager : métadonnées seules (sans PII), scopé à ses sites. SECURITY DEFINER (audit_log FORCE RLS).';


-- =====================================================================
-- FIX G (F19 audit sécu) — Cohérence sémantique de ordres_travail.origine
-- =====================================================================
-- L'ENUM ot_origine a 2 valeurs aux sémantiques fortes :
--   - 'programme' : maintenance préventive systématique (cycle calendaire),
--                   créée par le trigger de génération à la clôture du précédent
--   - 'planifie'  : intervention manuelle décidée par un humain (planning ad hoc)
--
-- Bascule (décision PO 2026-06-01) : un OT 'programme' dont un HUMAIN déplace la
-- date prévue passe en 'planifie' (la date n'est plus dictée par le cycle auto mais
-- par une décision humaine). Géré par bascule_origine_sur_date_manuelle ci-dessous.
--
-- Sans ce trigger, n'importe quel user pouvait créer un OT avec origine='programme'
-- alors qu'il n'est pas le cron : preuve de conformité réglementaire faussée.
-- (Le lien OT↔DI a été retiré : un OT ne référence plus aucune DI.)
--
-- En plus : origine devient immutable après création (cohérent avec gamme_id,
-- site_id figés par protection_ot_terminaux et FIX E).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_ot_origine_coherence()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- UPDATE : origine figée à la création (sauf admin pour corriger un bug).
    -- EXCEPTION légitime (décision PO 2026-06-01) : la transition programme →
    -- planifie est autorisée pour tous. Elle traduit le fait qu'un humain a repris
    -- la main sur la date d'un OT auto (cf bascule_origine_sur_date_manuelle). Le
    -- sens inverse (planifie → programme) reste réservé à l'admin : prétendre qu'un
    -- OT manuel est une preuve de cycle réglementaire automatique serait une falsification.
    IF TG_OP = 'UPDATE' AND OLD.origine IS DISTINCT FROM NEW.origine THEN
        IF NOT (OLD.origine = 'programme' AND NEW.origine = 'planifie')
           AND (SELECT public.current_role()) IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION
                'origine d''un OT est figée après création (% → %). Annulez l''OT et recréez si nécessaire.',
                OLD.origine, NEW.origine;
        END IF;
    END IF;

    -- origine = 'programme' : 3 cas autorisés (F19 + F28 + F33 + F41 audit) :
    --   1. trigger système generate_next_ot_on_cloture (pose la GUC)
    --   2. admin (correction manuelle / amorçage de masse)
    --   3. AMORÇAGE par un humain habilité = 1er OT de la gamme (aucun autre
    --      OT n'existe pour cette gamme). Depuis F41 (RBAC v2), tous les rôles
    --      avec policy INSERT sur ordres_travail peuvent amorcer : admin,
    --      manager ET technicien (rôle central, cf RBAC v2 2026-05-19).
    --      Les OT suivants sont créés automatiquement par le trigger de clôture.
    -- Garde d'AMORÇAGE : ne concerne que la CRÉATION (INSERT). Sans le garde
    -- TG_OP='INSERT', un UPDATE full-row (pattern supabase-js qui renvoie origine
    -- inchangée = 'programme') re-déclenchait ce contrôle anti-doublon et bloquait
    -- toute édition courante d'un OT préventif généré par un non-admin. La sémantique
    -- d'origine sur UPDATE est entièrement gérée par le 1er bloc ci-dessus.
    IF TG_OP = 'INSERT' AND NEW.origine = 'programme' THEN
        IF current_setting('app.cron_generate_ot', true) IS DISTINCT FROM 'on'
           AND (SELECT public.current_role()) IS DISTINCT FROM 'admin'
           AND EXISTS (
               SELECT 1 FROM public.ordres_travail
               WHERE gamme_id = NEW.gamme_id AND id IS DISTINCT FROM NEW.id
           )
        THEN
            RAISE EXCEPTION
                'origine=''programme'' interdite ici : la gamme a déjà des OT. Le prochain OT préventif sera créé automatiquement à la clôture du précédent.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_ot_origine_coherence
    BEFORE INSERT OR UPDATE OF origine ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.check_ot_origine_coherence();
COMMENT ON FUNCTION public.check_ot_origine_coherence() IS
    'F19 + F28 audit : verrouille la sémantique de ot_origine. ''programme'' autorisé pour : trigger système (GUC posée), admin, ou 1er OT de la gamme (amorçage humain). ''planifie'' = OT créé manuellement. Origine figée après création (admin bypass) SAUF la bascule légitime programme → planifie (reprise humaine de la date, v0.28).';

-- ═══════════════════════════════════════════════════════════════════════════
-- Bascule origine programme → planifie sur reprise humaine de la date (v0.28)
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision PO 2026-06-01 : « programmé » = OT généré par le trigger automatique ;
-- « planifié » = la date est posée/déplacée par un humain. Donc dès qu'un humain
-- modifie date_prevue d'un OT 'programme', il devient 'planifie'.
--
-- Innocuité des chemins SYSTÈME (jamais de faux positif) :
--   - génération auto = INSERT d'un nouvel OT → ce trigger (UPDATE) ne s'arme pas ;
--   - résurrection (annule → planifie) touche date_debut/date_cloture, PAS date_prevue ;
--   - OT terminal (cloture/annule) : date_prevue figée par protection_ot_terminaux
--     → l'UPDATE est rejeté en amont, la bascule ne s'applique qu'aux OT actifs.
CREATE OR REPLACE FUNCTION public.bascule_origine_sur_date_manuelle()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.origine = 'programme'
       AND NEW.date_prevue IS DISTINCT FROM OLD.date_prevue THEN
        NEW.origine := 'planifie';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bascule_origine_date
    BEFORE UPDATE OF date_prevue ON ordres_travail
    FOR EACH ROW
    EXECUTE FUNCTION public.bascule_origine_sur_date_manuelle();
COMMENT ON FUNCTION public.bascule_origine_sur_date_manuelle() IS
    'v0.28 (décision PO) : un OT ''programme'' (généré auto) dont un humain déplace date_prevue passe en ''planifie''. Les chemins système ne touchent pas date_prevue sur un OT existant (génération = INSERT, résurrection = date_debut/cloture) → aucun faux positif.';


-- =====================================================================
-- BIBLIOTHÈQUE DE GAMMES — règle « modèle inerte » (MVP 2026-05-20)
-- =====================================================================
-- Une gamme avec site_id IS NULL est un MODÈLE entreprise (inerte) :
-- elle ne doit JAMAIS porter d'OT. Tout OT doit pointer vers une gamme
-- SITE (site_id renseigné), et la gamme doit appartenir AU MÊME site
-- que l'OT (cohérence site OT ↔ gamme — defense-in-depth Pattern 6,
-- la RLS ne vérifie pas la cohérence des FK).
--
-- gamme_id et site_id de l'OT sont déjà figés après création
-- (protection_ot_terminaux + protect_ot_site_immutable). Ce trigger
-- couvre l'INSERT et l'UPDATE de ces deux colonnes par prudence.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_ot_gamme_site()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_gamme_site UUID;
    v_found      BOOLEAN;
BEGIN
    -- Cas légitime : déclassement post-purge gamme (FK ON DELETE SET NULL).
    -- L'OT clôturé survit en autonomie grâce aux snapshots figés (Pattern 1).
    -- L'INSERT d'un OT avec gamme_id NULL est déjà bloqué par
    -- validation_gamme_avec_operations (RAISE explicite en tête de fonction).
    IF NEW.gamme_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT g.site_id, true
    INTO v_gamme_site, v_found
    FROM public.gammes g
    WHERE g.id = NEW.gamme_id;

    IF NOT COALESCE(v_found, false) THEN
        RAISE EXCEPTION 'Gamme % introuvable', NEW.gamme_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Une gamme modèle (site_id NULL) ne peut pas porter d'OT.
    IF v_gamme_site IS NULL THEN
        RAISE EXCEPTION
            'Un OT ne peut pas être créé sur un modèle de gamme — injectez d''abord la gamme sur un site (copier_gamme).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Cohérence site : l'OT et sa gamme doivent partager le même site.
    IF v_gamme_site IS DISTINCT FROM NEW.site_id THEN
        RAISE EXCEPTION
            'Incohérence site : la gamme % est rattachée au site %, l''OT au site %.',
            NEW.gamme_id, v_gamme_site, NEW.site_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_ot_gamme_site
    BEFORE INSERT OR UPDATE OF gamme_id, site_id ON ordres_travail
    FOR EACH ROW EXECUTE FUNCTION public.check_ot_gamme_site();
COMMENT ON FUNCTION public.check_ot_gamme_site() IS
    'Bibliothèque de gammes : un OT ne peut pointer que vers une gamme SITE (site_id renseigné), jamais un modèle entreprise (site_id NULL), et la gamme doit appartenir au même site que l''OT (defense-in-depth Pattern 6).';


-- =====================================================================
-- FIX H — Bornes de taille sur colonnes TEXT verbose
-- =====================================================================
-- Defense en profondeur §3 supabase-security.md ("Couche 3 Postgres").
-- Évite qu'un user authentifié écrive 1Mo+ dans un champ libre (DoS soft,
-- gonflement BDD, alourdissement exports/PDF). Limite = 5000 chars =
-- ~1 page A4 dense, largement suffisant pour un commentaire de maintenance,
-- un constat de demande d'intervention ou une observation terrain.
-- Cible : colonnes ÉCRITES par les rôles non-admin (technicien, demandeur,
-- manager). Les colonnes de référentiels (description, libelle)
-- ne sont pas concernées car écrites uniquement par l'admin.
-- =====================================================================

ALTER TABLE equipements
    ADD CONSTRAINT equipements_commentaires_taille
    CHECK (commentaires IS NULL OR length(commentaires) <= 5000);

ALTER TABLE prestataires
    ADD CONSTRAINT prestataires_commentaires_taille
    CHECK (commentaires IS NULL OR length(commentaires) <= 5000);

ALTER TABLE ordres_travail
    ADD CONSTRAINT ot_commentaires_taille
    CHECK (commentaires IS NULL OR length(commentaires) <= 5000);

ALTER TABLE operations_execution
    ADD CONSTRAINT opex_commentaires_taille
    CHECK (commentaires IS NULL OR length(commentaires) <= 5000);

ALTER TABLE demandes_intervention
    ADD CONSTRAINT di_constat_taille
    CHECK (length(constat) <= 5000);

ALTER TABLE observations
    ADD CONSTRAINT obs_description_taille
    CHECK (length(description) <= 5000);


-- =====================================================================
-- FIX I (F40 audit RBAC v2) — Plein pouvoir métier au technicien
-- =====================================================================
-- Le technicien est le rôle central de Dédale (cf RBAC v2 2026-05-19,
-- mémoire projet_dedale_rbac_v2). C'est lui qui produit la donnée sur le
-- terrain. Plein pouvoir sur son giron (sites assignés via has_site_access).
-- Seule limite : PAS de création de site (réservé admin + manager —
-- un technicien est attaché à des sites, pas créateur de sites).
-- PAS de création de comptes (réservée manager + admin).
--
-- Ce bloc complète les policies existantes (PERMISSIVE OR) : sur les
-- entités déjà site-scopées (equipements/batiments/niveaux/locaux/
-- observations/demandes_intervention), le technicien est déjà couvert par
-- les *_site_scoped_write/update qui listent 'technicien'. On ajoute donc
-- les manquants :
--   - ordres_travail : INSERT/UPDATE/DELETE (avant : seul UPDATE, et
--     manager_insert excluait technicien → impossible d'amorcer le 1er OT
--     ni de créer un OT correctif manuellement).
--   - prestataires, contrats, modeles_operations + items + liaisons
--     (gamme_modeles, gammes_equipements, contrats_gammes) :
--     plein pouvoir (référentiels d'entreprise, pas de site_id direct).
--   - gammes : bibliothèque scope 2 niveaux — écriture limitée aux gammes
--     SITE des sites assignés (les modèles entreprise restent admin/manager) ;
--     operations : écriture sur les opérations d'une gamme accessible.
--   - prestataires_sites : gestion des affectations sur ses sites.
--   - documents : UPDATE en complément de l'INSERT existant.
--
-- Le scope se limite aux sites assignés via has_site_access.
-- =====================================================================

-- 1. ordres_travail — plein pouvoir (INSERT/UPDATE/DELETE) sur ses sites.
-- L'INSERT permet l'amorçage 1er OT (F41) et la création d'OT correctif
-- manuel. La DELETE physique reste bloquée par protection_ot_terminaux
-- (trigger BEFORE DELETE) ; seul le soft-delete via deleted_at est possible.
CREATE POLICY ot_technicien_all ON ordres_travail FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND public.has_site_access(site_id)
    );

-- 2. prestataires — v0.21 : CLOISONNÉ par site comme le manager (décision
-- 2026-05-31 : plus de FOR ALL cross-site). SELECT couvert par
-- prestataires_site_scoped_select ; INSERT/UPDATE scopés via prestataires_sites
-- (convention : prestataire sans site = visible/éditable par tous). Le trigger
-- protect_prestataire_interne protège le prestataire interne.
CREATE POLICY prestataires_technicien_insert ON prestataires FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND (
            NOT EXISTS (SELECT 1 FROM prestataires_sites ps WHERE ps.prestataire_id = prestataires.id)
            OR EXISTS (
                SELECT 1 FROM prestataires_sites ps
                WHERE ps.prestataire_id = prestataires.id
                  AND public.has_site_access(ps.site_id)
            )
        )
    );

CREATE POLICY prestataires_technicien_update ON prestataires FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND (
            NOT EXISTS (SELECT 1 FROM prestataires_sites ps WHERE ps.prestataire_id = prestataires.id)
            OR EXISTS (
                SELECT 1 FROM prestataires_sites ps
                WHERE ps.prestataire_id = prestataires.id
                  AND public.has_site_access(ps.site_id)
            )
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND (
            NOT EXISTS (SELECT 1 FROM prestataires_sites ps WHERE ps.prestataire_id = prestataires.id)
            OR EXISTS (
                SELECT 1 FROM prestataires_sites ps
                WHERE ps.prestataire_id = prestataires.id
                  AND public.has_site_access(ps.site_id)
            )
        )
    );

-- 3. prestataires_sites — gestion des affectations site sur ses sites.
CREATE POLICY prestataires_sites_technicien_all ON prestataires_sites FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND public.has_site_access(site_id)
    );

-- 4. contrats — plein pouvoir sur les contrats de SES prestataires (F32 :
-- cloisonné par site via le prestataire, plus de "tout voir" cross-site).
CREATE POLICY contrats_technicien_all ON contrats FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND public.has_site_access(site_id)
    );

-- 5. contrats_gammes — liaison contrats ↔ gammes (F32 : cloisonné via la gamme).
-- Inviolabilité du commun (2026-06-10) : can_access_gamme_site exclut le commun
-- (site_id NULL) → un technicien n'écrit JAMAIS la liaison d'une gamme commune.
CREATE POLICY contrats_gammes_technicien_all ON contrats_gammes FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND public.can_access_gamme_site(gamme_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND public.can_access_gamme_site(gamme_id)
    );

-- 6. gammes — bibliothèque scope 2 niveaux. Le technicien écrit UNIQUEMENT
-- des gammes SITE sur ses sites assignés (matrice biblio 2026-05-20 : créer/
-- modifier une gamme site = technicien ses sites ; les modèles entreprise
-- restent réservés à admin/manager). La lecture des modèles entreprise est
-- couverte par gammes_select (rôle technicien inclus).
CREATE POLICY gammes_technicien_site_write ON gammes FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    );

-- 7. operations — opérations spécifiques d'une gamme. L'accès suit la gamme
-- parente. Le technicien écrit les opérations des gammes SITE de son périmètre
-- UNIQUEMENT — il ne touche jamais aux opérations d'un modèle entreprise
-- (site_id IS NULL), cohérent avec la matrice : modèles = admin + manager.
CREATE POLICY operations_technicien_write ON operations FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND EXISTS (
            SELECT 1 FROM gammes g
            WHERE g.id = operations.gamme_id
              AND g.site_id IS NOT NULL
              AND public.has_site_access(g.site_id)
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND EXISTS (
            SELECT 1 FROM gammes g
            WHERE g.id = operations.gamme_id
              AND g.site_id IS NOT NULL
              AND public.has_site_access(g.site_id)
        )
    );

-- 8. modeles_operations — plein pouvoir sur ses SITES UNIQUEMENT.
-- La bibliothèque entreprise (site_id IS NULL) est réservée à admin + manager
-- (règle universelle 2026-05-25). Le tech garde le SELECT via modeles_operations_select
-- (peut lire la biblio) et la capacité de RATTACHER un modèle entreprise à une de
-- ses gammes via gamme_modeles_technicien_all (inchangée).
CREATE POLICY modeles_operations_technicien_all ON modeles_operations FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    );

-- 9. modeles_operations_items — items d'un modèle. Aligné sur la restriction de
-- la table parente : tech écrit uniquement sur les items de modèles scope SITE
-- auxquels il a accès. Les items des modèles entreprise restent réservés à
-- admin + manager (règle universelle 2026-05-25).
CREATE POLICY modeles_items_technicien_all ON modeles_operations_items FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND EXISTS (
            SELECT 1 FROM modeles_operations mo
            WHERE mo.id = modeles_operations_items.modele_operation_id
              AND mo.site_id IS NOT NULL
              AND public.has_site_access(mo.site_id)
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND EXISTS (
            SELECT 1 FROM modeles_operations mo
            WHERE mo.id = modeles_operations_items.modele_operation_id
              AND mo.site_id IS NOT NULL
              AND public.has_site_access(mo.site_id)
        )
    );

-- 10. gamme_modeles — liaison gammes ↔ modeles_operations (cloisonnée par site
-- via la gamme parente, comme gammes_equipements / contrats_gammes).
-- Inviolabilité du commun (2026-06-10) : can_access_gamme_site exclut le commun
-- (site_id NULL) → un technicien n'écrit JAMAIS la liaison d'une gamme commune.
CREATE POLICY gamme_modeles_technicien_all ON gamme_modeles FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND public.can_access_gamme_site(gamme_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND public.can_access_gamme_site(gamme_id)
    );

-- 10bis. modeles_equipements — plein pouvoir sur ses SITES UNIQUEMENT
-- (règle universelle 2026-05-25, calque modeles_operations_technicien_all).
-- La bibliothèque entreprise (site_id IS NULL) est réservée à admin + manager.
-- Le tech garde le SELECT via modeles_equipements_select (peut lire la biblio
-- pour l'utiliser via instancier_equipement).
CREATE POLICY modeles_equipements_technicien_all ON modeles_equipements FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND site_id IS NOT NULL
        AND public.has_site_access(site_id)
    );

-- 11. gammes_equipements — liaison gammes ↔ equipements (F32 : cloisonné par
-- site via l'équipement).
CREATE POLICY gammes_equipements_technicien_all ON gammes_equipements FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND public.can_access_equipement(equipement_id)
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND public.can_access_equipement(equipement_id)
    );

-- 12. documents — UPDATE en complément de l'INSERT existant
-- (documents_manager_tech_insert inclut déjà 'technicien'). Le SELECT
-- est déjà couvert par documents_site_scoped_select.
CREATE POLICY documents_technicien_update ON documents FOR UPDATE
    USING ((SELECT public.current_role()) = 'technicien')
    WITH CHECK ((SELECT public.current_role()) = 'technicien');


-- =====================================================================
-- FIX J (F38 + F39 audit RBAC v2) — Cascade création comptes + attribution sites
-- =====================================================================
-- Implémente la matrice RBAC v2 pour la création de users et l'attribution
-- de sites. Technicien rôle central, manager supervise une région, admin
-- patron de l'instance.
--
-- Cascade création comptes (qui peut créer/modifier/supprimer qui) :
--   admin       → tous les rôles                            (users_admin_all)
--   manager     → technicien, lecteur, demandeur            (P2 ajouté ici)
--   technicien  → lecteur, demandeur                        (P3 ajouté ici)
--
-- Attribution sites (user_sites) :
--   admin       → partout                                   (user_sites_admin_all)
--   manager     → ses sites uniquement                      (P4 ajouté ici)
--
-- Toutes ces policies sont PERMISSIVE (défaut) → ORées avec les existantes.
-- Le filtre role IN (...) anti-escalade : un manager ne peut pas créer un
-- admin par mass-assignment ; un technicien ne peut pas créer de techniciens.
-- v0.29 : USING borné par public.shares_site_with(id) — un manager/technicien ne
-- GÈRE (voit/modifie/supprime) que les comptes de rôle inférieur partageant un de
-- ses sites, plus toute l'entreprise (le provisioning initial passe par le trigger
-- handle_new_auth_user en SECURITY DEFINER, qui valide cascade + scope hors RLS).
-- =====================================================================

-- P2. users — Manager provisionne technicien/lecteur/demandeur.
-- Filtre role IN (...) interdit l'escalade vers admin ou manager.
CREATE POLICY users_manager_provision ON users FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND role_id IN (SELECT id FROM public.roles WHERE code IN ('technicien', 'lecteur', 'demandeur'))
        AND public.shares_site_with(id)   -- v0.29 : cloisonnement — gère uniquement les comptes partageant un de ses sites
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND role_id IN (SELECT id FROM public.roles WHERE code IN ('technicien', 'lecteur', 'demandeur'))
    );

-- P3. users — Technicien provisionne lecteur/demandeur.
-- Cas usage : technicien d'un site qui invite une gouvernante (demandeur)
-- ou un directeur d'hôtel (lecteur). Il ne peut PAS créer d'autres
-- techniciens (réservé manager + admin).
CREATE POLICY users_technicien_provision ON users FOR ALL
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND role_id IN (SELECT id FROM public.roles WHERE code IN ('lecteur', 'demandeur'))
        AND public.shares_site_with(id)   -- v0.29 : cloisonnement — gère uniquement les comptes partageant un de ses sites
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND role_id IN (SELECT id FROM public.roles WHERE code IN ('lecteur', 'demandeur'))
    );

-- P4. user_sites — Manager attribue des sites à ses subordonnés.
-- Garde-fous :
--   - has_site_access(site_id)  : le manager ne peut attribuer QUE ses
--     propres sites (pas d'extension de périmètre via auto-affectation).
--   - EXISTS (users)            : le user attribué est d'un rôle attribuable
--     (tech/lecteur/demandeur). Pas d'attribution à un admin ni à un autre
--     manager (attribués par l'admin uniquement).
-- Le SELECT est déjà couvert par user_sites_manager_select (FIX F).
CREATE POLICY user_sites_manager_provision ON user_sites FOR ALL
    USING (
        (SELECT public.current_role()) = 'manager'
        AND public.has_site_access(site_id)
        AND EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = user_sites.user_id
              AND u.role_id IN (SELECT id FROM public.roles WHERE code IN ('technicien', 'lecteur', 'demandeur'))
        )
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND public.has_site_access(site_id)
        AND EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = user_sites.user_id
              AND u.role_id IN (SELECT id FROM public.roles WHERE code IN ('technicien', 'lecteur', 'demandeur'))
        )
    );


-- =====================================================================
-- FIN 061_fix_compartimentage.sql
-- =====================================================================


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  070_cron_et_generation_ot.sql
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- =============================================================================
-- 070 — Cron jobs + génération événementielle des OT préventifs
--
-- F27 (audit 3e passe) : refonte majeure du modèle de génération des OT.
-- Avant : 3 crons opérationnels (check_observations_caduques, generate_next_ots,
--         cleanup_orphan_documents) + 1 cron RGPD (purge_corbeille_90j).
-- Après : 1 seul cron RGPD (purge_corbeille_90j) + génération événementielle
--         du prochain OT au moment de la clôture du précédent (trigger).
--
-- Justification (décision 2026-05-19) :
--   - À l'échelle 250 clients × milliers de gammes, un cron 03h qui scanne
--     toutes les gammes = charge serveur ingérable.
--   - Le statut 'caduque' (observations) est supprimé : l'UI gère l'affichage
--     "en retard" via echeance < CURRENT_DATE (pas besoin de cron pour écrire).
--   - Le cleanup d'orphans Storage présente un risque (purger un PDF utile par
--     bug) sans valeur métier forte : on accepte l'accumulation de fichiers
--     orphelins en V1 (faible volume attendu).
--
-- Restent en cron :
--   - purge_corbeille_90j : RGPD, hors charge transactionnelle, 1 fois/jour
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. generate_next_ot_for_gamme — création du prochain OT pour UNE gamme donnée
-- ═══════════════════════════════════════════════════════════════════════════
-- F27 audit : appelée par le trigger trg_ot_generate_next AFTER UPDATE OF statut
-- (passage → cloture). Ne traite QUE la gamme passée en paramètre — pas de
-- scan global. created_by = celui qui a clôturé l'OT précédent (closed_by).
--
-- Logique de date (F26 audit : périodicité semaine ISO, plus de tolerance_jours
-- dans le calcul) :
--   date_prevue = p_date_cloture_precedent + jours_periodicite (jours civils).
--   L'OT généré vit dans la semaine ISO contenant cette date.
--
-- Conditions de non-génération (sortie silencieuse, pas d'exception) :
--   - gamme inactive ou supprimée
--   - périodicité = 0 (one-shot)
--   - un OT actif existe déjà pour cette gamme (sécurité anti-doublon)
--   - aucun site actif (cas pathologique)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.generate_next_ot_for_gamme(
    p_gamme_id   UUID,
    p_created_by UUID,
    p_site_id    UUID,
    p_date_cloture_precedent DATE
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_gamme         RECORD;
    v_site_final    UUID;
    v_date_prevue   DATE;
    v_new_ot_id     UUID;
BEGIN
    -- Charger la gamme + sa périodicité
    SELECT g.id, g.site_id, g.prestataire_id, g.est_active, g.deleted_at,
           p.jours_periodicite, p.tolerance_jours, p.libelle
    INTO v_gamme
    FROM public.gammes g
    JOIN public.periodicites p ON p.id = g.periodicite_id
    WHERE g.id = p_gamme_id;

    -- Conditions de non-génération (sortie silencieuse)
    IF v_gamme IS NULL OR NOT v_gamme.est_active OR v_gamme.deleted_at IS NOT NULL THEN
        RETURN NULL;
    END IF;

    -- Bibliothèque de gammes : une gamme modèle (site_id NULL) est INERTE,
    -- elle ne génère jamais d'OT — sortie silencieuse.
    IF v_gamme.site_id IS NULL THEN
        RETURN NULL;
    END IF;
    IF v_gamme.jours_periodicite IS NULL OR v_gamme.jours_periodicite <= 0 THEN
        RETURN NULL;
    END IF;

    -- Sécurité anti-doublon : pas d'autre OT actif sur cette gamme
    IF EXISTS (
        SELECT 1 FROM public.ordres_travail
        WHERE gamme_id = p_gamme_id
          AND statut NOT IN ('cloture', 'annule')
          AND deleted_at IS NULL
    ) THEN
        RETURN NULL;
    END IF;

    -- Calcul de la prochaine date prévue, CALÉE sur la semaine ISO (lundi) — F26 / v0.12.
    -- date_trunc('week', ...) renvoie le lundi 00:00 de la semaine ISO contenant la date,
    -- donc l'OT tombe toujours pile au début d'une semaine ISO (lundi→dimanche).
    v_date_prevue := date_trunc('week',
                         COALESCE(p_date_cloture_precedent, CURRENT_DATE)
                         + (v_gamme.jours_periodicite * INTERVAL '1 day')
                     )::date;

    -- F34 (audit 4e passe) — site du successeur = site du précédent OT
    -- (continuité métier). Fallback : site de la gamme si p_site_id NULL
    -- (cas d'amorçage manuel où l'appelant ne le précise pas — peu probable car
    -- le trigger fournit toujours NEW.site_id). Le site retenu DOIT être celui
    -- de la gamme : trg_check_ot_gamme_site rejette sinon l'INSERT.
    IF p_site_id IS NOT NULL THEN
        -- Vérifie que le site est toujours actif
        SELECT id INTO v_site_final
        FROM public.sites
        WHERE id = p_site_id
          AND deleted_at IS NULL;
    END IF;

    IF v_site_final IS NULL THEN
        -- Fallback : le site propre de la gamme (cohérent avec check_ot_gamme_site)
        SELECT id INTO v_site_final
        FROM public.sites
        WHERE id = v_gamme.site_id
          AND deleted_at IS NULL;
    END IF;

    IF v_site_final IS NULL THEN
        RAISE LOG 'generate_next_ot_for_gamme: gamme % sans site actif, abandon',
            p_gamme_id;
        RETURN NULL;
    END IF;

    -- F19 audit : signature de génération système via GUC LOCAL pour autoriser
    -- origine='programme' (sans cette GUC, check_ot_origine_coherence refuserait).
    PERFORM set_config('app.cron_generate_ot', 'on', true);

    -- F31 (audit 4e passe) : seconde GUC pour bypasser protect_ot_immutable_fields
    -- pendant la chaîne d'UPDATE des snapshots du nouveau OT (Pattern 1) déclenchée
    -- par creation_ot_orchestrator → snapshot_ot_from_gamme. Sans ce bypass, un
    -- technicien qui clôt un OT fait échouer toute la chaîne de génération.
    PERFORM set_config('app.system_ot_generation', 'on', true);

    -- INSERT du nouvel OT. Les snapshots seront peuplés par le trigger
    -- creation_ot_orchestrator (Pattern 1 — snapshots figés Option B).
    BEGIN
        INSERT INTO public.ordres_travail (
            site_id, gamme_id, prestataire_id,
            origine, date_prevue,
            nom_gamme, nature_gamme, nom_prestataire, libelle_periodicite,
            jours_periodicite, tolerance_jours,
            created_by
        ) VALUES (
            v_site_final, p_gamme_id, v_gamme.prestataire_id,
            'programme'::public.ot_origine, v_date_prevue,
            'TEMP', 'maintenance_preventive'::public.gamme_nature, 'TEMP', 'TEMP',
            v_gamme.jours_periodicite, COALESCE(v_gamme.tolerance_jours, 0),
            p_created_by
        )
        RETURNING id INTO v_new_ot_id;

        RETURN v_new_ot_id;
    EXCEPTION WHEN OTHERS THEN
        -- F05 audit : LOG + SQLSTATE court (pas SQLERRM qui peut leak PII).
        RAISE LOG 'generate_next_ot_for_gamme: skip gamme % (errcode=%)',
            p_gamme_id, SQLSTATE;
        -- v0.12 : remonter l'échec dans security_alerts (sinon totalement silencieux).
        -- La clôture de l'OT courant n'est PAS bloquée (RETURN NULL), mais l'admin est alerté
        -- qu'un OT préventif n'a pas pu être recréé.
        INSERT INTO public.security_alerts (indicator, severity, details)
        VALUES ('ot_generation_failed', 'warning',
                jsonb_build_object('gamme_id', p_gamme_id, 'sqlstate', SQLSTATE));
        RETURN NULL;
    END;
END;
$$;

COMMENT ON FUNCTION public.generate_next_ot_for_gamme(UUID, UUID, UUID, DATE) IS
    'F27 + F34 audit : crée le prochain OT préventif pour UNE gamme donnée, appelée par trigger AFTER UPDATE de clôture. date_prevue = p_date_cloture + jours_periodicite (semaine ISO F26). site_id = p_site_id (continuité du précédent OT, F34). created_by = closed_by. Sortie silencieuse si conditions non remplies (gamme inactive, OT actif existant, site supprimé).';

-- ═══════════════════════════════════════════════════════════════════════════
-- Triggers événementiels : BEFORE UPDATE peuple closed_by, AFTER UPDATE
-- génère le prochain OT. F25 + F27 audit.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_ot_closed_by()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- F25 audit : force closed_by = (SELECT auth.uid()) au passage statut → cloture.
    -- BEFORE UPDATE : la valeur est écrite avant le commit, peu importe ce
    -- que l'user envoie dans son UPDATE (anti-tricherie).
    NEW.closed_by := (SELECT auth.uid());
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ot_set_closed_by
    BEFORE UPDATE OF statut ON ordres_travail
    FOR EACH ROW
    WHEN (NEW.statut = 'cloture' AND OLD.statut IS DISTINCT FROM 'cloture')
    EXECUTE FUNCTION public.set_ot_closed_by();
COMMENT ON FUNCTION public.set_ot_closed_by() IS
    'F25 audit : peuple closed_by = (SELECT auth.uid()) au passage statut → cloture. BEFORE UPDATE, force la valeur peu importe ce que l''user envoie.';

CREATE OR REPLACE FUNCTION public.generate_next_ot_on_cloture()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- F27 + F34 audit : génération événementielle du prochain OT préventif.
    -- date_cloture est TIMESTAMPTZ → cast en DATE civile pour le calcul.
    -- closed_by vient d'être peuplé par set_ot_closed_by (BEFORE UPDATE).
    -- site_id du successeur = site_id du précédent (continuité métier).
    PERFORM public.generate_next_ot_for_gamme(
        NEW.gamme_id,
        NEW.closed_by,
        NEW.site_id,
        COALESCE(NEW.date_cloture::date, CURRENT_DATE)
    );
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_ot_generate_next
    AFTER UPDATE OF statut ON ordres_travail
    FOR EACH ROW
    WHEN (NEW.statut = 'cloture' AND OLD.statut IS DISTINCT FROM 'cloture')
    EXECUTE FUNCTION public.generate_next_ot_on_cloture();
COMMENT ON FUNCTION public.generate_next_ot_on_cloture() IS
    'F27 audit : génère le prochain OT préventif pour la gamme à la clôture (événementiel, remplace l''ancien cron generate_next_ots). Sans effet si gamme inactive / OT actif déjà existant.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. purge_corbeille_90j — RGPD, soft-deleted > 90j supprimés physiquement
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.purge_corbeille_90j()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB := '{}'::jsonb;
    v_nb     INTEGER;
BEGIN
    -- v0.26 : autorise la suppression en cascade des équipes internes des sites
    -- purgés (FK prestataires.site_id CASCADE ; protect_prestataire_interne lit ce flag).
    PERFORM set_config('app.purge_active', 'on', true);

    -- Ordre de purge : du plus feuille au plus racine pour respecter les FK RESTRICT.
    --
    -- PRÉSERVATION DES OT CLÔTURÉS (NF EN 13306) : un OT en statut 'cloture' est
    -- une preuve légale de contrôle réglementaire ERP — il N'EST JAMAIS purgé
    -- automatiquement par ce cron. Seul un admin peut le détruire manuellement.
    -- Conséquence : un OT clôturé peut survivre à la purge de sa gamme parente
    -- grâce à ses snapshots figés (Pattern 1) ; la FK gamme_id passe à NULL
    -- (ON DELETE SET NULL — cf définition de ordres_travail.gamme_id).
    --
    -- GARDE-FOU FK : le DELETE physique des OT (tout en bas) bascule la session
    -- en session_replication_role = 'replica', ce qui DÉSACTIVE le contrôle des
    -- FK. Les DELETE de gammes/categories s'exécutent AVANT ce basculement (donc
    -- FK actives). Pour les categories on garde des garde-fous NOT EXISTS sur
    -- (gamme, sous-catégorie) — RESTRICT volontaire. Pour les gammes, plus de
    -- garde-fou côté OT : le SET NULL absorbe les OT survivants (clôturés ou
    -- non encore purgés à ce stade).

    -- documents — purge tôt (les liaisons documents_* partent en CASCADE ; la seule
    -- FK métier entrante, observations.document_levee_id, est ON DELETE SET NULL et
    -- ce DELETE tourne HORS replica → le SET NULL se déclenche, pas de garde-fou requis).
    --
    -- F28 audit sécu : suppression PHYSIQUE des fichiers Storage rattachés AVANT
    -- de supprimer la ligne metadata. Sans ça, les blobs restent indéfiniment
    -- dans le bucket 'documents' (fuite RGPD + coût de stockage). On supprime
    -- via storage.objects (RLS bypass via SECURITY DEFINER + search_path = '').
    -- Supabase storage récent : le trigger storage.protect_delete (statement-level)
    -- interdit tout DELETE direct sur storage.objects, SAUF si cette GUC est posée
    -- (mécanisme officiel — la Storage API la pose elle-même). SET LOCAL = portée TX.
    -- Sans ça, la purge entière échoue (transaction avortée) → purge RGPD jamais faite.
    PERFORM set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects
        WHERE bucket_id = 'documents'
          AND name IN (
              SELECT storage_path FROM public.documents
              WHERE deleted_at IS NOT NULL
                AND deleted_at < now() - interval '90 days'
          );
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('storage_objects', v_nb);

    DELETE FROM public.documents
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('documents', v_nb);

    -- demandes_intervention (signalement curatif autonome). Soft-delete RGPD :
    -- purge à 90j comme les autres entités. Les liaisons di_equipements /
    -- di_localisations partent en CASCADE (FK ON DELETE CASCADE). La table est
    -- auditée → le trigger AFTER DELETE trace la purge. Aucun trigger de
    -- protection ne bloque le DELETE d'une DI (pas de bypass replica requis).
    DELETE FROM public.demandes_intervention
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('demandes_intervention', v_nb);

    -- interventions_chantier (v0.33) — soft-delete RGPD, purge à 90j. Les liaisons
    -- chantier_localisations / chantier_equipements / documents_interventions_chantier
    -- partent en CASCADE. Aucun trigger de protection terminal (pas de bypass replica).
    DELETE FROM public.interventions_chantier
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('interventions_chantier', v_nb);

    -- investissements (v0.33) — soft-delete RGPD, purge à 90j. La liaison
    -- documents_investissements part en CASCADE.
    DELETE FROM public.investissements
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('investissements', v_nb);

    -- equipements — détacher D'ABORD les liaisons gammes_equipements (FK RESTRICT
    -- entrante, table de liaison sans soft-delete propre, jamais nettoyée par
    -- ailleurs) : sinon le DELETE ci-dessous lève foreign_key_violation et AVORTE
    -- toute la purge (le bloc tourne hors 'replica', FK actives). Les autres
    -- liaisons entrantes se résolvent seules : di_equipements / documents_equipements
    -- (CASCADE), observations.equipement_id (SET NULL).
    DELETE FROM public.gammes_equipements
        WHERE equipement_id IN (
            SELECT id FROM public.equipements
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
        );
    DELETE FROM public.equipements WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('equipements', v_nb);

    -- modeles_equipements — chantier C 2026-05-25.
    -- equipements.copie_depuis_modele_id est ON DELETE SET NULL → aucun garde-fou
    -- FK nécessaire : la purge d'un modèle déclasse proprement les équipements
    -- instanciés (qui conservent leurs specs grâce au snapshot Pattern 1).
    DELETE FROM public.modeles_equipements WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('modeles_equipements', v_nb);

    -- modeles_di (024) — feuille pure : aucune FK entrante, aucun trigger BEFORE
    -- DELETE, pas d'items. DELETE simple, hors replica.
    DELETE FROM public.modeles_di WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('modeles_di', v_nb);

    -- modeles_operations (024) — fenêtre 'replica' DÉDIÉE. Hors replica, le DELETE
    -- déclencherait validation_suppression_gamme_type_globale (BEFORE DELETE), la FK
    -- gamme_modeles RESTRICT et la CASCADE des items, avec un RISQUE D'AVORTER toute
    -- la purge. En 'replica', triggers ET FK désactivés → on nettoie EXPLICITEMENT les
    -- items (CASCADE inactif) puis les liaisons gamme_modeles (RESTRICT inactif), avant
    -- de supprimer les modèles. Placé AVANT categories (garde-fou NOT EXISTS).
    SET LOCAL session_replication_role = replica;
    DELETE FROM public.modeles_operations_items
        WHERE modele_operation_id IN (
            SELECT id FROM public.modeles_operations
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
        );
    DELETE FROM public.gamme_modeles
        WHERE modele_operation_id IN (
            SELECT id FROM public.modeles_operations
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
        );
    DELETE FROM public.modeles_operations
        WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    SET LOCAL session_replication_role = origin;
    v_result := v_result || jsonb_build_object('modeles_operations', v_nb);

    -- locaux
    DELETE FROM public.locaux WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('locaux', v_nb);

    -- niveaux
    DELETE FROM public.niveaux WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('niveaux', v_nb);

    -- batiments
    DELETE FROM public.batiments WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('batiments', v_nb);

    -- gammes — Plus de garde-fou côté OT : la FK ordres_travail.gamme_id est
    -- ON DELETE SET NULL, donc la purge d'une gamme déclasse proprement les OT
    -- conservés (clôturés ou pas encore purgés). Les OT survivent grâce aux
    -- snapshots figés (Pattern 1).
    DELETE FROM public.gammes
        WHERE deleted_at IS NOT NULL
          AND deleted_at < now() - interval '90 days';
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('gammes', v_nb);

    -- categories — GARDE-FOU : on n'efface PAS une catégorie encore référencée
    -- par une gamme non purgée (gammes.categorie_id est RESTRICT), par un modèle
    -- d'équipement (modeles_equipements.categorie_id est RESTRICT — patch
    -- 2026-06-10), par un modèle d'opération (modeles_operations.categorie_id RESTRICT
    -- — garde-fou 024) ni par une catégorie enfant (parent_id RESTRICT). En revanche
    -- equipements.categorie_id et copie_depuis_id sont ON DELETE SET NULL → aucun
    -- garde-fou nécessaire de ces côtés (la purge déclasse simplement les
    -- équipements concernés).
    DELETE FROM public.categories
        WHERE deleted_at IS NOT NULL
          AND deleted_at < now() - interval '90 days'
          AND NOT EXISTS (
              SELECT 1 FROM public.gammes g WHERE g.categorie_id = public.categories.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.modeles_equipements me WHERE me.categorie_id = public.categories.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.modeles_operations mo WHERE mo.categorie_id = public.categories.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.categories enfant WHERE enfant.parent_id = public.categories.id
          );
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('categories', v_nb);

    -- prestataires + sites : v0.21 — purgés APRÈS les OT (déplacés plus bas), sinon
    -- leurs OT (même soft-deletés) bloqueraient le DELETE par FK RESTRICT. Voir le
    -- bloc « prestataires/sites » en fin de fonction (avec garde-fous NOT EXISTS).

    -- ordres_travail (soft-delete RGPD : on conserve 90j puis on purge — SAUF
    -- les OT en statut 'cloture' qui sont des preuves légales NF EN 13306 et
    -- ne sont JAMAIS purgés automatiquement. Seul un admin peut les détruire).
    -- ATTENTION : protection_ot_terminaux bloque DELETE physique ; il faut
    -- bypasser via session_replication_role = 'replica' (service_role + SET LOCAL).
    -- F15 (audit sécu) : 'replica' désactive AUSSI les triggers d'audit
    --   (audit_ordres_travail) → on log manuellement AVANT le DELETE pour
    --   garder une trace conforme NF EN 13306. row_pk en TEXT, before = ligne
    --   complète, after = NULL (DELETE). user_id = NULL car cron système.
    INSERT INTO public.audit_log (user_id, table_name, row_pk, action, before, after)
    SELECT
        NULL,                        -- cron système, pas d'user
        'ordres_travail',
        ot.id::text,
        'DELETE',
        to_jsonb(ot.*),
        NULL
    FROM public.ordres_travail ot
    WHERE ot.deleted_at IS NOT NULL
      AND ot.deleted_at < now() - interval '90 days'
      AND ot.statut <> 'cloture';   -- preuve légale → jamais purgée auto

    -- ATTENTION : 'replica' désactive AUSSI les triggers d'intégrité référentielle
    -- (FK). Les actions ON DELETE CASCADE / SET NULL des enfants des OT ne se
    -- déclenchent donc PAS → on nettoie EXPLICITEMENT, sinon lignes orphelines :
    --   - operations_execution (FK CASCADE, pas de soft-delete propre → jamais
    --     purgée autrement : un OT purgé laisserait ses opex orphelines)
    --   - documents_ordres_travail (FK CASCADE, table de liaison)
    --   - observations.ot_id (FK SET NULL : la ligne survit, on neutralise le lien)
    SET LOCAL session_replication_role = replica;

    DELETE FROM public.operations_execution
        WHERE ordre_travail_id IN (
            SELECT id FROM public.ordres_travail
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
              AND statut <> 'cloture'
        );
    DELETE FROM public.documents_ordres_travail
        WHERE ordre_travail_id IN (
            SELECT id FROM public.ordres_travail
            WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
              AND statut <> 'cloture'
        );
    -- observations : lien souple (SET NULL) pour celles qui peuvent vivre
    -- détachées. MAIS le CHECK observations_source_controle_ot impose ot_id NOT
    -- NULL pour source='controle_reglementaire', et les CHECK SURVIVENT à 'replica'
    -- (contrairement aux FK) → un SET NULL aveugle lèverait check_violation et
    -- avorterait la purge. Ces observations de contrôle sont donc purgées AVEC leur
    -- OT (un OT non clôturé purgé les emporte ; les OT clôturés ne sont jamais
    -- purgés). observations n'a aucune FK entrante → DELETE sûr (pas d'orphelin).
    UPDATE public.observations SET ot_id = NULL
        WHERE source <> 'controle_reglementaire'
          AND ot_id IN (
              SELECT id FROM public.ordres_travail
              WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
                AND statut <> 'cloture'
          );
    DELETE FROM public.observations
        WHERE source = 'controle_reglementaire'
          AND ot_id IN (
              SELECT id FROM public.ordres_travail
              WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'
                AND statut <> 'cloture'
          );

    DELETE FROM public.ordres_travail
        WHERE deleted_at IS NOT NULL
          AND deleted_at < now() - interval '90 days'
          AND statut <> 'cloture';   -- preuve légale → jamais purgée auto
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    SET LOCAL session_replication_role = origin;
    v_result := v_result || jsonb_build_object('ordres_travail', v_nb);

    -- prestataires — v0.21 : APRÈS les OT (les OT non clôturés sont désormais purgés).
    -- Garde-fou NOT EXISTS : un prestataire encore référencé par un contrat (pas de
    -- soft-delete), une gamme ou un OT (clôturé = preuve jamais purgée) reste en
    -- corbeille — jamais détruit tant qu'une de ces références existe (décision PO 2026).
    DELETE FROM public.prestataires p
        WHERE p.deleted_at IS NOT NULL AND p.deleted_at < now() - interval '90 days'
          AND NOT EXISTS (SELECT 1 FROM public.contrats c        WHERE c.prestataire_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM public.gammes g          WHERE g.prestataire_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM public.ordres_travail ot WHERE ot.prestataire_id = p.id);
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('prestataires', v_nb);

    -- sites — v0.21 : EN DERNIER. La cascade spatiale (trg_sites_cascade_corbeille)
    -- a normalement déjà mis batiments/gammes/categories/documents/DI/OT du site en
    -- corbeille (donc purgés au-dessus). Garde-fou NOT EXISTS sur les 6 FK RESTRICT
    -- filles : un OT clôturé (preuve jamais purgée) ou une observation (pas de
    -- soft-delete) retient le site → il reste en corbeille (décision PO 2026 : on ne
    -- détruit jamais une preuve NF EN 13306).
    DELETE FROM public.sites s
        WHERE s.deleted_at IS NOT NULL AND s.deleted_at < now() - interval '90 days'
          AND NOT EXISTS (SELECT 1 FROM public.batiments b             WHERE b.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.gammes g                WHERE g.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.categories c            WHERE c.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.documents d             WHERE d.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.demandes_intervention di WHERE di.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.observations o          WHERE o.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.ordres_travail ot       WHERE ot.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.contrats c              WHERE c.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.interventions_chantier ic WHERE ic.site_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM public.investissements inv     WHERE inv.site_id = s.id);
    GET DIAGNOSTICS v_nb = ROW_COUNT;
    v_result := v_result || jsonb_build_object('sites', v_nb);

    -- Trace d'exécution (apparaît dans les logs Supabase). Le détail par table
    -- — dont documents, gammes et categories avec leurs garde-fous FK — sert au
    -- suivi RGPD et au diagnostic d'éventuels résidus non purgés.
    RAISE LOG 'purge_corbeille_90j: purge terminée %', v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.purge_corbeille_90j() IS
    'Cron quotidien 05:00 : supprime physiquement les entités soft-deleted depuis > 90 jours. Bypass triggers via session_replication_role. (024 : + modeles_operations (fenêtre replica dédiée) + modeles_di + garde-fou catégorie NOT EXISTS modeles_operations.)';

-- ═══════════════════════════════════════════════════════════════════════════
-- cleanup_storage_orphans — Cron mensuel (patch v0.5, F29)
-- ═══════════════════════════════════════════════════════════════════════════
-- Réintroduction validée par le PO en v0.5 (la doctrine V1 acceptait
-- l'accumulation pour éviter le risque de purge involontaire — mais avec
-- l'avatar users.photo_path et la croissance des volumes, on bascule).
--
-- Sources de référence (tout chemin présent ici est PRÉSERVÉ) :
--   - public.documents.storage_path (PDF rapports, photos équipements, pièces DI)
--   - public.users.photo_path        (avatars utilisateurs F28)
--   - image_path des entités illustrées (batiments, niveaux, locaux, categories,
--     equipements, prestataires, gammes, modeles_*, ordres_travail) — v0.14a.
--
-- Tout objet du bucket 'documents' dont le name n'apparaît PAS dans une de ces
-- deux colonnes est considéré orphelin et supprimé. Supabase propage le DELETE
-- sur storage.objects au stockage S3 (suppression effective du fichier).
--
-- Garde-fous :
--   - Trace systématique dans audit_log AVANT suppression (forensic : on peut
--     identifier ce qui a été supprimé en cas de bug).
--   - Sortie silencieuse si aucun orphelin (pas de log inutile).
--   - SECURITY DEFINER + search_path = '' (doctrine).
--   - DELETE sur storage.objects autorisé car owner = postgres bypasse FORCE RLS.
CREATE OR REPLACE FUNCTION public.cleanup_storage_orphans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_orphan_ids   UUID[];
    v_orphan_names TEXT[];
    v_orphan_count INTEGER;
BEGIN
    -- Collecte des orphelins en deux passes (id + name pour le forensic)
    WITH referenced_paths AS (
        SELECT storage_path AS path FROM public.documents WHERE storage_path IS NOT NULL
        UNION
        SELECT photo_path  AS path FROM public.users     WHERE photo_path     IS NOT NULL
        -- v0.14a : TOUTES les colonnes image_path d'illustration doivent être
        -- référencées, sinon le cron considérerait ces images comme orphelines
        -- et les SUPPRIMERAIT alors qu'elles sont en cours d'usage (bug latent).
        UNION SELECT image_path FROM public.batiments           WHERE image_path IS NOT NULL
        UNION SELECT image_path FROM public.niveaux             WHERE image_path IS NOT NULL
        UNION SELECT image_path FROM public.locaux              WHERE image_path IS NOT NULL
        UNION SELECT image_path FROM public.categories          WHERE image_path IS NOT NULL
        UNION SELECT image_path FROM public.equipements         WHERE image_path IS NOT NULL
        UNION SELECT image_path FROM public.prestataires        WHERE image_path IS NOT NULL
        UNION SELECT image_path FROM public.gammes              WHERE image_path IS NOT NULL
        UNION SELECT image_path FROM public.modeles_operations  WHERE image_path IS NOT NULL
        UNION SELECT image_path FROM public.modeles_equipements WHERE image_path IS NOT NULL
        UNION SELECT image_path FROM public.ordres_travail      WHERE image_path IS NOT NULL
        -- v0.14b : les miniatures du pool vivent aussi dans le bucket
        UNION SELECT storage_path FROM public.miniatures        WHERE storage_path IS NOT NULL
    ),
    orphans AS (
        SELECT o.id, o.name
        FROM storage.objects o
        WHERE o.bucket_id = 'documents'
          -- F29 (audit sécu) — Grace period 24h pour éviter la race condition :
          -- un upload qui vient juste d'arriver dans storage.objects pourrait
          -- ne pas encore avoir été lié à une ligne documents/users (la TX
          -- applicative est en cours). On laisse 24h de marge avant de
          -- considérer un objet comme orphelin.
          AND o.created_at < now() - interval '24 hours'
          AND NOT EXISTS (
              SELECT 1 FROM referenced_paths rp
              WHERE rp.path = o.name
          )
    )
    SELECT array_agg(id), array_agg(name)
    INTO   v_orphan_ids, v_orphan_names
    FROM   orphans;

    v_orphan_count := COALESCE(array_length(v_orphan_ids, 1), 0);

    IF v_orphan_count = 0 THEN
        RAISE LOG 'cleanup_storage_orphans : aucun orphelin trouvé';
        RETURN;
    END IF;

    -- Forensic : trace AVANT suppression — on garde les noms des fichiers
    -- supprimés au cas où il faudrait identifier un faux positif (limité aux
    -- 100 premiers pour éviter de gonfler audit_log si gros volume).
    INSERT INTO public.audit_log (
        user_id, table_name, row_pk, action, before, after
    ) VALUES (
        NULL,
        'storage.objects',
        'bulk-cleanup',
        'DELETE',
        jsonb_build_object(
            'orphan_count', v_orphan_count,
            'sample_names', to_jsonb(v_orphan_names[1:100])
        ),
        jsonb_build_object(
            'cleaned_at', now(),
            'bucket',     'documents'
        )
    );

    -- Suppression effective (propagée au stockage S3 par Supabase). La GUC
    -- storage.allow_delete_query autorise le DELETE direct (trigger Supabase
    -- storage.protect_delete, statement-level) ; sans elle, le cron échoue.
    PERFORM set_config('storage.allow_delete_query', 'true', true);
    DELETE FROM storage.objects WHERE id = ANY(v_orphan_ids);

    RAISE LOG 'cleanup_storage_orphans : % orphelins supprimés du bucket documents',
        v_orphan_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_storage_orphans() IS
    'F29 (patch v0.5) — Cron mensuel : supprime les objets du bucket documents non référencés en base (documents.storage_path + users.photo_path) et plus vieux que 24h (grace period anti-race upload). Trace dans audit_log avant suppression (forensic).';

-- ═══════════════════════════════════════════════════════════════════════════
-- deactivate_inactive_users — Cron mensuel (patch v0.6, F30)
-- ═══════════════════════════════════════════════════════════════════════════
-- Sécurité : un employé qui quitte l'entreprise reste est_actif = true tant
-- qu'un admin ne le désactive pas à la main. Un compte oublié = porte d'entrée
-- potentielle (l'ex-employé connaît peut-être encore son mot de passe).
--
-- Ce cron désactive automatiquement les comptes sans connexion depuis 6 mois.
-- Source de la dernière connexion : auth.users.last_sign_in_at (table Supabase
-- Auth, lisible en SECURITY DEFINER).
--
-- Garde-fous :
--   - EXCLUT les admins (anti-lockout : on ne se verrouille jamais dehors,
--     les admins sont peu nombreux et gérés manuellement).
--   - Les comptes déjà anonymisés / désactivés sont naturellement exclus
--     (filtre est_actif = true).
--   - Bypass contrôlé de protect_users_sensitive_columns via GUC
--     app.system_deactivation (Pattern 3) — uniquement est_actif, jamais role.
--   - Trace bulk dans audit_log AVANT modification (forensic).
--
-- Le seuil de 6 mois est volontairement conservateur. Pour l'ajuster, modifier
-- la variable v_threshold ci-dessous.
CREATE OR REPLACE FUNCTION public.deactivate_inactive_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_threshold INTERVAL := interval '6 months';
    v_ids       UUID[];
    v_count     INTEGER;
BEGIN
    -- Candidats : actifs, non-admin, sans connexion depuis le seuil — ou
    -- jamais connectés mais créés il y a plus longtemps que le seuil
    -- (compte fantôme jamais activé).
    SELECT array_agg(u.id)
    INTO   v_ids
    FROM   public.users u
    JOIN   auth.users   au ON au.id = u.id
    WHERE  u.est_actif = true
      AND  u.role_id <> (SELECT id FROM public.roles WHERE code = 'admin')
      AND  (
            (au.last_sign_in_at IS NOT NULL AND au.last_sign_in_at < now() - v_threshold)
         OR (au.last_sign_in_at IS NULL     AND u.created_at         < now() - v_threshold)
      );

    v_count := COALESCE(array_length(v_ids, 1), 0);

    IF v_count = 0 THEN
        RAISE LOG 'deactivate_inactive_users : aucun compte inactif à désactiver';
        RETURN;
    END IF;

    -- Forensic : trace AVANT modification (liste des comptes désactivés).
    INSERT INTO public.audit_log (
        user_id, table_name, row_pk, action, before, after
    ) VALUES (
        NULL,
        'users',
        'bulk-deactivation',
        'UPDATE',
        jsonb_build_object('reason', 'inactivite_6_mois', 'user_ids', to_jsonb(v_ids)),
        jsonb_build_object('deactivated_count', v_count, 'at', now())
    );

    -- Bypass contrôlé du trigger protect_users_sensitive_columns (GUC LOCAL,
    -- limité à cette transaction). N'autorise QUE est_actif, jamais role.
    PERFORM set_config('app.system_deactivation', 'true', true);

    UPDATE public.users
    SET est_actif = false
    WHERE id = ANY(v_ids);

    RAISE LOG 'deactivate_inactive_users : % comptes désactivés (inactifs > 6 mois)',
        v_count;
END;
$$;

COMMENT ON FUNCTION public.deactivate_inactive_users() IS
    'F30 (patch v0.6) — Cron mensuel : désactive (est_actif=false) les comptes non-admin sans connexion depuis 6 mois (auth.users.last_sign_in_at). Exclut les admins (anti-lockout). Bypass GUC app.system_deactivation. Trace dans audit_log avant modification.';

-- ═══════════════════════════════════════════════════════════════════════════
-- detect_security_anomalies — Cron horaire de monitoring (patch v0.6, F30)
-- ═══════════════════════════════════════════════════════════════════════════
-- Détecte les anomalies de sécurité calculables EN SQL PUR et écrit une ligne
-- dans security_alerts par anomalie détectée. Trois indicateurs couverts :
--   1. Croissance anormale d'audit_log (dernière heure > 10× la moyenne
--      horaire des 7 derniers jours) — signal d'activité massive suspecte.
--   2. Pic de création de comptes (> 20 / heure) — credential stuffing,
--      provisioning anormal.
--   3. Anonymisation RGPD en masse (> 5 / heure) — suppression suspecte de
--      traces (admin compromis qui efface des comptes).
--
-- Les autres indicateurs de supabase-security.md §6 (logins échoués, erreurs
-- RLS, erreurs Edge 500, lectures massives) vivent dans les logs Supabase et
-- nécessitent un outil externe (Logflare / Grafana) — hors périmètre SQL.
-- Documenté dans DEPLOY.md section monitoring.
--
-- Plancher anti-bruit sur l'indicateur 1 : on n'alerte que si la dernière
-- heure dépasse aussi 100 lignes en absolu (sinon un simple import légitime
-- en phase de faible activité déclencherait l'alerte 10×).
--
-- Pas de déduplication : si une anomalie persiste, une alerte par heure est
-- créée — c'est un signal de persistance, pas du bruit.
CREATE OR REPLACE FUNCTION public.detect_security_anomalies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_audit_last_hour BIGINT;
    v_audit_avg_hour  NUMERIC;
    v_new_accounts    BIGINT;
    v_anonymizations  BIGINT;
BEGIN
    -- 1. Croissance anormale audit_log
    SELECT count(*) INTO v_audit_last_hour
    FROM   public.audit_log
    WHERE  at > now() - interval '1 hour';

    SELECT count(*)::numeric / (7 * 24)
    INTO   v_audit_avg_hour
    FROM   public.audit_log
    WHERE  at > now() - interval '7 days'
      AND  at <= now() - interval '1 hour';

    IF v_audit_last_hour > 100
       AND v_audit_avg_hour > 0
       AND v_audit_last_hour > 10 * v_audit_avg_hour THEN
        INSERT INTO public.security_alerts (indicator, severity, observed_value, threshold, details)
        VALUES (
            'audit_log_growth', 'warning', v_audit_last_hour, round(10 * v_audit_avg_hour, 1),
            jsonb_build_object('avg_hourly_7d', round(v_audit_avg_hour, 2), 'window', '1 hour')
        );
    END IF;

    -- 2. Pic de création de comptes
    SELECT count(*) INTO v_new_accounts
    FROM   public.users
    WHERE  created_at > now() - interval '1 hour';

    IF v_new_accounts > 20 THEN
        INSERT INTO public.security_alerts (indicator, severity, observed_value, threshold, details)
        VALUES (
            'account_creation_spike', 'critical', v_new_accounts, 20,
            jsonb_build_object('window', '1 hour')
        );
    END IF;

    -- 3. Anonymisation RGPD en masse
    SELECT count(*) INTO v_anonymizations
    FROM   public.users
    WHERE  anonymized_at > now() - interval '1 hour';

    IF v_anonymizations > 5 THEN
        INSERT INTO public.security_alerts (indicator, severity, observed_value, threshold, details)
        VALUES (
            'mass_anonymization', 'critical', v_anonymizations, 5,
            jsonb_build_object('window', '1 hour')
        );
    END IF;

    -- Trace d'exécution (cohérence avec les autres crons : confirme que le job
    -- horaire a bien tourné, même quand aucune anomalie n'est détectée).
    RAISE LOG 'detect_security_anomalies : exécution terminée (audit_log dernière heure=%, nouveaux comptes=%, anonymisations=%)',
        v_audit_last_hour, v_new_accounts, v_anonymizations;
END;
$$;

COMMENT ON FUNCTION public.detect_security_anomalies() IS
    'F30 (patch v0.6) — Cron horaire : détecte 3 anomalies SQL-feasibles (croissance audit_log, pic création comptes, anonymisation en masse) et écrit dans security_alerts. Les autres indicateurs (logins échoués, erreurs RLS) sont hors SQL (logs Supabase + Grafana).';

-- ═══════════════════════════════════════════════════════════════════════════
-- Planification pg_cron
-- ═══════════════════════════════════════════════════════════════════════════
-- F27 audit : 1 cron RGPD (purge 90j). F29 (v0.5) : +cleanup_storage_orphans.
-- F30 (v0.6) : +deactivate_inactive_users +detect_security_anomalies.

-- purge_corbeille_90j : 05:00 Paris (hors charge transactionnelle), tous les jours
SELECT cron.schedule(
    'purge_corbeille_90j',
    '0 5 * * *',
    $$ SELECT public.purge_corbeille_90j(); $$
);

-- cleanup_storage_orphans (F29 v0.5) : 1er du mois, 04:00 Paris (hors charge,
-- avant la purge RGPD qui peut elle-même créer des orphelins documents).
SELECT cron.schedule(
    'cleanup_storage_orphans',
    '0 4 1 * *',
    $$ SELECT public.cleanup_storage_orphans(); $$
);

-- deactivate_inactive_users (F30 v0.6) : 1er du mois, 03:00 Paris (hygiène
-- des comptes, hors charge).
SELECT cron.schedule(
    'deactivate_inactive_users',
    '0 3 1 * *',
    $$ SELECT public.deactivate_inactive_users(); $$
);

-- detect_security_anomalies (F30 v0.6) : toutes les heures (détection au plus
-- proche d'un pic d'activité suspecte).
SELECT cron.schedule(
    'detect_security_anomalies',
    '0 * * * *',
    $$ SELECT public.detect_security_anomalies(); $$
);

-- Visualisation des jobs : SELECT * FROM cron.job;
-- Historique : SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- Couverture d'index sur les FK (patch v0.19 — Advisor 0001 unindexed_foreign_keys)
-- ═══════════════════════════════════════════════════════════════════════════
-- Postgres ne crée pas d'index sur les colonnes de FK. Règle perf Dédale :
-- indexer TOUTE FK (JOINs, cascades, contrôles RESTRICT, scope). Ces 12 FK
-- (tables récentes v0.14b + lineage copie_depuis + created_by / prestataire /
-- unite oubliés) n'en avaient pas. IF NOT EXISTS : idempotent, sûr à rejouer.
CREATE INDEX IF NOT EXISTS idx_categories_copie_depuis_id           ON public.categories (copie_depuis_id);
CREATE INDEX IF NOT EXISTS idx_contrats_type_contrat_id             ON public.contrats (type_contrat_id);
CREATE INDEX IF NOT EXISTS idx_demandes_intervention_prestataire_id ON public.demandes_intervention (prestataire_id);
CREATE INDEX IF NOT EXISTS idx_document_chapitres_created_by        ON public.document_chapitres (created_by);
CREATE INDEX IF NOT EXISTS idx_gammes_copie_depuis_id               ON public.gammes (copie_depuis_id);
CREATE INDEX IF NOT EXISTS idx_miniatures_created_by                ON public.miniatures (created_by);
CREATE INDEX IF NOT EXISTS idx_modeles_operations_items_unite_id    ON public.modeles_operations_items (unite_id);
CREATE INDEX IF NOT EXISTS idx_observations_document_levee_id       ON public.observations (document_levee_id);
CREATE INDEX IF NOT EXISTS idx_observations_levee_by                ON public.observations (levee_by);
CREATE INDEX IF NOT EXISTS idx_operations_unite_id                  ON public.operations (unite_id);
CREATE INDEX IF NOT EXISTS idx_ordres_travail_prestataire_id        ON public.ordres_travail (prestataire_id);
CREATE INDEX IF NOT EXISTS idx_users_created_by                     ON public.users (created_by);


-- ═══════════════════════════════════════════════════════════════════════════
-- RPC de consultation des tables sensibles (patch v0.18b)
-- ═══════════════════════════════════════════════════════════════════════════
-- audit_log et security_alerts ne sont plus exposés directement via PostgREST :
-- le SELECT est révoqué à authenticated (cf bloc privilèges plus bas), de sorte
-- qu'elles ne figurent plus dans le schéma GraphQL (lint 0027). L'accès admin
-- passe désormais exclusivement par ces RPC SECURITY DEFINER, qui contrôlent le
-- rôle en interne. La consultation de l'audit PAR ENREGISTREMENT reste
-- get_audit_trail (admin + manager scopé).

CREATE OR REPLACE FUNCTION public.get_audit_log(
    p_table_name TEXT        DEFAULT NULL,
    p_limit      INT         DEFAULT 100,
    p_before     TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.audit_log
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF public.current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Consultation du journal d''audit réservée à l''admin'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT a.*
    FROM   public.audit_log a
    WHERE  (p_table_name IS NULL OR a.table_name = p_table_name)
      AND  (p_before IS NULL OR a.at < p_before)
    ORDER BY a.at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;
COMMENT ON FUNCTION public.get_audit_log(TEXT, INT, TIMESTAMPTZ) IS
    'v0.18b — Browse admin du journal d''audit (audit_log SELECT révoqué à authenticated → hors PostgREST/GraphQL). Pagination keyset via p_before (a.at). Réservé admin ; consultation par enregistrement = get_audit_trail.';

CREATE OR REPLACE FUNCTION public.get_security_alerts(
    p_limit  INT         DEFAULT 100,
    p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.security_alerts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF public.current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Consultation des alertes de sécurité réservée à l''admin'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT al.*
    FROM   public.security_alerts al
    WHERE  (p_before IS NULL OR al.detected_at < p_before)
    ORDER BY al.detected_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;
COMMENT ON FUNCTION public.get_security_alerts(INT, TIMESTAMPTZ) IS
    'v0.18b — Browse admin des alertes de monitoring (security_alerts SELECT révoqué à authenticated → hors PostgREST/GraphQL). Réservé admin.';

-- ═══════════════════════════════════════════════════════════════════════════
-- DURCISSEMENT DES PRIVILÈGES (patch v0.17 — Security Advisor 0026/0028/0029)
-- ═══════════════════════════════════════════════════════════════════════════
-- Postgres accorde EXECUTE à PUBLIC par défaut sur toute fonction, et Supabase
-- accorde aux rôles anon/authenticated l'accès aux tables de public. La RLS
-- protège déjà les LIGNES, mais le Security Advisor signale à juste titre la
-- SURFACE exposée. On la réduit ici en defense-in-depth :
--   1. anon (visiteur non connecté) ne doit RIEN pouvoir faire : signup public
--      désactivé, aucune donnée publique en V1, pas de DI anonyme (cf V2).
--   2. EXECUTE sur les fonctions SECURITY DEFINER (qui bypassent la RLS) doit
--      être réservé : les triggers et crons n'ont besoin d'AUCUN grant (ils
--      s'exécutent en contexte propriétaire, sans contrôle d'EXECUTE sur le
--      rôle appelant) ; seules les vraies RPC métier restent appelables par
--      authenticated.
-- Note : lint 0027 (authenticated peut voir les tables) reste volontairement en
-- l'état — c'est le fonctionnement nominal de PostgREST + RLS (les users LISENT
-- les tables, la RLS filtre les lignes). Le verrouiller casserait l'app.

-- ── 1. Tables / séquences : anon n'a aucun accès à public ──────────────────
-- (les rôles connectés gardent leur accès, filtré par la RLS.)
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- v0.18b : audit_log et security_alerts ne sont plus lisibles via l'API auto.
-- L'admin y accède par les RPC get_audit_log() / get_security_alerts() (DEFINER,
-- contrôle admin interne). Sort ces 2 tables sensibles du schéma GraphQL (0027).
REVOKE SELECT ON public.audit_log, public.security_alerts FROM authenticated;

-- ── 2. EXECUTE des fonctions SECURITY DEFINER ──────────────────────────────
-- Révoque PUBLIC + anon + authenticated sur TOUTES les fonctions DEFINER de
-- public (couvre triggers, crons, helpers internes ET rpc), puis ré-autorise le
-- service_role (identité serveur de confiance, jamais exposée côté client).
-- Boucle déclarative : auto-maintenue si de nouvelles fonctions DEFINER sont
-- ajoutées au schéma — pas de liste à maintenir à la main.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM   pg_proc p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  n.nspname = 'public'
        AND    p.prosecdef                       -- SECURITY DEFINER uniquement
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', r.sig);
        EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END LOOP;
END $$;

-- ── 3. RPC métier : ré-autorisées au rôle authenticated ────────────────────
-- Seules ces fonctions DEFINER sont appelées directement par le client connecté
-- (via /rest/v1/rpc/...). Chacune contrôle elle-même rôle + scope (RLS interne
-- ou vérifications explicites : anonymize_user = admin, get_audit_trail =
-- admin/manager, get_user_telephone = self/hiérarchie, etc.).
GRANT EXECUTE ON FUNCTION public.anonymize_user(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_trail(text, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sites()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_telephone(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.copier_gamme(uuid, uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.copier_categorie(uuid, uuid, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copier_modele_equipement(uuid, uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.detacher_et_supprimer_modele_operation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.instancier_equipement(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_document_refs(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_miniature_refs(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_log(text, int, timestamptz)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_security_alerts(int, timestamptz)    TO authenticated;

-- reouvrir_ot : SECURITY INVOKER (la RLS gère l'autorisation) → pas dans la
-- boucle ci-dessus. On lui retire seulement l'accès anon, par cohérence (RPC
-- qui change un état métier).
REVOKE EXECUTE ON FUNCTION public.reouvrir_ot(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reouvrir_ot(uuid, text) TO authenticated, service_role;

-- ── 4. Helpers de scope-gating Storage (durcissement UPDATE/DELETE) ─────────
-- storage_objet_modifiable / storage_objet_rattache sont invoquées DANS les
-- policies RLS de storage.objects (UPDATE/DELETE). PostgreSQL contrôle le droit
-- EXECUTE du caller même pour une fonction appelée dans une policy. La boucle §2
-- a révoqué storage_objet_rattache (SECURITY DEFINER) à authenticated → il faut
-- le re-grant, sinon toute écriture storage.objects échoue « permission denied ».
-- (storage_objet_modifiable est SECURITY INVOKER : pas révoquée, mais on rend le
-- grant explicite par hygiène.)
REVOKE EXECUTE ON FUNCTION public.storage_objet_rattache(text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.storage_objet_modifiable(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.storage_objet_rattache(text)  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.storage_objet_modifiable(text) TO authenticated, service_role;

-- ── 5. Helpers RLS déplacés du schéma auth vers public (portabilité hébergé) ──
-- Sur Supabase hébergé, le rôle du SQL Editor (postgres) n'a pas le droit de créer
-- dans le schéma auth → ces 8 helpers vivent dans public. Comme ils sont
-- SECURITY DEFINER, la boucle §2 leur a révoqué l'EXECUTE à authenticated ; or ils
-- sont appelés DANS quasiment toutes les policies RLS → ré-autorisation obligatoire
-- (sinon « permission denied for function » sur la moindre requête). anon non concerné.
GRANT EXECUTE ON FUNCTION public.current_role()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_site_access(uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_site_with(uuid)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_local(uuid)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_prestataire(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_gamme(uuid)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_gamme_site(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_equipement(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.miniature_scope_ok(uuid, uuid)     TO authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- CLOISONNEMENT PAR SITE DES DOCUMENTS (patch v0.20 — 2026-05-31)
-- ═══════════════════════════════════════════════════════════════════════════
-- Comble l'écart relevé : documents.site_id (ajouté en v0.14b) n'était branché
-- dans AUCUNE policy → un manager/technicien/lecteur voyait TOUTES les lignes
-- documents (tous sites), et storage.objects était lisible par tout utilisateur
-- authentifié. Le cloisonnement ne tenait que sur les liaisons documents_*.
--
-- Sémantique du scope (calquée sur gammes / categories) :
--   - documents.site_id IS NULL     → document ENTREPRISE (bibliothèque
--                                      partagée, visible par tous les rôles internes)
--   - documents.site_id renseigné   → document de SITE (visible si has_site_access)
--
-- COHÉRENCE TOTALE (choix PO) : un fichier (document OU image) n'est lisible
-- que si l'élément auquel il est rattaché l'est. Réalisé en réutilisant les RLS
-- déjà en place sur chaque table porteuse — la policy storage teste, par des
-- EXISTS soumis à LEUR PROPRE RLS, si une entité visible référence l'objet :
--   - documents.storage_path  → RLS documents (scope site_id)
--   - miniatures.storage_path → RLS miniatures (scope entreprise/site)
--   - users.photo_path        → RLS users (self / admin / site commun)
--   - *.image_path (10 tables : batiments, niveaux, locaux, categories,
--     equipements, prestataires, gammes, modeles_operations,
--     modeles_equipements, ordres_travail) → RLS de chaque table (scope site).
-- Conséquence : « je vois l'élément → je vois son image » ET « pas d'accès à
-- l'élément (autre site) → image invisible, même au téléchargement ». admin = tout.
--
-- Écriture documents (INSERT/UPDATE) : interdit de poser un doc hors de son
-- scope (WITH CHECK). site_id NULL = document entreprise (partagé). Le demandeur
-- reste isolé via uploaded_by (policies inchangées).
--
-- ⚠️ Côté application :
--   - pour cloisonner un DOCUMENT par site, l'upload doit renseigner
--     documents.site_id (sinon « entreprise », visible par tous les rôles internes) ;
--   - un objet Storage n'est lisible qu'une fois RATTACHÉ à son entité (ligne
--     documents / image_path / photo_path / miniature) : uploader puis lier dans
--     la foulée (un objet non encore référencé n'est visible que de l'admin).
-- ═══════════════════════════════════════════════════════════════════════════

-- Index sur toutes les colonnes « pointeur Storage » testées par la policy
-- storage_objects_select_documents (doctrine RLS : indexer les colonnes de
-- policy). storage_path = NOT NULL (documents, miniatures) → index plein ;
-- image_path / photo_path nullables → index partiel (la plupart des lignes
-- n'ont pas d'image).
CREATE INDEX IF NOT EXISTS idx_documents_storage_path         ON public.documents(storage_path);
CREATE INDEX IF NOT EXISTS idx_miniatures_storage_path        ON public.miniatures(storage_path);
CREATE INDEX IF NOT EXISTS idx_users_photo_path               ON public.users(photo_path)               WHERE photo_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batiments_image_path           ON public.batiments(image_path)           WHERE image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_niveaux_image_path             ON public.niveaux(image_path)             WHERE image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_locaux_image_path              ON public.locaux(image_path)              WHERE image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_image_path          ON public.categories(image_path)          WHERE image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipements_image_path         ON public.equipements(image_path)         WHERE image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prestataires_image_path        ON public.prestataires(image_path)        WHERE image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gammes_image_path              ON public.gammes(image_path)              WHERE image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_modeles_operations_image_path  ON public.modeles_operations(image_path)  WHERE image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_modeles_equipements_image_path ON public.modeles_equipements(image_path) WHERE image_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ordres_travail_image_path      ON public.ordres_travail(image_path)      WHERE image_path IS NOT NULL;

-- documents.site_id : colonne de policy (cloisonnement v0.20), filtrée sans
-- deleted_at → index PLEIN dédié (l'unique partiel documents_unique_hash ne
-- couvre que WHERE deleted_at IS NULL). Doctrine : indexer toute colonne de policy.
CREATE INDEX IF NOT EXISTS idx_documents_site               ON public.documents(site_id)              WHERE site_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- DURCISSEMENT — CHECK anti-traversal sur les 10 colonnes image_path
-- ═══════════════════════════════════════════════════════════════════════════
-- documents.storage_path (documents_storage_path_safe) et users.photo_path
-- (users_photo_path_format) ont déjà une garde anti path-traversal. Les colonnes
-- image_path (pointeurs Storage facultatifs) ne l'avaient pas → on aligne, en
-- réutilisant EXACTEMENT le pattern position() de documents_storage_path_safe
-- (pas de '..', pas de backslash, pas de path absolu, longueur < 500). NULL
-- autorisé (image_path est facultatif). Défense en profondeur : la RLS Storage
-- filtre déjà par bucket_id, mais un chemin malveillant pourrait servir ailleurs
-- (cron orphelins, exports, logs). Idempotent via DROP CONSTRAINT IF EXISTS.
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'batiments', 'niveaux', 'locaux', 'categories', 'equipements',
        'prestataires', 'gammes', 'modeles_operations', 'modeles_equipements',
        'ordres_travail'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format(
            'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS chk_%s_image_path_format',
            t, t);
        EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT chk_%s_image_path_format CHECK ('
            || ' image_path IS NULL OR ('
            || '   position(''..'' in image_path) = 0'
            || '   AND position(''\'' in image_path) = 0'
            || '   AND image_path NOT LIKE ''/%%'''
            || '   AND length(image_path) < 500'
            || ' ))',
            t, t);
    END LOOP;
END $$;

-- ── documents : SELECT cloisonné par site (manager/technicien/lecteur) ──────
DROP POLICY IF EXISTS documents_site_scoped_select ON documents;
CREATE POLICY documents_site_scoped_select ON documents FOR SELECT
    USING (
        (SELECT public.current_role()) IN ('manager', 'technicien', 'lecteur')
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- ── documents : INSERT cloisonné (manager/technicien) ───────────────────────
DROP POLICY IF EXISTS documents_manager_tech_insert ON documents;
CREATE POLICY documents_manager_tech_insert ON documents FOR INSERT
    WITH CHECK (
        (SELECT public.current_role()) IN ('manager', 'technicien')
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- ── documents : UPDATE cloisonné (manager) ──────────────────────────────────
DROP POLICY IF EXISTS documents_manager_update ON documents;
CREATE POLICY documents_manager_update ON documents FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'manager'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- ── documents : UPDATE cloisonné (technicien) ───────────────────────────────
DROP POLICY IF EXISTS documents_technicien_update ON documents;
CREATE POLICY documents_technicien_update ON documents FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'technicien'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'technicien'
        AND (site_id IS NULL OR public.has_site_access(site_id))
    );

-- ── storage.objects : SELECT aligné sur la visibilité de l'entité porteuse ───
-- Remplace la policy historique (« tout authentifié »). Un objet est lisible
-- si une entité VISIBLE par le caller le référence : chaque EXISTS est soumis à
-- la RLS de sa table → « je vois l'entité ⇒ je vois le fichier », et inversement.
-- admin court-circuite (voit tout). PAS de SECURITY DEFINER : on veut justement
-- que les RLS des tables porteuses s'appliquent. Aucune récursion (ces tables ne
-- référencent pas storage.objects).
-- ⚠️ PORTABILITÉ HÉBERGÉ (v0.36) : création DIRECTE (sans SET ROLE, refusé en hébergé),
-- comme le bloc précédent. Non bloquant : NOTICE + fallback Dashboard si refus.
DO $do$
BEGIN
    -- Création directe (sans SET ROLE, refusé en hébergé). Bloc non bloquant.
    EXECUTE $pol$DROP POLICY IF EXISTS storage_objects_select_documents ON storage.objects$pol$;
    EXECUTE $pol$CREATE POLICY storage_objects_select_documents ON storage.objects FOR SELECT
        USING (
            bucket_id = 'documents'
            AND (SELECT public.current_role()) IS NOT NULL
            AND (
                (SELECT public.current_role()) = 'admin'
                OR EXISTS (SELECT 1 FROM public.documents          d  WHERE d.storage_path = name)
                OR EXISTS (SELECT 1 FROM public.miniatures         m  WHERE m.storage_path = name)
                OR EXISTS (SELECT 1 FROM public.users              u  WHERE u.photo_path   = name)
                OR EXISTS (SELECT 1 FROM public.batiments          b  WHERE b.image_path   = name)
                OR EXISTS (SELECT 1 FROM public.niveaux            n  WHERE n.image_path   = name)
                OR EXISTS (SELECT 1 FROM public.locaux             l  WHERE l.image_path   = name)
                OR EXISTS (SELECT 1 FROM public.categories         c  WHERE c.image_path   = name)
                OR EXISTS (SELECT 1 FROM public.equipements        e  WHERE e.image_path   = name)
                OR EXISTS (SELECT 1 FROM public.prestataires       p  WHERE p.image_path   = name)
                OR EXISTS (SELECT 1 FROM public.gammes             g  WHERE g.image_path   = name)
                OR EXISTS (SELECT 1 FROM public.modeles_operations  mo WHERE mo.image_path = name)
                OR EXISTS (SELECT 1 FROM public.modeles_equipements me WHERE me.image_path = name)
                OR EXISTS (SELECT 1 FROM public.ordres_travail     ot WHERE ot.image_path  = name)
            )
        )$pol$;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Override SELECT Storage v0.20 non appliqué via SQL (% : %) — à créer via le Dashboard. ', SQLSTATE, SQLERRM;
END
$do$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ DONNÉES INITIALES & BACKFILLS (one-shot, idempotents — repris des migrations 002/003/004) ═══
-- ═══════════════════════════════════════════════════════════════════════════
-- Cette section vient TOUT À LA FIN du fichier, APRÈS toutes les tables,
-- fonctions, triggers, contraintes et policies : le seed doit donc satisfaire
-- TOUS les triggers de validation des catégories déjà installés ci-dessus
-- (check_categorie_parent_scope, check_categorie_no_cycle, check_gamme_categorie)
-- ainsi que le CHECK chk_equipement_categorie_racine.
--
-- Elle ne contient QUE des opérations de DONNÉES (aucun DDL — tables, fonctions,
-- triggers et policies sont déjà définis plus haut). On y trouve :
--   - le SEED durable des catégories de secours « Non classé » (filet des RPC
--     copier_gamme / copier_modele_equipement → elles DOIVENT exister même sur
--     une base neuve) ;
--   - les UPDATE de reclassement LEGACY (aplatissement equipement, reparentage
--     des gammes / modèles non conformes), naturellement no-op sur base neuve et
--     utiles uniquement en rejeu sur des données pré-existantes.
--
-- Idempotence : rejouable N fois sans doublon ni erreur. Le seed cherche d'abord
-- la ligne (SELECT … INTO) et n'INSÈRE que si absente ; les UPDATE legacy sont
-- gardés par des conditions WHERE qui ne matchent plus rien après le 1er passage
-- (ni sur base vide). Ordre interne de chaque bloc : SEED d'abord, puis les
-- UPDATE qui s'appuient sur l'id capturé — aucune référence à une catégorie
-- pas encore créée.

-- ───────────────────────────────────────────────────────────────────────────
-- (002) Aplatissement « equipement = 1 seul niveau » — LEGACY.
-- Repris de 002_categories_equipement_1_niveau.sql (partie DATA uniquement ;
-- le CHECK chk_equipement_categorie_racine et la fonction
-- check_categorie_parent_scope sont déjà dans le snapshot).
-- LEGACY : no-op sur base neuve, utile uniquement en rejeu sur données
-- pré-existantes (catégories d'équipement ayant un parent, ou enfants d'une
-- catégorie d'équipement). Aucune création de catégorie ici : ces UPDATE ne
-- référencent aucune catégorie cible → ne peuvent jamais échouer faute de seed.
-- ───────────────────────────────────────────────────────────────────────────

-- Garde-fou d'UNICITÉ (AVANT l'aplatissement) : promouvoir une catégorie à la
-- racine peut faire entrer deux racines VIVANTES homonymes de MÊME scope au même
-- site → uq_categories_nom (scope inclus depuis migration 011) lèverait 23505. On
-- suffixe le nom de façon non destructive (« (déplacé) », puis « (déplacé N) »)
-- avant de promouvoir.
-- Sur base neuve : la boucle ne sélectionne aucune ligne → no-op.
DO $$
DECLARE
    r       record;
    v_base  text;
    v_nom   text;
    v_n     int;
BEGIN
    FOR r IN
        SELECT c.id, c.site_id, c.nom, c.scope
          FROM public.categories c
         WHERE c.deleted_at IS NULL
           AND (
               (c.scope = 'equipement' AND c.parent_id IS NOT NULL)
               OR c.parent_id IN (
                   SELECT id FROM public.categories WHERE scope = 'equipement'
               )
           )
    LOOP
        v_base := r.nom;
        v_nom  := v_base;
        v_n    := 1;
        WHILE EXISTS (
            SELECT 1
              FROM public.categories x
             WHERE x.deleted_at IS NULL
               AND x.parent_id IS NULL
               AND x.id <> r.id
               AND x.site_id IS NOT DISTINCT FROM r.site_id
               AND x.scope = r.scope
               AND lower(x.nom) = lower(v_nom)
        ) LOOP
            IF v_n = 1 THEN
                v_nom := v_base || ' (déplacé)';
            ELSE
                v_nom := v_base || ' (déplacé ' || v_n || ')';
            END IF;
            v_n := v_n + 1;
        END LOOP;

        IF v_nom <> r.nom THEN
            UPDATE public.categories SET nom = v_nom, parent_id = NULL WHERE id = r.id;
        ELSE
            UPDATE public.categories SET parent_id = NULL WHERE id = r.id;
        END IF;
    END LOOP;
END $$;

-- LEGACY (no-op sur base neuve) : une catégorie d'équipement ne peut plus avoir
-- de parent → racine. (Les lignes vivantes sont déjà détachées par le DO ci-dessus.)
UPDATE public.categories
   SET parent_id = NULL
 WHERE scope = 'equipement'
   AND parent_id IS NOT NULL;

-- LEGACY (no-op sur base neuve) : aucune catégorie ne peut plus avoir un parent
-- de scope 'equipement' (un équipement ne porte pas d'enfant) → on les détache.
UPDATE public.categories
   SET parent_id = NULL
 WHERE parent_id IN (
     SELECT id FROM public.categories WHERE scope = 'equipement'
 );

-- ───────────────────────────────────────────────────────────────────────────
-- (003) SEED « Non classé (gammes) » → « Non classé » + reclassement des gammes
-- non conformes. Repris de 003_gammes_arborescence_stricte.sql, bloc (B).
-- SEED durable (idempotent) : racine commune « Non classé (gammes) » (scope
-- gamme, entreprise) puis sa sous-catégorie commune « Non classé » (niveau 2),
-- filet de secours de copier_gamme. L'id de la racine est capturé pour servir de
-- parent_id à la sous-catégorie. Le SELECT … INTO cherche par nom (de seed, unique
-- en pratique) ; on n'INSÈRE que si absent → idempotent.
-- UPDATE de reclassement = LEGACY (no-op sur base neuve : aucune gamme) ; placé
-- APRÈS le seed du même bloc → la sous-catégorie cible existe toujours.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_racine_id   uuid;
    v_sous_cat_id uuid;
BEGIN
    -- SEED : racine « Non classé (gammes) » (réutilisée si déjà présente).
    SELECT id INTO v_racine_id
      FROM public.categories
     WHERE site_id IS NULL AND parent_id IS NULL
       AND lower(nom) = 'non classé (gammes)'
       AND deleted_at IS NULL
     LIMIT 1;

    IF v_racine_id IS NULL THEN
        INSERT INTO public.categories (nom, scope, site_id, parent_id, est_actif)
        VALUES ('Non classé (gammes)', 'gamme', NULL, NULL, true)
        RETURNING id INTO v_racine_id;
    END IF;

    -- SEED : sous-catégorie « Non classé » (enfant de la racine ci-dessus, niveau 2).
    SELECT id INTO v_sous_cat_id
      FROM public.categories
     WHERE site_id IS NULL AND parent_id = v_racine_id
       AND lower(nom) = 'non classé'
       AND deleted_at IS NULL
     LIMIT 1;

    IF v_sous_cat_id IS NULL THEN
        INSERT INTO public.categories (nom, scope, site_id, parent_id, est_actif)
        VALUES ('Non classé', 'gamme', NULL, v_racine_id, true)
        RETURNING id INTO v_sous_cat_id;
    END IF;

    -- LEGACY (no-op sur base neuve) : réassigne toute gamme sans catégorie ou dont
    -- la catégorie ne satisfait pas TOUTES les règles de check_gamme_categorie
    -- (vraie sous-catégorie de niveau 2, scope gamme/mixte, cohérence de site). La
    -- cible v_sous_cat_id est ENTREPRISE (site_id NULL) → acceptée pour toute gamme.
    UPDATE public.gammes g
       SET categorie_id = v_sous_cat_id
     WHERE g.categorie_id IS NULL
        OR NOT EXISTS (
                SELECT 1 FROM public.categories c
                 WHERE c.id = g.categorie_id
                   AND c.parent_id IS NOT NULL
                   AND (SELECT p.parent_id FROM public.categories p WHERE p.id = c.parent_id) IS NULL
                   AND c.scope IN ('gamme', 'mixte')
                   AND (c.site_id IS NULL OR c.site_id = g.site_id)
            );
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- (004) SEED « Non classé (équipements) » + reclassement des modèles à
-- categorie NULL. Repris de 004_modeles_equipements_categorie_obligatoire.sql,
-- bloc (A). SEED durable (idempotent) : racine commune « Non classé
-- (équipements) » (scope equipement, racine, entreprise), filet de secours de
-- copier_modele_equipement. Nom DISTINCT de « Non classé (gammes) » par
-- convention de lisibilité (depuis migration 011, uq_categories_nom inclut le
-- scope → l'homonymie inter-scope serait permise). UPDATE de reclassement = LEGACY (no-op sur
-- base neuve : aucun modèle) ; placé APRÈS le seed → la cible existe toujours.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_cat_id uuid;
BEGIN
    -- SEED : racine « Non classé (équipements) » (réutilisée si déjà présente,
    -- recherche par nom seul ; le nom de seed est unique en pratique).
    SELECT id INTO v_cat_id
      FROM public.categories
     WHERE site_id IS NULL AND parent_id IS NULL
       AND lower(nom) = 'non classé (équipements)'
       AND deleted_at IS NULL
     LIMIT 1;

    IF v_cat_id IS NULL THEN
        INSERT INTO public.categories (nom, scope, site_id, parent_id, est_actif)
        VALUES ('Non classé (équipements)', 'equipement', NULL, NULL, true)
        RETURNING id INTO v_cat_id;
    END IF;

    -- LEGACY (no-op sur base neuve) : range les modèles sans catégorie sous la
    -- racine de secours. Catégorie entreprise scope equipement → acceptée par
    -- check_modele_equipement_categorie pour tout modèle (aucune contrainte de site).
    UPDATE public.modeles_equipements
       SET categorie_id = v_cat_id
     WHERE categorie_id IS NULL;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- (010) Reclassement LEGACY : modèle DE SITE rangé dans une catégorie COMMUNE →
-- catégorie DE SITE homonyme, via copier_categorie_noeud (le find-or-create de la
-- RPC 009). LEGACY / no-op sur base neuve : depuis la migration 009, copier_
-- modele_equipement range déjà les copies dans une catégorie de site. Placé APRÈS
-- le seed → les catégories existent. Les originaux COMMUNS ne sont pas touchés ;
-- catégorie source en corbeille → modèle ignoré (pas d'échec). Idempotent.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    r          RECORD;
    v_cat_site UUID;
BEGIN
    FOR r IN
        SELECT m.id AS modele_id, m.categorie_id AS cat_commune, m.site_id AS site_id
          FROM public.modeles_equipements m
          JOIN public.categories c ON c.id = m.categorie_id
         WHERE m.deleted_at IS NULL
           AND m.site_id    IS NOT NULL   -- modèle DE SITE
           AND c.site_id    IS NULL       -- mais rangé dans une catégorie COMMUNE
           AND c.deleted_at IS NULL
    LOOP
        v_cat_site := public.copier_categorie_noeud(r.cat_commune, NULL, r.site_id);
        UPDATE public.modeles_equipements
           SET categorie_id = v_cat_site
         WHERE id = r.modele_id;
    END LOOP;
END $$;


-- ╔═════════════════════════════════════════════════════════════════════════╗
-- ║  020_v_miniatures_pool_usage.sql                                          ║
-- ╚═════════════════════════════════════════════════════════════════════════╝
-- Pool de vignettes enrichi de l'usage : origines (familles qui référencent la
-- vignette) + libelles (noms des entités liées, pour la recherche). Lecture seule ;
-- les écritures ciblent la table miniatures. security_invoker → RLS respectée.
CREATE OR REPLACE VIEW public.v_miniatures_pool AS
WITH refs AS (
    SELECT miniature_id, 'equipement'::text AS origine, nom AS libelle
      FROM public.modeles_equipements
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'equipement', nom
      FROM public.equipements
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'equipement', nom
      FROM public.categories
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
       AND scope IN ('equipement', 'mixte')
    UNION ALL
    SELECT miniature_id, 'operation', nom
      FROM public.modeles_operations
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'operation', nom
      FROM public.categories
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
       AND scope = 'operation'
    UNION ALL
    SELECT miniature_id, 'plan_maintenance', nom
      FROM public.gammes
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'plan_maintenance', nom
      FROM public.categories
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
       AND scope IN ('gamme', 'mixte')
    UNION ALL
    SELECT miniature_id, 'di', libelle
      FROM public.modeles_di
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'lieux', libelle
      FROM public.prestataires
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'lieux', nom
      FROM public.batiments
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'lieux', nom
      FROM public.niveaux
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT miniature_id, 'lieux', nom
      FROM public.locaux
     WHERE miniature_id IS NOT NULL AND deleted_at IS NULL
),
agg AS (
    SELECT miniature_id,
           array_agg(DISTINCT origine ORDER BY origine) AS origines,
           string_agg(DISTINCT libelle, ' ')            AS libelles
      FROM refs
     GROUP BY miniature_id
)
SELECT
    m.id,
    m.site_id,
    m.hash_sha256,
    m.storage_path,
    m.created_at,
    m.created_by,
    COALESCE(a.origines, ARRAY[]::text[]) AS origines,
    COALESCE(a.libelles, '')             AS libelles
  FROM public.miniatures m
  LEFT JOIN agg a ON a.miniature_id = m.id;

ALTER VIEW public.v_miniatures_pool SET (security_invoker = true);
GRANT SELECT ON public.v_miniatures_pool TO anon, authenticated;

COMMENT ON VIEW public.v_miniatures_pool IS
    'Pool de vignettes enrichi de l''usage : origines TEXT[] (familles d''entités qui référencent la vignette : equipement / operation / plan_maintenance / di / lieux ; vide = inutilisée) et libelles TEXT (noms des entités liées, pour la recherche). security_invoker → respecte la RLS. Lecture seule ; les écritures ciblent la table miniatures. (020)';
