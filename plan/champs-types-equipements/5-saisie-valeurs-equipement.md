# Étape 5 — Saisie des valeurs sur l'équipement

## Objectif

Permettre de renseigner et modifier les **valeurs** des caractéristiques sur un équipement réel (aujourd'hui non éditables après instanciation), via les widgets typés.

## Contexte

`instancier_equipement` copie déjà les `specifications` du modèle vers l'équipement (snapshot, 0 SQL). L'équipement reçoit donc les définitions de champs (avec `defaut`). Il manque l'UI de saisie des `valeur` et leur persistance : le `equipement-form-dialog` n'a aucune section caractéristiques, et `useUpdateEquipement` ignore `specifications`.

## Fichier(s) impacté(s)

- `src/features/equipements/components/equipement-form-dialog.tsx` (modifié — section caractéristiques)
- `src/features/equipements/schemas.ts` (modifié — schéma des valeurs)
- `src/features/equipements/mutations.ts` (modifié — `equipementPayload` inclut `specifications`)

## Travail à réaliser

### 1. Section « Caractéristiques techniques » (form équipement)

Lire `parseChamps(equipement.specifications)` → liste de champs (définition + `valeur`). Pour chaque champ, un `ChampValeurInput` qui édite la `valeur` (pré-remplie par `valeur` actuelle, sinon `defaut`). Le tech ne crée/supprime pas de champ ici : il **remplit** ceux définis par le modèle.

### 2. Validation (A3)

Schéma Zod des valeurs : si `champ.requis` et `valeur` vide → erreur (décision A3, à confirmer). Conversion correcte par type (nombre → number, oui-non → boolean, date → ISO).

### 3. Persistance

`equipementPayload` : `specifications: serializeChamps(champsAvecValeurs)`. Bien réinjecter les définitions (snapshot) + les `valeur` saisies, pour ne pas perdre la structure.

## Ordre d'exécution

1. Section caractéristiques (lecture + édition des valeurs).
2. Schéma Zod des valeurs.
3. Payload de mise à jour.

## Critère de validation

- Instancier un équipement depuis un modèle à champs typés → l'équipement affiche les champs avec leurs défauts.
- Modifier les valeurs, enregistrer, recharger : les valeurs persistent.
- Un champ requis vide bloque l'enregistrement (si A3 = bloquer).
- `npm run typecheck` + `npm run lint` + `npm run build` verts.
