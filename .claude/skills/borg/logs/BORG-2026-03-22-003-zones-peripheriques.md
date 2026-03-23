# BORG-2026-03-22-003 — Zones peripheriques (donnees, FK, CHECK)

> Projet : GMAO hotel ERP / SQLite STRICT / 60 triggers / 438 tests
> Drones deployes : Quatre-de-Cinq, Sept-de-Neuf, Deux-de-Cinq, Trois-de-Cinq
> Mode : DIAGNOSTIC + EXECUTION
> Reference : BORG-2026-03-22-001, BORG-2026-03-22-002

## Cible

Zones jamais auditees en profondeur : donnees de reference (INSERT seed),
FK ON DELETE, CHECK constraints, tables peripheriques, images, modeles_di.

## Trouvailles

### HAUTE — IDs statuts auto-generes (CORRIGE)
statuts_operations et statuts_ot faisaient des INSERT sans ID explicite.
Les triggers hardcodent ces IDs (1-5). Un changement d'ordre d'INSERT
casserait tous les triggers silencieusement.
Fix : IDs explicites ajoutes.

### MOYENNE — modeles_di FK sans ON DELETE (CORRIGE)
Seule FK du schema sans ON DELETE explicite. Comportement correct (RESTRICT
implicite) mais incoherent avec les 63 autres FK.
Fix : ON DELETE RESTRICT explicite.

### MOYENNE — CHECK periodicites manquantes (CORRIGE)
Pas de CHECK jours_valide <= jours_periodicite ni tolerance_jours <= jours_valide.
Donnees seed correctes mais insertion manuelle pouvait creer des periodicites
incoherentes cassant la reprogrammation.
Fix : 2 CHECK ajoutees.

### BASSE — taille_octets sans CHECK > 0 (CORRIGE)
documents et images acceptaient taille_octets = 0 ou negatif.
Fix : CHECK (taille_octets > 0) sur les 2 tables.

### DOCUMENTES (non corriges)
- Documents/images orphelins possibles apres cascade : nettoyage applicatif
- Email/telephone sans validation format : validation applicative
- Hash SHA-256 non-hex accepte : application genere le hash

## Actions executees
- 4 corrections appliquees au schema
- 438 tests : 0 echec
