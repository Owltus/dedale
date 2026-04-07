# Etape 7 — Verification

## Objectif
Valider l'ensemble de la migration par des tests manuels complets.

## Commandes de verification

```bash
# Build Rust
cd src-tauri && cargo build

# Type-check TypeScript
npx tsc --noEmit

# Seed complet (reset + injection)
python seed.py

# Lancer l'app
npm run tauri dev
```

## Tests manuels

### A. Installation fraiche
1. Supprimer `mantis.db` + fichiers WAL/SHM
2. Lancer `python seed.py` → verifier 0 erreur
3. Verifier que toutes les familles ont un modele (`SELECT COUNT(*) FROM familles_equipements WHERE id_modele_equipement IS NULL` = 0)
4. Verifier que tous les modeles ont un champ d'affichage (`SELECT COUNT(*) FROM modeles_equipements WHERE id_champ_affichage IS NULL` = 0)
5. Verifier que tous les equipements ont un nom_affichage non vide
6. Lancer `npm run tauri dev` → verifier demarrage sans erreur

### B. Navigation et affichage
7. Naviguer vers Equipements → verifier que les domaines s'affichent
8. Naviguer vers un domaine → verifier les familles avec le nom du modele
9. Naviguer vers une famille → verifier la liste des equipements (nom_affichage visible)
10. Ouvrir un equipement → verifier l'InfoCard (pas de champs Marque/Modele/N° serie fixes)
11. Verifier la section "Caracteristiques techniques" → tous les champs du modele visibles
12. Verifier le breadcrumb → nom_affichage correct

### C. CRUD Equipements (nouveau workflow)
13. Creer un equipement dans la famille Extincteurs
    - Le formulaire doit afficher les champs du modele (Designation, Marque, Agent, Poids, etc.)
    - Remplir la Designation → verifier que nom_affichage est mis a jour
    - Sauvegarder → verifier l'equipement dans la liste avec le bon nom
14. Modifier un equipement → dialog "Caracteristiques"
    - Changer la Designation → verifier que nom_affichage se met a jour
    - Modifier d'autres champs → verifier la mise a jour
15. Supprimer un equipement → verifier suppression + cascade valeurs

### D. CRUD Modeles d'equipement
16. Creer un nouveau modele "Ampoule"
17. Ajouter des champs : Designation (texte, obligatoire), Puissance (nombre, W), Culot (liste)
18. Definir "Designation" comme champ d'affichage
19. Verifier le badge "Affichage" sur le champ Designation

### E. Liaison famille ↔ modele
20. Creer une nouvelle famille dans un domaine
    - Le selecteur de modele doit etre OBLIGATOIRE (pas d'option "Aucun")
    - Choisir le modele "Ampoule"
    - Sauvegarder → verifier
21. Tenter de changer le modele d'une famille qui a des equipements → message de blocage
22. Tenter de changer le modele d'une famille VIDE → succes

### F. Soft-delete des champs
23. Archiver un champ non-obligatoire (ex: "Culot" de Ampoule)
    - Verifier qu'il disparait des formulaires de CREATION
    - Verifier que les equipements existants conservent la valeur en lecture
24. Tenter d'archiver le champ d'affichage → message de blocage
25. Tenter de supprimer un champ (DELETE) → message de blocage

### G. Triggers OT
26. Creer un OT via une gamme liee a un equipement
    - Verifier que `nom_equipement` est snapshotte correctement (= nom_affichage)
27. Modifier le nom_affichage d'un equipement (via modification du champ d'affichage)
    - Verifier propagation vers les OT actifs (non clotures/annules)
28. Creer un OT pour une gamme liee a 2+ equipements
    - Verifier que `nom_equipement` = NULL (comportement existant)

### H. Recherche globale
29. Rechercher un equipement par son nom_affichage → verifier qu'il apparait
30. Rechercher un terme qui etait dans "marque" → verifier qu'il n'apparait PAS (recherche sur nom_affichage uniquement)

### I. Export CSV
31. Exporter les equipements → verifier le CSV (colonnes sans marque/modele/serie)

### J. Non-regression
32. Verifier le CRUD familles d'equipements
33. Verifier le CRUD domaines d'equipements
34. Verifier que les gammes liees aux equipements fonctionnent
35. Verifier que les OT existants affichent encore nom_equipement correctement
36. Verifier le dashboard (compteurs equipements)
37. Verifier la page planning (pas d'impact attendu)
38. Verifier les demandes d'intervention (pas d'impact attendu)

## Points d'attention

- **nom_affichage vide** : Si le champ d'affichage n'a pas de valeur, `nom_affichage` sera vide. Le frontend doit afficher un fallback ("Equipement #ID").
- **Migration seed** : Les IDs des champs changent (nouveaux champs ajoutes en tete). Adapter tous les INSERT INTO valeurs_equipements.
- **Colonne numero_serie_equipement** : Si supprimee de ordres_travail, verifier que les OT existants ne plantent pas.
- **Performance** : Verifier que la page liste des equipements (500+ items) reste rapide grace a l'index sur nom_affichage.
