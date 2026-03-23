# Phase 5 — Prestataires & Contrats

## Objectif
Gestion complète des prestataires externes, contrats (avec chaîne d'avenants), types de contrats. Le prestataire interne (id=1 "Mon Entreprise") est protégé.

## Dépend de
Phase 3 (référentiels — types_contrats)

## Tables concernées
- `prestataires` (id=1 protégé)
- `contrats` (versioning via `id_contrat_parent`, `est_archive`)
- `types_contrats` (Déterminé, Tacite, Indéterminé)
- `contrats_gammes` (liaison, utilisée en phase 6)

## Étapes

### 5.1 Backend — Prestataires

**Fichier** : `src-tauri/src/commands/prestataires.rs`

```
get_prestataires()              → Vec<Prestataire>  (avec nb_contrats_actifs, nb_gammes)
get_prestataire(id)             → Prestataire + contrats + gammes
create_prestataire(...)         → Prestataire
update_prestataire(id, ...)     → Prestataire
delete_prestataire(id)          → ()
```

### 5.2 Backend — Contrats

**Fichier** : `src-tauri/src/commands/contrats.rs`

```
get_contrats(filtres?)          → Vec<ContratListItem>  (avec prestataire, type, statut calculé, nb_gammes)
get_contrat(id)                 → Contrat + prestataire + gammes liées + chaîne versions
create_contrat(...)             → Contrat
update_contrat(id, ...)         → Contrat
delete_contrat(id)              → ()
resilier_contrat(id, date_notification, date_resiliation) → Contrat

// Avenants
create_avenant(id_contrat_parent, objet_avenant, ...) → Contrat  (nouveau)

// Liaisons gammes
get_contrat_gammes(id_contrat)   → Vec<Gamme>
link_contrat_gamme(id_contrat, id_gamme)    → ()
unlink_contrat_gamme(id_contrat, id_gamme)  → ()

// Chaîne de versions
get_contrat_versions(id_contrat) → Vec<ContratVersion>  (remonte la chaîne parent)
```

**Statut calculé** (en Rust, pas en SQL) :
```rust
fn calculer_statut(contrat: &Contrat) -> &str {
    if contrat.est_archive { return "Archivé"; }
    if contrat.date_resiliation.is_some() { return "Résilié"; }
    let today = chrono::Local::now().date_naive();
    if contrat.date_debut > today { return "À venir"; }
    if let Some(fin) = contrat.date_fin {
        if fin < today { return "Expiré"; }
    }
    "Actif"
}
```

### 5.3 Frontend — Prestataires

**Fichiers** :
```
src/pages/prestataires/
├── PrestatairesList.tsx        # Liste avec DataTable
├── PrestatairesDetail.tsx      # Fiche + contrats liés + gammes + documents
└── PrestataireForm.tsx         # Dialog création/modification
```

**Règles UI** :
- "Mon Entreprise" (id=1) toujours visible, jamais supprimable (`{id != 1 && <DeleteButton>}`)
- Formulaire : code_postal validé regex `^\d{5}$`, email validé

### 5.4 Frontend — Contrats

**Fichiers** :
```
src/pages/contrats/
├── ContratsList.tsx            # Liste avec filtres (prestataire, type, archivés)
├── ContratsDetail.tsx          # Fiche + résiliation + timeline avenants + gammes liées + documents
├── ContratForm.tsx             # Dialog création/modification
├── AvenantForm.tsx             # Dialog création avenant (pré-rempli)
└── ContratTimeline.tsx         # Composant timeline des versions
```

Composant partagé à créer :
```
src/components/shared/Timeline.tsx      # Timeline verticale générique
```

**Points critiques** :
- Champs conditionnels selon type de contrat (date_fin, duree_cycle, fenetre_resiliation)
- Contrat archivé = tout readonly, aucun bouton d'action
- Résiliation = formulaire inline (date_notification + date_resiliation)
- Avenant : alerte "Le contrat parent sera archivé automatiquement" + les gammes liées NE SONT PAS reportées

### 5.5 Schemas Zod

**Fichier** : `src/lib/schemas/contrats.ts`

```ts
const contratSchema = z.object({
  id_prestataire: z.number().int().min(2), // pas le prestataire interne
  id_type_contrat: z.number().int(),
  date_signature: z.string().optional(),
  date_debut: z.string().min(1),
  date_fin: z.string().optional(),
  // ...
}).refine(d => !d.date_fin || d.date_debut <= d.date_fin, {
  message: "Date fin doit être ≥ date début"
}).refine(d => !d.date_signature || d.date_signature <= d.date_debut, {
  message: "Date signature doit être ≤ date début"
});
```

## Erreurs trigger à gérer
- `Impossible : ce contrat est déjà archivé`
- `Impossible : le prestataire de l'avenant doit être identique au contrat parent`
- `Modification interdite : ce contrat est archivé`
- `Suppression impossible : ce prestataire a des contrats actifs`
- `Le prestataire interne (id=1) ne peut pas être supprimé`

## Critère de validation
- CRUD prestataires complet, id=1 protégé
- Contrats avec statut calculé correct (Actif/Expiré/Résilié/Archivé/À venir)
- Création d'avenant → parent archivé automatiquement
- Timeline des versions visible
- Résiliation fonctionne
- Liaison/dissociation gammes (préparé pour phase 6)
