# Fusion Prestataires + Contrats

## Contexte

Actuellement, Prestataires et Contrats sont deux sections séparées dans la sidebar avec 4 pages distinctes. Chaque contrat est lié à un prestataire (1:N). Il est plus logique de naviguer par prestataire puis voir ses contrats dans un onglet.

## Architecture cible

```
Sidebar : "Prestataires" (plus de "Contrats")

/prestataires           → Liste des prestataires (inchangée)
/prestataires/:id       → Détail prestataire avec onglets :
                           ├── Contrats (liste + CRUD + avenants + résiliation)
                           └── Documents (DocumentsLies)
```

## Ce qui disparaît
- `/contrats` (page liste) → supprimée
- `/contrats/:id` (page détail) → la logique est intégrée dans l'onglet Contrats du prestataire
- Entrée "Contrats" dans la sidebar → supprimée

## Ce qui reste inchangé
- Backend Rust (commandes, models, schema) → zéro changement
- Hooks use-contrats.ts → réutilisés tels quels
- Types et schemas contrats → inchangés

---

## Page détail prestataire (nouvelle)

### Header
```
PageHeader "Nom du prestataire" + badge "Interne" si id=1
  Boutons : [Modifier] [Supprimer]
```

### Fiche info (Card compacte)
```
InfoItem : Adresse | Code postal | Ville | Téléphone | Email
```

### Onglets
```
Tabs :
  ├── Contrats (N) → table inline des contrats de ce prestataire
  │     Colonnes : Type | Début | Fin | Statut (badge) | Actions
  │     Actions par ligne : [Voir détail] [Modifier] [Supprimer]
  │     Bouton header : [+ Nouveau contrat]
  │     Clic sur ligne → expand/dialog avec :
  │       - Détail complet du contrat
  │       - Versions (avenants)
  │       - Gammes liées
  │       - Boutons : Résilier, Créer avenant
  │
  └── Documents → DocumentsLies entityType="prestataires"
```

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/pages/prestataires/[id].tsx` | **Réécrire** — page avec onglets (contrats + documents) |
| `src/pages/contrats/index.tsx` | **Supprimer** |
| `src/pages/contrats/[id].tsx` | **Intégrer** la logique dans prestataires/[id].tsx |
| `src/components/layout/Sidebar.tsx` | Supprimer entrée "Contrats" |
| `src/router.tsx` | Supprimer routes `/contrats` et `/contrats/:id` |
| `src/hooks/use-contrats.ts` | Inchangé (réutilisé) |
| `src-tauri/` | Aucun changement |

---

## Étapes

1. Réécrire `prestataires/[id].tsx` avec onglets
2. Intégrer la logique contrats (CRUD, avenants, résiliation, versions, gammes liées)
3. Supprimer pages contrats + sidebar + routes
4. Vérification
