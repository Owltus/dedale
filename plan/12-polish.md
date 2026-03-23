# Phase 12 — Finitions

## Objectif
Onboarding complet, empty states partout, optimistic updates avec rollback UX, accessibilité clavier, et tests de bout en bout.

## Dépend de
Phase 11 (tout doit être fonctionnel)

## Étapes

### 12.1 Empty states

Chaque DataTable et chaque section vide doit afficher un état dédié :

```tsx
<EmptyState
  icon={<IconPackage />}
  titre="Aucun ordre de travail"
  description="Créez votre premier OT depuis une gamme de maintenance"
  action={<Button onClick={...}>Créer un OT</Button>}
/>
```

Pages prioritaires :
- Dashboard (base vide → stepper onboarding, déjà fait en phase 10)
- Liste OT vide → lien vers gammes
- Liste gammes vide → lien vers équipements/familles
- Liste prestataires → seul "Mon Entreprise" visible
- Documents → aucun document

### 12.2 Optimistic updates avec rollback

**Pattern TanStack Query** :

```ts
const mutation = useMutation({
  mutationFn: (params) => invoke("update_statut_ot", params),
  onMutate: async (params) => {
    // Annuler les queries en cours
    await queryClient.cancelQueries({ queryKey: ["get_ordre_travail", id] });

    // Sauvegarder l'état précédent
    const previous = queryClient.getQueryData(["get_ordre_travail", id]);

    // Optimistic update
    queryClient.setQueryData(["get_ordre_travail", id], (old) => ({
      ...old,
      ordre_travail: { ...old.ordre_travail, id_statut_ot: params.nouveau_statut }
    }));

    return { previous };
  },
  onError: (err, params, context) => {
    // Rollback : restaurer l'état précédent
    queryClient.setQueryData(["get_ordre_travail", id], context.previous);
    // Toast d'erreur avec le message du trigger
    toast.error(String(err));
  },
  onSuccess: (data) => {
    // Mettre à jour avec les données réelles du serveur
    queryClient.setQueryData(["get_ordre_travail", id], data);
    // Invalider les queries liées (liste OT, dashboard)
    queryClient.invalidateQueries({ queryKey: ["get_ordres_travail"] });
    queryClient.invalidateQueries({ queryKey: ["get_dashboard_data"] });
    // Notifications système
    handleEffets(data.effets);
  },
});
```

Appliquer ce pattern sur :
- Transitions statut OT
- Modifications opérations d'exécution
- Transitions statut DI

### 12.3 Accessibilité clavier

- Tab navigation dans les formulaires
- Enter pour soumettre les dialogs
- Escape pour fermer les dialogs
- Ctrl+K pour la recherche globale
- Flèches haut/bas dans les TreeView (localisations, équipements)
- Aria-labels sur les badges de statut

### 12.4 Performance

- Pagination côté serveur (SQL `LIMIT/OFFSET`) pour les grandes tables (OT, opérations)
- Debounce sur les champs de recherche (300ms)
- Skeleton loading sur toutes les pages
- Images en lazy loading (base64 chargé à la demande, pas dans les listes)

### 12.5 Tests manuels de bout en bout

Scénarios à tester manuellement (checklist) :

**Cycle OT complet** :
- [ ] Créer un établissement
- [ ] Créer des localisations (3 niveaux)
- [ ] Créer un domaine + famille + équipement
- [ ] Créer un prestataire externe
- [ ] Créer un contrat pour ce prestataire
- [ ] Créer une gamme réglementaire (avec le prestataire externe + contrat)
- [ ] Ajouter 3 opérations à la gamme (1 mesure, 1 vérification, 1 entretien)
- [ ] Créer un OT manuellement → vérifier snapshots + opérations générées
- [ ] Exécuter les 3 opérations (statut Terminée, avec mesure pour l'op mesure)
- [ ] Vérifier auto-clôture → toast affiché
- [ ] Vérifier reprogrammation → nouvel OT créé → toast affiché
- [ ] Vérifier que le planning affiche les deux OT

**Annulation + résurrection** :
- [ ] Annuler un OT → vérifier cascade ops → toast
- [ ] Vérifier que la reprogrammation crée un nouvel OT (car ops NA)
- [ ] Ressusciter l'OT annulé → vérifier reset ops → toast

**Bascule prestataire** :
- [ ] Créer une gamme NON réglementaire avec prestataire externe
- [ ] NE PAS créer de contrat
- [ ] Créer un OT → vérifier bascule sur "Mon Entreprise" → toast

**Contrats / avenants** :
- [ ] Créer un contrat
- [ ] Lier des gammes au contrat
- [ ] Créer un avenant → vérifier archivage parent
- [ ] Vérifier que les gammes ne sont PAS reportées au nouvel avenant
- [ ] Vérifier contrat archivé = readonly

**DI** :
- [ ] Créer une DI depuis un modèle
- [ ] Lier des gammes + localisations
- [ ] Résoudre la DI → vérifier readonly
- [ ] Réouvrir → vérifier éditable
- [ ] Re-résoudre

**Documents** :
- [ ] Uploader un document
- [ ] Le lier à un OT + un prestataire
- [ ] Dissocier du prestataire
- [ ] Dissocier de l'OT → vérifier suppression auto (orphelin)

**Export** :
- [ ] Export PDF fiche OT → impression
- [ ] Export CSV liste OT
- [ ] Rapport conformité PDF

**Recherche** :
- [ ] Ctrl+K → taper un nom de gamme → naviguer
- [ ] Taper un nom de prestataire → naviguer

### 12.6 Nettoyage final

- Supprimer les console.log
- Vérifier que les commentaires sont en français (règle 9 PRD-STACK)
- Vérifier qu'aucun `invoke()` n'est appelé directement (toujours via TanStack Query)
- Vérifier que tous les formulaires utilisent React Hook Form + Zod
- Vérifier que toutes les suppressions passent par un AlertDialog de confirmation

## Critère de validation
- Tous les scénarios de la checklist passent
- Aucune erreur console
- L'application est utilisable sans documentation
- Le stepper d'onboarding guide correctement un nouvel utilisateur
- Les optimistic updates + rollback fonctionnent (tester en simulant une erreur trigger)
