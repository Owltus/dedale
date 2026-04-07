<p align="center">
  <img src="src/assets/logo.svg" width="120" alt="DÉDALE Logo">
</p>

<h1 align="center">DÉDALE</h1>

<p align="center">
  <strong>Application de Gestion de Maintenance Assistée par Ordinateur (GMAO)</strong><br>
  Desktop, mono-utilisateur, 100 % locale — aucune donnée ne quitte votre poste.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-blue?logo=tauri" alt="Tauri v2">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/Rust-2021-orange?logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/SQLite-embedded-003B57?logo=sqlite" alt="SQLite">
  <img src="https://img.shields.io/badge/License-Proprietary-red" alt="License">
</p>

---

## Sommaire

- [Apercu](#apercu)
- [Stack technique](#stack-technique)
- [Fonctionnalites](#fonctionnalites)
  - [Tableau de bord](#tableau-de-bord)
  - [Planning Gantt](#planning-gantt)
  - [Ordres de travail](#ordres-de-travail)
  - [Gammes de maintenance](#gammes-de-maintenance)
  - [Gammes types](#gammes-types)
  - [Demandes d'intervention](#demandes-dintervention)
  - [Equipements](#equipements)
  - [Localisations](#localisations)
  - [Prestataires et contrats](#prestataires-et-contrats)
  - [Techniciens](#techniciens)
  - [Documents](#documents)
  - [Parametres](#parametres)
  - [Fonctions transversales](#fonctions-transversales)
- [Installation](#installation)
  - [Prerequis](#prerequis)
  - [Developpement](#developpement)
  - [Build de production](#build-de-production)
- [Structure du projet](#structure-du-projet)

---

## Apercu

DÉDALE est une GMAO desktop pensee pour les etablissements recevant du public (ERP). Elle couvre l'ensemble du cycle de maintenance : planification des interventions, suivi des ordres de travail, gestion des prestataires et contrats, traçabilite documentaire et conformite reglementaire.

L'application fonctionne entierement en local avec une base SQLite embarquee — aucun serveur, aucun compte, aucune connexion internet requise.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Runtime desktop | [Tauri v2](https://v2.tauri.app/) |
| Backend | Rust + rusqlite (SQL brut, pas d'ORM) |
| Base de donnees | SQLite (WAL mode, ~30 tables, ~40 triggers) |
| Frontend | React 19 + TypeScript |
| Styles | Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com/) |
| Routing | React Router v7 |
| State serveur | TanStack Query |
| Tableaux | TanStack Table + TanStack Virtual |
| Formulaires | React Hook Form + Zod |
| Icones | Lucide React |

---

## Fonctionnalites

### Tableau de bord

- **KPI en temps reel** : OT en retard, OT de la semaine, DI ouvertes, contrats a risque
- **Alertes proactives** : contrats expirant sous 30 jours, gammes reglementaires sans OT planifie, OT stagnants depuis 30+ jours
- **Acces rapide** aux derniers OT et DI crees
- **Checklist d'integration** guidant la mise en route (etablissement, localisations, equipements, prestataires, contrats, gammes, premier OT)

### Planning Gantt

- Vue annuelle avec grille par semaines ISO
- Evenements groupes par famille de maintenance puis par gamme
- Code couleur par statut (planifie, en cours, cloture, annule, reouvert)
- Indicateur de retard visuel
- Mode focus (8 prochaines semaines)
- Navigation par annee et clic vers le detail de l'OT

### Ordres de travail

- **Liste** : vue par cartes avec recherche, filtres par date, statut, priorite, presence de documents
- **Detail** : fiche complete (prestataire, localisation, periodicite, technicien, dates, equipements)
- **Operations** : suivi operation par operation avec type, seuils, valeurs mesurees, conformite
  - Action groupee "tout completer"
  - Workflow : En attente → En cours → Termine / Non applicable
- **Cycle de vie** : Planifie → En cours → Cloture / Annule / Reouvert
- **Documents lies** par OT
- Generation automatique depuis les gammes avec reprogrammation a la cloture

### Gammes de maintenance

- Organisation hierarchique : **Domaines → Familles → Gammes**
- Chaque gamme definit : operations, equipements lies, periodicite, caractere reglementaire, prestataire
- **Operations** : ajout, edition, suppression, lien vers des modeles d'operations
- **Equipements** : association individuelle ou import par lot
- **OT generes** : historique de tous les ordres de travail issus de la gamme
- Activation / desactivation de gamme
- Documents lies

### Gammes types

- **Modeles de gammes** reutilisables avec operations pre-definies
- Servent de base a la creation rapide de nouvelles gammes
- Edition des operations du modele (nom, type, seuils, unite)

### Demandes d'intervention

- **Liste** avec filtres rapides et recherche
- **Creation** manuelle ou depuis un modele (pre-remplissage automatique)
- **Ciblage** : association a des localisations (batiment → niveau → local) et des equipements
- **Lien gammes** : rattachement a des gammes de maintenance
- **Workflow** : Ouverte → Suggestion → Resolue, avec possibilite de reouverture
- Documents lies

### Equipements

- Organisation hierarchique : **Domaines → Familles → Equipements**
- Chaque equipement : nom, famille, localisation, statut actif/inactif
- **Modeles d'equipements** avec champs personnalises (texte, nombre, date, booleen, selection)
  - Gestion par categorie de modele
  - Archivage de champs sans perte de donnees
- Gammes de maintenance associees
- Historique des OT lies
- Documents lies

### Localisations

- Structure hierarchique : **Batiments → Niveaux → Locaux**
- Chaque niveau : surface, description, image
- Equipements rattaches par local
- Documents lies a chaque niveau de la hierarchie

### Prestataires et contrats

- **Prestataires** : fiche complete (coordonnees, image, statut), OT et gammes associes
- **Contrats** : gestion complete du cycle de vie
  - Types : Determine (duree fixe), Tacite reconduction, Indetermine
  - Reference, dates (signature, debut, fin, resiliation, notification), preavis, fenetre de resiliation
  - Statuts automatiques : Actif, A risque, Expiration proche, Expire, A venir, Resilie, Archive
  - **Avenants** : creation d'avenants avec archivage automatique de la version precedente
  - **Resiliation** avec suivi des dates
  - **Historique des versions** consultable
  - Documents lies par contrat
  - Barre de progression visuelle du cycle de vie

### Techniciens

- Liste avec recherche et filtres
- Fiche : nom, contact, poste, statut actif/inactif
- Affectation a des postes
- OT assignes
- Image et documents lies

### Documents

- **Systeme documentaire unifie** : les documents peuvent etre rattaches a toute entite (OT, gamme, prestataire, contrat, DI, equipement, localisation)
- Upload par drag & drop ou selection de fichier
- **Previsualisation** en modal (PDF et images)
- Telechargement
- Types de documents parametrables

### Parametres

- **Fiche etablissement** : nom, type ERP, categorie, adresse, capacite, surface
- Configuration generale de l'application

### Fonctions transversales

| Fonction | Description |
|----------|-------------|
| **Recherche globale** | Palette de commandes (Ctrl+K) cherchant dans toutes les entites |
| **Export CSV** | Export des OT, equipements et gammes au format CSV |
| **Theme clair / sombre** | Bascule automatique ou manuelle |
| **Snapshots** | Les OT capturent l'etat du prestataire, technicien et localisation a la creation |
| **Validation reglementaire** | Blocage de creation d'OT pour les gammes reglementaires sans contrat actif |
| **Reprogrammation auto** | Generation automatique du prochain OT a la cloture du precedent |
| **Fil d'Ariane** | Navigation contextuelle sur toutes les pages |

---

## Installation

### Prerequis

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://www.rust-lang.org/tools/install) (edition 2021, v1.77.2+)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) (WebView2 sur Windows, webkit2gtk sur Linux)

### Developpement

```bash
# Cloner le depot
git clone https://github.com/Owltus/dedale.git
cd dedale

# Installer les dependances
npm install

# Lancer en mode developpement (frontend + backend)
npm run tauri dev
```

L'application s'ouvre automatiquement. La base SQLite est creee au premier lancement dans `%APPDATA%/com.dedale.app/` (Windows).

#### Donnees de test (optionnel)

```bash
# Fermer l'application avant de lancer
python seed.py
```

### Build de production

```bash
npm run tauri build
```

L'installateur est genere dans `src-tauri/target/release/bundle/`.

---

## Structure du projet

```
src/                          # Frontend React
├── assets/                   # Logo et ressources statiques
├── components/
│   ├── ui/                   # shadcn/ui (genere — ne pas modifier)
│   ├── layout/               # Sidebar, PageHeader, Breadcrumb
│   ├── icons/                # Icones SVG en composants React
│   └── shared/               # Composants reutilisables metier
├── pages/                    # 1 dossier par domaine metier
├── hooks/                    # Hooks TanStack Query et utilitaires
└── lib/
    ├── schemas/              # Validation Zod (1 fichier/domaine)
    ├── types/                # Types TypeScript (1 fichier/domaine)
    └── utils/                # Fonctions utilitaires

src-tauri/                    # Backend Rust
├── src/
│   ├── commands/             # Commandes Tauri (1 fichier/domaine)
│   ├── models/               # Structs serde (1 fichier/domaine)
│   ├── db.rs                 # Connexion SQLite + PRAGMAs
│   └── lib.rs                # Registre des modules
├── schema.sql                # Schema complet (~30 tables, ~40 triggers)
└── seed.sql                  # Donnees de test
```

---

<p align="center">
  <sub>Concu pour la gestion de maintenance des etablissements recevant du public.</sub>
</p>
