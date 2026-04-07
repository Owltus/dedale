# Etape 6 — Frontend (types, schemas, hooks, pages)

## Objectif
Adapter tout le frontend pour refleter le nouveau schema sans colonnes fixes. Les equipements n'ont plus de nom/marque/modele/numero_serie — tout passe par les champs du modele.

## Fichiers impactes
- `src/lib/types/equipements.ts`
- `src/lib/schemas/equipements.ts`
- `src/hooks/use-equipements.ts`
- `src/hooks/use-modeles-equipements.ts`
- `src/pages/equipements/[id].tsx`
- `src/pages/equipements/familles/[idFamille].tsx`
- `src/pages/modeles-equipements/index.tsx`
- `src/pages/modeles-equipements/[id].tsx`
- `src/components/shared/EquipementList.tsx`
- `src/router.tsx` (pas de changement)

## Travail a realiser

### 6.1 Types (`lib/types/equipements.ts`)

**Interface `Equipement` — retirer :**
```typescript
// SUPPRIMER
nom: string;
numero_serie: string | null;
marque: string | null;
modele: string | null;
```

**Interface `Equipement` — ajouter :**
```typescript
nom_affichage: string;
```

**Interface `EquipementListItem` — modifier :**
```typescript
// REMPLACER nom, marque, modele PAR :
nom_affichage: string;
// SUPPRIMER description (etait commentaires, renomme)
```

**Interface `EquipementInput` — retirer :** nom, numero_serie, marque, modele

**Interface `Famille` :**
- `id_modele_equipement` passe de `number | null` a `number`

**Interface `FamilleEquipListItem` :**
- `nom_modele` passe de `string | null` a `string`

**Interface `ModeleEquipement` — ajouter :**
```typescript
id_champ_affichage: number | null;
```

**Interface `ChampModele` — ajouter :**
```typescript
est_archive: number;
```

### 6.2 Schemas (`lib/schemas/equipements.ts`)

**`equipementSchema` — simplifier :**
```typescript
export const equipementSchema = z.object({
  nom_affichage: z.string().trim().min(1, "Le nom est requis"),
  date_mise_en_service: optionalText,
  date_fin_garantie: optionalText,
  id_famille: z.coerce.number().int().positive("La famille est requise"),
  id_local: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
  est_actif: z.coerce.number().min(0).max(1).default(1),
  commentaires: optionalText,
  id_image: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
}).refine(
  d => !d.date_mise_en_service || !d.date_fin_garantie || d.date_fin_garantie >= d.date_mise_en_service,
  { message: "La date de fin de garantie doit etre posterieure", path: ["date_fin_garantie"] }
);
```

**`familleSchema` — modifier :**
```typescript
// id_modele_equipement passe de nullable a obligatoire
id_modele_equipement: z.coerce.number().int().positive("Le modele est requis"),
```

**`modeleEquipementSchema` — ajouter :**
```typescript
id_champ_affichage: z.coerce.number().int().positive().nullable().optional().transform(v => v ?? null),
```

### 6.3 Hooks (`hooks/use-modeles-equipements.ts`)

**Nouvelle commande :**
- `useArchiveChampModele()` — mutation `archive_champ_modele`, invalide `modeleEquipementKeys.all`
- Retirer `useDeleteChampModele()` (remplacee par archive)

### 6.4 Page detail equipement (`pages/equipements/[id].tsx`)

**Changements majeurs :**

1. **InfoCard** : retirer Marque/Modele/N° serie. Ne garder que :
   - Famille, Localisation (via local), Mise en service, Fin de garantie, Actif, Commentaires

2. **Section "Caracteristiques techniques"** : DEJA EN PLACE (utilise `useValeursEquipement`).
   C'est ici que Marque, Modele, N° serie apparaitront (comme champs du modele).

3. **Dialog edition** : retirer les champs nom/marque/modele/numero_serie.
   - Le `nom_affichage` n'est PAS editable directement — il est recalcule depuis le champ d'affichage
   - Garder : date_mise_en_service, date_fin_garantie, localisation, commentaires, est_actif, id_image
   - Les champs du modele sont editables via le dialog "Caracteristiques" (deja en place)

4. **PageHeader title** : utiliser `equipement.nom_affichage` au lieu de `equipement.nom`

5. **Breadcrumb** : utiliser `equipement.nom_affichage`

### 6.5 Page famille detail (`pages/equipements/familles/[idFamille].tsx`)

**Dialog creation equipement :**
1. Retirer les champs nom/marque/modele/numero_serie du formulaire fixe
2. Les champs du modele sont DEJA affiches (section "Caracteristiques techniques" ajoutee precedemment)
3. Le `nom_affichage` initial est rempli depuis la valeur du champ d'affichage
4. **Workflow :**
   - L'utilisateur remplit les champs du modele (dont le champ d'affichage "Designation")
   - A la soumission : `create_equipement({ nom_affichage: caracValues[idChampAffichage], ... })`
   - Puis `save_valeurs_equipement(...)` avec toutes les valeurs
   - Le trigger met a jour `nom_affichage` si necessaire

**Dialog edition famille :**
- `id_modele_equipement` est maintenant obligatoire (pas d'option "Aucun modele")
- Retirer l'option "Aucun modele" du Select

### 6.6 Composant `EquipementList.tsx`

**Modifier :**
```typescript
// filterEquipement : chercher dans nom_affichage au lieu de nom/marque/modele
function filterEquipement(e: EquipementListItem, q: string): boolean {
  return e.nom_affichage.toLowerCase().includes(q);
}

// renderContent : afficher nom_affichage au lieu de nom + marque/modele
renderContent={(e) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-medium truncate">{e.nom_affichage}</p>
  </div>
)}
```

### 6.7 Page modeles-equipements detail (`pages/modeles-equipements/[id].tsx`)

**Ajouter :**
- Dans le dialog edition du modele : un Select pour choisir le `id_champ_affichage` parmi les champs non archives
- Dans l'InfoCard : afficher le champ d'affichage selectionne
- Badge "Affichage" sur le champ designe dans la liste des champs
- Bouton "Archiver" au lieu de "Supprimer" sur les champs (sauf le champ d'affichage)

### 6.8 Page modeles-equipements liste (`pages/modeles-equipements/index.tsx`)

**Pas de changement majeur** (deja en place).

## Critere de validation
- `npx tsc --noEmit` : 0 erreur
- Aucune reference a `.nom` (sauf `.nom_affichage`), `.marque`, `.modele`, `.numero_serie` sur les equipements
- Le formulaire de creation d'equipement affiche les champs du modele
- Le formulaire d'edition d'equipement n'a plus les champs fixes
- La section "Caracteristiques techniques" affiche tous les champs (y compris Designation, Marque, etc.)
- L'EquipementList affiche `nom_affichage`
- Le breadcrumb affiche `nom_affichage`

## Controle /borg
- Coherence types TS ↔ structs Rust
- Composants partages utilises (CrudDialog, HeaderButton, InfoCard, etc.)
- Pas de champ orphelin dans les formulaires
