# Étape 3 — Vérification

## Compilation
```bash
npx tsc --noEmit
npm run tauri dev
```

## Tests fonctionnels

### Navigation
1. Sidebar → Prestataires → liste des prestataires
2. Clic sur un prestataire → page détail avec onglets
3. "Contrats" n'apparaît plus dans la sidebar
4. URL `/contrats` redirige ou affiche 404

### Fiche prestataire
5. InfoItem affiche adresse, ville, téléphone, email
6. Modifier le prestataire → toast success
7. Supprimer un prestataire sans contrat → OK
8. Supprimer un prestataire avec contrats → bloqué (RESTRICT)
9. Prestataire interne (id=1) → bouton supprimer masqué

### Onglet Contrats
10. Liste des contrats de ce prestataire uniquement
11. Créer un contrat → dialog → toast success → apparaît dans la liste
12. Modifier un contrat → dialog → toast success
13. Supprimer un contrat → ConfirmDialog → toast success
14. Résilier un contrat → dialog dates → statut passe à "Résilié"
15. Créer un avenant → dialog → ancien contrat archivé, nouveau apparaît
16. Contrat archivé → boutons modifier/résilier masqués
17. Badges statut : Actif (vert), À venir (bleu), Expiré (rouge), Résilié (gris barré), Archivé (gris)

### Onglet Documents
18. DocumentsLies fonctionne pour le prestataire

### Recherche globale
19. Recherche "prestataire" → résultat pointe vers `/prestataires/:id` (pas `/contrats/`)

## Contrôle /borg
Audit post-fusion prestataires/contrats.
