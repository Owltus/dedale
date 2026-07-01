import { z } from 'zod'

// ── Prestataire ─────────────────────────────────────────────────────────────

// Formulaire allégé (décision PO) : un prestataire = un NOM + une DESCRIPTION +
// une IMAGE. Les coordonnées (métier, SIRET, contact, adresse…) restent en base
// mais ne sont plus saisies ici. `commentaires` porte la description.
export const prestataireSchema = z.object({
  libelle: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  commentaires: z.string().trim().max(2000),
  miniature_id: z.string().nullable(),
})

export type PrestataireFormValues = z.infer<typeof prestataireSchema>

export const emptyPrestataire: PrestataireFormValues = {
  libelle: '',
  commentaires: '',
  miniature_id: null,
}

// ── Contrat ──────────────────────────────────────────────────────────────────

// Identifiants de `types_contrats` (source : base). Réutilisés par `etat.ts`.
export const TYPE_CONTRAT_TACITE = '2'

// Les champs de reconduction/résiliation existent en base ; le schéma reflète les
// contraintes CHECK (sinon erreur backend 23514) et conditionne la durée de cycle
// au type « tacite reconduction ». Les dates nues (`YYYY-MM-DD`) se comparent en
// string ; les compteurs sont saisis via `NumberField` (donc `number | null`).
export const contratSchema = z
  .object({
    reference: z
      .string()
      .trim()
      .min(1, 'La référence est obligatoire')
      .max(200),
    type_contrat_id: z.string().min(1, 'Le type de contrat est obligatoire'),
    date_debut: z.string().min(1, 'La date de début est obligatoire'),
    date_fin: z.string(),
    objet_avenant: z.string().trim().max(500),
    commentaires: z.string().trim().max(2000),
    // Reconduction (tacite) : durée d'un cycle de reconduction, en mois.
    duree_cycle_mois: z
      .number()
      .int('La durée du cycle doit être un nombre entier de mois')
      .positive('La durée du cycle doit être supérieure à 0')
      .nullable(),
    // Résiliation / préavis. Nullable côté formulaire (le champ peut être vidé) ;
    // rendu obligatoire par un refine (la colonne est NOT NULL DEFAULT 30).
    delai_preavis_jours: z
      .number()
      .int('Le délai de préavis doit être un nombre entier de jours')
      .min(0, 'Le délai de préavis doit être positif ou nul')
      .nullable(),
    fenetre_resiliation_jours: z
      .number()
      .int('La fenêtre de résiliation doit être un nombre entier de jours')
      .positive('La fenêtre de résiliation doit être supérieure à 0')
      .nullable(),
    date_signature: z.string(),
    date_resiliation: z.string(),
    date_notification: z.string(),
  })
  // CHECK `date_debut <= date_fin`.
  .refine((v) => !v.date_fin || v.date_fin >= v.date_debut, {
    message: 'La date de fin doit être postérieure à la date de début',
    path: ['date_fin'],
  })
  // CHECK `date_signature <= date_debut`.
  .refine((v) => !v.date_signature || v.date_signature <= v.date_debut, {
    message: 'La signature doit précéder (ou égaler) la date de début',
    path: ['date_signature'],
  })
  // CHECK `date_resiliation >= date_debut`.
  .refine((v) => !v.date_resiliation || v.date_resiliation >= v.date_debut, {
    message:
      'La résiliation doit être postérieure (ou égale) à la date de début',
    path: ['date_resiliation'],
  })
  // CHECK `date_notification <= date_resiliation`.
  .refine(
    (v) =>
      !v.date_notification ||
      !v.date_resiliation ||
      v.date_notification <= v.date_resiliation,
    {
      message: 'La notification doit précéder (ou égaler) la résiliation',
      path: ['date_notification'],
    },
  )
  // `delai_preavis_jours` obligatoire (colonne NOT NULL).
  .refine((v) => v.delai_preavis_jours != null, {
    message: 'Le délai de préavis est obligatoire',
    path: ['delai_preavis_jours'],
  })
  // Durée de cycle obligatoire pour un contrat à tacite reconduction.
  .refine(
    (v) =>
      v.type_contrat_id !== TYPE_CONTRAT_TACITE || v.duree_cycle_mois != null,
    {
      message: 'La durée du cycle est obligatoire pour une tacite reconduction',
      path: ['duree_cycle_mois'],
    },
  )

export type ContratFormValues = z.infer<typeof contratSchema>

export const emptyContrat: ContratFormValues = {
  reference: '',
  type_contrat_id: '',
  date_debut: '',
  date_fin: '',
  objet_avenant: '',
  commentaires: '',
  duree_cycle_mois: null,
  delai_preavis_jours: 30,
  fenetre_resiliation_jours: null,
  date_signature: '',
  date_resiliation: '',
  date_notification: '',
}
