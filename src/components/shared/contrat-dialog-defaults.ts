import type { Contrat } from "@/lib/types/contrats";

export function contratDefaults(c: Contrat) {
  return {
    id_prestataire: c.id_prestataire, id_type_contrat: c.id_type_contrat,
    reference: c.reference ?? "", date_signature: c.date_signature ?? "", date_debut: c.date_debut,
    date_fin: c.date_fin ?? "", duree_cycle_mois: c.duree_cycle_mois,
    delai_preavis_jours: c.delai_preavis_jours,
    fenetre_resiliation_jours: c.fenetre_resiliation_jours,
    commentaires: c.commentaires ?? "",
  };
}

export function contratCreateDefaults(prestataireId: number) {
  return {
    id_prestataire: prestataireId, id_type_contrat: 0, reference: "",
    date_debut: "", date_fin: "", date_signature: "",
    duree_cycle_mois: null, delai_preavis_jours: 30,
    fenetre_resiliation_jours: null, commentaires: "",
  };
}
