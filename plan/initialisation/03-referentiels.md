# Phase 3 — Paramètres & Référentiels

## Objectif
Page `/parametres` complète avec CRUD pour toutes les tables de référence. C'est le socle de données nécessaire pour toutes les phases suivantes.

## Dépend de
Phases 1 (backend) + 2 (frontend)

## Tables concernées

| Table | Onglet | CRUD | Champs spécifiques |
|---|---|---|---|
| `etablissements` | Établissement | Create/Update (fiche unique) | type_erp, categorie_erp, adresse, code_postal, ville, capacite, surface |
| `types_documents` | Types de documents | Full CRUD | `est_systeme` (badge, non modifiable) |
| `types_di` | Types de DI | Full CRUD | libelle, description |
| `unites` | Unités de mesure | Full CRUD | nom, symbole, description |
| `periodicites` | Périodicités | Full CRUD | jours_periodicite, jours_valide, tolerance_jours |
| `types_operations` | Types d'opérations | Full CRUD | necessite_seuils (switch) |
| `postes` | Postes | Full CRUD | libelle, description |
| `modeles_di` | Modèles de DI | Full CRUD | type_di, libelle_constat, description_constat, resolution_suggeree |
| `types_erp` | Référentiel ERP | Lecture seule | Données pré-insérées par le schema |
| `categories_erp` | Référentiel ERP | Lecture seule | Données pré-insérées par le schema |

## Étapes

### 3.1 Backend — Commandes Rust

**Fichier** : `src-tauri/src/commands/referentiels.rs`

Commandes à créer (pattern identique pour chaque table CRUD) :

```
get_unites()              → Vec<Unite>
create_unite(params)      → Unite
update_unite(id, params)  → Unite
delete_unite(id)          → ()

get_periodicites()        → Vec<Periodicite>
create_periodicite(...)   → Periodicite
update_periodicite(...)   → Periodicite
delete_periodicite(...)   → ()

get_types_operations()    → Vec<TypeOperation>
create_type_operation()   → ...
update_type_operation()   → ...
delete_type_operation()   → ...

get_types_documents()     → Vec<TypeDocument>
create_type_document()    → ...
update_type_document()    → ...
delete_type_document()    → ...

get_types_di()            → Vec<TypeDi>
create_type_di()          → ...
update_type_di()          → ...
delete_type_di()          → ...

get_postes()              → Vec<Poste>
create_poste()            → ...
update_poste()            → ...
delete_poste()            → ...

get_modeles_di()          → Vec<ModeleDi>
create_modele_di()        → ...
update_modele_di()        → ...
delete_modele_di()        → ...

get_types_erp()           → Vec<TypeErp>           (lecture seule)
get_categories_erp()      → Vec<CategorieErp>      (lecture seule)

get_etablissement()       → Option<Etablissement>   (le premier, ou null)
upsert_etablissement()    → Etablissement
```

**Fichier** : `src-tauri/src/models/referentiels.rs`

Structs pour chaque table.

### 3.2 Frontend — Page Paramètres

**Fichier** : `src/pages/parametres/Parametres.tsx`

Layout avec `<Tabs>` shadcn/ui :
- Onglet par table (9 onglets)
- Chaque onglet = un composant enfant

### 3.3 Frontend — Composant CRUD générique

Pattern réutilisable pour les tables simples (unités, postes, types_di, types_documents, types_operations) :

```
src/pages/parametres/
├── Parametres.tsx              # Layout avec Tabs
├── EtablissementTab.tsx        # Fiche unique
├── CrudTab.tsx                 # Composant générique CRUD (DataTable + Dialog)
├── PeriodicitesTab.tsx         # CRUD enrichi (3 champs numériques + validations croisées)
├── TypesOperationsTab.tsx      # CRUD avec switch necessite_seuils
├── TypesDocumentsTab.tsx       # CRUD avec badge est_systeme
├── ModelesDiTab.tsx            # CRUD complexe (4 champs + select type_di)
└── ReferentielErpTab.tsx       # Lecture seule (2 tables)
```

### 3.4 Schemas Zod

**Fichier** : `src/lib/schemas/referentiels.ts`

```ts
const periodiciteSchema = z.object({
  libelle: z.string().trim().min(1),
  description: z.string().optional(),
  jours_periodicite: z.number().int().min(0),
  jours_valide: z.number().int().min(0),
  tolerance_jours: z.number().int().min(0).default(0),
}).refine(d => d.jours_valide <= d.jours_periodicite, {
  message: "Jours valide doit être ≤ jours périodicité"
}).refine(d => d.tolerance_jours <= d.jours_valide, {
  message: "Tolérance doit être ≤ jours valide"
});
```

## Erreurs trigger à gérer
- `Suppression impossible : des documents utilisent ce type. Reclassifiez-les d'abord.`
- FK RESTRICT sur unités, périodicités, types_operations liés à des opérations existantes

## Critère de validation
- Chaque onglet affiche les données de référence pré-insérées par le schema
- CRUD fonctionne pour chaque table
- Les validations Zod rejettent les données invalides
- La suppression d'un type_document utilisé affiche l'erreur trigger
- L'établissement se crée/modifie correctement
- Les modèles de DI se créent avec le type_di en select
