# Étape 9 — Vérification finale

## Compilation
```bash
cargo check
npx tsc --noEmit
npm run tauri dev
```

## Tests fonctionnels

### CRUD Bâtiments
1. Créer un bâtiment "Bâtiment A"
2. Modifier son nom → vérifier mise à jour
3. Supprimer un bâtiment vide → OK
4. Supprimer un bâtiment avec niveaux → bloqué (RESTRICT)

### CRUD Niveaux
5. Créer niveaux "RDC", "Étage 1" dans Bâtiment A
6. Modifier un niveau
7. Supprimer un niveau vide → OK
8. Supprimer un niveau avec locaux → bloqué

### CRUD Locaux
9. Créer locaux "Hall", "Cuisine", "Local technique" dans RDC
10. Modifier un local
11. Supprimer un local non lié → OK
12. Supprimer un local lié à un équipement → bloqué (RESTRICT)

### Liens avec gammes/équipements
13. Créer un équipement avec `id_local` → OK
14. Créer une gamme avec `id_local` → OK
15. Créer un OT depuis cette gamme → snapshot `nom_localisation` = "Bâtiment A > RDC > Cuisine"
16. Renommer le local → OT actifs mis à jour avec nouveau chemin

### Migration
17. Restaurer une base v2 avec des localisations existantes
18. Lancer l'app → migration auto v2→v3
19. Vérifier que les bâtiments/niveaux/locaux ont été créés correctement
20. Vérifier que les FK gammes/équipements pointent vers les bons locaux

### Transversaux
21. Recherche globale → trouve bâtiments, niveaux, locaux
22. Dashboard → feature flag localisations fonctionne
23. DI → liaison avec local fonctionne
24. Documents → liaison avec local fonctionne

## Contrôle /borg
Audit complet post-refactoring :
- Aucune référence à `localisations` (ancienne table) dans le code
- Cohérence FK dans schema.sql
- Triggers snapshot et propagation corrects
