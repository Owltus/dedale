# Étape 1 — Réécrire la page détail prestataire

## Objectif
Transformer la page prestataire détail en page avec onglets (Contrats + Documents), intégrant toute la logique qui était dans les pages contrats.

## Fichier impacté
- `src/pages/prestataires/[id].tsx`

## Structure de la page

### Layout (identique à OrdresTravailDetail / GammesDetail)
```
<div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
  <PageHeader title={prestataire.libelle}>
    <badge "Interne" si id=1>
    <boutons selon onglet actif>
  </PageHeader>

  <Card shrink-0> InfoItem grid (adresse, ville, tel, email) </Card>

  <Tabs>
    <TabsTrigger "Contrats (N)">
    <TabsTrigger "Documents">

    <TabsContent "contrats"> ... </TabsContent>
    <TabsContent "documents"> DocumentsLies </TabsContent>
  </Tabs>
</div>
```

### Onglet Contrats
- Table inline des contrats filtrés par `id_prestataire`
- Colonnes : Type | Début | Fin | Statut (badge) | Actions (edit/delete)
- Bouton header onglet : [+ Nouveau contrat]
- Clic sur ligne → Dialog détail contrat avec :
  - Infos complètes (dates, cycle, préavis, commentaires)
  - Versions/avenants (liste chaînée)
  - Gammes liées (avec link/unlink)
  - Actions : Modifier, Résilier, Créer avenant, Supprimer

### Données à charger
- `usePrestataire(id)` — fiche prestataire
- `useContrats()` filtré côté frontend par prestataire OU nouveau hook `useContratsByPrestataire(id)`
- `useTypesContrats()` — pour les selects
- `useContratVersions(idContrat)` — quand un contrat est sélectionné
- `useContratGammes(idContrat)` — gammes liées au contrat sélectionné

### Dialogs nécessaires
1. **Edit prestataire** — formulaire nom, adresse, etc.
2. **Delete prestataire** — ConfirmDialog
3. **Create contrat** — formulaire type, dates, cycle
4. **Edit contrat** — formulaire modification
5. **Delete contrat** — ConfirmDialog
6. **Résilier contrat** — formulaire date notification + date résiliation
7. **Créer avenant** — formulaire nouvelle version
8. **Détail contrat** — Dialog lecture avec versions + gammes

### Points d'attention
- Le composant sera gros (~400+ lignes). C'est acceptable pour une page détail complexe.
- Le prestataire interne (id=1) : masquer le bouton supprimer
- Les contrats archivés : masquer les boutons modifier/résilier
- Récupérer le pattern de statut contrat (Actif/À venir/Expiré/Résilié/Archivé) depuis l'existant

## Critère de validation
- `npx tsc --noEmit` passe
- La page affiche les contrats du prestataire sélectionné
- CRUD contrats fonctionne dans l'onglet
