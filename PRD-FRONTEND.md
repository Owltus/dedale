# PRD — Frontend GMAO (Structure DOM & Vues)

## Contexte

Ce document décrit l'intégralité de ce que l'utilisateur verra dans le DOM de l'application GMAO desktop. Il s'appuie sur le schéma SQLite existant (~30 tables, ~40 triggers) et le PRD-STACK (React + TypeScript + Tailwind + shadcn/ui + Tauri v2).

Application mono-utilisateur, offline, desktop. Aucune authentification, aucun système de rôles.

---

## Navigation principale

### Layout racine

```
┌──────────────────────────────────────────────────────────────┐
│  Sidebar (fixe, gauche)                 Zone principale      │
│  ┌────────────────────┐  ┌──────────────────────────────────┐│
│  │ Logo / Nom app     │  │  Breadcrumb                      ││
│  │ [Ctrl+K Recherche] │  │  ─────────────────────────────── ││
│  │                    │  │                                  ││
│  │ ── Opérationnel ── │  │  Contenu de la page active       ││
│  │ Dashboard          │  │                                  ││
│  │ Planning           │  │                                  ││
│  │ Ordres de travail  │  │                                  ││
│  │ Demandes (DI)      │  │                                  ││
│  │                    │  │                                  ││
│  │ ── Référentiels ── │  │                                  ││
│  │ Gammes             │  │                                  ││
│  │ Équipements        │  │                                  ││
│  │ Localisations      │  │                                  ││
│  │ Prestataires       │  │                                  ││
│  │ Contrats           │  │                                  ││
│  │ Techniciens        │  │                                  ││
│  │ Documents          │  │                                  ││
│  │                    │  │                                  ││
│  │ ── Système ──      │  │                                  ││
│  │ Paramètres         │  │                                  ││
│  └────────────────────┘  └──────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

La sidebar est groupée en 3 sections :
- **Opérationnel** : les vues du quotidien (dashboard, planning, OT, DI)
- **Référentiels** : les entités de configuration (gammes, équipements, localisations, prestataires, contrats, techniciens, documents)
- **Système** : paramètres

### Recherche globale (`Ctrl+K`)

Command palette accessible depuis n'importe quelle page via `Ctrl+K`. Recherche full-text sur :
- Noms de gammes
- Noms d'OT (via nom_gamme snapshot)
- Noms de prestataires
- Noms d'équipements
- Noms de localisations
- Libellés de DI

```
<CommandPalette>
  <SearchInput placeholder="Rechercher partout..." autofocus />
  <ResultList>
    {resultats.map(r =>
      <ResultItem
        type={r.type}                    <!-- "OT", "Gamme", "Prestataire", etc. -->
        label={r.label}
        sublabel={r.sublabel}            <!-- contexte : famille, localisation, etc. -->
        lien={r.route}
      />
    )}
  </ResultList>
</CommandPalette>
```

### Routes React Router

| Route | Vue | Description |
|---|---|---|
| `/` | Dashboard | Tableau de bord synthétique + alertes proactives |
| `/planning` | Planning | Vue calendrier des OT (semaine / mois) |
| `/ordres-travail` | Liste OT | Tous les ordres de travail |
| `/ordres-travail/:id` | Détail OT | Fiche complète d'un OT + ses opérations |
| `/gammes` | Liste gammes | Procédures de maintenance |
| `/gammes/:id` | Détail gamme | Fiche gamme + opérations + gammes types liées |
| `/gammes-types` | Liste gammes types | Templates réutilisables |
| `/gammes-types/:id` | Détail gamme type | Fiche gamme type + ses items |
| `/equipements` | Arbre équipements | Domaines → Familles → Équipements |
| `/equipements/:id` | Détail équipement | Fiche équipement |
| `/localisations` | Arbre localisations | Hiérarchie des localisations |
| `/prestataires` | Liste prestataires | Entreprises externes |
| `/prestataires/:id` | Détail prestataire | Fiche prestataire + contrats liés |
| `/contrats` | Liste contrats | Tous les contrats |
| `/contrats/:id` | Détail contrat | Fiche contrat + chaîne avenants |
| `/techniciens` | Liste techniciens | Personnel interne |
| `/demandes` | Liste DI | Demandes d'intervention |
| `/demandes/:id` | Détail DI | Fiche DI + gammes/localisations liées |
| `/documents` | Liste documents | Tous les documents uploadés |
| `/parametres` | Paramètres | Configuration des référentiels |
| `/parametres/etablissement` | Établissement | Fiche établissement unique |

---

## 1. Dashboard (`/`)

Vue synthétique et proactive. Lecture seule. Point d'entrée quotidien.

### DOM

```
<Page>
  <PageHeader titre="Tableau de bord" />

  <!-- Bandeau d'alertes proactives (visible seulement si alertes actives) -->
  <AlertBanner>
    {contrats_expirant_30j.length > 0 &&
      <Alert variante="destructive">
        {contrats_expirant_30j.length} contrat(s) expirent dans les 30 prochains jours
        <Button variante="link">Voir les contrats</Button>
      </Alert>
    }
    {gammes_regl_sans_ot.length > 0 &&
      <Alert variante="warning">
        {gammes_regl_sans_ot.length} gamme(s) réglementaire(s) sans OT planifié
        <Button variante="link">Voir les gammes</Button>
      </Alert>
    }
    {ot_en_cours_stagnants.length > 0 &&
      <Alert variante="warning">
        {ot_en_cours_stagnants.length} OT « En cours » depuis plus de 30 jours
      </Alert>
    }
  </AlertBanner>

  <div class="grid grid-cols-4 gap-4">        <!-- Ligne de KPIs -->
    <StatCard label="OT en retard"       valeur={n} variante="destructive" />
    <StatCard label="OT cette semaine"   valeur={n} variante="warning" />
    <StatCard label="DI ouvertes"        valeur={n} variante="default" />
    <StatCard label="Contrats à risque"  valeur={n} variante="destructive" />
  </div>

  <div class="grid grid-cols-2 gap-6 mt-6">
    <!-- Colonne gauche -->
    <Card titre="Prochains OT">
      <DataTable colonnes={[date_prevue, nom_gamme, statut, priorité]} />
      <!-- 10 prochains OT triés par date_prevue ASC, statut NOT IN (3,4) -->
    </Card>

    <!-- Colonne droite -->
    <Card titre="Dernières DI">
      <DataTable colonnes={[date_constat, libelle_constat, type, statut]} />
      <!-- 10 dernières DI triées par date_creation DESC -->
    </Card>
  </div>

  <Card titre="OT en retard" class="mt-6">
    <DataTable colonnes={[nom_gamme, date_prevue, retard_jours, priorité, prestataire]} />
    <!-- OT avec date_prevue < aujourd'hui AND statut IN (1, 2, 5) -->
  </Card>

  <!-- État initial (base vide) : guide d'onboarding -->
  {is_empty_database &&
    <Card titre="Premiers pas" class="mt-6">
      <Stepper>
        <Step label="1. Établissement" description="Configurez votre établissement" lien="/parametres/etablissement" done={has_etablissement} />
        <Step label="2. Localisations" description="Créez l'arbre des locaux" lien="/localisations" done={has_localisations} />
        <Step label="3. Équipements" description="Ajoutez domaines, familles, équipements" lien="/equipements" done={has_equipements} />
        <Step label="4. Prestataires" description="Enregistrez vos prestataires externes" lien="/prestataires" done={has_prestataires} />
        <Step label="5. Contrats" description="Liez les contrats aux prestataires" lien="/contrats" done={has_contrats} />
        <Step label="6. Gammes" description="Créez vos procédures de maintenance" lien="/gammes" done={has_gammes} />
        <Step label="7. Premier OT" description="Lancez votre premier ordre de travail" lien="/ordres-travail" done={has_ot} />
      </Stepper>
    </Card>
  }
</Page>
```

### Données affichées

- **OT en retard** : `date_prevue < date('now') AND id_statut_ot IN (1, 2, 5)`
- **OT cette semaine** : `date_prevue BETWEEN date('now') AND date('now', '+7 days') AND id_statut_ot IN (1, 2, 5)`
- **DI ouvertes** : `id_statut_di IN (1, 3)`
- **Contrats à risque** : `(date_fin IS NOT NULL AND date_fin <= date('now', '+30 days') AND date_resiliation IS NULL AND est_archive = 0) OR (date_resiliation IS NOT NULL AND date_resiliation <= date('now', '+30 days'))`
- **Gammes régl. sans OT** : gammes actives, `est_reglementaire = 1`, sans OT en statut `IN (1, 2, 5)`
- **OT stagnants** : `id_statut_ot = 2 AND date_debut < date('now', '-30 days')`

---

## 1b. Planning (`/planning`)

Vue calendrier des OT. Le responsable maintenance pense en semaines et en mois, pas en listes paginées.

### DOM

```
<Page>
  <PageHeader titre="Planning">
    <ToggleGroup>
      <Toggle value="semaine">Semaine</Toggle>
      <Toggle value="mois" default>Mois</Toggle>
    </ToggleGroup>
    <div class="flex gap-2">
      <Button icon="ChevronLeft" />
      <Button variante="outline">Aujourd'hui</Button>
      <Button icon="ChevronRight" />
    </div>
  </PageHeader>

  <!-- Vue mois -->
  <CalendarGrid mois={mois_courant}>
    {jours.map(jour =>
      <CalendarCell date={jour}>
        {ot_du_jour.map(ot =>
          <CalendarEvent
            label={ot.nom_gamme}
            couleur={couleur_statut(ot.id_statut_ot)}
            priorite={ot.id_priorite}
            est_reglementaire={ot.est_reglementaire}
            cliquable → `/ordres-travail/${ot.id}`
          />
        )}
      </CalendarCell>
    )}
  </CalendarGrid>

  <!-- Vue semaine -->
  <WeekGrid semaine={semaine_courante}>
    {jours.map(jour =>
      <WeekColumn date={jour}>
        {ot_du_jour.map(ot =>
          <WeekEvent>
            <span class="font-medium">{ot.nom_gamme}</span>
            <Badge statut={ot.statut} />
            <span class="text-muted text-xs">{ot.nom_prestataire}</span>
          </WeekEvent>
        )}
      </WeekColumn>
    )}
  </WeekGrid>
</Page>
```

### Données

- Source : `ordres_travail` avec `date_prevue` pour le positionnement
- Couleur par statut OT (même palette que les badges)
- Icône cadenas si `est_reglementaire = 1`
- Filtre latéral optionnel : prestataire, famille, réglementaire uniquement

---

## 2. Ordres de travail

### 2.1 Liste (`/ordres-travail`)

```
<Page>
  <PageHeader titre="Ordres de travail">
    <Button variante="primary">+ Créer un OT</Button>
  </PageHeader>

  <Toolbar>
    <SearchInput placeholder="Rechercher par nom de gamme..." />
    <FilterSelect label="Statut" options={statuts_ot} />
    <FilterSelect label="Priorité" options={priorites_ot} />
    <FilterSelect label="Prestataire" options={prestataires} />
    <FilterToggle label="Réglementaire" />
    <DateRangePicker label="Date prévue" />
  </Toolbar>

  <DataTable
    colonnes={[
      { champ: "nom_gamme",         label: "Gamme" },
      { champ: "date_prevue",       label: "Date prévue" },
      { champ: "id_statut_ot",      label: "Statut",       rendu: <Badge /> },
      { champ: "id_priorite",       label: "Priorité",     rendu: <Badge /> },
      { champ: "nom_prestataire",   label: "Prestataire" },
      { champ: "est_reglementaire", label: "Régl.",        rendu: <IconCheck /> },
      { champ: "nom_localisation",  label: "Localisation" },
      { champ: "progression",       label: "Progression",  rendu: <ProgressBar /> },
    ]}
    tri_defaut="date_prevue ASC"
    pagination={20}
    ligne_cliquable → naviguer vers `/ordres-travail/:id`
  />
</Page>
```

**Progression** : calculée côté Rust = `(ops terminées + ops NA) / total ops * 100`

**Codes couleur des lignes** :
- Rouge clair : en retard (`date_prevue < today AND statut IN (1,2,5)`)
- Vert clair : clôturé (statut 3)
- Gris : annulé (statut 4)

### 2.2 Détail OT (`/ordres-travail/:id`)

```
<Page>
  <PageHeader titre={nom_gamme}>
    <Badge statut={statut_ot} />
    <Badge priorite={priorite} />
    {est_reglementaire && <Badge variante="outline">Réglementaire</Badge>}
  </PageHeader>

  <!-- Barre d'actions contextuelle (selon statut) -->
  <!-- Transitions autorisées par le trigger validation_transitions_manuelles :
       1 (Planifié)  → 2, 3, 4
       2 (En Cours)  → 1, 3, 4
       3 (Clôturé)   → 5
       4 (Annulé)    → 1
       5 (Réouvert)  → 1, 2, 3, 4
  -->
  <ActionBar>
    {statut IN (1,5) && <Button>Démarrer</Button>}                          <!-- → statut 2 -->
    {statut IN (2,5) && <Button>Retour planifié</Button>}                   <!-- → statut 1 -->
    {statut IN (1,2,5) && <Button>Clôturer</Button>}                       <!-- → statut 3 (bloqué si ops en attente/en cours) -->
    {statut IN (1,2,5) && <Button variante="destructive">Annuler</Button>} <!-- → statut 4 -->
    {statut == 3     && <Button>Réouvrir</Button>}                          <!-- → statut 5 -->
    {statut == 4     && <Button>Ressusciter</Button>}                       <!-- → statut 1 (si gamme active + pas d'OT actif + contrat valide si réglementaire) -->
  </ActionBar>

  <!-- Warning réouverture : si un OT suivant a été créé par reprogrammation -->
  {statut == 3 && ot_suivant_existe &&
    <Alert variante="warning">
      Un OT suivant (#{ot_suivant.id}, prévu le {ot_suivant.date_prevue}) a été créé
      automatiquement. Réouvrir cet OT créera un doublon.
      <Button variante="link" lien={"/ordres-travail/" + ot_suivant.id}>Voir l'OT suivant</Button>
    </Alert>
  }

  <div class="grid grid-cols-3 gap-6">
    <!-- Colonne 1 : Informations générales (SNAPSHOTS — figés à la création) -->
    <!-- Note : les champs ci-dessous sont des snapshots capturés au moment de la
         création de l'OT. Ils ne suivent PAS les modifications de la gamme source.
         Un tooltip "Valeur figée à la création" est affiché sur chaque champ snapshot. -->
    <Card titre="Informations">
      <DescriptionList>
        <Item label="Gamme"          valeur={nom_gamme} lien="/gammes/:id_gamme" snapshot />
        <Item label="Description"    valeur={description_gamme} snapshot />
        <Item label="Famille"        valeur={nom_famille} snapshot />
        <Item label="Localisation"   valeur={nom_localisation} snapshot />
        <Item label="Périodicité"    valeur={libelle_periodicite} />
        <Item label="Équipement"     valeur={nom_equipement} />
        <Item label="N° série"       valeur={numero_serie_equipement} />
      </DescriptionList>
    </Card>

    <!-- Colonne 2 : Assignation -->
    <Card titre="Assignation">
      <DescriptionList>
        <Item label="Prestataire"    valeur={nom_prestataire} />
        <Item label="Technicien"     valeur={nom_technicien} />
        <Item label="Poste"          valeur={nom_poste} />
      </DescriptionList>
      <!-- Sélecteur technicien (si OT interne, prestataire_id == 1, statut actif) -->
      {id_prestataire == 1 && statut NOT IN (3,4) &&
        <Select label="Assigner un technicien" options={techniciens_actifs} />
      }
    </Card>

    <!-- Colonne 3 : Dates & Suivi -->
    <Card titre="Dates">
      <DescriptionList>
        <Item label="Date prévue"    valeur={date_prevue} />
        <Item label="Date début"     valeur={date_debut} />
        <Item label="Date clôture"   valeur={date_cloture} />
        <Item label="Création"       valeur={date_creation} />
        <Item label="Automatique"    valeur={est_automatique ? "Oui" : "Non"} />
      </DescriptionList>
      <!-- Priorité modifiable si OT actif -->
      {statut NOT IN (3,4) &&
        <Select label="Priorité" options={priorites_ot} valeur={id_priorite} />
      }
    </Card>
  </div>

  <!-- DI liée -->
  {id_di &&
    <Card titre="Demande d'intervention liée" class="mt-6">
      <DescriptionList>
        <Item label="DI" valeur={"#" + id_di + " — " + libelle_constat} lien="/demandes/:id_di" />
      </DescriptionList>
    </Card>
  }

  <!-- Commentaires -->
  <Card titre="Commentaires" class="mt-6">
    <Textarea valeur={commentaires} readonly={statut IN (3,4)} />
  </Card>

  <!-- Image (via gamme) -->
  {id_image &&
    <Card titre="Image" class="mt-6">
      <img src={data_url_from_blob} class="max-w-xs rounded" />
    </Card>
  }

  <!-- Opérations d'exécution -->
  <Card titre="Opérations" class="mt-6">
    <DataTable
      colonnes={[
        { champ: "nom_operation",       label: "Opération" },
        { champ: "type_operation",      label: "Type" },
        { champ: "id_statut_operation", label: "Statut",    rendu: <Badge /> },
        { champ: "seuils",              label: "Seuils",    rendu: <SeuilDisplay /> },
        { champ: "valeur_mesuree",      label: "Mesure",    rendu: <InputNumber /> },
        { champ: "est_conforme",        label: "Conforme",  rendu: <ConformiteIcon /> },
        { champ: "date_execution",      label: "Date",      rendu: <DatePicker /> },
        { champ: "commentaires",        label: "Remarques", rendu: <InputText /> },
      ]}
    />
  </Card>

  <!-- Documents liés -->
  <Card titre="Documents" class="mt-6">
    <DocumentsLies entite="ordres_travail" id={id_ordre_travail} />
    {statut NOT IN (3,4) && <UploadButton />}
  </Card>
</Page>
```

#### Composant opération (ligne interactive)

Chaque ligne d'opération est un mini-formulaire inline :

```
<OperationRow>
  <span>{nom_operation}</span>
  <Badge>{type_operation}</Badge>
  <StatusSelect                               <!-- Statuts sélectionnables -->
    options={[                                 <!-- 1=En attente, 2=En cours, 3=Terminée, 5=Non applicable -->
      "En attente", "En cours", "Terminée",    <!-- PAS 4=Annulée (système uniquement) -->
      "Non applicable"
    ]}
    disabled={statut_ot IN (3,4)}
  />
  {type == "Mesure" &&
    <div class="flex gap-2 items-center">
      <span class="text-muted">{seuil_min} – {seuil_max} {unite_symbole}</span>
      <InputNumber valeur={valeur_mesuree} />
    </div>
  }
  <ConformiteIndicator valeur={est_conforme} />  <!-- Vert/Rouge/Gris -->
  <DatePicker valeur={date_execution} />
  <InputText valeur={commentaires} placeholder="Remarque..." />
</OperationRow>
```

**Règles UI des opérations** :
- Statut 4 (Annulée) : jamais dans le select, uniquement affiché si déjà annulée (par le système)
- Passage à "Terminée" (3) ou "En cours" (2) → `date_execution` requise
- Passage à "Non applicable" (5) → `date_execution` optionnelle
- Si `type_operation == "Mesure"` : afficher les seuils + input valeur + conformité auto-calculée
- Si `type_operation != "Mesure"` : `est_conforme` reste `NULL` (icône grise "—"), la conformité ne s'applique pas
- OT en statut 3 ou 4 → toutes les opérations readonly

**Bulk actions sur les opérations** :

```
<OperationsBulkBar>
  <Checkbox label="Tout sélectionner" />
  <Button disabled={!selection.length}>Terminer la sélection</Button>
  <DatePicker label="Date d'exécution commune" />
  <!-- Passe toutes les opérations sélectionnées en statut 3 (Terminée) avec la même date -->
</OperationsBulkBar>
```

### 2.3 Notifications système (triggers automatiques)

Le backend déclenche des actions automatiques via les triggers SQLite. Le frontend **doit notifier l'utilisateur** de chaque action système via des toasts informatifs :

| Trigger système | Toast affiché |
|---|---|
| Auto-clôture OT (toutes ops terminées/NA) | `"OT clôturé automatiquement — toutes les opérations sont terminées"` |
| Reprogrammation auto (nouvel OT créé) | `"OT suivant créé automatiquement : #{id}, prévu le {date}"` + lien |
| Bascule prestataire sur interne (pas de contrat) | `"⚠ Prestataire basculé sur Mon Entreprise : aucun contrat valide pour {prestataire}"` |
| Cascade annulation ops (OT annulé) | `"{n} opération(s) en attente/en cours annulée(s) automatiquement"` |
| Auto-passage En Cours (1ère op exécutée) | `"OT passé en statut En Cours"` |
| Retour Planifié (toutes ops repassent en attente) | `"OT repassé en statut Planifié"` |
| Résurrection (4→1) avec reset ops | `"OT réactivé — {n} opération(s) réinitialisée(s), snapshots mis à jour"` |

**Mécanisme** : après chaque `invoke()` qui modifie un OT ou ses opérations, le frontend compare l'état avant/après (via la réponse Rust ou un refetch TanStack Query) et affiche le toast approprié.

### 2.4 Modale création OT

```
<Dialog titre="Créer un ordre de travail">
  <Form schema={zodSchemaCreationOT}>
    <SelectSearch
      label="Gamme *"
      options={gammes_actives}        <!-- gammes WHERE est_active = 1 -->
      affichage={nom_gamme + " — " + nom_famille}
      filtre_texte
    />
    <DatePicker label="Date prévue *" defaut={today} />
    <Select label="Priorité" options={priorites_ot} defaut="Normale" />
    <Select
      label="Technicien"
      options={techniciens_actifs}     <!-- techniciens WHERE est_actif = 1 -->
      visible_si={gamme.id_prestataire == 1}   <!-- Seulement si OT interne -->
    />
    <SelectSearch
      label="DI liée"
      options={di_ouvertes}            <!-- DI WHERE statut IN (1, 3) -->
      optionnel
    />
    <Textarea label="Commentaires" optionnel />

    <!-- Preview (après sélection gamme) — validation proactive -->
    <InfoBox>
      Prestataire : {gamme.prestataire}
      Périodicité : {gamme.periodicite}
      Réglementaire : {gamme.est_reglementaire ? "Oui" : "Non"}
      Opérations : {nb_operations} opération(s) seront générées
    </InfoBox>

    <!-- Warning contrat (affiché AVANT soumission si gamme réglementaire + prestataire externe) -->
    {gamme.est_reglementaire && gamme.id_prestataire != 1 && !contrat_valide &&
      <Alert variante="destructive">
        Cette gamme est réglementaire. Aucun contrat valide trouvé pour {gamme.prestataire}.
        La création sera bloquée. <Button variante="link" lien="/contrats">Gérer les contrats</Button>
      </Alert>
    }
    <!-- Warning bascule (affiché si gamme NON réglementaire + prestataire externe sans contrat) -->
    {!gamme.est_reglementaire && gamme.id_prestataire != 1 && !contrat_valide &&
      <Alert variante="warning">
        Aucun contrat valide pour {gamme.prestataire}. L'OT sera automatiquement assigné
        au prestataire interne (Mon Entreprise).
      </Alert>
    }

    <DialogFooter>
      <Button type="submit">Créer</Button>
      <Button variante="outline">Annuler</Button>
    </DialogFooter>
  </Form>
</Dialog>
```

**Erreurs backend attendues** (affichées comme toast ou alerte inline) :
- `Gamme inactive ou inexistante`
- `Gamme sans opérations exécutables`
- `Gamme réglementaire sans contrat valide`
- `Technicien inactif`
- `Technicien interne sur OT externe`

---

## 3. Gammes de maintenance

### 3.1 Liste (`/gammes`)

```
<Page>
  <PageHeader titre="Gammes de maintenance">
    <Button>+ Créer une gamme</Button>
  </PageHeader>

  <Toolbar>
    <SearchInput placeholder="Rechercher par nom..." />
    <FilterSelect label="Famille" options={familles} />
    <FilterSelect label="Prestataire" options={prestataires} />
    <FilterSelect label="Périodicité" options={periodicites} />
    <FilterToggle label="Réglementaire" />
    <FilterToggle label="Actives uniquement" defaut={true} />
  </Toolbar>

  <DataTable
    colonnes={[
      { champ: "nom_gamme",         label: "Nom" },
      { champ: "nom_famille",       label: "Famille" },
      { champ: "libelle_periodicite", label: "Périodicité" },
      { champ: "nom_prestataire",   label: "Prestataire" },
      { champ: "est_reglementaire", label: "Régl.", rendu: <IconCheck /> },
      { champ: "est_active",        label: "Active", rendu: <Switch /> },
      { champ: "nb_operations",     label: "Opérations" },
    ]}
    pagination={20}
    ligne_cliquable → `/gammes/:id`
  />
</Page>
```

### 3.2 Détail gamme (`/gammes/:id`)

```
<Page>
  <PageHeader titre={nom_gamme}>
    {est_reglementaire && <Badge>Réglementaire</Badge>}
    <Switch label="Active" valeur={est_active} />
    <Button variante="outline">Modifier</Button>
  </PageHeader>

  <div class="grid grid-cols-2 gap-6">
    <Card titre="Informations">
      <DescriptionList>
        <Item label="Famille"        valeur={nom_famille} />
        <Item label="Localisation"   valeur={nom_localisation} />
        <Item label="Périodicité"    valeur={libelle_periodicite + " (" + jours + "j)"} />
        <Item label="Prestataire"    valeur={prestataire.libelle} />
        <Item label="Équipement"     valeur={equipement.nom} />
        <Item label="Description"    valeur={description} />
      </DescriptionList>
    </Card>

    <Card titre="Image">
      {id_image ? <img src={image_data_url} /> : <Placeholder>Aucune image</Placeholder>}
      <Button variante="outline">Changer l'image</Button>
    </Card>
  </div>

  <!-- Opérations spécifiques -->
  <Card titre="Opérations spécifiques" class="mt-6">
    <DataTable
      colonnes={[
        { champ: "nom_operation",   label: "Nom" },
        { champ: "type_operation",  label: "Type" },
        { champ: "seuils",          label: "Seuils" },
        { champ: "unite",           label: "Unité" },
        { champ: "actions",         label: "",      rendu: <EditDeleteButtons /> },
      ]}
    />
    <Button variante="outline" class="mt-2">+ Ajouter une opération</Button>
  </Card>

  <!-- Gammes types associées -->
  <Card titre="Gammes types associées" class="mt-6">
    <div class="flex flex-wrap gap-2">
      {gamme_modeles.map(gm =>
        <Badge variante="secondary" cliquable lien={"/gammes-types/" + gm.id_gamme_type}>
          {gm.nom_gamme_type} ({gm.nb_items} ops)
          <ButtonIcon icon="X" onClick={dissocier} />
        </Badge>
      )}
    </div>
    <Button variante="outline" class="mt-2">+ Associer une gamme type</Button>
  </Card>

  <!-- Contrats couvrant cette gamme (via contrats_gammes) -->
  <!-- Navigation symétrique : contrat → gammes ET gamme → contrats -->
  <Card titre="Contrats" class="mt-6">
    {contrats_lies.length > 0 ?
      <DataTable
        colonnes={[prestataire, type_contrat, date_debut, date_fin, statut_calcule]}
        source="contrats JOIN contrats_gammes WHERE id_gamme = :id"
      />
    :
      <EmptyState>
        {est_reglementaire
          ? <Alert variante="destructive">Aucun contrat lié — la création d'OT sera bloquée si le prestataire est externe</Alert>
          : <span class="text-muted">Aucun contrat lié à cette gamme</span>
        }
      </EmptyState>
    }
    <Button variante="outline" lien="/contrats">Gérer les contrats</Button>
  </Card>

  <!-- OT liés -->
  <Card titre="Ordres de travail" class="mt-6">
    <DataTable
      colonnes={[date_prevue, statut, priorite, prestataire, date_cloture]}
      source="ordres_travail WHERE id_gamme = :id"
    />
    <Button variante="outline">+ Créer un OT pour cette gamme</Button>
  </Card>

  <!-- Documents liés -->
  <Card titre="Documents" class="mt-6">
    <DocumentsLies entite="gammes" id={id_gamme} />
    <UploadButton />
  </Card>
</Page>
```

### 3.3 Formulaire gamme (création / modification)

```
<Dialog titre="Créer une gamme" | "Modifier la gamme">
  <Form schema={zodSchemaGamme}>
    <Input label="Nom *" />
    <Textarea label="Description" />
    <Select label="Famille d'équipements *" options={familles} />
    <Select label="Périodicité *" options={periodicites} />
    <Select label="Prestataire *" options={prestataires} defaut="Mon Entreprise" />
    <Select label="Localisation" options={localisations_flat} optionnel />
    <Select label="Équipement" options={equipements} optionnel />
    <Switch label="Réglementaire" defaut={false} />
    <ImagePicker label="Image (icône WebP)" />
  </Form>
</Dialog>
```

---

## 4. Gammes types (templates)

### 4.1 Liste (`/gammes-types`)

```
<Page>
  <PageHeader titre="Gammes types">
    <Button>+ Créer une gamme type</Button>
  </PageHeader>

  <DataTable
    colonnes={[
      { champ: "nom_gamme_type", label: "Nom" },
      { champ: "description",   label: "Description" },
      { champ: "nb_items",      label: "Opérations" },
      { champ: "nb_gammes",     label: "Gammes liées" },
      { champ: "date_creation", label: "Créée le" },
    ]}
    ligne_cliquable → `/gammes-types/:id`
  />
</Page>
```

### 4.2 Détail gamme type (`/gammes-types/:id`)

```
<Page>
  <PageHeader titre={nom_gamme_type}>
    <Button variante="outline">Modifier</Button>
    <Button variante="destructive">Supprimer</Button>
  </PageHeader>

  <Card titre="Items d'opération">
    <DataTable
      colonnes={[
        { champ: "nom_operation",   label: "Opération" },
        { champ: "type_operation",  label: "Type" },
        { champ: "seuils",          label: "Seuils" },
        { champ: "unite",           label: "Unité" },
        { champ: "description",     label: "Description" },
        { champ: "actions",         rendu: <EditDeleteButtons /> },
      ]}
    />
    <Button variante="outline">+ Ajouter un item</Button>
  </Card>

  <!-- Gammes qui utilisent ce template -->
  <Card titre="Gammes associées" class="mt-6">
    <DataTable
      colonnes={[nom_gamme, famille, periodicite]}
      source="gammes JOIN gamme_modeles"
    />
  </Card>
</Page>
```

### 4.3 Formulaire item gamme type

```
<Dialog titre="Ajouter un item">
  <Form>
    <Input label="Nom de l'opération *" />
    <Textarea label="Description" />
    <Select label="Type d'opération *" options={types_operations} />
    <!-- Champs conditionnels (visibles si type.necessite_seuils == 1) -->
    {necessite_seuils &&
      <>
        <Select label="Unité *" options={unites} />
        <div class="grid grid-cols-2 gap-4">
          <InputNumber label="Seuil minimum" />
          <InputNumber label="Seuil maximum" />
        </div>
      </>
    }
  </Form>
</Dialog>
```

---

## 5. Équipements

### 5.1 Vue arborescente (`/equipements`)

Navigation hiérarchique : **Domaines techniques → Familles → Équipements**

```
<Page>
  <PageHeader titre="Équipements">
    <Button>+ Domaine</Button>
    <Button>+ Famille</Button>
    <Button>+ Équipement</Button>
  </PageHeader>

  <div class="grid grid-cols-[300px_1fr] gap-6">
    <!-- Arbre de navigation (gauche) -->
    <Card>
      <TreeView>
        {domaines.map(d =>
          <TreeNode
            label={d.nom_domaine}
            icon={d.image_data_url}
            expandable
          >
            {d.familles.map(f =>
              <TreeNode
                label={f.nom_famille}
                icon={f.image_data_url}
                expandable
              >
                {f.equipements.map(e =>
                  <TreeLeaf
                    label={e.nom}
                    actif={e.est_actif}
                    selected={e.id == selected_id}
                    onClick → sélectionner
                  />
                )}
              </TreeNode>
            )}
          </TreeNode>
        )}
      </TreeView>
    </Card>

    <!-- Détail sélectionné (droite) -->
    <div>
      {selected_type == "domaine" && <DomaineDetail />}
      {selected_type == "famille" && <FamilleDetail />}
      {selected_type == "equipement" && <EquipementDetail />}
    </div>
  </div>
</Page>
```

### 5.2 Détail équipement (`/equipements/:id`)

```
<Card titre={nom}>
  <DescriptionList>
    <Item label="Famille"           valeur={nom_famille} />
    <Item label="Domaine"           valeur={nom_domaine} />
    <Item label="N° série"          valeur={numero_serie} />
    <Item label="Marque"            valeur={marque} />
    <Item label="Modèle"            valeur={modele} />
    <Item label="Localisation"      valeur={nom_localisation} />
    <Item label="Mise en service"   valeur={date_mise_en_service} />
    <Item label="Fin garantie"      valeur={date_fin_garantie} />
    <Item label="Actif"             valeur={<Switch />} />
    <Item label="Commentaires"      valeur={commentaires} />
  </DescriptionList>

  <!-- Gammes liées à cet équipement -->
  <Card titre="Gammes associées" class="mt-4">
    <DataTable colonnes={[nom_gamme, periodicite, prestataire]} />
  </Card>
</Card>
```

### 5.3 Formulaires

**Domaine technique** :
```
<Dialog titre="Domaine technique">
  <Input label="Nom *" />
  <Textarea label="Description" />
  <ImagePicker label="Icône" />
</Dialog>
```

**Famille d'équipements** :
```
<Dialog titre="Famille d'équipements">
  <Input label="Nom *" />
  <Textarea label="Description" />
  <Select label="Domaine technique *" options={domaines} />
  <ImagePicker label="Icône" />
</Dialog>
```

**Équipement** :
```
<Dialog titre="Équipement">
  <Input label="Nom *" />
  <Select label="Famille *" options={familles} />
  <Select label="Localisation" options={localisations} optionnel />
  <Input label="N° série" />
  <Input label="Marque" />
  <Input label="Modèle" />
  <DatePicker label="Mise en service" />
  <DatePicker label="Fin garantie" />
  <Textarea label="Commentaires" />
</Dialog>
```

---

## 6. Localisations

### 6.1 Vue arborescente (`/localisations`)

```
<Page>
  <PageHeader titre="Localisations">
    <Button>+ Ajouter une localisation</Button>
  </PageHeader>

  <div class="grid grid-cols-[350px_1fr] gap-6">
    <!-- Arbre hiérarchique (gauche) -->
    <Card>
      <TreeView>
        <!-- Arbre récursif : chaque localisation peut avoir des enfants (id_parent) -->
        {racines.map(loc =>
          <LocalisationNode loc={loc} />   <!-- récursif -->
        )}
      </TreeView>
    </Card>

    <!-- Détail sélectionné (droite) -->
    <Card titre={selected.nom_localisation}>
      <DescriptionList>
        <Item label="Description"    valeur={description} />
        <Item label="Établissement"  valeur={etablissement.nom} />
        <Item label="Parent"         valeur={parent.nom_localisation} />
      </DescriptionList>

      <!-- Gammes dans cette localisation -->
      <Card titre="Gammes" class="mt-4">
        <DataTable colonnes={[nom_gamme, periodicite, prestataire]} />
      </Card>

      <!-- Équipements dans cette localisation -->
      <Card titre="Équipements" class="mt-4">
        <DataTable colonnes={[nom, famille, marque]} />
      </Card>

      <!-- Documents liés -->
      <Card titre="Documents" class="mt-4">
        <DocumentsLies entite="localisations" id={id_localisation} />
        <UploadButton />
      </Card>
    </Card>
  </div>
</Page>
```

### 6.2 Formulaire localisation

```
<Dialog titre="Localisation">
  <Input label="Nom *" />
  <Textarea label="Description" />
  <Select label="Établissement" options={etablissements} optionnel />
  <SelectSearch label="Parent" options={localisations_sauf_descendants} optionnel />
  <!-- Note : la liste des parents exclut la localisation elle-même et ses descendants -->
  <!-- pour éviter les cycles (protégés par triggers côté DB) -->
</Dialog>
```

---

## 7. Prestataires

### 7.1 Liste (`/prestataires`)

```
<Page>
  <PageHeader titre="Prestataires">
    <Button>+ Ajouter un prestataire</Button>
  </PageHeader>

  <DataTable
    colonnes={[
      { champ: "libelle",      label: "Nom" },
      { champ: "ville",        label: "Ville" },
      { champ: "telephone",    label: "Téléphone" },
      { champ: "email",        label: "Email" },
      { champ: "nb_contrats",  label: "Contrats actifs" },
      { champ: "nb_gammes",    label: "Gammes" },
    ]}
    ligne_cliquable → `/prestataires/:id`
  />
  <!-- "Mon Entreprise" (id=1) toujours en première ligne, non supprimable -->
</Page>
```

### 7.2 Détail prestataire (`/prestataires/:id`)

```
<Page>
  <PageHeader titre={libelle}>
    <Button variante="outline">Modifier</Button>
    {id != 1 && <Button variante="destructive">Supprimer</Button>}
  </PageHeader>

  <Card titre="Coordonnées">
    <DescriptionList>
      <Item label="Adresse"    valeur={adresse} />
      <Item label="Code postal" valeur={code_postal} />
      <Item label="Ville"       valeur={ville} />
      <Item label="Téléphone"   valeur={telephone} />
      <Item label="Email"       valeur={email} />
    </DescriptionList>
  </Card>

  <Card titre="Contrats" class="mt-6">
    <DataTable colonnes={[type, date_debut, date_fin, statut, nb_gammes_liees]} />
    <Button variante="outline">+ Créer un contrat</Button>
  </Card>

  <Card titre="Gammes associées" class="mt-6">
    <DataTable colonnes={[nom_gamme, periodicite, est_reglementaire]} />
  </Card>

  <!-- Documents liés -->
  <Card titre="Documents" class="mt-6">
    <DocumentsLies entite="prestataires" id={id_prestataire} />
    <UploadButton />
  </Card>
</Page>
```

### 7.3 Formulaire prestataire

```
<Dialog titre="Prestataire">
  <Input label="Nom *" />
  <Textarea label="Description" />
  <Input label="Adresse" />
  <Input label="Code postal" pattern="[0-9]{5}" />
  <Input label="Ville" />
  <Input label="Téléphone" />
  <Input label="Email" type="email" />
</Dialog>
```

---

## 8. Contrats

### 8.1 Liste (`/contrats`)

```
<Page>
  <PageHeader titre="Contrats">
    <Button>+ Créer un contrat</Button>
  </PageHeader>

  <Toolbar>
    <FilterSelect label="Prestataire" options={prestataires} />
    <FilterSelect label="Type" options={types_contrats} />
    <FilterToggle label="Masquer archivés" defaut={true} />
  </Toolbar>

  <DataTable
    colonnes={[
      { champ: "prestataire",    label: "Prestataire" },
      { champ: "type_contrat",   label: "Type" },
      { champ: "date_debut",     label: "Début" },
      { champ: "date_fin",       label: "Fin" },
      { champ: "statut_calcule", label: "Statut", rendu: <ContratStatusBadge /> },
      { champ: "est_archive",    label: "Archivé", rendu: <IconArchive /> },
      { champ: "nb_gammes",      label: "Gammes" },
    ]}
    ligne_cliquable → `/contrats/:id`
  />
</Page>
```

**Statut calculé** (côté front, pas en DB) :
- **Actif** : `date_debut <= today AND (date_fin IS NULL OR date_fin >= today) AND date_resiliation IS NULL AND est_archive = 0`
- **Expiré** : `date_fin < today`
- **Résilié** : `date_resiliation IS NOT NULL`
- **Archivé** : `est_archive = 1`
- **À venir** : `date_debut > today`

### 8.2 Détail contrat (`/contrats/:id`)

```
<Page>
  <PageHeader titre={"Contrat — " + prestataire.libelle}>
    <ContratStatusBadge />
    {est_archive && <Badge variante="secondary">Archivé</Badge>}
    {!est_archive && <Button variante="outline">Modifier</Button>}
    {!est_archive && <Button variante="outline">Créer un avenant</Button>}
  </PageHeader>

  <Card titre="Informations">
    <DescriptionList>
      <Item label="Prestataire"      valeur={prestataire.libelle} lien />
      <Item label="Type"             valeur={type_contrat.libelle} />
      <Item label="Date signature"   valeur={date_signature} />
      <Item label="Date début"       valeur={date_debut} />
      <Item label="Date fin"         valeur={date_fin} />
      <Item label="Durée cycle"      valeur={duree_cycle_mois + " mois"} />
      <Item label="Préavis"          valeur={delai_preavis_jours + " jours"} />
      <Item label="Fenêtre résiliation" valeur={fenetre_resiliation_jours + " jours"} />
      <Item label="Commentaires"     valeur={commentaires} />
    </DescriptionList>
  </Card>

  <!-- Résiliation -->
  {!est_archive && !date_resiliation &&
    <Card titre="Résiliation" class="mt-6">
      <div class="flex gap-4 items-end">
        <DatePicker label="Date notification" />
        <DatePicker label="Date résiliation" />
        <Button variante="destructive">Résilier</Button>
      </div>
    </Card>
  }

  <!-- Chaîne d'avenants -->
  {(id_contrat_parent || has_enfants) &&
    <Card titre="Historique des versions" class="mt-6">
      <Timeline>
        {versions.map(v =>
          <TimelineItem
            label={v.objet_avenant || "Contrat initial"}
            date={v.date_debut}
            actif={!v.est_archive}
            lien={"/contrats/" + v.id_contrat}
          />
        )}
      </Timeline>
    </Card>
  }

  <!-- Gammes liées -->
  <Card titre="Gammes couvertes" class="mt-6">
    <div class="flex flex-wrap gap-2">
      {gammes_liees.map(g =>
        <Badge cliquable lien={"/gammes/" + g.id_gamme}>
          {g.nom_gamme}
          {!est_archive && <ButtonIcon icon="X" onClick={dissocier} />}
        </Badge>
      )}
    </div>
    {!est_archive && <Button variante="outline">+ Lier une gamme</Button>}
  </Card>

  <!-- Documents liés -->
  <Card titre="Documents" class="mt-6">
    <DocumentsLies entite="contrats" id={id_contrat} />
    {!est_archive && <UploadButton />}
  </Card>
</Page>
```

### 8.3 Formulaire contrat

```
<Dialog titre="Créer un contrat" | "Modifier le contrat">
  <Form>
    <Select label="Prestataire *" options={prestataires_sauf_interne} />
    <Select label="Type *" options={types_contrats} />
    <DatePicker label="Date signature" />
    <DatePicker label="Date début *" />
    <DatePicker label="Date fin" visible_si={type != "Indéterminé"} />
    <InputNumber label="Durée cycle (mois)" visible_si={type == "Tacite"} />
    <InputNumber label="Délai préavis (jours)" defaut={30} />
    <InputNumber label="Fenêtre résiliation (jours)" visible_si={type == "Tacite"} />
    <Textarea label="Commentaires" />
  </Form>
</Dialog>
```

### 8.4 Modale avenant

```
<Dialog titre="Créer un avenant">
  <Alert>
    L'avenant archivera automatiquement le contrat actuel.
    Le contrat archivé ne pourra plus être modifié.
  </Alert>
  <Input label="Objet de l'avenant *" />
  <!-- Mêmes champs que le formulaire contrat, pré-remplis depuis le parent -->
  <Form pré_rempli_depuis={contrat_parent} />
</Dialog>
```

---

## 9. Techniciens

### 9.1 Liste (`/techniciens`)

```
<Page>
  <PageHeader titre="Techniciens">
    <Button>+ Ajouter un technicien</Button>
  </PageHeader>

  <Toolbar>
    <FilterSelect label="Poste" options={postes} />
    <FilterToggle label="Actifs uniquement" defaut={true} />
  </Toolbar>

  <DataTable
    colonnes={[
      { champ: "nom_complet",  label: "Nom" },
      { champ: "poste",        label: "Poste" },
      { champ: "telephone",    label: "Téléphone" },
      { champ: "email",        label: "Email" },
      { champ: "est_actif",    label: "Actif", rendu: <Switch /> },
      { champ: "nb_ot_actifs", label: "OT en cours" },
    ]}
  />
</Page>
```

### 9.2 Formulaire technicien

```
<Dialog titre="Technicien">
  <Input label="Nom *" />
  <Input label="Prénom *" />
  <Select label="Poste" options={postes} optionnel />
  <Input label="Téléphone" />
  <Input label="Email" type="email" />
  <Switch label="Actif" defaut={true} />
</Dialog>
```

**Erreurs attendues** :
- Suppression : `Ce technicien est assigné à des OT actifs`
- Désactivation : pas d'erreur DB, mais l'UI devrait avertir si des OT actifs existent

---

## 10. Demandes d'intervention (DI)

### 10.1 Liste (`/demandes`)

```
<Page>
  <PageHeader titre="Demandes d'intervention">
    <Button>+ Créer une DI</Button>
    <DropdownMenu>
      <MenuItem>Créer depuis un modèle</MenuItem>
    </DropdownMenu>
  </PageHeader>

  <Toolbar>
    <SearchInput placeholder="Rechercher..." />
    <FilterSelect label="Type" options={types_di} />
    <FilterSelect label="Statut" options={statuts_di} />
    <DateRangePicker label="Date constat" />
  </Toolbar>

  <DataTable
    colonnes={[
      { champ: "id_di",             label: "#" },
      { champ: "libelle_constat",   label: "Constat" },
      { champ: "type_di",           label: "Type" },
      { champ: "id_statut_di",      label: "Statut",     rendu: <Badge /> },
      { champ: "date_constat",      label: "Date constat" },
      { champ: "date_resolution",   label: "Résolution" },
    ]}
    ligne_cliquable → `/demandes/:id`
  />
</Page>
```

### 10.2 Détail DI (`/demandes/:id`)

```
<Page>
  <PageHeader titre={"DI #" + id_di + " — " + libelle_constat}>
    <Badge statut={statut_di} />
    <Badge type={type_di} />
  </PageHeader>

  <ActionBar>
    {statut == 1 && <Button>Résoudre</Button>}       <!-- → statut 2, ouvre modale résolution -->
    {statut == 2 && <Button>Réouvrir</Button>}        <!-- → statut 3 -->
    {statut == 3 && <Button>Résoudre à nouveau</Button>} <!-- → statut 2 -->
    {statut == 3 && <Button>Repasser en Ouverte</Button>} <!-- → statut 1 -->
  </ActionBar>

  <div class="grid grid-cols-2 gap-6">
    <Card titre="Constat">
      <DescriptionList>
        <Item label="Type"             valeur={type_di.libelle} />
        <Item label="Libellé"          valeur={libelle_constat} />
        <Item label="Description"      valeur={description_constat} />
        <Item label="Date constat"     valeur={date_constat} />
        <Item label="Résolution suggérée" valeur={description_resolution_suggeree} />
      </DescriptionList>
    </Card>

    {(statut == 2 || date_resolution) &&
      <Card titre="Résolution">
        <DescriptionList>
          <Item label="Description"    valeur={description_resolution} />
          <Item label="Date"           valeur={date_resolution} />
        </DescriptionList>
      </Card>
    }
  </div>

  <!-- Gammes liées (table di_gammes) -->
  <Card titre="Gammes liées" class="mt-6">
    <div class="flex flex-wrap gap-2">
      {gammes.map(g =>
        <Badge cliquable lien={"/gammes/" + g.id_gamme}>
          {g.nom_gamme}
          {statut != 2 && <ButtonIcon icon="X" onClick={dissocier} />}
        </Badge>
      )}
    </div>
    {statut != 2 && <Button variante="outline">+ Lier une gamme</Button>}
  </Card>

  <!-- Localisations liées (table di_localisations) -->
  <Card titre="Localisations liées" class="mt-6">
    <div class="flex flex-wrap gap-2">
      {localisations.map(l =>
        <Badge cliquable>
          {l.nom_localisation}
          {statut != 2 && <ButtonIcon icon="X" onClick={dissocier} />}
        </Badge>
      )}
    </div>
    {statut != 2 && <Button variante="outline">+ Lier une localisation</Button>}
  </Card>

  <!-- OT liés à cette DI -->
  <Card titre="Ordres de travail liés" class="mt-6">
    <DataTable colonnes={[nom_gamme, date_prevue, statut_ot]}
      source="ordres_travail WHERE id_di = :id_di"
    />
  </Card>

  <!-- Documents liés -->
  <Card titre="Documents" class="mt-6">
    <DocumentsLies entite="di" id={id_di} />
    {statut != 2 && <UploadButton />}
  </Card>
</Page>
```

### 10.3 Modale résolution

```
<Dialog titre="Résoudre la DI">
  <DatePicker label="Date de résolution *" defaut={today} />
  <Textarea label="Description de la résolution *" />
  <DialogFooter>
    <Button type="submit">Résoudre</Button>
  </DialogFooter>
</Dialog>
```

### 10.4 Formulaire DI

```
<Dialog titre="Créer une DI">
  <Form>
    <Select label="Type *" options={types_di} />
    <Input label="Libellé du constat *" />
    <Textarea label="Description du constat *" />
    <DatePicker label="Date du constat *" defaut={today} />
    <Textarea label="Résolution suggérée" optionnel />
  </Form>
</Dialog>
```

### 10.5 Modale création depuis modèle

```
<Dialog titre="Créer depuis un modèle">
  <SelectSearch label="Modèle de DI" options={modeles_di} />
  <!-- Pré-remplit : type_di, libelle_constat, description_constat, description_resolution_suggeree -->
  <Form pré_rempli />
  <!-- L'utilisateur peut modifier avant soumission -->
</Dialog>
```

---

## 11. Documents

### 11.1 Liste (`/documents`)

```
<Page>
  <PageHeader titre="Documents">
    <Button>+ Uploader un document</Button>
  </PageHeader>

  <Toolbar>
    <SearchInput placeholder="Nom du fichier..." />
    <FilterSelect label="Type" options={types_documents} />
  </Toolbar>

  <DataTable
    colonnes={[
      { champ: "nom_original",     label: "Fichier" },
      { champ: "type_document",    label: "Type" },
      { champ: "taille_octets",    label: "Taille",   rendu: formatBytes },
      { champ: "date_upload",      label: "Uploadé le" },
      { champ: "nb_liaisons",      label: "Rattachements" },
      { champ: "actions",          rendu: <DownloadDeleteButtons /> },
    ]}
  />
</Page>
```

### 11.2 Modale upload

```
<Dialog titre="Uploader un document">
  <DropZone accept="*" />              <!-- Drag & drop ou sélection fichier -->
  <Input label="Nom du fichier" pré_rempli={nom_original} />
  <Select label="Type de document *" options={types_documents} />
  <!-- Rattachement immédiat (optionnel) -->
  <Select label="Rattacher à" options={["Prestataire","Contrat","Gamme","OT","DI","Localisation"]} />
  {rattachement == "Prestataire" && <Select options={prestataires} />}
  {rattachement == "Contrat"     && <Select options={contrats} />}
  <!-- etc. -->
  <Textarea label="Commentaire" optionnel />
</Dialog>
```

### 11.3 Composant réutilisable `<DocumentsLies />`

Utilisé dans les détails de : OT, gammes, contrats, prestataires, DI, localisations.

```
<DocumentsLies entite={type} id={entity_id}>
  <div class="space-y-2">
    {documents.map(doc =>
      <div class="flex items-center justify-between p-2 border rounded">
        <div>
          <span class="font-medium">{doc.nom_original}</span>
          <Badge class="ml-2">{doc.type_document}</Badge>
          <span class="text-sm text-muted">{formatBytes(doc.taille_octets)}</span>
        </div>
        <div class="flex gap-2">
          {doc.commentaire && <Tooltip>{doc.commentaire}</Tooltip>}
          <Button icon="Download" onClick={telecharger} />
          <Button icon="Unlink" onClick={dissocier} variante="ghost" />
        </div>
      </div>
    )}
  </div>
</DocumentsLies>
```

---

## 12. Paramètres (`/parametres`)

### 12.1 Layout paramètres

```
<Page>
  <PageHeader titre="Paramètres" />

  <Tabs>
    <Tab label="Établissement" />
    <Tab label="Types de documents" />
    <Tab label="Types de DI" />
    <Tab label="Unités de mesure" />
    <Tab label="Périodicités" />
    <Tab label="Types d'opérations" />
    <Tab label="Postes" />
    <Tab label="Modèles de DI" />
    <Tab label="Référentiel ERP" />
  </Tabs>
</Page>
```

### 12.2 Établissement

```
<TabContent>
  <Card titre="Mon établissement">
    <Form>
      <Input label="Nom *" />
      <Select label="Type ERP" options={types_erp} affichage={code + " — " + libelle} />
      <Select label="Catégorie ERP" options={categories_erp} />
      <Input label="Adresse" />
      <Input label="Code postal" pattern="[0-9]{5}" />
      <Input label="Ville" />
      <InputNumber label="Capacité d'accueil" />
      <InputNumber label="Surface (m²)" step={0.1} />
      <Button type="submit">Enregistrer</Button>
    </Form>
  </Card>
</TabContent>
```

### 12.3 Tables de référence CRUD

Même pattern pour : types_documents, types_di, unites, postes, types_operations.

```
<TabContent>
  <DataTable
    colonnes={[libelle, description, ...champs_specifiques]}
    actions={<EditDeleteButtons />}
  />
  <Button>+ Ajouter</Button>

  <!-- Modale ajout/modification -->
  <Dialog>
    <Input label="Libellé *" />
    <Textarea label="Description" />
    {/* Champs spécifiques selon la table */}
  </Dialog>
</TabContent>
```

**Spécificités par table** :

| Table | Champs supplémentaires | Protection suppression |
|---|---|---|
| `types_documents` | `est_systeme` (badge, non modifiable) | Message si documents liés + avertissement si `est_systeme` |
| `unites` | `symbole` | RESTRICT si opérations liées |
| `periodicites` | `jours_periodicite`, `jours_valide`, `tolerance_jours` | RESTRICT si gammes liées |
| `types_operations` | `necessite_seuils` (switch) | RESTRICT si opérations liées |
| `postes` | — | SET NULL sur techniciens |

### 12.4 Modèles de DI

```
<TabContent>
  <DataTable
    colonnes={[
      { champ: "nom_modele",        label: "Nom" },
      { champ: "type_di",           label: "Type" },
      { champ: "libelle_constat",   label: "Constat" },
      { champ: "actions",           rendu: <EditDeleteButtons /> },
    ]}
  />
  <Button>+ Créer un modèle</Button>

  <Dialog titre="Modèle de DI">
    <Input label="Nom du modèle *" />
    <Select label="Type de DI *" options={types_di} />
    <Input label="Libellé constat *" />
    <Textarea label="Description constat *" />
    <Textarea label="Résolution suggérée" />
    <Textarea label="Description" />
  </Dialog>
</TabContent>
```

### 12.5 Périodicités (vue enrichie)

```
<TabContent>
  <DataTable
    colonnes={[
      { champ: "libelle",            label: "Nom" },
      { champ: "jours_periodicite",  label: "Jours (cycle)" },
      { champ: "jours_valide",       label: "Jours (validité)" },
      { champ: "tolerance_jours",    label: "Tolérance" },
      { champ: "description",        label: "Description" },
    ]}
    actions={<EditDeleteButtons />}
  />
  <Button>+ Ajouter</Button>

  <Dialog titre="Périodicité">
    <Input label="Libellé *" />
    <Textarea label="Description" />
    <InputNumber label="Jours de périodicité *" min={0} />
    <InputNumber label="Jours de validité *" min={0} />
    <InputNumber label="Tolérance (jours) *" min={0} defaut={0} />
    <!-- Validation Zod : valide <= periodicite, tolerance <= valide -->
  </Dialog>
</TabContent>
```

---

## Composants partagés

### Badges de statut

| Entité | Statut | Couleur | Variante shadcn |
|---|---|---|---|
| OT | Planifié | Bleu | `default` |
| OT | En Cours | Jaune | `warning` (custom) |
| OT | Clôturé | Vert | `success` (custom) |
| OT | Annulé | Gris | `secondary` |
| OT | Réouvert | Orange | `outline` + bordure orange |
| Opération | En attente | Gris | `secondary` |
| Opération | En cours | Jaune | `warning` |
| Opération | Terminée | Vert | `success` |
| Opération | Annulée | Gris barré | `secondary` + strikethrough |
| Opération | Non applicable | Gris clair | `outline` |
| DI | Ouverte | Bleu | `default` |
| DI | Résolue | Vert | `success` |
| DI | Réouverte | Orange | `outline` |
| Priorité | Urgente | Rouge | `destructive` |
| Priorité | Haute | Orange | `warning` |
| Priorité | Normale | Bleu | `default` |
| Priorité | Basse | Gris | `secondary` |

### Composant `<SeuilDisplay />`

```
<!-- Pour les opérations de type Mesure -->
<div class="flex items-center gap-1 text-sm">
  <span class="text-muted">{seuil_min ?? "—"}</span>
  <span>–</span>
  <span class="text-muted">{seuil_max ?? "—"}</span>
  <span class="font-medium">{unite_symbole}</span>
</div>
```

### Composant `<ConformiteIcon />`

```
{est_conforme === null && <span class="text-muted">—</span>}
{est_conforme === 1    && <IconCheck class="text-green-600" />}
{est_conforme === 0    && <IconX class="text-red-600" />}
```

### Toast / Alertes d'erreur

Les erreurs renvoyées par les triggers SQLite (via `RAISE(ABORT, ...)`) sont affichées dans des toasts :

```
<Toaster position="bottom-right">
  <Toast variante="destructive" titre="Erreur">
    {message_erreur_trigger}
  </Toast>
</Toaster>
```

Messages clés à intercepter et afficher clairement :
- `Modification interdite : OT terminé`
- `Gamme réglementaire sans contrat valide`
- `Technicien inactif`
- `Technicien interne sur OT externe`
- `Cycle détecté dans la hiérarchie des localisations`
- `Suppression impossible : des documents utilisent ce type`
- `Ce contrat est archivé`
- `Clôture impossible : des opérations sont encore en attente`
- `Résurrection impossible : la gamme est inactive`
- `Résurrection impossible : un OT actif existe déjà pour cette gamme`
- `Résurrection impossible : gamme réglementaire sans contrat valide`
- `Désactivation impossible : des OT actifs existent encore pour cette gamme`
- `Suppression impossible : ce prestataire a des contrats actifs`
- `Suppression impossible : ce technicien est assigné à des OT actifs`
- `Passage en réglementaire impossible : des OT actifs existent avec un prestataire externe sans contrat valide`

---

## Export et impression

### Principe

L'application doit permettre l'export de données pour les besoins métier (commission de sécurité, assurances, direction, terrain).

### Exports disponibles

| Contexte | Format | Contenu |
|---|---|---|
| Fiche OT | PDF | OT + liste d'opérations avec statuts, seuils, mesures, conformité. Format imprimable pour le terrain. |
| Liste OT filtrée | CSV | Export de la DataTable courante avec les filtres actifs |
| Fiche gamme | PDF | Gamme + opérations + gammes types associées |
| Rapport conformité | PDF | Toutes les gammes réglementaires avec : dernier OT clôturé, date, conformité. Pour la commission de sécurité. |
| Rapport activité | PDF | Synthèse mensuelle : OT réalisés, en retard, taux de conformité, par prestataire. |
| Liste équipements | CSV | Export de l'inventaire avec familles, localisations, dates |

### Boutons d'export

```
<!-- Présent dans chaque page qui le supporte -->
<DropdownMenu>
  <DropdownTrigger>
    <Button variante="outline" icon="Download">Exporter</Button>
  </DropdownTrigger>
  <DropdownContent>
    <DropdownItem icon="FileText">Export PDF</DropdownItem>
    <DropdownItem icon="Table">Export CSV</DropdownItem>
  </DropdownContent>
</DropdownMenu>
```

### Fiche d'intervention imprimable (PDF OT)

```
┌─────────────────────────────────────────┐
│ FICHE D'INTERVENTION                    │
│ OT #{id} — {nom_gamme}                  │
│ Date prévue : {date_prevue}             │
│ Prestataire : {nom_prestataire}         │
│ Localisation : {nom_localisation}       │
│ Équipement : {nom_equipement}           │
├─────────────────────────────────────────┤
│ OPÉRATIONS                              │
│ ☐ {nom_op_1} ({type}) — seuils         │
│ ☐ {nom_op_2} ({type})                  │
│ ☐ ...                                  │
│                                         │
│ Commentaires : _________________________│
│ Technicien : ___________________________│
│ Date : _________________________________│
│ Signature : ____________________________│
└─────────────────────────────────────────┘
```

---

## Gestion des images (BLOB)

Les images sont stockées en BLOB dans la table `images`. Le flux :

1. **Upload** : l'utilisateur sélectionne un fichier image
2. **Conversion** : le frontend convertit en WebP (via Canvas API) avant envoi
3. **Stockage** : le backend Rust stocke le BLOB dans SQLite
4. **Affichage** : le backend retourne `base64(image_data)` → le frontend affiche via `data:image/webp;base64,...`

Les images sont utilisées comme icônes pour :
- Domaines techniques
- Familles d'équipements
- Gammes (propagées aux OT via snapshot)

---

## Validations Zod (côté frontend)

Toutes les validations frontend miroir les CHECK contraintes SQLite :

| Champ | Validation |
|---|---|
| `code_postal` | `z.string().regex(/^\d{5}$/)` |
| `email` | `z.string().email()` |
| `nom` / `libelle` / textes requis | `z.string().trim().min(1)` |
| `capacite_accueil` | `z.number().int().positive().optional()` |
| `surface_m2` | `z.number().positive().optional()` |
| `taille_octets` | `z.number().int().positive()` |
| `seuil_minimum / maximum` | `min <= max` (raffinement) |
| `jours_valide` | `<= jours_periodicite` |
| `tolerance_jours` | `<= jours_valide` |
| `date_fin` | `>= date_debut` |
| `date_signature` | `<= date_debut` |
| `date_fin_garantie` | `>= date_mise_en_service` |
| `necessite_seuils` + unité | Si mesure → unité requise ; si qualitatif → pas de seuils |

---

## Règles d'interaction globales

1. **Lecture seule contextuelle** : les entités terminales (OT clôturé/annulé, DI résolue, contrat archivé) affichent leurs champs en readonly sans bouton de modification
2. **Suppression = confirmation** : toute suppression passe par un `<AlertDialog>` avec message explicite
3. **Navigation retour** : le breadcrumb permet de remonter dans la hiérarchie
4. **Liens croisés** : les snapshots (nom_gamme, nom_prestataire, etc.) dans les OT sont cliquables et mènent vers l'entité source. Un tooltip `"Valeur figée à la création de l'OT"` indique que le snapshot peut diverger de la valeur actuelle.
5. **Empty states** : chaque DataTable affiche un état vide avec icône + message + CTA de création. Sur base vide, le dashboard affiche le stepper d'onboarding.
6. **Loading states** : chaque requête TanStack Query affiche un skeleton pendant le chargement
7. **Optimistic updates** : les changements de statut (OT, opérations, DI) sont appliqués immédiatement côté UI, avec rollback en cas d'erreur trigger. Le rollback : le badge revient à l'état précédent + toast d'erreur rouge avec le message du trigger.
8. **Notifications système** : les actions automatiques des triggers (auto-clôture, reprogrammation, cascade annulation, bascule prestataire, propagation) sont signalées par un toast informatif (voir section 2.3).
9. **Propagation visible** : quand l'utilisateur modifie une gamme, un prestataire, un technicien, une localisation, une famille, un équipement, ou une gamme type, un toast indique `"{n} OT actif(s) mis à jour"` si des OT ont été affectés par la propagation.
10. **Avenants contrats** : lors de la création d'un avenant, l'utilisateur est averti que (a) le contrat parent sera archivé, (b) les gammes liées au parent ne sont PAS automatiquement reportées — il doit les lier manuellement au nouvel avenant.

---

## Composants : shadcn/ui vs custom

Le PRD-STACK impose shadcn/ui pour tous les composants. Certains composants décrits dans ce PRD n'existent pas nativement dans shadcn/ui et doivent être construits :

### Composants shadcn/ui natifs utilisés
Button, Badge, Card, Dialog, Select, Input, Textarea, Tabs, AlertDialog, DropdownMenu, Switch, Checkbox, Separator, Tooltip, Progress, Sheet

### Composants à construire au-dessus de shadcn/ui
| Composant | Base | Usage |
|---|---|---|
| `DataTable` | `@tanstack/react-table` + composants shadcn | Toutes les listes (OT, gammes, DI, etc.) |
| `TreeView` / `TreeNode` | Composant custom (Radix Accordion ou récursif) | Équipements, Localisations |
| `Timeline` / `TimelineItem` | Composant custom (div + bordure) | Chaîne avenants contrats |
| `CalendarGrid` / `WeekGrid` | Composant custom ou lib tierce | Vue Planning |
| `StatCard` | Card shadcn + contenu custom | Dashboard KPIs |
| `DescriptionList` | Composant custom (dl/dt/dd) | Fiches détail |
| `CommandPalette` | `cmdk` (lib) + Dialog shadcn | Recherche globale Ctrl+K |
| `ImagePicker` | Input file + preview | Upload images/icônes |
| `DropZone` | Input file + drag & drop | Upload documents |
| `DateRangePicker` | 2x DatePicker shadcn | Filtres par période |
| `SeuilDisplay` | Spans custom | Affichage seuils mesure |
| `ConformiteIcon` | Icônes custom | Vert/Rouge/Gris |
| `FilterToggle` | Switch shadcn | Filtres booléens |

### Dépendance manquante dans le PRD-STACK

Le PRD-STACK doit inclure `@tanstack/react-table` dans les dépendances npm :
```bash
npm install @tanstack/react-table
```
Cette lib est nécessaire pour tous les DataTable du PRD (tri, filtrage, pagination).
