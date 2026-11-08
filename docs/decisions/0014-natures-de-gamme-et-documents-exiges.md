# 0014 — La nature d'une gamme dit pourquoi on intervient ; le document exigé en découle

- **Date** : 2026-11-08
- **Statut** : accepté (décisions du PO du 08/11/2026). Mise en œuvre : migrations
  131 (valeurs de l'ENUM) et 132 (règle, vue, reclassement).

## Contexte

`gammes.nature` n'avait que deux valeurs, `controle_reglementaire` et
`maintenance_preventive`, et faisait deux métiers à la fois :

- dire **pourquoi** on intervient ;
- dire **s'il faut une preuve** : l'alerte du tableau de bord ne signalait que
  les OT réglementaires clôturés sans document.

Pour obtenir l'alerte, des entretiens étaient classés « réglementaires »
(machine à glaçons, fontaine, portail…). Le registre de sécurité et les hachures
du planning les comptaient alors comme des obligations légales. À l'inverse, un
document manquant sur une maintenance (bon d'intervention d'un ascensoriste) ne
remontait jamais.

## Décision

1. **Huit natures**, établies à partir des 102 gammes réelles du site.
   Quatre exigent **toujours** un document, et ce n'est pas désactivable :

   | Nature                     | Document |
   | -------------------------- | -------- |
   | `controle_reglementaire`   | toujours |
   | `hygiene_sanitaire`        | toujours |
   | `maintenance_sous_contrat` | toujours |
   | `formation_habilitation`   | toujours |
   | `maintenance_interne`      | au choix |
   | `autocontrole`             | au choix |
   | `releve_compteurs`         | au choix |
   | `suivi_administratif`      | au choix |

2. **« Au choix »** = l'interrupteur `gammes.document_requis`, désactivé par
   défaut. Exemple : la machine à glaçons, en maintenance interne, exige une
   photo.
3. **La règle vit en base** : `public.nature_exige_document(nature)`. Le front en
   garde un miroir pour l'affichage, `NATURES_DOCUMENT_EXIGE`, et un test vérifie
   que les deux restent identiques.
4. **L'alerte « Documents manquants »** lit la vue `v_ot_documents_manquants`.
   Elle liste les OT clôturés dont le document est requis, par leur nature ou
   par l'interrupteur de leur gamme, et qui n'en ont aucun. **L'historique est
   compris**, à la demande du PO.
5. **`maintenance_preventive` est obsolète** : PostgreSQL ne sait pas retirer
   une valeur d'ENUM. Plus aucune ligne ne la porte et le front ne la propose
   plus. L'import CSV accepte encore les anciens libellés (« Réglementaire »,
   « Maintenance »).

## Conséquences

- **Le reclassement couvre aussi les OT clôturés.** C'est une exception voulue
  à « clôturé = immuable » : la nature figée sur l'OT est corrigée, pas
  réécrite. Les protections ont été suspendues le temps de la seule transaction
  132, et `audit_log` en garde la trace.
- **L'interrupteur est lu en direct sur la gamme**, sans être figé sur l'OT.
  L'activer sur une gamme fait remonter son historique sans document. C'est ce
  que veut le PO.
- **`check_derniere_op_preventive` s'applique désormais à toutes les natures.**
  Il ne visait que `maintenance_preventive`, qui disparaît. C'est la même règle
  que celle qui s'applique déjà à la création d'un OT.
- **Pas encore touchés**, volontairement :
  - le registre de sécurité (`v_registre_securite`, en développement) ne garde
    que `controle_reglementaire` ;
  - les hachures du planning et du cadran restent sur `controle_reglementaire`.
