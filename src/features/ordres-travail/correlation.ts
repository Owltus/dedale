/**
 * Corrélation des exécutions d'une même opération récurrente, d'un OT à l'autre.
 * Mise en œuvre de l'ADR 0012 (docs/decisions).
 *
 * Deux clés, dans cet ordre et jamais dans l'autre :
 *
 *   1. `(source_type, source_id)` — la provenance. C'est la clé de référence :
 *      elle survit au RENOMMAGE de l'opération, qui est le geste courant.
 *   2. `(gamme_id, nom normalisé)` — le repli, utilisé UNIQUEMENT quand la
 *      première ne rattache rien. Il survit à la SUPPRESSION de l'opération
 *      d'origine, que la base autorise explicitement (aucune clé étrangère sur
 *      `source_id`, cf. ADR 0010).
 *
 * Les deux échouent sur des événements disjoints, et — mesuré sur la production
 * le 17/09/2026 — aucune ne confond jamais deux séries distinctes : zéro nom
 * partagé par deux opérations d'une même gamme. Le repli ne sait que retrouver,
 * jamais fusionner à tort.
 *
 * Pourquoi le déclencheur est « ne rattache rien » et non « ne résout pas » : le
 * front ne lit jamais la table `operations`, il ne peut donc pas savoir si la
 * source existe encore. Il n'en a pas besoin. Deux exécutions qui partagent un
 * `source_id` mort se recollent très bien l'une à l'autre — c'est le cas des
 * quatre « Piège à insectes » en production, qui n'atteignent jamais le repli.
 * Ce qui casse le chaînage, ce n'est pas un identifiant mort : c'est un
 * identifiant UNIQUE à sa ligne (53 exécutions, séquelle de l'import 061 que la
 * migration 063 n'a pas pu repointer, la cible étant déjà supprimée).
 */

/**
 * Normalisation du nom d'opération, pour comparaison seulement.
 *
 * CONTRAT FIGÉ — minuscules, bords rognés, espaces internes réduits à un, et
 * RIEN DE PLUS. En particulier pas de repli d'accents : il n'apporte rien
 * (mesuré : zéro collision sans lui) et augmenterait le risque de confondre deux
 * séries distinctes.
 *
 * Élargir cette normalisation redécouperait SILENCIEUSEMENT des séries
 * existantes — un historique se scinderait ou deux se fondraient, sans erreur ni
 * trace. Le test qui l'accompagne est là pour rendre un tel changement bruyant.
 */
export function normaliserNomOperation(nom: string): string {
  return nom.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Ce qu'il faut d'une exécution pour la corréler. */
export interface OperationCorrelable {
  source_type: string | number
  source_id: string | null
  nom: string
}

/** Clé de référence : la provenance. `null` si l'exécution n'en porte pas. */
export function cleProvenance(op: OperationCorrelable): string | null {
  return op.source_id === null
    ? null
    : `${String(op.source_type)}:${op.source_id}`
}

/**
 * Clé de repli : gamme + nom normalisé. `null` si la gamme est inconnue — sans
 * elle, deux opérations homonymes de gammes différentes se confondraient.
 */
export function cleNom(
  gammeId: string | null,
  op: OperationCorrelable,
): string | null {
  return gammeId === null
    ? null
    : `${gammeId}|${normaliserNomOperation(op.nom)}`
}

/**
 * Les deux index d'un ensemble d'exécutions antérieures, prêts à être
 * interrogés dans l'ordre par {@link valeurPrecedente}.
 */
export interface IndexPrecedents {
  parProvenance: Record<string, number>
  parNom: Record<string, number>
}

/**
 * Valeur du relevé précédent : la provenance d'abord, le nom seulement si elle
 * ne rattache rien. C'est LE point de l'ADR 0012 — inverser l'ordre coûterait
 * les huit séries dont l'opération a été renommée en cours de route.
 */
export function valeurPrecedente(
  index: IndexPrecedents | undefined,
  gammeId: string | null,
  op: OperationCorrelable,
): number | null {
  if (index === undefined) return null

  // Le test porte sur `undefined` (entrée absente) et NON sur la valeur : un
  // compteur neuf relevé à 0 a bel et bien un précédent, qu'un `??` avalerait.
  //
  // Les deux gardes `!== null` ci-dessous survivent au mutation testing, et c'est
  // ATTENDU : les neutraliser ferait chercher la clé « null », qui n'existe dans
  // aucun des deux index — même résultat. Mutants équivalents, pas trous de test.
  // Les « tuer » demanderait d'éprouver un état impossible ; ne pas s'y employer.
  const parProvenance = cleProvenance(op)
  if (parProvenance !== null) {
    const trouve = index.parProvenance[parProvenance]
    if (trouve !== undefined) return trouve
  }

  const parNom = cleNom(gammeId, op)
  if (parNom !== null) {
    const trouve = index.parNom[parNom]
    if (trouve !== undefined) return trouve
  }

  return null
}

/**
 * Message à afficher quand aucun relevé précédent n'a été trouvé — ou `null`
 * quand il n'y a rien à expliquer.
 *
 * Troisième temps de l'ADR 0012. Un tiret seul est ambigu : il dit aussi bien
 * « c'est la première mesure de ce compteur » (normal, rien à signaler) que
 * « l'historique existait et n'est plus rattachable » (anormal, et invisible).
 * Ces deux cas se distinguent par une question et une seule : le `source_id`
 * de l'exécution désigne-t-il encore une opération vivante de la gamme ?
 *
 * On n'affirme donc la cause que lorsqu'on l'a CONSTATÉE. Tant que la liste des
 * opérations n'est pas chargée (`idsOperationsGamme === undefined`), on se tait
 * plutôt que de deviner.
 */
export function messageHistoriqueIntrouvable(
  op: OperationCorrelable,
  idsOperationsGamme: ReadonlySet<string> | undefined,
): string | null {
  if (idsOperationsGamme === undefined) return null
  if (op.source_id === null) return null
  if (idsOperationsGamme.has(op.source_id)) return null

  return "Historique indisponible : l'opération d'origine a été supprimée du modèle."
}
