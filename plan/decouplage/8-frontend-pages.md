# Étape 8 — Frontend : Pages

## Objectif
Mettre à jour les pages React pour utiliser les nouveaux hooks et afficher la liaison N↔N équipements.

## Fichiers impactés
- `src/pages/gammes/index.tsx`
- `src/pages/gammes/domaines/[idDomaine].tsx`
- `src/pages/gammes/familles/[idFamille].tsx`
- `src/pages/gammes/[id].tsx`
- `src/pages/equipements/[id].tsx`

## Travail à réaliser

### 1. `pages/gammes/index.tsx` (liste domaines gammes)
- Remplacer `useDomaines()` → `useDomainesGammes()`
- Remplacer `useCreateDomaine()` → `useCreateDomaineGamme()`
- Remplacer `domaineSchema` (import equipements) → `domaineGammeSchema` (import gammes)
- Mettre à jour les imports

### 2. `pages/gammes/domaines/[idDomaine].tsx` (détail domaine gamme)
- Remplacer tous les hooks domaine/famille de `use-equipements` par ceux de `use-gammes`
- `useDomaine()` → `useDomaineGamme()`
- `useFamilles()` → `useFamillesGammes()`
- `useUpdateDomaine()` → `useUpdateDomaineGamme()`
- `useDeleteDomaine()` → `useDeleteDomaineGamme()`
- `useCreateFamille()` → `useCreateFamilleGamme()`
- Schema : `familleSchema` → `familleGammeSchema`
- Champ par défaut : `id_domaine` → `id_domaine_gamme`
- Mettre à jour la navigation : `/gammes/familles/{id}`

### 3. `pages/gammes/familles/[idFamille].tsx` (détail famille gamme)
- `useFamille()` → `useFamilleGamme()`
- `useDomaine()` → `useDomaineGamme()`
- `useUpdateFamille()` → `useUpdateFamilleGamme()`
- `useDeleteFamille()` → `useDeleteFamilleGamme()`
- **Supprimer** `useEquipements(familleId)` (les équipements ne sont plus filtrés par famille gamme)
- **Supprimer** le sélecteur `id_equipement` dans le formulaire de création de gamme
- Formulaire création gamme : `id_famille` → `id_famille_gamme` dans les defaultValues
- Mettre à jour le breadcrumb

### 4. `pages/gammes/[id].tsx` (détail gamme) — **LE PLUS GROS CHANGEMENT**

**Supprimer :**
- État `editEquipement`
- Le champ Select équipement dans le formulaire d'édition
- `useEquipements(gamme?.id_famille)` (plus de lien famille gamme → équipements)
- Toute référence à `id_equipement` dans les soumissions de formulaire

**Modifier :**
- `useFamille(gamme?.id_famille)` → `useFamilleGamme(gamme?.id_famille_gamme)`
- `useDomaine(famille?.id_domaine)` → `useDomaineGamme(famille?.id_domaine_gamme)`
- Soumission édition gamme : `id_famille` → `id_famille_gamme`

**Ajouter :**
- `useGammeEquipements(gammeId)` — liste des équipements liés
- `useLinkGammeEquipement()` — mutation pour lier
- `useUnlinkGammeEquipement()` — mutation pour délier
- Nouveau tab/section **"Équipements"** dans la page :
  - Table des équipements liés (nom, famille, marque, modèle) avec bouton "Retirer"
  - Bouton "Ajouter des équipements" → Dialog :
    - Filtre par domaine équipement (optionnel, Select)
    - Filtre par famille équipement (optionnel, Select)
    - Liste des équipements disponibles (non déjà liés)
    - Bouton de liaison par équipement ou sélection multiple

### 5. `pages/equipements/[id].tsx` (détail équipement)
- Ajouter `useEquipementGammes(equipementId)` — gammes liées à cet équipement
- Ajouter une section "Gammes liées" montrant les gammes qui couvrent cet équipement
- Table avec colonnes : Gamme, Famille gamme, Périodicité, Réglementaire

## Critère de validation
- `npx tsc --noEmit` passe sans erreur
- `npm run dev` compile le frontend
- Navigation gammes : Domaines → Familles → Gammes fonctionne
- Page gamme détail : onglet équipements visible et fonctionnel
- Page équipement détail : section gammes liées visible

## Contrôle /borg
Lancer un /borg pour vérifier :
- Pas d'import mort (hooks/schemas de l'ancien modèle)
- Pas de référence à `id_famille` ou `id_equipement` dans les pages gammes
- Cohérence des routes et breadcrumbs
- UI de liaison : les mutations invalident bien le cache TanStack Query
