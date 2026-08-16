---
name: brique-commune
description: Extrait, crée ou fait adopter un composant partagé de l'app Dédale (`ui/`, `common/`, `common/fields/`). À utiliser dès qu'on se dit « ce bloc, je l'ai déjà vu ailleurs » ou qu'on s'apprête à écrire un composant réutilisable.
---

# Ajouter une brique partagée

> **Une brique à un seul consommateur n'est pas une brique.** Soit on la généralise, soit on la retire du catalogue. C'est la règle centrale de ce skill : le projet compte 24 briques mono-consommateur, et son problème n'est pas de manquer de composants — c'est qu'on en recrée à côté de ceux qui existent.

## 1. Chercher avant de créer

Trois vérifications, dans l'ordre. La plupart des doublons du projet viennent de la deuxième, sautée.

1. **Lire le catalogue** : `.claude/skills/nouvelle-page/references/catalogue-composants.md`.
2. **Vérifier qu'une brique proche n'existe pas sous un autre nom.** Un import « qui marche » peut pointer vers un voisin qui ne fait pas tout à fait la même chose. Comparer le **chemin complet**, pas le nom. Pour les champs de formulaire, le critère est explicite : `common/fields/*` = react-hook-form (`control` + `name`) · `common/standalone-fields.tsx` = état local (`value` + `onChange`). Choisir selon qui porte l'état, jamais par habitude.
3. **Chercher le rôle, pas le nom.** Une brique qui fait ce dont on a besoin peut s'appeler autrement : `grep` sur les props attendues (`onConfirm`, `breadcrumb`, `pending`…) plutôt que sur le nom qu'on lui aurait donné.

Si une brique proche existe mais ne couvre pas le cas : **l'étendre**, ne pas écrire sa voisine. C'est ainsi que `DetailTabsShell` s'est retrouvée avec un seul consommateur pendant que deux fiches réassemblaient sa géométrie à la main.

## 2. Décider de l'emplacement

| Emplacement                     | Pour quoi                                  | Exemple                               |
| ------------------------------- | ------------------------------------------ | ------------------------------------- |
| `src/components/ui/`            | Primitive générique, zéro métier (shadcn)  | `button`, `dialog`                    |
| `src/components/common/`        | Brique applicative transverse              | `PageHeader`, `ListRow`, `QueryState` |
| `src/components/common/fields/` | Champ react-hook-form (`control` + `name`) | `TextField`                           |
| `src/features/<x>/components/`  | Spécifique à un domaine                    | `ContratCard`                         |

**Seuil de remontée** : les mêmes `ui/` assemblés de la même façon **au moins deux fois** → remonter dans `common/`.

**Cas particulier** : une brique qui vit dans `features/` mais est consommée par **d'autres** features doit être promue dans `common/`. Deux le sont aujourd'hui sans l'avoir été (`CategorieCard`, `catalogue-panel`).

## 3. Écrire la brique

```tsx
export function MaBrique({ className, ...props }: ComponentProps<'div'> & { … }) {
  return <div data-slot="ma-brique" className={cn('classes-de-base', className)} {...props} />
}
```

- `cn(..., className)` **toujours** en dernier — sinon l'appelant ne peut rien surcharger et les conflits Tailwind ne se résolvent pas.
- Variantes → **CVA**, types dérivés via `VariantProps<typeof xVariants>`.
- React 19 : pas de `forwardRef`, on prend `ComponentProps`. Attribut `data-slot` pour le ciblage CSS.
- **Porter les mesures dans la brique, pas dans l'appelant.** Une marge ou une taille d'icône laissée à sept appelants diverge mécaniquement : c'est exactement ce qui est arrivé à `DetailHeaderCard` (trois marges, deux tailles d'icône).
- **Exposer une source unique de valeurs partagées.** Si deux briques doivent s'accorder (une ligne et son squelette), l'une exporte la table de valeurs et l'autre la consomme — jamais deux tables approximativement égales.
- Tokens sémantiques uniquement, jamais de couleur en dur.

## 4. Faire adopter

Créer la brique ne suffit pas — le projet a des briques créées et jamais adoptées.

1. Migrer **tous** les appels existants dans le même chantier, pas « au fil de l'eau ».
2. **Supprimer** ce qu'elle remplace. Tant que l'ancien fichier existe, il sera réimporté ; c'est ainsi que quatre paires de champs coexistent encore.
3. Mettre à jour le **catalogue** : ligne de la brique + colonne « Usages » des briques touchées.
4. Si la brique reste à un seul consommateur en fin de chantier, trancher : généraliser ou retirer.

## 5. Quand NE PAS créer de brique

- **Un seul consommateur prévu** et aucun second à l'horizon → laisser dans la feature.
- **Ressemblance de surface, divergence de fond** : deux blocs qui se ressemblent aujourd'hui mais obéissent à des règles métier différentes divergeront demain. Une brique paramétrée par cinq drapeaux booléens est un signe qu'il fallait deux composants.
- **Briques structurellement mono** (un cadran = un graphe, un explorateur = un drill) : légitimes, à marquer comme telles dans le catalogue pour qu'on cesse de les signaler.

## Vérifier avant de conclure

- `grep` sur l'ancien chemin : plus aucun importeur, et le fichier n'existe plus.
- La brique est dans le catalogue avec son nombre réel de consommateurs.
- Rendu contrôlé sur **deux** consommateurs différents, mobile inclus.
- `npm run verify`.
