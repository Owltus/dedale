# Étape 1 — Test de validation manuel

## Objectif

Confirmer que les fixes appliqués lors de l'audit Borg ont bien éliminé le freeze UI pendant `backup_create`. Sans ce test, on ne sait pas si l'on peut passer aux étapes de polish ou s'il faut relancer un audit.

## Contexte

Trois corrections critiques ont été appliquées : `async fn` + `spawn_blocking`, `busy_timeout` SQLite, throttling temporel des events. Le code compile, mais aucune validation effective n'a été faite. L'utilisateur a rapporté un freeze sévère après les tentatives précédentes — ce test détermine la suite.

## Travail à réaliser

### 1. Lancer l'app en mode dev

```bash
npm run tauri dev
```

### 2. Préparer le scénario de test

- Ouvrir **Paramètres → Sauvegarde**
- Garder un onglet DevTools ouvert (F12) sur **Console** pour observer les events `backup:progress`
- Avoir une seconde page accessible (Dashboard, Ordres de travail, Planning) pour tester la navigation pendant le backup

### 3. Déclencher un backup

- Cliquer sur **« Créer une sauvegarde »**
- Choisir un emplacement de destination
- Observer le comportement pendant les phases `snapshot`, `documents`, `finalizing`

### 4. Vérifier les critères de fluidité

Pendant l'exécution du backup :
- **Naviguer entre les pages** — Dashboard, Ordres de travail, Sidebar — vérifier que les chargements se font sans gel visible
- **Cliquer dans la sidebar** — les liens doivent répondre instantanément
- **Observer la barre de progression** — elle doit avancer en parallèle des navigations
- **Aucune apparition de « (Ne répond pas) »** dans la barre de titre Windows
- **Aucun gel visuel** de plus de 200 ms

## Critère de validation

Validation = **OK** si tous les points suivants sont vrais :

- L'application reste réactive pendant toute la durée du backup
- La barre de progression s'anime de façon continue
- Le titre de fenêtre Windows ne passe jamais à « (Ne répond pas) »
- Le toast de succès apparaît à la fin avec la taille de l'archive

Validation = **KO** si l'un des points est faux. Dans ce cas :
- Capturer les logs (Console DevTools + `log::warn!` éventuels)
- Documenter précisément à quelle phase le freeze apparaît (snapshot, documents, finalizing ?)
- Relancer un audit `/borg` ciblé sur la cause résiduelle avant de continuer
