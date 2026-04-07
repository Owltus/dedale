# Étape 3 — Vérification

## Compilation
```bash
npx tsc --noEmit
npm run tauri dev
```

## Tests fonctionnels

### Affichage
1. La page Planning affiche un Gantt avec 7 colonnes (Lun-Dim)
2. La semaine courante est affichée par défaut
3. Les familles gammes sont listées à gauche
4. Les OT apparaissent comme barres sur les bons jours

### Navigation
5. Bouton < → semaine précédente
6. Bouton > → semaine suivante
7. Bouton "Aujourd'hui" → revient à la semaine courante
8. Le header affiche "Semaine N — DD mois au DD mois YYYY"

### Interactions
9. Clic sur une barre OT → navigate vers /ordres-travail/:id
10. Clic chevron famille → expand/collapse les gammes
11. Hover sur barre → tooltip avec nom + statut + prestataire

### Couleurs
12. OT planifié → bleu
13. OT en cours → jaune
14. OT clôturé → vert
15. OT en retard → rouge
16. OT annulé → gris barré

### Cas limites
17. Semaine sans aucun OT → message vide
18. Famille sans OT cette semaine → collapsed
19. Plusieurs OT le même jour sur la même gamme → empilés
