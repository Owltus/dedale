---
name: deployer
description: Met Dédale en production — gate de vérification, migrations SQL à appliquer, régénération des types, déploiement Vercel et contrôle après mise en ligne. À utiliser avant toute mise en production, ou quand une migration attend d'être appliquée.
---

# Mettre Dédale en production

> **L'ordre compte.** Le front est déployé en continu par Vercel à chaque poussée ; la base, elle, ne se met à jour que si quelqu'un applique la migration. Déployer un front qui attend une colonne absente casse la production.

## Le paysage

| Élément   | Où                                      | Note                                                            |
| --------- | --------------------------------------- | --------------------------------------------------------------- |
| Front     | Vercel, projet `dedale`                 | build `tsc -b && vite build`                                    |
| Adresse   | `dedale.naostack.com`                   | CNAME Cloudflare **DNS only** ; `dedale.vercel.app` reste actif |
| Base      | Supabase, projet `ybxuojtyevldrbieaykh` | migrations appliquées **à la main**                             |
| Variables | Vercel → Environment Variables          | `VITE_*` **inlinées au build**                                  |

## Avant tout : l'ordre

1. **La base d'abord**, le front ensuite. Une migration qui ajoute une colonne doit être appliquée **avant** que le front ne la lise.
2. **Sauf** si la migration retire quelque chose : déployer d'abord le front qui cesse de l'utiliser, appliquer ensuite.

## Recette

### 1. Gate locale

```bash
npm run verify   # typecheck + lint + format + tests
npm run build
```

Tout doit être vert. `verify` inclut format et tests — l'ancienne gate s'arrêtait à `typecheck && lint && build`, ce qui a laissé 170 fichiers dériver hors format et 2 tests rouges passer inaperçus.

### 2. Les migrations en attente

`migrations/` est **gitignoré** (dépôt public, données réelles) : rien ne signale une migration non appliquée. Le seul moyen fiable est de vérifier **en base** que son effet est là.

Pour chacune, dans l'ordre de numérotation : appliquer dans l'éditeur SQL, puis jouer la requête de vérification de son en-tête. Voir le skill `migration-sql` pour l'écriture et les pièges.

### 3. Régénérer les types

```bash
npx supabase login    # une fois
npm run gen:types
```

À faire **après** le déploiement de la migration. Tant qu'elle n'est pas déployée, `database.types.ts` est édité à la main en pont — et cette édition doit être remplacée par la génération, pas conservée.

Si les types changent : relancer `npm run verify`.

### 4. Déployer le front

La poussée sur `main` déclenche le déploiement. Vercel refuse de publier si `tsc -b` échoue — c'est le seul garde-fou distant : **ni lint, ni format, ni tests ne tournent côté Vercel**.

### 5. Contrôle après mise en ligne

```bash
curl -sS -o /dev/null -w "HTTP %{http_code} ssl=%{ssl_verify_result}\n" https://dedale.naostack.com
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://dedale.naostack.com/ordres-travail   # rewrite SPA
```

Puis, dans l'application : se connecter, ouvrir une page liste, ouvrir une fiche détail, vérifier que le site actif filtre bien.

## Pièges vérifiés

- **Les variables `VITE_*` sont figées au build.** Les modifier dans Vercel ne change rien tant qu'on n'a pas **redéployé**. C'est l'erreur qui fait perdre une heure.
- **Ne jamais mettre de secret derrière `VITE_`** : tout ce préfixe finit en clair dans le bundle téléchargeable. La clé `service_role` de Supabase n'a rien à faire dans ce projet ; la clé publique, si — la sécurité repose sur la RLS.
- **Ne jamais réactiver le proxy Cloudflare** (nuage orange) sur l'enregistrement `dedale` : Vercel ne peut plus émettre son certificat, et un mode SSL « Flexible » provoque une boucle de redirection. Cloudflare affiche un bandeau qui incite à l'activer — l'ignorer.
- **Supabase met un projet gratuit en pause** après une longue inactivité. Une application qui renvoie des erreurs réseau après plusieurs jours sans usage, c'est souvent ça.
- **Les URL de redirection Auth** doivent contenir le domaine de production, sinon les liens de réinitialisation de mot de passe renvoient vers l'URL par défaut.

## Pas d'intégration continue — décision assumée

**Tranché le 2026-08-16 : le projet n'aura pas de CI.** Ce n'est pas un sujet en attente, c'est un choix, avec sa contrepartie.

Ce qui protège le dépôt :

- le hook `.claude/hooks/check.mjs`, qui **formate puis type-vérifie** chaque fichier édité via l'outil ;
- le build Vercel, qui refuse de publier si `tsc -b` échoue.

Ce que cela ne couvre pas, et qui devient donc une **discipline** :

- une édition faite **hors de Claude Code** (éditeur, autre machine, correction à la volée) ne passe par aucun garde-fou ;
- Vercel n'exécute **ni lint, ni format, ni tests** : un test rouge ou 170 fichiers hors format se déploient sans broncher. C'est exactement ce qui s'est produit une fois.

**Règle qui remplace la CI : lancer `npm run verify` à la main avant toute poussée dont une partie n'a pas été écrite via l'outil.** Si cette règle s'avère trop souvent oubliée, la conclusion sera de créer la CI — pas de renforcer le rappel.
