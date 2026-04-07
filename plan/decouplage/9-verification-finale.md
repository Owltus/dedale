# Étape 9 — Vérification finale

## Objectif
Valider le fonctionnement complet de l'application après le découplage.

## Aucun fichier à modifier
Cette étape est purement de test et validation.

## Tests à exécuter

### Compilation
```bash
cargo build                  # Backend Rust
npx tsc --noEmit             # Frontend TypeScript
npm run tauri dev            # App complète
```

### Tests fonctionnels — Installation fraîche
1. Supprimer `%APPDATA%/com.gmao.desktop/gmao.db`
2. Lancer l'app → vérifier que le schéma v2 se crée sans erreur
3. Créer un domaine gamme + famille gamme + gamme avec opérations
4. Créer un domaine équipement + famille équipement + équipements
5. Lier des équipements à la gamme
6. Créer un OT → vérifier les snapshots

### Tests fonctionnels — Migration
1. Restaurer une copie de la base v1 existante
2. Lancer l'app → vérifier migration automatique
3. Vérifier que les gammes existantes ont bien migré (famille_gamme, opérations intactes)
4. Vérifier que les OT existants sont inchangés (snapshots préservés)
5. Vérifier que les équipements existants sont inchangés

### Tests fonctionnels — Cycle de vie OT
1. **OT avec 1 équipement lié** : créer OT → `nom_equipement` rempli
2. **OT avec 0 équipement** : créer OT → `nom_equipement` = NULL
3. **OT avec 2+ équipements** : créer OT → `nom_equipement` = NULL
4. **Clôturer un OT** → reprogrammation auto crée le suivant avec bons snapshots
5. **Annuler un OT** → reprogrammation auto si applicable

### Tests fonctionnels — Propagation
1. Renommer une `famille_gamme` → `nom_famille` mis à jour dans OT actifs
2. Renommer un équipement (lié seul à une gamme) → `nom_equipement` mis à jour dans OT actifs
3. Modifier `id_famille_gamme` d'une gamme → `nom_famille` propagé aux OT actifs
4. Vérifier que les OT terminés/annulés ne sont PAS impactés

### Tests fonctionnels — Transversaux
1. **Dashboard** : alerte "gammes régl. sans OT" affiche la bonne famille
2. **Recherche globale** (Ctrl+K) : rechercher une gamme → sous-label famille correct
3. **Export CSV gammes** : colonne famille correcte
4. **Export CSV OT** : `nom_famille` correct
5. **Documents liés** : lier/délier un document à une gamme fonctionne

### Tests fonctionnels — Cas limites
1. Supprimer un équipement lié à une gamme → bloqué (RESTRICT) avec message explicite
2. Supprimer une famille gamme avec des gammes → bloqué (RESTRICT)
3. Supprimer un domaine gamme avec des familles → bloqué (RESTRICT)
4. Désactiver une gamme avec OT actifs → bloqué (trigger existant)

## Critère de validation
- Tous les tests ci-dessus passent
- Aucune erreur dans la console Rust
- Aucune erreur dans la console navigateur

## Contrôle /borg final
Lancer un /borg complet pour :
- Audit exhaustif du schéma SQL (cohérence FK, triggers, index)
- Audit du code Rust (requêtes SQL, structs, commandes)
- Audit du frontend (types, hooks, pages)
- Vérifier qu'il ne reste AUCUNE référence à l'ancien modèle :
  - `domaines_techniques` (doit être `domaines_equipements` partout)
  - `gammes.id_famille` (doit être `gammes.id_famille_gamme`)
  - `gammes.id_equipement` (doit être supprimé, remplacé par `gammes_equipements`)
