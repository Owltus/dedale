import type { ZodError } from 'zod'

/** Map les erreurs Zod par nom de champ (première erreur rencontrée par champ). */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !(key in out)) {
      out[key] = issue.message
    }
  }
  return out
}

/** Message lisible d'une erreur inconnue (ex. erreur Supabase/RLS). */
export function errorMessage(
  e: unknown,
  fallback = 'Une erreur est survenue',
): string {
  return e instanceof Error ? e.message : fallback
}

/** Code SQLSTATE d'une erreur Supabase, si disponible. */
export function pgCode(e: unknown): string | undefined {
  return e !== null &&
    typeof e === 'object' &&
    'code' in e &&
    typeof e.code === 'string'
    ? e.code
    : undefined
}

/**
 * Message clair pour une copie commun → site refusée (RPC `copier_*` :
 * `copier_gamme` ET `copier_categorie`). Traduit les codes Postgres remontés au
 * lieu d’afficher le message technique brut de la RPC ; repli sur `errorMessage`
 * pour le reste. Neutre quant à l’élément copié (catégorie ou gamme).
 * - `42501` : RLS, site cible hors périmètre.
 * - `23505` : élément du même nom déjà présent sur le site cible (copie déjà faite ?).
 * - `P0002` : élément source (catégorie ou gamme) introuvable (supprimé pendant l’opération).
 */
export function exportErrorMessage(e: unknown): string {
  const code = pgCode(e)
  if (code === '42501') {
    return 'Action non autorisée : vous n’avez pas accès à ce site.'
  }
  if (code === '23505') {
    return 'Un élément du même nom existe déjà sur ce site (copie déjà effectuée ?).'
  }
  if (code === 'P0002') {
    return 'L’élément source (catégorie ou gamme) est introuvable ou a été supprimé. Rafraîchis la liste puis réessaie.'
  }
  return errorMessage(e)
}

/**
 * Champ texte refusé parce qu’il ne contient QUE des blancs (contraintes
 * `length(trim(...)) > 0`). Le cas est réel et déroutant : les espaces de
 * largeur nulle collés depuis Word ou un PDF passent le `.trim()` de
 * JavaScript mais pas celui de Postgres. L’utilisateur voit un champ
 * apparemment rempli — d’où l’explication, et pas seulement le refus.
 */
const VIDE_NOM =
  'Ce nom est vide : il ne contient que des espaces ou des caractères invisibles. Saisissez un nom lisible.'
const VIDE_TITRE =
  'Ce titre est vide : il ne contient que des espaces ou des caractères invisibles. Saisissez un titre lisible.'
const VIDE_LIBELLE =
  'Ce libellé est vide : il ne contient que des espaces ou des caractères invisibles. Saisissez un libellé lisible.'
const VIDE_REFERENCE =
  'Cette référence est vide : elle ne contient que des espaces ou des caractères invisibles. Saisissez une référence lisible.'
const VIDE_CONSTAT =
  'Ce constat est vide : il ne contient que des espaces ou des caractères invisibles. Décrivez le problème en quelques mots.'

/** Seuils min/max inversés (opérations et items de modèles d’opérations). */
const SEUILS_INVERSES =
  'Seuils inversés : le seuil minimum doit être inférieur ou égal au seuil maximum. Corrigez l’un des deux.'

/**
 * Messages métier par CONTRAINTE CHECK (nom SQL) : « Valeur refusée : elle ne
 * respecte pas une règle. » ne dit pas QUOI corriger. Postgres nomme la contrainte
 * violée dans son message (« … violates check constraint "dates_coherentes" »),
 * que PostgREST transmet tel quel → on le traduit quand on sait le faire.
 * Les contraintes absentes retombent sur le message générique.
 *
 * La liste couvre les 41 contraintes CHECK atteignables depuis un formulaire,
 * relevées en PRODUCTION le 16/09/2026 (`pg_constraint`, et non
 * `schema_complete.sql` qui avait dérivé) — cf.
 * `plan/correction-findings-martin/contraintes-check-reelles.md` —, plus les
 * contraintes d’ordres de travail déjà traduites. Écrire ici plutôt que dans un
 * écran profite aux 66 points d’appel de `writeErrorMessage` d’un seul coup, y
 * compris aux imports CSV.
 *
 * Les gardes purement structurelles (format d’un chemin d’image, structure du
 * JSONB de caractéristiques, `source_type_valide`…) restent volontairement
 * absentes : une saisie ne peut pas les déclencher, et sur un appel
 * programmatique fautif le message brut de Postgres est plus utile.
 */
const MESSAGES_CONTRAINTE_CHECK: Readonly<Record<string, string>> = {
  // ── Ordres de travail et opérations ───────────────────────────────────────
  dates_coherentes:
    'Dates incohérentes : la clôture serait antérieure au démarrage. Corrigez les dates d’exécution des opérations.',
  statut_terminal_a_date_cloture:
    'Date de clôture manquante : un OT clôturé ou annulé doit être horodaté.',
  motif_annulation_oblig_si_annule: 'Motif d’annulation obligatoire.',
  motif_reouverture_oblig_si_reouvert: 'Motif de réouverture obligatoire.',
  operations_execution_remplacement_coherent:
    'Remplacement incomplet : renseignez l’ancien ET le nouvel index.',
  statut_date_coherents:
    'Date d’exécution incohérente avec le statut de l’opération.',
  opex_commentaires_taille:
    'Commentaire trop long : 5 000 caractères au maximum. Raccourcissez le texte, ou joignez le détail en document.',
  // Migration 118. Posée NOT VALID : les relevés historiques sans valeur
  // survivent, mais toute écriture qui les laisserait en l'état est refusée.
  opex_mesure_terminee_a_valeur:
    'Valeur manquante : une mesure terminée doit porter un relevé. Saisissez la valeur, ou passez l’opération en « Non applicable ».',
  operations_nom_non_vide: VIDE_NOM,
  operations_seuils_coherents: SEUILS_INVERSES,
  modeles_operations_items_nom_non_vide: VIDE_NOM,
  modeles_operations_items_seuils_coherents: SEUILS_INVERSES,

  // ── Caractères invisibles (migration 117) ─────────────────────────────────
  // Les CHECK historiques testent `length(trim(...)) > 0`, or `trim()` ne retire
  // que les blancs ASCII : un espace de largeur nulle ou une marque d'inversion
  // d'écriture passait des deux côtés. Ces contraintes-ci ferment les chemins
  // que le formulaire ne contrôle pas — import CSV, appel direct à l'API.
  sites_nom_visible: VIDE_NOM,
  batiments_nom_visible: VIDE_NOM,
  niveaux_nom_visible: VIDE_NOM,
  locaux_nom_visible: VIDE_NOM,
  categories_nom_visible: VIDE_NOM,
  gammes_nom_visible: VIDE_NOM,
  prestataires_libelle_visible: VIDE_LIBELLE,
  types_locaux_libelle_visible: VIDE_LIBELLE,
  evenements_titre_visible: VIDE_TITRE,
  interventions_travaux_titre_visible: VIDE_TITRE,
  demandes_intervention_constat_visible: VIDE_CONSTAT,

  // ── Lieux : sites, bâtiments, niveaux, locaux ─────────────────────────────
  sites_nom_check: VIDE_NOM,
  batiments_nom_check: VIDE_NOM,
  niveaux_nom_check: VIDE_NOM,
  locaux_nom_check: VIDE_NOM,
  locaux_hauteur_positive:
    'Hauteur sous plafond invalide : saisissez une valeur supérieure à 0, ou laissez le champ vide si elle n’est pas connue.',
  // Contrainte nommée par Postgres : elle refuse aussi 0, que le front accepte.
  locaux_surface_m2_check:
    'Surface invalide : saisissez une valeur supérieure à 0 (0 n’est pas accepté), ou laissez le champ vide si elle n’est pas connue.',
  locaux_capacite_positive:
    'Effectif invalide : saisissez 0 ou plus, ou laissez le champ vide si l’effectif n’est pas connu.',

  // ── Catégories, gammes, équipements ───────────────────────────────────────
  categories_nom_check: VIDE_NOM,
  // Contrainte nommée par Postgres : `parent_id IS NULL OR parent_id <> id`.
  categories_check:
    'Catégorie parente invalide : une catégorie ne peut pas être sa propre parente. Choisissez une autre catégorie parente, ou laissez le champ vide pour une catégorie racine.',
  gammes_nom_non_vide: VIDE_NOM,
  // Contrainte nommée par Postgres : `date_fin_garantie >= date_mise_en_service`.
  equipements_check:
    'Dates incohérentes : la fin de garantie ne peut pas précéder la mise en service. Corrigez l’une des deux dates.',

  // ── Demandes d’intervention, événements, travaux ──────────────────────────
  demandes_intervention_constat_check: VIDE_CONSTAT,
  di_constat_taille:
    'Constat trop long : 5 000 caractères au maximum. Raccourcissez le texte, ou joignez le détail en document.',
  evenements_titre_check: VIDE_TITRE,
  evenements_dates_coherentes:
    'Dates incohérentes : la clôture ne peut pas précéder la date de l’événement. Corrigez l’une des deux dates.',
  interventions_travaux_titre_check: VIDE_TITRE,

  // ── Investissements ───────────────────────────────────────────────────────
  investissements_libelle_check: VIDE_LIBELLE,
  // Migration 121. Le dialogue de motif rend ce refus improbable depuis l'écran,
  // mais tout chemin qui l'évite (import, correction en masse) doit lire une
  // phrase utile plutôt que « Valeur refusée : elle ne respecte pas une règle ».
  capex_motif_arret_oblig_si_refuse_ou_annule:
    'Motif obligatoire : un investissement refusé ou annulé doit dire pourquoi.',
  investissements_dates_coherentes:
    'Dates incohérentes : la clôture ne peut pas précéder la date de demande. Corrigez l’une des deux dates.',
  investissements_montant_demande_check:
    'Montant demandé invalide : saisissez 0 ou plus, ou laissez le champ vide s’il n’est pas encore chiffré.',
  investissements_montant_prevu_check:
    'Montant prévu invalide : saisissez 0 ou plus, ou laissez le champ vide s’il n’est pas encore chiffré.',
  investissements_depense_reelle_check:
    'Dépense réelle invalide : saisissez 0 ou plus, ou laissez le champ vide tant que la dépense n’est pas connue.',

  // ── Contrats ──────────────────────────────────────────────────────────────
  contrats_reference_non_vide: VIDE_REFERENCE,
  contrats_date_fin_apres_debut:
    'Dates incohérentes : la fin du contrat ne peut pas précéder son début. Corrigez l’une des deux dates.',
  contrats_date_signature_avant_debut:
    'Dates incohérentes : la signature ne peut pas être postérieure au début du contrat. Corrigez l’une des deux dates.',
  contrats_date_resiliation_apres_debut:
    'Dates incohérentes : la résiliation ne peut pas précéder le début du contrat. Corrigez l’une des deux dates.',
  contrats_date_notification_avant_resiliation:
    'Dates incohérentes : la notification doit précéder la résiliation, ou tomber le même jour. Corrigez l’une des deux dates.',
  contrats_cycle_positif:
    'Durée de cycle invalide : saisissez au moins 1 mois, ou laissez le champ vide si le contrat n’est pas reconductible.',
  contrats_fenetre_positive:
    'Fenêtre de résiliation invalide : saisissez au moins 1 jour, ou laissez le champ vide si le contrat n’en prévoit pas.',
  contrats_preavis_positif:
    'Préavis invalide : saisissez 0 jour ou plus, jamais une valeur négative.',

  // ── Prestataires ──────────────────────────────────────────────────────────
  prestataires_libelle_non_vide: VIDE_LIBELLE,
  prestataires_email_format:
    'Adresse e-mail invalide : elle doit ressembler à nom@domaine.fr, sans espace. Corrigez-la, ou laissez le champ vide.',
  prestataires_siret_format:
    'SIRET invalide : saisissez les 14 chiffres, sans espace ni séparateur, ou laissez le champ vide.',
  prestataires_code_postal_format:
    'Code postal invalide : saisissez 5 chiffres (par exemple 75001), ou laissez le champ vide.',
  prestataires_commentaires_taille:
    'Commentaire trop long : 5 000 caractères au maximum. Raccourcissez le texte.',
}

/**
 * Nom de la contrainte CHECK violée, extrait du message Postgres (23514).
 * `PostgrestError` étend `Error`, mais on lit aussi la propriété `message` d’un
 * objet brut (erreur sérialisée / test) — même souplesse que `pgCode`.
 */
function checkConstraintName(e: unknown): string | undefined {
  const message =
    e !== null &&
    typeof e === 'object' &&
    'message' in e &&
    typeof e.message === 'string'
      ? e.message
      : errorMessage(e, '')
  return /violates check constraint "([^"]+)"/.exec(message)?.[1]
}

/**
 * Libellés contextuels par code SQLSTATE (ou code PostgREST), pour affiner les
 * messages génériques de `writeErrorMessage` / `deleteErrorMessage` — ex.
 * `{ '23505': 'Une catégorie portant ce nom existe déjà à cet emplacement.' }`.
 * Les codes absents retombent sur les messages génériques.
 */
export type SqlstateOverrides = Readonly<Record<string, string>>

/**
 * Message clair pour une SUPPRESSION refusée : traduit les codes Postgres/PostgREST
 * au lieu du message technique brut. À utiliser dans les `onError` des suppressions.
 * - `42501` (RLS) / `PGRST116` (0 ligne touchée) : hors périmètre, ou déjà supprimé.
 * - `23503` : encore référencé par une FK RESTRICT → dissocier d’abord.
 * - `restrict_violation` (23001) : le message FR de la base est déjà explicite → tel quel.
 *
 * `overrides` (optionnel) : libellés CONTEXTUELS par code, prioritaires sur les
 * génériques ci-dessus (cf. `SqlstateOverrides`).
 */
export function deleteErrorMessage(
  e: unknown,
  overrides?: SqlstateOverrides,
): string {
  const code = pgCode(e)
  const override = code !== undefined ? overrides?.[code] : undefined
  if (override !== undefined) return override
  if (code === '42501' || code === 'PGRST116') {
    return 'Action impossible : élément hors de votre périmètre, ou déjà supprimé.'
  }
  if (code === '23503') {
    return 'Cet élément est encore lié à d’autres données : dissociez-les d’abord.'
  }
  return errorMessage(e)
}

/**
 * Message clair pour une ÉCRITURE refusée (INSERT/UPDATE) : traduit les codes
 * Postgres/PostgREST courants au lieu du message technique brut. À utiliser dans
 * les `onError` de création/édition/changement de statut.
 * - `42501` (RLS) / `PGRST116` (0 ligne touchée) : hors périmètre, ou déjà modifié.
 * - `22003` : dépassement de capacité d’un montant (numeric overflow).
 * - `22001` : texte plus long que la colonne ne l’accepte (troncature refusée).
 * - `22P02` : valeur mal formée envoyée à la base — typiquement un identifiant
 *   qui n’est pas un UUID (lien périmé, import CSV, référence copiée à la main).
 * - `23502` : colonne obligatoire laissée vide (NOT NULL).
 * - `23514` (CHECK) : message métier si la contrainte violée est connue
 *   (cf. `MESSAGES_CONTRAINTE_CHECK`), sinon « valeur refusée par une règle ».
 * - `23505` : doublon (contrainte d’unicité).
 * - `23503` : référence FK manquante / supprimée.
 *
 * `overrides` (optionnel) : libellés CONTEXTUELS par code, prioritaires sur les
 * génériques ci-dessus (cf. `SqlstateOverrides`) — remplace les petits
 * traducteurs locaux dupliqués dans les features.
 */
export function writeErrorMessage(
  e: unknown,
  overrides?: SqlstateOverrides,
): string {
  const code = pgCode(e)
  const override = code !== undefined ? overrides?.[code] : undefined
  if (override !== undefined) return override
  if (code === '42501' || code === 'PGRST116') {
    return 'Action impossible : élément hors de votre périmètre, ou déjà modifié.'
  }
  if (code === '22003') return 'Montant trop élevé : réduisez la valeur.'
  if (code === '22001') {
    return 'Texte trop long : il dépasse la longueur autorisée pour ce champ. Raccourcissez-le.'
  }
  if (code === '22P02') {
    return 'Donnée mal formée : une valeur ou un identifiant n’a pas le format attendu. Rafraîchissez la page puis réessayez, ou vérifiez les valeurs saisies.'
  }
  if (code === '23502') {
    return 'Champ obligatoire vide : renseignez tous les champs requis avant d’enregistrer.'
  }
  if (code === '23514') {
    const contrainte = checkConstraintName(e)
    return (
      (contrainte !== undefined
        ? MESSAGES_CONTRAINTE_CHECK[contrainte]
        : undefined) ?? 'Valeur refusée : elle ne respecte pas une règle.'
    )
  }
  if (code === '23505') return 'Un élément identique existe déjà.'
  if (code === '23503') {
    return 'Référence manquante : un élément lié est introuvable.'
  }
  return errorMessage(e)
}
