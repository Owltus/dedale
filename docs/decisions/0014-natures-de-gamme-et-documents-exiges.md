# 0014 — La nature d'une gamme dit pourquoi on intervient ; le document exigé en découle

- **Date** : 2026-11-08
- **Statut** : accepté (décisions du PO du 08/11/2026). Mise en œuvre : migrations
  131 (valeurs de l'ENUM), 132 (règle, vue, reclassement) et 133 (passage de 8 à
  7 natures, le même jour).

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

1. **Sept natures**, établies à partir des 102 gammes réelles du site. Chacune
   répond à « qui intervient, et pourquoi ? ». Trois exigent **toujours** un
   document, et ce n'est pas désactivable :

   | Nature                   | On y range une gamme si…                               | Document |
   | ------------------------ | ------------------------------------------------------ | -------- |
   | `controle_reglementaire` | un organisme la vérifie parce que la loi l'oblige      | toujours |
   | `hygiene_sanitaire`      | elle protège la santé des occupants                    | toujours |
   | `formation_habilitation` | elle porte sur une personne                            | toujours |
   | `maintenance_preventive` | on agit **sur** l'équipement (équipe ou prestataire)   | au choix |
   | `controle_interne`       | l'équipe **vérifie** que tout fonctionne, sans réparer | au choix |
   | `releve_compteurs`       | on note une valeur                                     | au choix |
   | `gestion_administrative` | une échéance sans geste technique (badges…)            | au choix |

   La 132 en avait posé huit. Le PO les a jugées trop nombreuses et mal nommées.
   La 133 fusionne « sous contrat » et « interne » dans `maintenance_preventive`,
   car qui intervient ne change pas la nature. Les 11 gammes sous contrat
   gardent leur justificatif grâce à l'interrupteur (point 2). Elle renomme
   aussi `autocontrole` → `controle_interne` et `suivi_administratif` →
   `gestion_administrative`, une catégorie volontairement large (assurances,
   abonnements, renouvellements).

2. **« Au choix »** = l'interrupteur `gammes.document_requis`, désactivé par
   défaut. Il est activé sur la machine à glaçons (photo) et sur les gammes
   confiées à un prestataire (bon d'intervention).
3. **La règle vit en base** : `public.nature_exige_document(nature)`. Le front en
   garde un miroir pour l'affichage, `NATURES_DOCUMENT_EXIGE`, et un test vérifie
   que les deux restent identiques.
4. **L'alerte « Documents manquants »** lit la vue `v_ot_documents_manquants`.
   Elle liste les OT clôturés dont le document est requis, par leur nature ou
   par l'interrupteur de leur gamme, et qui n'en ont aucun. **L'historique est
   compris**, à la demande du PO.
5. **`maintenance_interne` et `maintenance_sous_contrat` sont obsolètes** :
   PostgreSQL ne sait pas retirer une valeur d'ENUM. Plus aucune ligne ne les
   porte et le front ne les propose plus. L'import CSV accepte encore les
   anciens libellés (« Réglementaire », « Maintenance », « Autocontrôle »…).

## Conséquences

- **Le reclassement couvre aussi les OT clôturés.** C'est une exception voulue
  à « clôturé = immuable » : la nature figée sur l'OT est corrigée, pas
  réécrite. Les protections ont été suspendues le temps de la seule transaction
  (132, puis 133), et `audit_log` en garde la trace.
- **L'interrupteur est lu en direct sur la gamme**, sans être figé sur l'OT.
  L'activer sur une gamme fait remonter son historique sans document. C'est ce
  que veut le PO.
- **`check_derniere_op_preventive` s'applique désormais à toutes les natures.**
  Il ne visait que `maintenance_preventive`. C'est la même règle
  que celle qui s'applique déjà à la création d'un OT.
- **Pas encore touchés**, volontairement :
  - le registre de sécurité (`v_registre_securite`, en développement) ne garde
    que `controle_reglementaire` ;
  - les hachures du planning et du cadran restent sur `controle_reglementaire`.
