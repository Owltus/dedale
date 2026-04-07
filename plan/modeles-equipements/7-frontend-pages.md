# Etape 7 — Frontend : Pages

## Objectif
Creer les pages de gestion des modeles d'equipement. Modifier la page detail equipement pour afficher et editer les champs personnalises. Ajouter la navigation.

## Fichiers impactes
- `src/pages/modeles-equipements/index.tsx` (NOUVEAU)
- `src/pages/modeles-equipements/[id].tsx` (NOUVEAU)
- `src/pages/equipements/[id].tsx` (modifie)
- `src/pages/equipements/familles/[idFamille].tsx` (modifie)
- `src/router.tsx` (modifie)
- `src/components/layout/Sidebar.tsx` (modifie)

## Travail a realiser

### 7.1 Page liste des modeles — `modeles-equipements/index.tsx`

**Structure :** similaire a `modeles-operations/index.tsx`

```
PageHeader "Modeles d'equipement"
  └─ HeaderButton "Nouveau modele"

CardList ou InlineTable
  └─ Pour chaque modele : nom, description, nb_champs, nb_familles
  └─ ActionButtons (edit / delete)

CrudDialog (create/edit)
  └─ nom_modele (Input)
  └─ description (Textarea)

ConfirmDialog (delete)
  └─ Message d'avertissement : "Supprimer ce modele supprimera tous les champs personnalises
     et les valeurs associees pour les equipements concernes."
```

**Navigation :** clic sur un modele → `/modeles-equipements/:id`

### 7.2 Page detail modele — `modeles-equipements/[id].tsx`

**Structure :**

```
PageHeader "{nom_modele}"
  └─ HeaderButton "Ajouter un champ"
  └─ HeaderButton "Modifier"
  └─ HeaderButton "Supprimer"

InfoCard
  └─ items: [Nom, Description, Nb champs, Nb familles utilisatrices, Date creation]

Section "Champs du modele"
  └─ InlineTable
     └─ Colonnes : Ordre | Nom | Type | Unite | Obligatoire | Valeurs possibles | Actions
     └─ Drag & drop pour reordonner (optionnel — si trop complexe, boutons fleche haut/bas)
     └─ ActionButtons (edit / delete) par ligne

CrudDialog (create/edit champ)
  └─ nom_champ (Input)
  └─ type_champ (Select : texte, nombre, date, booleen, liste)
  └─ unite (Input — visible si type = nombre)
  └─ est_obligatoire (Switch)
  └─ valeurs_possibles (Input — visible si type = liste, placeholder "Optique|Thermique|Mixte")

Section "Familles utilisant ce modele" (lecture seule, informative)
  └─ Liste des familles rattachees (CardList ou simple liste)
  └─ Lien vers la famille
```

**Notes UI :**
- Le champ `valeurs_possibles` est un simple Input texte. L'utilisateur saisit les valeurs separees par `|`.
- Afficher un badge "Obligatoire" dans la table pour les champs marques comme tels.
- Afficher le type sous forme de badge colore (texte=gris, nombre=bleu, date=vert, booleen=violet, liste=orange).

### 7.3 Modifier page detail equipement — `equipements/[id].tsx`

**Ajout d'un onglet "Caracteristiques" (ou integration dans l'onglet Informations) :**

Option recommandee : afficher les champs personnalises **dans l'onglet Informations**, sous l'InfoCard existante, dans une section separee.

```
TabsContent "informations"
  └─ InfoCard (champs de base — existant)
  └─ {valeursChamps.length > 0 && (
       <section "Caracteristiques techniques">
         └─ Grille de champs personnalises (lecture)
         └─ Bouton "Modifier les caracteristiques"
       </section>
     )}
```

**Affichage en lecture :**
Pour chaque champ du modele, afficher dans une grille similaire a InfoCard :
- Label = `nom_champ` (+ `unite` entre parentheses si present)
- Valeur = `valeur` formatee selon le type :
  - `texte` : affichage brut
  - `nombre` : affichage brut + unite
  - `date` : formatDate()
  - `booleen` : "Oui" / "Non"
  - `liste` : affichage brut

**Edition :**
Un CrudDialog "Modifier les caracteristiques" avec un formulaire dynamique :
- Pour chaque champ du modele, generer le bon composant :
  - `texte` → `<Input />`
  - `nombre` → `<Input type="number" />` avec unite affichee a cote
  - `date` → `<Input type="date" />`
  - `booleen` → `<Switch />`
  - `liste` → `<Select>` avec les options parsees depuis `valeurs_possibles.split("|")`
- A la soumission, appeler `save_valeurs_equipement` avec toutes les valeurs.

**Hook :**
```typescript
const { data: valeursChamps = [] } = useValeursEquipement(equipementId);
```

### 7.4 Modifier page familles — `equipements/familles/[idFamille].tsx`

**Ajouter le selecteur de modele dans le dialog de creation/edition de famille :**

```
CrudDialog (create/edit famille)
  └─ nom_famille (Input)
  └─ description (Textarea)
  └─ id_modele_equipement (Select — liste des modeles, optionnel)
  └─ id_image (ImagePicker)
```

Le Select doit :
- Avoir une option vide "Aucun modele"
- Lister tous les modeles disponibles
- Afficher le nombre de champs entre parentheses : "Extincteur (5 champs)"

### 7.5 Navigation

**`router.tsx` :**
```typescript
{
  path: "/modeles-equipements",
  lazy: () => import("./pages/modeles-equipements/index"),
},
{
  path: "/modeles-equipements/:id",
  lazy: () => import("./pages/modeles-equipements/[id]"),
},
```

Ajouter dans `ROUTE_LABELS` :
```typescript
"/modeles-equipements": "Modeles d'equipement",
```

**`Sidebar.tsx` :**
Ajouter une entree sous "Equipements" ou dans la section "Configuration" :
```typescript
{ label: "Modeles d'equipement", path: "/modeles-equipements", icon: Layers }
```

> **Note :** l'icone exacte est a determiner selon les icones Lucide disponibles. `Layers`, `LayoutTemplate`, `Blocks` ou `Puzzle` sont des candidats.

## Critere de validation
- `npx tsc --noEmit` passe sans erreur
- Navigation complete : sidebar → liste modeles → detail modele → retour
- Page detail equipement affiche les champs personnalises si la famille a un modele
- Edition des valeurs fonctionne (dialog, sauvegarde, rafraichissement)
- Creation/edition famille permet de selectionner un modele

## Controle /borg
- Composants partages utilises (InlineTable, HeaderButton, CrudDialog, InfoCard, etc.)
- Pas de `<table>` inline, pas de `Dialog+form` custom
- Formulaire dynamique gere tous les types de champs
- Le dialog de suppression modele previent de la perte de donnees
