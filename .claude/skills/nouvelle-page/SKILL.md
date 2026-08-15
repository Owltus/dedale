---
name: nouvelle-page
description: Crée OU refond une page/écran de l'app Dédale (route TanStack Router protégée + feature) en réutilisant les composants `common/` et les patrons existants. À utiliser dès qu'on ajoute, refond ou homogénéise une page, un écran ou une fiche détail.
---

# Créer / refondre une page Dédale

> **Règle d'or : le front présente, la base valide.** La page consomme l'API et reflète rôle + site ; la RLS et les machines à états backend sont la vraie sécurité.
>
> **Ne jamais réimplémenter une coquille maison.** « Presque pareil = pas pareil » → viser l'homogénéité avec les pages déjà faites (Sites, Investissements, Prestataires, Utilisateurs, Documents, Localisations, Équipements, Travaux, Demandes).

**Avant de coder, dans cet ordre :**

1. Choisir le patron (§1).
2. Ouvrir [`references/catalogue-composants.md`](./references/catalogue-composants.md) et **chercher la brique avant d'en écrire une**.
3. Dérouler la recette : [`references/patrons-de-page.md`](./references/patrons-de-page.md).

Typage via `Database['public']['Tables']['xxx']['Row']`.
À la fin **toujours** : `npm run verify` (typecheck + lint + format + tests) puis `npm run build`.

## Skills voisins

| Besoin                                           | Skill             |
| ------------------------------------------------ | ----------------- |
| Créer ou câbler une modale                       | `modale`          |
| Extraire un composant dans `common/`             | `brique-commune`  |
| Écrire une migration et resynchroniser le schéma | `migration-sql`   |
| Vérifier qu'un écran est aligné sur les patrons  | `revue-coherence` |

Ces skills sont la **source unique** de leur sujet : ne pas recopier leurs règles ici.

## 1. Choisir le patron

| Patron                            | Quand le prendre                                                                                                                                                    | Routes                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Liste plate + modale**          | L'entité tient sur une ligne ; l'édition est un formulaire court ; rien de riche à montrer (ni frise, ni documents, ni sous-listes) ; pas besoin d'URL partageable. | 1 route unique `<entite>.tsx`, édition par modale réutilisée création+édition. **Pas de slug.** → _Sites_                                   |
| **Liste + détail par slug**       | La fiche montre plus qu'un formulaire (description, **StatusStepper**, **DocumentsTab**, blocs métier) **ou** il faut une URL partageable.                          | layout `<entite>.tsx` + `<entite>/index.tsx` + `<entite>/$<entite>.tsx`. Slug lisible. → _Investissements, Travaux, Prestataires, Demandes_ |
| **Explorateur à paliers (drill)** | Données **hiérarchiques** à explorer en descendant ; l'état de navigation vit dans le **chemin d'URL**.                                                             | layout `<entite>.tsx` + route splat `$.tsx`, `PageHeader breadcrumb`, hook de drill. → _Localisations, Équipements, Bibliothèque_           |

Un « détail » rendu par dialogue piloté par état local (ex. aperçu d'un document) n'est **pas** le patron liste+détail : pas d'URL, pas de `segOfUnique`.

## 2. Les invariants d'une page

Quel que soit le patron, une page de Dédale respecte ces sept points. Ils sont non négociables parce que chacun a déjà été enfreint et a produit un défaut visible.

1. **Racine `PageContainer`.** Défaut : le 1er enfant est l'en-tête FIXE, le reste défile. **Avec un enfant unique, tout défile, en-tête compris** — d'où `fill` + `FillHeader`/`ScrollBody` pour les écrans qui gèrent leur propre défilement.
2. **Deux gardes distinctes.** Rôle au **layout** (`requireNav`, **fail-open** : si la RPC rôle échoue on laisse passer, la RLS tranche) ; site dans la liste **ET** le détail (`NoSiteSelected`, **avant toute query**).
3. **Une seule identité de page.** Titre, description, indice et icône sont saisis **une fois** et réutilisés par la liste, le détail et les gardes — sinon les textes divergent et le sous-titre change sous l'utilisateur.
4. **Règle des 4 états = `QueryState`.** Le 5ᵉ cas (« filtre sans résultat ») se traite à la main avec `NoSearchResults`. Le squelette passe le **même `size`** que les lignes réelles.
5. **Barre de liste = `ListFilterBar`**, pleine largeur, sentinelle `FILTRE_TOUS`. Défaut « non terminés » sur toute liste à statuts terminaux.
6. **`segOfUnique` symétrique** : même ensemble de frères (toute la liste **non filtrée**) en génération ET en résolution. Replis : slug vide → `id` ; collision → suffixe. **Jamais l'UUID brut dans l'URL.**
7. **Cloisonnement site redondant** côté query (`.eq('site_id', siteId)`) en plus de la RLS.

## 3. Règles toujours actives

- **Tout en français accentué** — UI, libellés, erreurs, commentaires. Apostrophe typographique. Jamais d'abréviation dans un libellé d'action, un titre de dialogue ou un toast (« ordre de travail », pas « OT »).
- **TypeScript strict, pas de `any`.** Erreurs Supabase **toujours** gérées : `.throwOnError()` + UI (toast ou `ErrorState`). RLS en lecture = **résultat vide** (`.maybeSingle()` si l'absence est normale) ; INSERT/UPDATE/DELETE hors scope = **erreur** `42501` à catcher ; un DELETE qui ne touche aucune ligne lève **PGRST116**, pas un faux succès. Transition d'état interdite = erreur backend → catcher + toast.
- **Ne jamais afficher une panne comme une absence de données.** Déstructurer `isPending`/`isError`, pas seulement `data` : un `?? []` silencieux transforme une erreur réseau en « aucun élément », ce qui est un mensonge à l'utilisateur.
- **Tokens sémantiques**, jamais de couleur en dur. Deux emplois distincts de `destructive` : **teinté** (`StatusBadge`, `StatusTone`) = état **critique** ; **solide** (`variant="destructive"`) = **action** destructrice. `warning` = état défavorable non critique.
- **Mobile-first** : grilles via `cardGrid`, listes via `listStack`. `badges`/`meta` de `ListRow` disparaissent sous `sm` → passer `mobileMeta` pour l'info discriminante. Un contenu à largeur plancher ne vit jamais sous `overflow-x-hidden`.
- **Hard-delete** : la colonne `deleted_at` n'existe plus — ne jamais filtrer dessus. Garde-fous FK : `RESTRICT` (conteneur non vide → suppression bloquée, à présenter via `blocked`/`blockedReason`) vs `CASCADE` (liaisons retirées — le dire dans le `warning`).
- **Invalidation** : `qc.invalidateQueries({ queryKey: xxxQueries.all() })` (clé racine). Mutation transverse ou en cascade → `invalidateQueries()` **global**. Une entité vue sous plusieurs clés (les OT : liste + planning) → invalider **toutes** ses clés, sinon un écran reste figé.
- **Upload = 3 étapes** : Storage → insert `documents` (avec `site_id`) → insert table de liaison — encapsulé par `DocumentsTab`.
- **Types Supabase** : après une migration déployée, `npm run gen:types`. Tant qu'elle ne l'est pas, on édite `database.types.ts` à la main **en pont** (seule exception admise).

## Après

- `npm run verify` et `npm run build` au vert.
- **Mettre à jour [`references/catalogue-composants.md`](./references/catalogue-composants.md)** : toute brique créée y entre, et la colonne « Usages » des briques touchées est corrigée. Une brique absente du catalogue sera recréée en double par le chantier suivant.
- Nouvelle décision d'architecture tranchée → un ADR dans `docs/decisions/` (+ son entrée dans l'index du `README.md`).
