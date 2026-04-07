# Phase 6 — Gammes de maintenance

## Objectif
Gammes (procédures de maintenance), opérations spécifiques, gammes types (templates réutilisables), associations gamme↔gamme_type. C'est le coeur du métier — les gammes sont le modèle des OT.

## Dépend de
Phase 4 (équipements, localisations) + Phase 5 (prestataires)

## Tables concernées
- `gammes` (procédures de maintenance)
- `operations` (opérations spécifiques d'une gamme)
- `gammes_types` (templates réutilisables)
- `gamme_type_items` (opérations d'un template)
- `gamme_modeles` (liaison gamme ↔ gamme_type)

## Étapes

### 6.1 Backend — Gammes types

**Fichier** : `src-tauri/src/commands/gammes_types.rs`

```
get_gammes_types()                         → Vec<GammeTypeListItem>  (avec nb_items, nb_gammes)
get_gamme_type(id)                         → GammeType + items + gammes associées
create_gamme_type(nom, description)        → GammeType
update_gamme_type(id, nom, description)    → GammeType
delete_gamme_type(id)                      → ()

// Items
get_gamme_type_items(id_gamme_type)        → Vec<GammeTypeItem>
create_gamme_type_item(id_gamme_type, ...) → GammeTypeItem
update_gamme_type_item(id, ...)            → GammeTypeItem
delete_gamme_type_item(id)                 → ()
```

### 6.2 Backend — Gammes

**Fichier** : `src-tauri/src/commands/gammes.rs`

```
get_gammes(filtres?)                       → Vec<GammeListItem>  (avec famille, periodicite, prestataire, nb_ops)
get_gamme(id)                              → Gamme + opérations + gamme_modeles + OT liés + contrats liés
create_gamme(...)                          → Gamme
update_gamme(id, ...)                      → Gamme  (triggers propagent vers OT actifs)
delete_gamme(id)                           → ()

// Opérations spécifiques
get_operations(id_gamme)                   → Vec<Operation>
create_operation(id_gamme, ...)            → Operation  (trigger injecte dans OT actifs)
update_operation(id, ...)                  → Operation  (trigger propage vers OT actifs)
delete_operation(id)                       → ()          (trigger nettoie dans OT actifs)

// Associations gamme ↔ gamme_type
link_gamme_type(id_gamme, id_gamme_type)   → ()  (trigger injecte ops dans OT actifs)
unlink_gamme_type(id_gamme, id_gamme_type) → ()  (trigger nettoie ops dans OT actifs)

// Activation/désactivation
toggle_gamme_active(id, est_active)        → Gamme
```

### 6.3 Frontend — Gammes types

**Fichiers** :
```
src/pages/gammes-types/
├── GammesTypesList.tsx         # Liste
├── GammesTypesDetail.tsx       # Détail + items (DataTable éditable) + gammes associées
├── GammeTypeForm.tsx           # Dialog gamme type
└── GammeTypeItemForm.tsx       # Dialog item (avec champs conditionnels seuils/unité)
```

**Point critique** : les champs seuils/unité sont conditionnels selon `necessite_seuils` du type d'opération sélectionné. Quand `necessite_seuils = 1` (Mesure) → afficher unité (obligatoire) + seuil_min + seuil_max. Sinon → masquer ces champs.

### 6.4 Frontend — Gammes

**Fichiers** :
```
src/pages/gammes/
├── GammesList.tsx              # Liste avec filtres (famille, prestataire, périodicité, régl., actives)
├── GammesDetail.tsx            # Fiche + ops spécifiques + gammes types + contrats + OT + documents
├── GammeForm.tsx               # Dialog création/modification
└── OperationForm.tsx           # Dialog opération spécifique
```

**Sections de la fiche gamme** (ordre PRD-FRONTEND) :
1. Informations (nom, famille, localisation, périodicité, prestataire, équipement, description, image)
2. Opérations spécifiques (DataTable avec edit/delete + bouton ajout)
3. Gammes types associées (badges cliquables avec X pour dissocier + bouton associer)
4. **Contrats** (DataTable des contrats liés via `contrats_gammes` — navigation symétrique)
5. Ordres de travail (DataTable des OT liés + bouton créer OT)
6. Documents

### 6.5 Schemas Zod

**Fichier** : `src/lib/schemas/gammes.ts`

```ts
const gammeSchema = z.object({
  nom_gamme: z.string().trim().min(1),
  id_famille: z.number().int(),
  id_periodicite: z.number().int(),
  id_prestataire: z.number().int().default(1),
  est_reglementaire: z.boolean().default(false),
  // ...
});

const operationSchema = z.object({
  nom_operation: z.string().trim().min(1),
  id_type_operation: z.number().int(),
  id_unite: z.number().int().optional(),
  seuil_minimum: z.number().optional(),
  seuil_maximum: z.number().optional(),
}).refine(/* seuil_min <= seuil_max */);
```

## Triggers actifs (effets automatiques lors des modifications)

| Action utilisateur | Trigger | Effet | Toast à afficher |
|---|---|---|---|
| Modifier une gamme | `a_propagation_gamme_vers_ot` | Met à jour les snapshots de tous les OT actifs | `"{n} OT actif(s) mis à jour"` |
| Ajouter une opération spécifique | `f_ajout_operation_specifique_vers_ot` | Injecte l'opération dans tous les OT actifs | `"Opération ajoutée à {n} OT actif(s)"` |
| Modifier une opération | `b_propagation_operations_vers_execution` | Propage les changements aux ops d'exécution | `"{n} OT actif(s) mis à jour"` |
| Supprimer une opération | `synchronisation_suppression_operation` | Supprime/annule les ops dans les OT actifs | `"Opération retirée de {n} OT actif(s)"` |
| Associer une gamme type | `e_ajout_gamme_type_vers_ot_existants` | Injecte toutes les ops du template dans les OT | `"{n} opération(s) ajoutée(s) à {m} OT actif(s)"` |
| Dissocier une gamme type | `nettoyage_deliaison_gamme_type` | Supprime/annule les ops dans les OT | `"Opérations du template retirées de {n} OT actif(s)"` |
| Désactiver une gamme | `protection_desactivation_gamme` | BLOQUÉ si OT actifs | Erreur toast |

## Erreurs trigger à gérer
- `Désactivation impossible : des OT actifs existent encore pour cette gamme`
- `Association impossible : cette gamme type ne contient aucune opération`
- `Suppression impossible : cette opération est la dernière source pour une gamme ayant des OT actifs`
- `Les opérations de type mesure nécessitent une unité`
- `Les opérations qualitatives ne peuvent pas avoir de seuils ni d'unité`
- `Passage en réglementaire impossible : des OT actifs existent avec un prestataire externe sans contrat valide`

## Critère de validation
- CRUD complet gammes + opérations + gammes types
- Champs conditionnels seuils/unité fonctionnent
- Switch réglementaire avec protection trigger
- Association/dissociation gamme type fonctionne
- Propagation vers OT actifs vérifiable (créer un OT phase 7, modifier la gamme, vérifier)
- Card contrats visible dans la fiche gamme
