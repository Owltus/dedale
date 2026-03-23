# Phase 7 — Ordres de travail

## Objectif
La pièce maîtresse. Cycle de vie complet des OT : création, exécution des opérations inline, transitions de statut, auto-clôture, reprogrammation automatique, résurrection.

## Dépend de
Phase 6 (gammes — un OT est toujours lié à une gamme)

## Tables concernées
- `ordres_travail` (24 colonnes dont snapshots figés)
- `operations_execution` (opérations d'un OT, inline dans la fiche)
- `statuts_ot` (1-5)
- `statuts_operations` (1-5)
- `priorites_ot` (1-4)

## Étapes

### 7.1 Backend — Commandes OT

**Fichier** : `src-tauri/src/commands/ordres_travail.rs`

```
// Liste
get_ordres_travail(filtres?)    → Vec<OtListItem>  (avec progression calculée)

// Détail
get_ordre_travail(id)           → OrdreDetailComplet  (OT + operations_execution + DI liée + documents)

// Création
create_ordre_travail(id_gamme, date_prevue, id_priorite, id_technicien?, id_di?, commentaires?)
    → OrdreDetailComplet
    // Le trigger creation_ot_complet fait tout : snapshots, résolution prestataire, génération ops

// Transitions de statut
update_statut_ot(id, nouveau_statut) → OrdreDetailComplet
    // Les triggers gèrent : nettoyage dates, cascade annulation, résurrection

// Modification (champs modifiables sur OT actif)
update_ordre_travail(id, id_priorite?, id_technicien?, commentaires?) → OrdreDetailComplet

// Opérations d'exécution
update_operation_execution(id_operation_execution, id_statut_operation, valeur_mesuree?, est_conforme?, date_execution?, commentaires?)
    → OperationExecution
    // Le trigger gestion_statut_ot peut auto-clôturer l'OT

// Bulk opérations
bulk_terminer_operations(ids: Vec<i64>, date_execution: String)
    → Vec<OperationExecution>

// Détection des effets système (pour les toasts)
// La commande Rust retourne un struct avec les effets :
struct OtCommandResult {
    ordre_travail: OrdreDetailComplet,
    effets: Vec<EffetSysteme>,  // ex: "auto_cloture", "reprogrammation(id, date)", "bascule_prestataire(ancien)"
}
```

**Progression** (calculée côté Rust) :
```rust
fn calculer_progression(ops: &[OperationExecution]) -> f64 {
    let total = ops.len() as f64;
    if total == 0.0 { return 0.0; }
    let terminees = ops.iter().filter(|o| [3, 4, 5].contains(&o.id_statut_operation)).count() as f64;
    (terminees / total * 100.0).round()
}
```

**Détection OT suivant** (pour warning réouverture) :
```rust
fn get_ot_suivant(conn: &Connection, id_gamme: i64, id_current: i64) -> Option<OtSuivant> {
    conn.query_row(
        "SELECT id_ordre_travail, date_prevue FROM ordres_travail
         WHERE id_gamme = ?1 AND id_ordre_travail != ?2 AND id_statut_ot NOT IN (3, 4)
         ORDER BY date_prevue ASC LIMIT 1",
        [id_gamme, id_current], |row| Ok(OtSuivant { ... })
    ).ok()
}
```

### 7.2 Backend — Modèles

**Fichier** : `src-tauri/src/models/ordres_travail.rs`

```rust
#[derive(Serialize)]
pub struct OtListItem {
    pub id_ordre_travail: i64,
    pub nom_gamme: String,
    pub date_prevue: String,
    pub id_statut_ot: i64,
    pub id_priorite: i64,
    pub nom_prestataire: String,
    pub est_reglementaire: bool,
    pub nom_localisation: Option<String>,
    pub progression: f64,
    pub est_en_retard: bool,
}

#[derive(Serialize)]
pub struct OrdreDetailComplet {
    pub ordre_travail: OrdreTravail,
    pub operations: Vec<OperationExecution>,
    pub ot_suivant: Option<OtSuivant>,  // pour warning réouverture
}
```

### 7.3 Frontend — Liste OT

**Fichier** : `src/pages/ordres-travail/OrdresTravailList.tsx`

- DataTable avec 8 colonnes (voir PRD-FRONTEND §2.1)
- Filtres : statut, priorité, prestataire, réglementaire, date range
- Codes couleur des lignes (rouge retard, vert clôturé, gris annulé)
- Bouton "+ Créer un OT" → modale

### 7.4 Frontend — Détail OT

**Fichiers** :
```
src/pages/ordres-travail/
├── OrdresTravailList.tsx       # Liste + filtres
├── OrdresTravailDetail.tsx     # Fiche complète
├── OtActionBar.tsx             # Barre d'actions contextuelle (transitions)
├── OtInfoCards.tsx             # 3 cards : infos (snapshots), assignation, dates
├── OperationsTable.tsx         # DataTable inline interactive
├── OperationRow.tsx            # Mini-formulaire par opération
├── OtCreateDialog.tsx          # Modale création
└── OperationsBulkBar.tsx       # Bulk actions (terminer la sélection)
```

### 7.5 ActionBar — transitions complètes

```
Planifié (1)  → Démarrer (→2), Clôturer (→3), Annuler (→4)
En Cours (2)  → Retour planifié (→1), Clôturer (→3), Annuler (→4)
Clôturé (3)   → Réouvrir (→5)  [+ warning si OT suivant existe]
Annulé (4)    → Ressusciter (→1)
Réouvert (5)  → Démarrer (→2), Retour planifié (→1), Clôturer (→3), Annuler (→4)
```

### 7.6 Opérations inline

Chaque opération est un mini-formulaire :
- Select statut (1, 2, 3, 5 — PAS 4 qui est système)
- InputNumber valeur_mesuree (si type Mesure)
- ConformiteIcon (auto-calculé si seuils)
- DatePicker date_execution
- InputText commentaires

**Auto-calcul conformité** (côté frontend, avant envoi) :
```ts
if (seuil_min != null && seuil_max != null && valeur_mesuree != null) {
  est_conforme = valeur_mesuree >= seuil_min && valeur_mesuree <= seuil_max ? 1 : 0;
}
```

### 7.7 Notifications système (toasts)

Après chaque mutation OT/opération, comparer l'état avant/après pour détecter les effets :

| Effet détecté | Toast |
|---|---|
| `statut_ot` a changé sans action directe | `"OT passé automatiquement en {statut}"` |
| `date_cloture` remplie automatiquement | `"OT clôturé automatiquement"` |
| Nouvel OT créé (reprogrammation) | `"OT #{id} créé automatiquement, prévu le {date}"` |
| `id_prestataire` différent de la gamme | `"⚠ Prestataire basculé sur Mon Entreprise"` |
| Opérations passées en statut 4 (cascade) | `"{n} opération(s) annulée(s) automatiquement"` |

### 7.8 Schemas Zod

**Fichier** : `src/lib/schemas/ordres-travail.ts`

## Erreurs trigger à gérer
- `Gamme inactive ou inexistante`
- `Gamme sans opérations exécutables`
- `Gamme réglementaire sans contrat valide pour ce prestataire`
- `Technicien inactif`
- `Technicien interne sur OT externe`
- `Transition interdite depuis {statut}`
- `Clôture impossible : des opérations sont encore en attente ou en cours`
- `Résurrection impossible : la gamme est inactive`
- `Résurrection impossible : un OT actif existe déjà pour cette gamme`
- `Résurrection impossible : gamme réglementaire sans contrat valide`
- `Modification interdite : OT terminé`
- `Le statut Annulée est réservé au système`

## Critère de validation
- Création OT → snapshots corrects, opérations générées
- Exécution des opérations inline (statut, mesure, conformité, date)
- Bulk "terminer la sélection" fonctionne
- Auto-clôture quand toutes les ops sont terminées
- Reprogrammation automatique (vérifier qu'un nouvel OT est créé)
- Bascule prestataire silencieuse → toast affiché
- Annulation → cascade sur opérations → toast
- Résurrection → reset opérations → toast
- Réouverture → warning OT suivant affiché
- Toutes les transitions de statut respectent les triggers
