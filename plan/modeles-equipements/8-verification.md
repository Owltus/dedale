# Etape 8 — Verification

## Objectif
Valider l'ensemble de l'implementation par des tests manuels et des commandes de verification.

## Tests manuels

### Installation fraiche
1. Supprimer la base `mantis.db` + fichiers WAL/SHM
2. Lancer `python seed.py` → verifier que les 3 modeles + champs sont crees
3. Lancer `npm run tauri dev` → verifier que l'app demarre sans erreur

### CRUD Modeles d'equipement
4. Naviguer vers "Modeles d'equipement" dans la sidebar
5. Verifier que les 3 modeles du seed apparaissent avec nb_champs et nb_familles
6. Creer un nouveau modele "Ampoule" avec description → verifier apparition
7. Modifier le modele "Ampoule" → verifier mise a jour
8. Supprimer le modele "Ampoule" (pas de famille liee) → verifier disparition

### CRUD Champs
9. Ouvrir le detail du modele "Extincteur"
10. Verifier les 5 champs affiches dans le bon ordre
11. Ajouter un champ "Hauteur" (nombre, cm, non obligatoire) → verifier apparition
12. Modifier le champ "Hauteur" → verifier mise a jour
13. Supprimer le champ "Hauteur" → verifier disparition
14. Verifier que le nb_champs se met a jour dans la liste des modeles

### Liaison famille ↔ modele
15. Naviguer vers une famille d'equipements (ex: Extincteurs)
16. Modifier la famille → verifier que le selecteur de modele est present
17. Selectionner le modele "Extincteur" → sauvegarder → verifier
18. Retirer le modele (option "Aucun") → sauvegarder → verifier

### Champs personnalises sur un equipement
19. Rattacher le modele "Extincteur" a la famille correspondante
20. Ouvrir le detail d'un equipement de cette famille
21. Verifier que la section "Caracteristiques techniques" apparait
22. Verifier que tous les champs du modele sont affiches (avec valeurs vides "—")
23. Cliquer "Modifier les caracteristiques"
24. Remplir les champs : Agent = "Eau + additif", Poids = 6, Pression = "Permanente", NF = oui
25. Sauvegarder → verifier que les valeurs apparaissent en lecture
26. Modifier une valeur → verifier mise a jour
27. Vider un champ → verifier que la valeur revient a "—"

### Champs obligatoires
28. Marquer un champ comme obligatoire
29. Tenter de sauvegarder sans le remplir → verifier la validation

### Suppression en cascade
30. Supprimer un modele qui a des familles liees → verifier le message d'avertissement
31. Confirmer → verifier que les familles perdent leur modele (SET NULL)
32. Verifier que les valeurs des equipements sont supprimees (CASCADE)

### Non-regression
33. Verifier que le CRUD equipements fonctionne normalement (creer, modifier, supprimer)
34. Verifier que le CRUD familles fonctionne normalement
35. Verifier que les gammes liees aux equipements ne sont pas impactees
36. Verifier que les OT lies aux equipements ne sont pas impactes

## Commandes de verification

```bash
# Type-check complet
npx tsc --noEmit

# Build Rust
cargo build

# Seed complet
python seed.py

# Lancer l'app
npm run tauri dev
```

## Points d'attention
- La suppression d'un modele est destructive (perte des valeurs) — le dialog doit etre explicite
- Un equipement sans modele (famille sans modele) ne doit afficher aucune section "Caracteristiques"
- Le changement de modele sur une famille ne doit pas effacer les valeurs existantes immediatement — les anciennes valeurs restent en base mais deviennent "orphelines" (champs d'un autre modele). Elles seront naturellement ignorees par la requete `get_valeurs_equipement` qui ne retourne que les champs du modele actuel.
