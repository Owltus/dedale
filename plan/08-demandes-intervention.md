# Phase 8 — Demandes d'intervention

## Objectif
DI complètes : création (manuelle ou depuis modèle), machine à états (Ouverte → Résolue → Réouverte), liaisons gammes/localisations, lien vers OT.

## Dépend de
Phase 4 (localisations) + Phase 6 (gammes — pour les liaisons)

## Tables concernées
- `demandes_intervention`
- `statuts_di` (1=Ouverte, 2=Résolue, 3=Réouverte)
- `types_di`
- `di_gammes` (liaison DI ↔ gamme)
- `di_localisations` (liaison DI ↔ localisation)
- `modeles_di` (templates de DI)

## Étapes

### 8.1 Backend

**Fichier** : `src-tauri/src/commands/demandes.rs`

```
get_demandes(filtres?)           → Vec<DiListItem>
get_demande(id)                  → DemandeComplete  (DI + gammes + localisations + OT liés + documents)
create_demande(...)              → Demande
update_demande(id, ...)          → Demande           (bloqué si statut 2)
resoudre_demande(id, date_resolution, description_resolution) → Demande  (→ statut 2)
reouvrir_demande(id)             → Demande           (→ statut 3)
repasser_ouverte_demande(id)     → Demande           (3 → 1)

// Créer depuis modèle (le modèle pré-remplit les champs)
create_demande_from_modele(id_modele_di, overrides?) → Demande

// Liaisons
link_di_gamme(id_di, id_gamme)       → ()
unlink_di_gamme(id_di, id_gamme)     → ()
link_di_localisation(id_di, id_loc)  → ()
unlink_di_localisation(id_di, id_loc) → ()
```

### 8.2 Frontend

**Fichiers** :
```
src/pages/demandes/
├── DemandesList.tsx             # Liste + filtres (type, statut, date range)
├── DemandesDetail.tsx           # Fiche + résolution + gammes liées + localisations liées + OT + documents
├── DemandeForm.tsx              # Dialog création
├── DemandeFromModeleDialog.tsx  # Dialog création depuis modèle (select modèle → pré-remplit)
└── ResolutionDialog.tsx         # Dialog résolution (date + description obligatoires)
```

### 8.3 Machine à états DI

```
Ouverte (1) → Résoudre → Résolue (2)
Résolue (2) → Réouvrir → Réouverte (3)        [DI figée en statut 2 sauf réouverture]
Réouverte (3) → Résoudre → Résolue (2)
Réouverte (3) → Repasser en Ouverte → Ouverte (1)
```

**Règles readonly** :
- Statut 2 (Résolue) : tous les champs figés sauf réouverture
- Liaisons gammes/localisations : modifiables sauf en statut 2

## Erreurs trigger à gérer
- `Création impossible : une DI doit commencer en statut Ouverte`
- `Transition DI interdite depuis Ouverte : seule la Résolution est autorisée`
- `Résolution impossible : date_resolution requise`
- `Résolution impossible : description_resolution requise`
- `Modification interdite : DI résolue`

## Critère de validation
- Création DI manuelle + depuis modèle
- Transitions de statut complètes
- Résolution avec champs obligatoires
- Liaisons gammes/localisations (ajout/suppression)
- DI résolue = tout readonly
- OT liés visibles (OT avec `id_di = :id`)
