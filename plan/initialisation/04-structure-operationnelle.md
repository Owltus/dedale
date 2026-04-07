# Phase 4 — Structure opérationnelle

## Objectif
Localisations (arbre hiérarchique), Domaines techniques, Familles d'équipements, Équipements. Les 3 entités spatiales/techniques de base.

## Dépend de
Phase 3 (référentiels — établissements nécessaires pour les localisations)

## Tables concernées
- `localisations` (hiérarchie récursive via `id_parent`)
- `domaines_techniques` (+ images)
- `familles_equipements` (liées aux domaines, + images)
- `equipements` (liés aux familles + localisations)
- `images` (stockage BLOB pour icônes)

## Étapes

### 4.1 Backend — Images

**Fichier** : `src-tauri/src/commands/images.rs`

```
upload_image(nom, image_data_base64, mime) → Image
get_image(id_image)                        → Image (avec data en base64)
delete_image(id_image)                     → ()
```

L'image est reçue en base64 depuis le frontend (conversion WebP côté JS via Canvas API).

### 4.2 Backend — Localisations

**Fichier** : `src-tauri/src/commands/localisations.rs`

```
get_localisations_tree()                         → Vec<LocalisationNode>  (arbre récursif)
get_localisation(id)                             → Localisation (+ enfants, gammes, équipements)
create_localisation(nom, description, id_etablissement, id_parent) → Localisation
update_localisation(id, ...)                     → Localisation
delete_localisation(id)                          → ()
```

La commande `get_localisations_tree()` retourne un arbre plat que le frontend restructure, OU un arbre déjà structuré via CTE récursive :

```sql
WITH RECURSIVE tree AS (
    SELECT *, 0 as depth FROM localisations WHERE id_parent IS NULL
    UNION ALL
    SELECT l.*, t.depth + 1 FROM localisations l JOIN tree t ON l.id_parent = t.id_localisation
)
SELECT * FROM tree ORDER BY depth, nom_localisation;
```

### 4.3 Backend — Équipements

**Fichier** : `src-tauri/src/commands/equipements.rs`

```
get_domaines()                        → Vec<Domaine>
create_domaine(nom, description, image_data?) → Domaine
update_domaine(id, ...)               → Domaine
delete_domaine(id)                    → ()

get_familles(id_domaine?)             → Vec<Famille>
create_famille(nom, description, id_domaine, image_data?) → Famille
update_famille(id, ...)               → Famille
delete_famille(id)                    → ()

get_equipements(id_famille?)          → Vec<Equipement>
get_equipement(id)                    → Equipement
create_equipement(...)                → Equipement
update_equipement(id, ...)            → Equipement
delete_equipement(id)                 → ()

get_equipements_tree()                → Vec<DomaineWithFamillesAndEquipements>
```

### 4.4 Frontend — Localisations

**Fichiers** :
```
src/pages/localisations/
├── Localisations.tsx          # Page avec TreeView + détail
├── LocalisationNode.tsx       # Noeud récursif de l'arbre
└── LocalisationForm.tsx       # Dialog création/modification
```

Composant partagé à créer :
```
src/components/shared/TreeView.tsx     # Arbre récursif générique
src/components/shared/TreeNode.tsx     # Noeud avec expand/collapse
```

**Point critique** : le sélecteur de parent dans le formulaire doit exclure la localisation elle-même et tous ses descendants pour éviter les cycles (protégés par trigger DB mais à prévenir côté UI aussi).

### 4.5 Frontend — Équipements

**Fichiers** :
```
src/pages/equipements/
├── Equipements.tsx            # Page avec TreeView (domaines→familles→équipements) + détail
├── DomaineDetail.tsx          # Détail domaine (sélectionné dans l'arbre)
├── FamilleDetail.tsx          # Détail famille
├── EquipementDetail.tsx       # Détail équipement + gammes associées
├── DomaineForm.tsx            # Dialog domaine
├── FamilleForm.tsx            # Dialog famille
├── EquipementForm.tsx         # Dialog équipement
└── ImagePicker.tsx            # Composant upload/preview image WebP
```

Composant partagé à créer :
```
src/components/shared/ImagePicker.tsx  # Sélection image + conversion WebP + preview
```

### 4.6 Schemas Zod

**Fichier** : `src/lib/schemas/localisations.ts` + `src/lib/schemas/equipements.ts`

Validations clés :
- `nom` / `nom_localisation` : `z.string().trim().min(1)`
- `capacite_accueil` : `z.number().int().positive().optional()`
- `date_fin_garantie >= date_mise_en_service` (raffinement)

## Erreurs trigger à gérer
- `Cycle détecté : une localisation ne peut pas être son propre parent`
- `Cycle détecté dans la hiérarchie des localisations`
- FK RESTRICT sur suppression domaine/famille/localisation avec enfants

## Critère de validation
- Arbre des localisations affiché avec niveaux imbriqués
- Drag-and-drop ou select pour déplacer une localisation (changer le parent)
- Le cycle est détecté (erreur trigger affichée)
- Arbre équipements : domaines → familles → équipements
- Les images (icônes WebP) s'uploadent et s'affichent
- Lien cliquable équipement → localisation dans la fiche
