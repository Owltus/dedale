# Étape 15 — Vérification

## Compilation
```bash
cargo check
npx tsc --noEmit
npm run tauri dev
```

## Tests fonctionnels

### Calcul LCA
1. Créer Bâtiment A > RDC > Hall, RDC > Cuisine, Étage 1 > Chambre 101
2. Créer une gamme, lier extincteur dans Hall → localisation = "RDC - Hall"
3. Lier extincteur dans Cuisine → localisation = "RDC" (même niveau, 2 locaux)
4. Lier RIA dans Chambre 101 → localisation = "Bâtiment A" (multi-niveaux)
5. Retirer RIA → localisation revient à "RDC"
6. Retirer extincteur Cuisine → localisation revient à "RDC - Hall"

### Multi-bâtiments
7. Créer Bâtiment B > RDC > Local technique
8. Lier équipement dans Local technique → localisation = NULL (multi-bâtiments)
9. Retirer → revient au LCA de Bâtiment A

### Gamme sans équipement
10. Créer une gamme sans lier d'équipement → localisation = NULL

### Snapshot OT
11. Créer OT depuis gamme avec localisation "RDC - Hall" → snapshot OK
12. Modifier la liaison (retirer Hall, ajouter Cuisine) → OT existant inchangé, nouveau OT aura "RDC"

### Renommage propagation
13. Renommer "RDC" en "Rez-de-chaussée" → gammes recalculées, OT actifs mis à jour

### Migration
14. Restaurer base v3 → lancer app → migration auto v3→v4
15. Vérifier que les gammes qui avaient id_local sont recalculées

## Contrôle /borg
Audit complet post-localisation-héritée.
