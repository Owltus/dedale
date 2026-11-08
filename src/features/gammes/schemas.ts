import { z } from 'zod'
import { texteObligatoire } from '@/lib/texte-zod'
import type { Database } from '@/lib/database.types'

/** Toute valeur de l'ENUM `gamme_nature`, obsolète comprise. */
export type NatureGamme = Database['public']['Enums']['gamme_nature']

/**
 * Natures proposées à la saisie (132), dans l'ordre d'affichage. La valeur
 * `maintenance_preventive` existe encore dans l'ENUM mais n'est plus portée par
 * aucune ligne : elle n'est plus proposée.
 */
export const gammeNatures = [
  'controle_reglementaire',
  'hygiene_sanitaire',
  'maintenance_sous_contrat',
  'formation_habilitation',
  'maintenance_interne',
  'autocontrole',
  'releve_compteurs',
  'suivi_administratif',
] as const satisfies readonly NatureGamme[]

export type NatureGammeSaisie = (typeof gammeNatures)[number]

/** Libellé de la nature d'une gamme (cartes, fiche, formulaires, import CSV). */
export const NATURE_GAMME_LABEL: Record<NatureGamme, string> = {
  controle_reglementaire: 'Contrôle réglementaire',
  hygiene_sanitaire: 'Hygiène et sanitaire',
  maintenance_sous_contrat: 'Maintenance sous contrat',
  formation_habilitation: 'Formation et habilitation',
  maintenance_interne: 'Maintenance interne',
  autocontrole: 'Autocontrôle',
  releve_compteurs: 'Relevé de compteurs',
  suivi_administratif: 'Suivi administratif',
  maintenance_preventive: 'Maintenance préventive (ancienne)',
}

/** Ce que recouvre chaque nature (aide sous la liste déroulante). */
export const NATURE_GAMME_DESCRIPTION: Record<NatureGammeSaisie, string> = {
  controle_reglementaire:
    'Vérification imposée par la loi, souvent par un organisme agréé.',
  hygiene_sanitaire: 'Analyses, lutte contre les nuisibles, rejets.',
  maintenance_sous_contrat:
    'Entretien confié à un prestataire extérieur, qui laisse un bon d’intervention.',
  formation_habilitation: 'Formations et habilitations du personnel.',
  maintenance_interne: 'Entretien réalisé par l’équipe.',
  autocontrole: 'Rondes et tests réguliers faits en interne.',
  releve_compteurs: 'Lecture des compteurs.',
  suivi_administratif: 'Échéances administratives (badges…).',
}

/**
 * Natures qui EXIGENT TOUJOURS un document sur l'intervention (132). Miroir de
 * `public.nature_exige_document` : la base reste la référence (vue
 * `v_ot_documents_manquants`), ce miroir ne sert qu'à l'affichage.
 */
export const NATURES_DOCUMENT_EXIGE: ReadonlySet<NatureGamme> = new Set([
  'controle_reglementaire',
  'hygiene_sanitaire',
  'maintenance_sous_contrat',
  'formation_habilitation',
])

export function natureExigeDocument(nature: NatureGamme): boolean {
  return NATURES_DOCUMENT_EXIGE.has(nature)
}

/** Un document est-il attendu sur les interventions de cette gamme ? */
export function documentAttendu(gamme: {
  nature: NatureGamme
  document_requis: boolean
}): boolean {
  return natureExigeDocument(gamme.nature) || gamme.document_requis
}

/** Options de la liste déroulante « Nature » (gamme de site ET Bibliothèque). */
export const NATURE_GAMME_OPTIONS = gammeNatures.map((n) => ({
  value: n,
  label: NATURE_GAMME_LABEL[n],
}))

/** Aide sous la liste « Nature » : ce que recouvre la nature + sa règle de document. */
export function aideNature(nature: NatureGammeSaisie): string {
  const regle = natureExigeDocument(nature)
    ? 'Un document est toujours exigé.'
    : 'Document au choix.'
  return `${NATURE_GAMME_DESCRIPTION[nature]} ${regle}`
}

/**
 * Nature à présenter dans un formulaire : une valeur obsolète (aucune ligne ne
 * devrait plus la porter) retombe sur `maintenance_interne`.
 */
export function natureSaisie(nature: NatureGamme): NatureGammeSaisie {
  return nature === 'maintenance_preventive' ? 'maintenance_interne' : nature
}

const REFERENCE_INVALIDE =
  'Référence invalide : rechargez la page puis réessayez.'
const UUID = z.uuid(REFERENCE_INVALIDE)

/**
 * Identifiant de ligne OBLIGATOIRE, saisi par une liste déroulante.
 *
 * Les colonnes visées sont des UUID : toute autre chaîne part en 22P02
 * (`invalid_text_representation`) côté PostgREST. Le champ reste une `string`
 * (convention du projet : ce que produit un `<select>`), seule sa FORME est
 * contrainte — et le `min(1)` d'abord, pour que le vide dise toujours
 * « obligatoire » plutôt que « mal formé ».
 */
const uuidObligatoire = (manquant: string) =>
  z.string().min(1, manquant).pipe(UUID)

/** Le même identifiant, FACULTATIF : '' = non renseigné (colonne NULL). */
const uuidFacultatif = z
  .string()
  .refine((v) => v === '' || UUID.safeParse(v).success, {
    message: REFERENCE_INVALIDE,
  })

/**
 * `gammes.periodicite_id SMALLINT REFERENCES periodicites(id)` : le formulaire
 * garde le texte du `<select>`, `mutations.ts` le convertit avec `Number()`.
 */
const periodiciteObligatoire = z
  .string()
  .min(1, 'La périodicité est obligatoire')
  .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 32_767, {
    message: 'Périodicité invalide : choisissez-en une dans la liste.',
  })

export const gammeSchema = z.object({
  nom: texteObligatoire('Le nom est obligatoire').max(200),
  nature: z.enum(gammeNatures),
  periodicite_id: periodiciteObligatoire,
  prestataire_id: uuidObligatoire('Le prestataire est obligatoire'),
  // Sous-catégorie de rattachement, OBLIGATOIRE (NOT NULL + trigger côté base) :
  // toute gamme — réelle de site comprise — pointe une sous-catégorie (niveau 2).
  categorie_id: uuidObligatoire('La sous-catégorie est obligatoire'),
  description: z.string().trim().max(2000),
  // Vignette du pool (`gammes.miniature_id`) ou `null` — gamme réelle de site ET
  // template commun ; le trigger backend valide qu'elle est du pool commun ou du
  // site de la gamme.
  miniature_id: z.uuid('Vignette invalide : rechargez la page.').nullable(),
  // Gamme active = génère des OT ; inactive = mise en sommeil. La désactivation
  // est refusée par un trigger s'il reste des OT actifs (erreur à catcher en UI).
  est_active: z.boolean(),
  // 128 : opérations répétées pour CHAQUE équipement lié (repli : une seule fois
  // si aucun équipement). La base synchronise les OT ouverts au basculement.
  repeter_par_equipement: z.boolean(),
  // 132 : document exigé sur chaque intervention. Sans effet pour les natures
  // qui l'exigent toujours (cf. NATURES_DOCUMENT_EXIGE).
  document_requis: z.boolean(),
})

export type GammeFormValues = z.input<typeof gammeSchema>

export const emptyGamme: GammeFormValues = {
  nom: '',
  nature: 'maintenance_interne',
  periodicite_id: '',
  prestataire_id: '',
  categorie_id: '',
  description: '',
  miniature_id: null,
  est_active: true,
  repeter_par_equipement: false,
  document_requis: false,
}

/**
 * Gamme-template de la Bibliothèque : étend le schéma de gamme avec une
 * **catégorie obligatoire** (scope `gamme`/`mixte`, l'arborescence) et une
 * **portée** (commun = `site_id NULL` inviolable, ou un site). Le schéma de
 * gamme de SITE reste inchangé (catégorie absente du flux existant).
 */
export const gammeBiblioSchema = gammeSchema
  .omit({
    est_active: true,
    repeter_par_equipement: true,
    document_requis: true,
  })
  .extend({
    categorie_id: uuidObligatoire('La catégorie est obligatoire'),
    portee: z.enum(['entreprise', 'site']),
    // Un template commun n'a PAS de prestataire (il dépend du site, renseigné
    // après copie) : le champ est facultatif ici (autorise '' → NULL en base),
    // contrairement à la gamme réelle (`gammeSchema`) qui l'exige.
    prestataire_id: uuidFacultatif,
    // `miniature_id` est hérité de `gammeSchema` (vignette du pool, nullable).
  })

export type GammeBiblioFormValues = z.input<typeof gammeBiblioSchema>

export const emptyGammeBiblio: GammeBiblioFormValues = {
  ...emptyGamme,
  categorie_id: '',
  portee: 'entreprise',
  miniature_id: null,
}

/**
 * Notation numérique usuelle. L'exponentielle est admise — `String()` la
 * produit seul pour les très petites valeurs (`String(5e-324)`) — mais ni
 * l'hexadécimal, ni le binaire, ni l'octal, ni l'infini.
 */
const NOMBRE_USUEL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

/**
 * Opérations : seuils saisis en texte (input number) → '' = non renseigné.
 *
 * NE PAS mutualiser avec l'homonyme de `localisations/schemas.ts` (décision
 * D4) : un seuil de mesure est légitimement NÉGATIF — une chambre froide se
 * contrôle entre −25 °C et −18 °C — là où une surface doit être > 0.
 *
 * Seule la FORME est contrainte. `Number.isNaN` seul laissait passer deux
 * pièges : `'Infinity'`, que Postgres ≥ 14 stocke tel quel dans un NUMERIC —
 * un seuil réglementaire qui ne se déclenchera jamais — et `'0x1F'`, que
 * `Number()` lit 31, soit une valeur DIFFÉRENTE de celle qui a été saisie.
 */
const optionalNumber = z
  .string()
  .trim()
  .refine(
    (v) => v === '' || (NOMBRE_USUEL.test(v) && Number.isFinite(Number(v))),
    { message: 'Saisissez un nombre fini (ni infini, ni texte).' },
  )

/** `operations.ordre INTEGER` : 2 147 483 647 au plus. */
const ORDRE_MAX = 2_147_483_647
const ordreOperation = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) <= ORDRE_MAX), {
    message: 'Le rang doit être un entier compris entre 0 et 2 147 483 647.',
  })

export const operationSchema = z
  .object({
    nom: texteObligatoire('Le libellé est obligatoire', 'libelle').max(200),
    ordre: ordreOperation,
    type_operation_id: z.string().min(1, 'Le type est obligatoire'),
    unite_id: z.string(),
    seuil_minimum: optionalNumber,
    seuil_maximum: optionalNumber,
    description: z.string().trim().max(2000),
  })
  .refine(
    (v) =>
      v.seuil_minimum === '' ||
      v.seuil_maximum === '' ||
      Number(v.seuil_minimum) <= Number(v.seuil_maximum),
    {
      message: 'Le seuil min doit être ≤ au seuil max',
      path: ['seuil_maximum'],
    },
  )

export type OperationFormValues = z.input<typeof operationSchema>

export const emptyOperation: OperationFormValues = {
  nom: '',
  ordre: '',
  type_operation_id: '',
  unite_id: '',
  seuil_minimum: '',
  seuil_maximum: '',
  description: '',
}
