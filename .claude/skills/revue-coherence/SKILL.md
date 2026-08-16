---
name: revue-coherence
description: Audite l'homogénéité d'un ou plusieurs écrans de Dédale contre les patrons maison, sans modifier le code. À utiliser avant de livrer une page, après une refonte, ou quand on soupçonne qu'un écran a divergé des autres.
---

# Revue de cohérence d'un écran

> **Constat, pas correction.** Ce skill produit un verdict avec fichier et ligne. On corrige ensuite, en connaissance de cause — un écran qui diverge a parfois une bonne raison, et l'aligner d'office serait une régression.

Sept des vingt chantiers du projet ont été des chantiers d'homogénéisation. L'un s'appelle `divergence-zero-front`. Cette checklist est ce qui aurait évité de les rouvrir.

## Méthode

1. Lire l'écran **en entier**, pas en diagonale.
2. Le comparer à **une page de référence du même patron** (Travaux ou Investissements pour une liste+détail, Localisations pour un explorateur, Sites pour une liste plate).
3. Pour chaque point ci-dessous : conforme / écart / sans objet. **Un écart se cite avec sa valeur exacte et son fichier:ligne.**
4. Classer : **bloquant** (visible par l'utilisateur ou fonction cassée) · **notable** (incohérence ou duplication réelle) · **mineur** (finition).

Ne jamais écrire « semble », « pourrait » : ouvrir le fichier et trancher.

## Checklist

### Coquille et géométrie

- [ ] Racine `PageContainer`. **Un enfant unique fait défiler l'en-tête** — pour une colonne centrée, utiliser `bodyMaxWidth` (jamais un `div` enveloppant) ; pour un écran qui gère son propre défilement, `fill`.
- [ ] `FillHeader` / `ScrollBody` **importés**, jamais recopiés (`shrink-0 px-4 pt-6…`). Le compteur de recopies dans `src/` doit rester à **zéro**.
- [ ] Un seul `PageHeader`, actions passées en fragment nu (pas de conteneur intermédiaire qui rajoute un `gap`).
- [ ] En défilant : titre, fil d'Ariane et boutons restent épinglés.

### États de données

- [ ] Les 4 états via `QueryState`. Dérogation admise uniquement pour le tableau de bord et le planning — et alors justifiée en commentaire.
- [ ] **Squelette de la même hauteur que les lignes réelles** : `ListRowSkeletons` avec le MÊME `size` que les `ListRow` de la liste, et le nombre par défaut.
- [ ] Le 5ᵉ cas (filtre sans résultat) rendu par `NoSearchResults`, distinct de l'état vide.
- [ ] `isError` **traité** : chercher tout `?? []` sur une query. Une panne ne doit jamais s'afficher comme « aucun élément ».

### Liste

- [ ] Corps via **`ListPageBody`** (barre + « aucun résultat » + `listStack`) — pas de `flex flex-col gap-4` écrit à la main.
- [ ] Barre via `ListFilterBar`, pleine largeur, sentinelles `FILTRE_TOUS` / `FILTRE_NON_TERMINES` (jamais une chaîne vide).
- [ ] Défaut « non terminés » si la liste a des statuts terminaux.
- [ ] `ListRow` avec `mobileMeta` pour l'info discriminante (les `badges`/`meta` disparaissent sous `sm`).
- [ ] `menuActions` via `actionsEditionSuppression`.
- [ ] Une ligne cliquable a un `onClick` — sans lui, ni cible focusable ni retour visuel au survol.

### Détail

- [ ] Fiche à onglets → `DetailTabsShell`, jamais un montage à la main.
- [ ] `DetailHeaderCard` pour la carte d'en-tête (marge et icône portées par la brique).
- [ ] Route détail par **slug** (`segOfUnique`), jamais l'UUID brut.
- [ ] `sibs` = liste **non filtrée**, identique en génération et en résolution.

### Modales

- [ ] Toutes sur `DialogShell` (aucun `DialogContent` nu).
- [ ] `key={dlg.dialogKey}` — tester : saisir, annuler, rouvrir.
- [ ] Suppression définitive → `ConfirmDeleteDialog`, pas `ConfirmDialog`.
- [ ] Libellés d'attente : un verbe, jamais un `…` nu.
- [ ] Aucune option `value: ''` : option neutre → `optionAucune`, champ requis → `placeholder`.
- [ ] Champs pris dans la bonne famille : `common/fields/*` en react-hook-form, `common/standalone-fields.tsx` à état local. Aucun `<select>` natif.

### Gardes et rôles

- [ ] Garde de site via **`SiteScopedRoute`**, sur la liste **et** le détail. Aucun appel direct à `NoSiteSelected` dans une route.
- [ ] Identité de page dans **`features/<x>/page-meta.ts`**, consommée par la liste, le détail, la garde ET le `PageHeader` — jamais saisie deux fois.
- [ ] Permissions via `perm.*`, jamais `role === 'admin'` en dur.
- [ ] Calées sur la RLS **réelle** — vérifier `pg_policies`, pas le schéma versionné.

### Style

- [ ] Tokens sémantiques, zéro couleur en dur.
- [ ] `destructive` teinté = état critique ; solide = action destructrice. Un état ne prend jamais `Badge variant="destructive"`.
- [ ] Hauteurs de contrôle `h-9`, sans exception ponctuelle.
- [ ] `listStack` / `cardGrid`, jamais une grille fixe.
- [ ] Un contenu à largeur plancher n'est jamais sous `overflow-x-hidden`.

### Libellés

- [ ] Français accentué, apostrophe typographique.
- [ ] Aucune abréviation dans un libellé d'action, un titre ou un toast.
- [ ] Formulation constante d'un écran à l'autre (« Choisis un site pour… » : un seul verbe partout).

## Sortie attendue

Un tableau : point · verdict · fichier:ligne · valeur constatée contre valeur attendue. Plus une phrase de synthèse disant ce que l'écran fait **bien** — un audit qui ne relève que les écarts fait croire que tout est cassé.

Puis, si des écarts sont confirmés, proposer l'ordre de correction par (impact visible ÷ effort) — sans l'appliquer.
