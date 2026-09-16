import { describe, expect, it } from 'vitest'
import type { ZodType } from 'zod'
import instantaneBrut from './contraintes-sql.json?raw'
import schemaVersionne from '../../schema_complete.sql?raw'
import { siteSchema } from '@/features/sites/schemas'
import {
  batimentSchema,
  localSchema,
  niveauSchema,
} from '@/features/localisations/schemas'
import { categorieSchema } from '@/features/categories/schemas'
import { modeleEquipementSchema } from '@/features/modeles-equipements/schemas'
import {
  modeleOperationSchema,
  operationItemSchema,
} from '@/features/modeles-operations/schemas'
import { gammeSchema, operationSchema } from '@/features/gammes/schemas'
import { diEditSchema, diSchema } from '@/features/demandes/schemas'
import { evenementSchema } from '@/features/evenements/schemas'
import { travauxSchema } from '@/features/travaux/schemas'
import { investissementSchema } from '@/features/investissements/schemas'
import {
  contratSchema,
  prestataireSchema,
} from '@/features/prestataires/schemas'
import { modeleDiSchema } from '@/features/modeles-di/schemas'
import {
  creerCompteSchema,
  profileSchema,
} from '@/features/utilisateurs/schemas'
import { tacheSchema } from '@/features/equipements/tache-schema'

/**
 * CONCORDANCE FRONT / BASE — le test qui empêche la récidive.
 *
 * Deux familles de défauts ont représenté la moitié d'un audit : « la validation
 * front ne connaît pas la contrainte de la base » et « le schéma versionné a
 * dérivé de la production ». Les corriger un par un garantissait leur retour au
 * prochain écran — `evenements` et `investissements` AVAIENT un `schemas.test.ts`
 * et portaient quand même une divergence chacun, parce que ces tests recopiaient
 * l'oracle à la main depuis `schema_complete.sql`. La couverture ne protège pas
 * d'une spécification fausse.
 *
 * ── La source ───────────────────────────────────────────────────────────────
 *
 * L'oracle N'EST PAS écrit à la main ici, et n'est PAS lu dans
 * `schema_complete.sql`. Il vient de `src/lib/contraintes-sql.json`, INSTANTANÉ
 * de `information_schema` + `pg_constraint` lu sur la PRODUCTION et régénéré par
 * `npm run contraintes:instantane`. `npm run contraintes:verifier` relit la
 * production et échoue si l'instantané a dérivé — c'est le contrôle EN LIGNE,
 * volontairement hors de `npm run verify`, qui doit rester déterministe.
 *
 * ── La méthode ──────────────────────────────────────────────────────────────
 *
 * On n'introspecte PAS les schémas Zod (leur structure interne est un détail
 * d'implémentation, et le front doit rester écrit à la main, lisible, en
 * français). On les SONDE : de chaque contrainte SQL on dérive mécaniquement une
 * valeur que la BASE refuserait, on l'injecte dans un objet par ailleurs valide,
 * et on exige que le schéma Zod la refuse AUSSI. Un schéma plus permissif que sa
 * colonne devient rouge, en nommant le champ, la colonne et la borne attendue.
 *
 * ── CE QUI EST COUVERT ──────────────────────────────────────────────────────
 *
 *   1. `CHECK (length(trim(col)) > 0)`      → le vide et le blanc sont refusés
 *   2. `CHECK (length(col) <= N)`           → N+1 caractères sont refusés
 *   3. `CHECK (length(col) = N)`            → N+1 caractères sont refusés
 *   4. `CHECK (col > v)` / `>= v`           → la borne est refusée
 *   5. `CHECK (col ~ 'regexp')`             → les valeurs que la regexp rejette
 *   6. `CHECK (col = ANY (ARRAY[…]))`       → une valeur hors liste est refusée
 *   7. `NUMERIC(p,s)`                       → 10^(p−s) déborde (22003)
 *   8. `SMALLINT` / `INTEGER`               → hors intervalle (22003)
 *
 * ── CE QUI N'EST PAS COUVERT (et pourquoi) ──────────────────────────────────
 *
 *   - Les CHECK INTER-COLONNES (`evenements_dates_coherentes`,
 *     `operations_seuils_coherents`, `statut_date_coherents`…) : une sonde de
 *     champ ISOLÉ ne peut pas les exprimer. Ils sont déclarés un par un dans
 *     `CHECKS_NON_SONDES` avec leur raison, et leur miroir front reste couvert
 *     par les `schemas.test.ts` de chaque feature.
 *   - Les CHECK STRUCTURELS (structure d'un JSONB, format d'un chemin d'image,
 *     liste blanche de MIME) : ils ne tombent que sur un appel programmatique
 *     fautif, jamais sur une saisie.
 *   - Le `NOT NULL` : une colonne peut légitimement être laissée au défaut
 *     serveur par un formulaire qui ne la saisit pas.
 *   - Les BORNES PUREMENT FRONT. Aucune colonne texte du schéma n'est un
 *     `VARCHAR(n)` : elles sont toutes en `TEXT`. Les `.max(200)` des schémas Zod
 *     sont donc une POLITIQUE D'INTERFACE, pas un miroir de la base — ce test ne
 *     les vérifie pas et ne peut pas le faire.
 *   - L'unicité, les clés étrangères, la RLS, les triggers et les machines à
 *     états : ils répondent par une ERREUR à catcher, pas par une borne.
 *   - Les schémas Zod DÉCLARÉS EN LIGNE dans un `.tsx` : ils ne sont pas
 *     exportés, donc pas sondables (cf. `docs/conventions/donnees.md`).
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. L'instantané
// ─────────────────────────────────────────────────────────────────────────────

interface ColonneSql {
  type: string
  nullable: boolean
  longueurMax: number | null
  precision: number | null
  echelle: number | null
  aUnDefaut: boolean
}

interface TableSql {
  colonnes: Record<string, ColonneSql>
  checks: Record<string, string>
}

interface Instantane {
  tables: Record<string, TableSql>
}

const INSTANTANE = JSON.parse(instantaneBrut) as Instantane

function tableSql(nom: string): TableSql {
  const t = INSTANTANE.tables[nom]
  if (t === undefined) {
    throw new Error(
      `Table « ${nom} » absente de l'instantané. Relancez \`npm run contraintes:instantane\`.`,
    )
  }
  return t
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Traduction mécanique d'une contrainte CHECK en sondes
// ─────────────────────────────────────────────────────────────────────────────

/** Ce qu'une contrainte impose à UNE colonne, sous forme exploitable. */
type Regle =
  | { genre: 'texte-non-vide' }
  | { genre: 'longueur-max'; longueur: number }
  | { genre: 'longueur-exacte'; longueur: number }
  | { genre: 'borne'; operateur: '>' | '>=' | '<' | '<='; valeur: number }
  | { genre: 'format'; motif: string; toleranteAuVide: boolean }
  | { genre: 'enumeration'; valeurs: string[] }

interface CheckTraduit {
  colonne: string
  regle: Regle
}

/** Nom de colonne, éventuellement entre guillemets dans la définition. */
const COL = String.raw`"?([a-z_][a-z0-9_]*)"?`

/**
 * Traduit la définition textuelle d'une contrainte CHECK en règle de colonne.
 *
 * Renvoie `null` dès que la forme n'est pas reconnue : on préfère ne rien dire
 * plutôt que d'inventer une borne. Les non-traduites sont ensuite comptées par
 * le test de couverture, qui exige qu'elles soient déclarées à la main.
 */
export function traduireCheck(definition: string): CheckTraduit | null {
  const d = definition.replace(/\s+/g, ' ').trim()

  // `CHECK ((length(TRIM(BOTH FROM nom)) > 0))`
  const nonVide = new RegExp(
    `^CHECK \\(\\(length\\(TRIM\\(BOTH FROM ${COL}\\)\\) > 0\\)\\)$`,
    'i',
  ).exec(d)
  if (nonVide?.[1] !== undefined) {
    return { colonne: nonVide[1], regle: { genre: 'texte-non-vide' } }
  }

  // `CHECK ((length(constat) <= 5000))` et sa variante `col IS NULL OR …`
  const longueur = new RegExp(
    `^CHECK \\(\\((?:\\(${COL} IS NULL\\) OR \\()?length\\(${COL}\\) (<=|=) (\\d+)\\)?\\)\\)$`,
    'i',
  ).exec(d)
  if (longueur !== null) {
    const colonne = longueur[2]
    const n = Number(longueur[4])
    // La variante gardée par `IS NULL` doit nommer la MÊME colonne des deux
    // côtés, sinon la contrainte parle de deux colonnes et nous échappe.
    if (
      colonne !== undefined &&
      (longueur[1] === undefined || longueur[1] === colonne) &&
      Number.isFinite(n)
    ) {
      return {
        colonne,
        regle:
          longueur[3] === '='
            ? { genre: 'longueur-exacte', longueur: n }
            : { genre: 'longueur-max', longueur: n },
      }
    }
  }

  // `CHECK (((surface_m2 IS NULL) OR (surface_m2 > (0)::numeric)))`
  // `CHECK ((delai_preavis_jours >= 0))`
  const borne = new RegExp(
    `^CHECK \\(\\((?:\\(${COL} IS NULL\\) OR \\()?${COL} (>|>=|<|<=) \\(?(-?[0-9]+(?:\\.[0-9]+)?)\\)?(?:::[a-z ]+)?\\)?\\)\\)$`,
    'i',
  ).exec(d)
  if (borne !== null) {
    const colonne = borne[2]
    const operateur = borne[3]
    const valeur = Number(borne[4])
    if (
      colonne !== undefined &&
      (borne[1] === undefined || borne[1] === colonne) &&
      (operateur === '>' ||
        operateur === '>=' ||
        operateur === '<' ||
        operateur === '<=') &&
      Number.isFinite(valeur)
    ) {
      return { colonne, regle: { genre: 'borne', operateur, valeur } }
    }
  }

  // `CHECK (((email IS NULL) OR (email ~ '…'::text)))`
  const format = new RegExp(
    `^CHECK \\(\\((?:\\(${COL} IS NULL\\) OR \\()?${COL} ~ '(.*)'::text\\)?\\)\\)$`,
    'i',
  ).exec(d)
  if (format !== null) {
    const colonne = format[2]
    const motif = format[3]
    if (
      colonne !== undefined &&
      motif !== undefined &&
      (format[1] === undefined || format[1] === colonne)
    ) {
      return {
        colonne,
        // Une contrainte gardée par `IS NULL` dit explicitement que l'absence de
        // valeur est permise : le front a le droit de traduire « non renseigné »
        // par `''`. Sonder le vide produirait un faux positif.
        regle: {
          genre: 'format',
          motif,
          toleranteAuVide: format[1] !== undefined,
        },
      }
    }
  }

  // `CHECK ((statut = ANY (ARRAY['en_attente'::text, …])))`
  const enumeration = new RegExp(
    `^CHECK \\(\\(${COL} = ANY \\(ARRAY\\[(.*)\\]\\)\\)\\)$`,
    'i',
  ).exec(d)
  if (enumeration?.[1] !== undefined && enumeration[2] !== undefined) {
    const valeurs = enumeration[2]
      .split(',')
      .map((v) => /^\s*'(.*)'(?:::[a-z ]+)?\s*$/.exec(v)?.[1])
      .filter((v): v is string => v !== undefined)
    if (valeurs.length > 0) {
      return {
        colonne: enumeration[1],
        regle: { genre: 'enumeration', valeurs },
      }
    }
  }

  return null
}

/**
 * Traduit une expression rationnelle POSIX (Postgres) en `RegExp` JavaScript.
 *
 * Seule différence rencontrée dans ce schéma : les classes POSIX nommées
 * (`[:space:]`, `[:digit:]`…), que JavaScript ne connaît pas. Toute autre
 * particularité renvoie `null` plutôt qu'une traduction approximative — une
 * sonde fondée sur une regexp mal traduite accuserait le front à tort.
 */
export function regexpPostgres(motif: string): RegExp | null {
  const classes: Record<string, string> = {
    '[:space:]': String.raw`\s`,
    '[:digit:]': String.raw`\d`,
    '[:alpha:]': 'A-Za-z',
    '[:alnum:]': 'A-Za-z0-9',
  }
  let js = motif
  for (const [posix, equivalent] of Object.entries(classes)) {
    js = js.split(posix).join(equivalent)
  }
  if (js.includes('[:')) return null
  try {
    return new RegExp(js)
  } catch {
    return null
  }
}

/**
 * Candidats soumis aux contraintes de FORMAT. On ne garde que ceux que la
 * regexp SQL rejette : l'oracle est donc la contrainte elle-même, jamais une
 * liste écrite à la main.
 */
const CANDIDATS_FORMAT = [
  '',
  ' ',
  'a',
  'abc',
  'ABC',
  '0',
  '1234',
  '123456',
  '1234567890123',
  '123456789012345',
  'a@b',
  'a b',
  '@',
  'nom@domaine',
  'nom @domaine.fr',
  'nom@domaine .fr',
  '00 00',
  '+',
  '-1',
  '../avatar.webp',
  'users/avatar.webp',
  'A'.repeat(600),
] as const

// ─────────────────────────────────────────────────────────────────────────────
// 3. Sondes dérivées des règles et du type de colonne
// ─────────────────────────────────────────────────────────────────────────────

/** Comment le formulaire exprime la valeur de ce champ. */
type Forme =
  /** Une chaîne de texte. */
  | 'texte'
  /** Une chaîne qui PORTE un nombre (champ de saisie converti à l'écriture). */
  | 'texteNombre'
  /** Un vrai `number` (NumberField). */
  | 'nombre'

interface Sonde {
  /** Ce que la BASE refuserait, en français, pour le message d'échec. */
  refusePar: string
  valeur: unknown
}

/** Bornes des types entiers de Postgres. */
const ENTIERS: Record<string, { min: number; max: number }> = {
  smallint: { min: -32_768, max: 32_767 },
  integer: { min: -2_147_483_648, max: 2_147_483_647 },
}

/** Exprime un nombre dans la forme attendue par le champ. */
function selonForme(n: number, forme: Forme): unknown {
  return forme === 'nombre' ? n : String(n)
}

/** Sondes dérivées du TYPE de la colonne (indépendantes des CHECK). */
function sondesDuType(colonne: ColonneSql, forme: Forme): Sonde[] {
  if (forme === 'texte') return []
  const sondes: Sonde[] = []

  if (
    colonne.type === 'numeric' &&
    colonne.precision !== null &&
    colonne.echelle !== null
  ) {
    // NUMERIC(p,s) accepte au plus 10^(p−s) − 10^(−s). L'ÉCHELLE excédentaire
    // est arrondie en silence par Postgres : seule la PRÉCISION déborde (22003).
    const depassement = 10 ** (colonne.precision - colonne.echelle)
    sondes.push({
      refusePar: `NUMERIC(${String(colonne.precision)},${String(colonne.echelle)}) — débordement 22003`,
      valeur: selonForme(depassement, forme),
    })
  }

  const entier = ENTIERS[colonne.type]
  if (entier !== undefined) {
    sondes.push({
      refusePar: `${colonne.type.toUpperCase()} — au-delà de ${String(entier.max)}`,
      valeur: selonForme(entier.max + 1, forme),
    })
    sondes.push({
      refusePar: `${colonne.type.toUpperCase()} — en deçà de ${String(entier.min)}`,
      valeur: selonForme(entier.min - 1, forme),
    })
  }

  return sondes
}

/** Sondes dérivées d'une règle CHECK. */
function sondesDeRegle(
  regle: Regle,
  colonne: ColonneSql,
  forme: Forme,
): Sonde[] {
  switch (regle.genre) {
    case 'texte-non-vide':
      if (forme !== 'texte') return []
      return [
        { refusePar: 'length(trim(col)) > 0 — texte vide', valeur: '' },
        { refusePar: 'length(trim(col)) > 0 — que des espaces', valeur: '   ' },
      ]

    case 'longueur-max':
    case 'longueur-exacte':
      if (forme !== 'texte') return []
      return [
        {
          refusePar: `length(col) ${regle.genre === 'longueur-exacte' ? '=' : '<='} ${String(regle.longueur)} — ${String(regle.longueur + 1)} caractères`,
          valeur: 'A'.repeat(regle.longueur + 1),
        },
      ]

    case 'borne': {
      if (forme === 'texte') return []
      // Une borne STRICTE (`> v`) refuse `v` lui-même ; une borne large (`>= v`)
      // ne refuse que ce qui la dépasse. Le pas vaut 10^(−échelle) pour un
      // NUMERIC (la plus petite valeur représentable), 1 pour un entier.
      const pas =
        colonne.type === 'numeric' && colonne.echelle !== null
          ? 10 ** -colonne.echelle
          : 1
      const dessous = regle.operateur.startsWith('>')
      const sondes: Sonde[] = []
      if (regle.operateur === '>' || regle.operateur === '<') {
        sondes.push({
          refusePar: `CHECK (col ${regle.operateur} ${String(regle.valeur)}) — la borne elle-même`,
          valeur: selonForme(regle.valeur, forme),
        })
      }
      sondes.push({
        refusePar: `CHECK (col ${regle.operateur} ${String(regle.valeur)}) — au-delà de la borne`,
        valeur: selonForme(
          dessous ? regle.valeur - pas : regle.valeur + pas,
          forme,
        ),
      })
      return sondes
    }

    case 'format': {
      if (forme !== 'texte') return []
      const re = regexpPostgres(regle.motif)
      if (re === null) return []
      return CANDIDATS_FORMAT.filter(
        (c) => !re.test(c) && !(regle.toleranteAuVide && c === ''),
      ).map((c) => ({
        refusePar: `CHECK (col ~ '${regle.motif}')`,
        valeur: c,
      }))
    }

    case 'enumeration': {
      if (forme !== 'texte') return []
      const horsListe = 'valeur_hors_liste'
      if (regle.valeurs.includes(horsListe)) return []
      return [
        {
          refusePar: `CHECK (col = ANY (ARRAY[${regle.valeurs.map((v) => `'${v}'`).join(', ')}]))`,
          valeur: horsListe,
        },
      ]
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. La carte : quel schéma Zod écrit quelle colonne
// ─────────────────────────────────────────────────────────────────────────────

interface Concordance {
  /** Nom du schéma, tel qu'il se lit dans le code — pour le message d'échec. */
  nom: string
  schema: ZodType
  table: string
  /** Objet VALIDE : sans lui, chaque sonde « réussirait » pour la mauvaise raison. */
  base: Record<string, unknown>
  /** Champ du formulaire → colonne de la table, avec sa forme de saisie. */
  champs: Record<string, { colonne: string; forme: Forme }>
}

const T = (colonne: string) => ({ colonne, forme: 'texte' as const })
const TN = (colonne: string) => ({ colonne, forme: 'texteNombre' as const })
const N = (colonne: string) => ({ colonne, forme: 'nombre' as const })

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

const CONCORDANCES: Concordance[] = [
  {
    nom: 'siteSchema',
    schema: siteSchema,
    table: 'sites',
    base: { nom: 'Siège', adresse: '', code_postal: '', ville: '' },
    champs: { nom: T('nom'), adresse: T('adresse'), ville: T('ville') },
  },
  {
    nom: 'batimentSchema',
    schema: batimentSchema,
    table: 'batiments',
    base: { nom: 'Tour A', description: '', miniature_id: null },
    champs: { nom: T('nom'), description: T('description') },
  },
  {
    nom: 'niveauSchema',
    schema: niveauSchema,
    table: 'niveaux',
    base: { nom: 'RDC', description: '', ordre: '0', miniature_id: null },
    champs: {
      nom: T('nom'),
      description: T('description'),
      ordre: TN('ordre'),
    },
  },
  {
    nom: 'localSchema',
    schema: localSchema,
    table: 'locaux',
    base: {
      nom: 'Hall',
      description: '',
      surface_m2: '',
      type_local_id: '',
      miniature_id: null,
      chauffe_climatise: false,
      hauteur_m: '',
      capacite_personnes: '',
      accessible_pmr: false,
    },
    champs: {
      nom: T('nom'),
      description: T('description'),
      surface_m2: TN('surface_m2'),
      hauteur_m: TN('hauteur_m'),
      capacite_personnes: TN('capacite_personnes'),
      type_local_id: TN('type_local_id'),
    },
  },
  {
    nom: 'categorieSchema',
    schema: categorieSchema,
    table: 'categories',
    base: {
      nom: 'Incendie',
      scope: 'equipement',
      description: '',
      parent_id: '',
      portee: 'entreprise',
      etat: 'actif',
      miniature_id: null,
    },
    champs: { nom: T('nom'), description: T('description') },
  },
  {
    nom: 'modeleEquipementSchema',
    schema: modeleEquipementSchema,
    table: 'modeles_equipements',
    base: {
      nom: 'Extincteur CO2',
      description: '',
      categorie_id: UUID_A,
      portee: 'entreprise',
      etat: 'actif',
      miniature_id: null,
      specifications: [],
    },
    champs: { nom: T('nom'), description: T('description') },
  },
  {
    nom: 'modeleOperationSchema',
    schema: modeleOperationSchema,
    table: 'modeles_operations',
    base: {
      nom: 'Vérification annuelle',
      description: '',
      categorie_id: UUID_A,
      miniature_id: null,
      portee: 'entreprise',
    },
    champs: { nom: T('nom'), description: T('description') },
  },
  {
    nom: 'operationItemSchema',
    schema: operationItemSchema,
    table: 'modeles_operations_items',
    base: {
      nom: 'Contrôle visuel',
      ordre: '1',
      type_operation_id: '1',
      unite_id: '',
      seuil_minimum: '',
      seuil_maximum: '',
      description: '',
    },
    champs: {
      nom: T('nom'),
      description: T('description'),
      ordre: TN('ordre'),
      seuil_minimum: TN('seuil_minimum'),
      seuil_maximum: TN('seuil_maximum'),
    },
  },
  {
    nom: 'operationSchema',
    schema: operationSchema,
    table: 'operations',
    base: {
      nom: 'Contrôle visuel',
      ordre: '1',
      type_operation_id: '1',
      unite_id: '',
      seuil_minimum: '',
      seuil_maximum: '',
      description: '',
    },
    champs: {
      nom: T('nom'),
      description: T('description'),
      ordre: TN('ordre'),
      seuil_minimum: TN('seuil_minimum'),
      seuil_maximum: TN('seuil_maximum'),
    },
  },
  {
    nom: 'gammeSchema',
    schema: gammeSchema,
    table: 'gammes',
    base: {
      nom: 'Vérification extincteurs',
      nature: 'maintenance_preventive',
      periodicite_id: '1',
      prestataire_id: UUID_A,
      categorie_id: UUID_B,
      description: '',
      miniature_id: null,
      est_active: true,
    },
    champs: {
      nom: T('nom'),
      description: T('description'),
      periodicite_id: TN('periodicite_id'),
    },
  },
  {
    nom: 'diSchema',
    schema: diSchema,
    table: 'demandes_intervention',
    base: {
      constat: 'Fuite au plafond',
      date_constat: '2026-09-16',
      local_id: '',
      equipement_id: '',
    },
    champs: { constat: T('constat') },
  },
  {
    nom: 'diEditSchema',
    schema: diEditSchema,
    table: 'demandes_intervention',
    base: { constat: 'Fuite au plafond', local_id: '', equipement_id: '' },
    champs: { constat: T('constat') },
  },
  {
    nom: 'evenementSchema',
    schema: evenementSchema,
    table: 'evenements',
    base: {
      titre: 'Intrusion',
      description: '',
      date_evenement: '2026-09-16',
      local_id: '',
      equipement_id: '',
      taches: [],
    },
    champs: { titre: T('titre'), description: T('description') },
  },
  {
    nom: 'travauxSchema',
    schema: travauxSchema,
    table: 'interventions_travaux',
    base: {
      titre: 'Réfection toiture',
      description: '',
      date_demande: '2026-09-16',
      local_id: '',
      equipement_id: '',
      taches: [],
    },
    champs: { titre: T('titre'), description: T('description') },
  },
  {
    nom: 'tacheSchema',
    schema: tacheSchema,
    table: 'travaux_taches',
    base: {
      libelle: 'Poser la membrane',
      local_id: '',
      equipement_id: '',
      commentaire: '',
      date_tache: '',
    },
    champs: { libelle: T('libelle'), commentaire: T('commentaire') },
  },
  {
    nom: 'investissementSchema',
    schema: investissementSchema,
    table: 'investissements',
    base: {
      libelle: 'Remplacement CTA',
      description: '',
      montant_demande: '',
      montant_prevu: '',
      depense_reelle: '',
      date_demande: '2026-09-16',
    },
    champs: {
      libelle: T('libelle'),
      description: T('description'),
      montant_demande: TN('montant_demande'),
      montant_prevu: TN('montant_prevu'),
      depense_reelle: TN('depense_reelle'),
    },
  },
  {
    nom: 'prestataireSchema',
    schema: prestataireSchema,
    table: 'prestataires',
    base: { libelle: 'Eurofeu', commentaires: '', miniature_id: null },
    champs: { libelle: T('libelle'), commentaires: T('commentaires') },
  },
  {
    nom: 'contratSchema',
    schema: contratSchema,
    table: 'contrats',
    base: {
      reference: 'C-2026-001',
      type_contrat_id: '1',
      date_debut: '2026-01-01',
      date_fin: '',
      objet_avenant: '',
      commentaires: '',
      duree_cycle_mois: null,
      delai_preavis_jours: 30,
      fenetre_resiliation_jours: null,
      date_signature: '',
      date_resiliation: '',
      date_notification: '',
    },
    champs: {
      reference: T('reference'),
      commentaires: T('commentaires'),
      duree_cycle_mois: N('duree_cycle_mois'),
      delai_preavis_jours: N('delai_preavis_jours'),
      fenetre_resiliation_jours: N('fenetre_resiliation_jours'),
    },
  },
  {
    nom: 'modeleDiSchema',
    schema: modeleDiSchema,
    table: 'modeles_di',
    base: {
      libelle: 'Fuite',
      constat_modele: 'Fuite constatée',
      miniature_id: null,
      etat: 'actif',
      portee: 'entreprise',
    },
    champs: {
      libelle: T('libelle'),
      constat_modele: T('constat_modele'),
    },
  },
  {
    nom: 'profileSchema',
    schema: profileSchema,
    table: 'users',
    base: { nom_complet: 'Jean Dupont', telephone: '' },
    champs: { nom_complet: T('nom_complet'), telephone: T('telephone') },
  },
  {
    nom: 'creerCompteSchema',
    schema: creerCompteSchema,
    table: 'users',
    base: {
      email: 'jean@exemple.fr',
      nom_complet: 'Jean Dupont',
      role: 'technicien',
      site_ids: [],
      password: 'Motdepasse1!',
      password_confirm: 'Motdepasse1!',
    },
    champs: { nom_complet: T('nom_complet') },
  },
]

/** Tables dont au moins un formulaire écrit une colonne. */
const TABLES_DE_FORMULAIRE = [
  ...new Set(CONCORDANCES.map((c) => c.table)),
].sort()

/**
 * Contraintes CHECK des tables ci-dessus qu'une sonde de champ ISOLÉ ne peut pas
 * exprimer, ou qui portent sur une colonne qu'aucun formulaire ne saisit.
 *
 * Toute contrainte ajoutée en production sur une de ces tables doit apparaître
 * ici ou devenir sondable : le test de couverture, plus bas, le vérifie. C'est
 * ce qui fait de ce fichier un garde-fou plutôt qu'une photographie.
 */
const CHECKS_NON_SONDES: Record<string, string> = {
  // ── Cohérences INTER-COLONNES : hors de portée d'une sonde de champ isolé.
  //    Leur miroir front est testé par les `schemas.test.ts` de chaque feature.
  'categories.categories_check':
    'Inter-colonnes (parent_id <> id) : la sonde porte sur un champ isolé.',
  'contrats.contrats_date_fin_apres_debut':
    'Inter-colonnes : couvert par un `.refine` de `contratSchema` et son test.',
  'contrats.contrats_date_notification_avant_resiliation':
    'Inter-colonnes : couvert par un `.refine` de `contratSchema` et son test.',
  'contrats.contrats_date_resiliation_apres_debut':
    'Inter-colonnes : couvert par un `.refine` de `contratSchema` et son test.',
  'contrats.contrats_date_signature_avant_debut':
    'Inter-colonnes : couvert par un `.refine` de `contratSchema` et son test.',
  'evenements.evenements_dates_coherentes':
    'Inter-colonnes : couvert par `clotureSchema` (evenements) et son test.',
  'investissements.investissements_dates_coherentes':
    'Inter-colonnes : couvert par `clotureCapexSchema` et son test.',
  'operations.operations_seuils_coherents':
    'Inter-colonnes : couvert par le `.refine` seuil min ≤ max d’`operationSchema`.',
  'modeles_operations_items.modeles_operations_items_seuils_coherents':
    'Inter-colonnes : couvert par le `.refine` seuil min ≤ max d’`operationItemSchema`.',
  'prestataires.prestataires_interne_site':
    'Inter-colonnes (est_interne = site_id IS NOT NULL) : posé par la mutation, jamais saisi.',

  // ── Colonnes qu'AUCUN formulaire ne saisit : la contrainte ne peut pas
  //    tomber au clavier. Les traduire n'apprendrait rien à l'utilisateur.
  'categories.chk_categorie_modele_xor_specs':
    'Colonnes non saisies (modele_equipement_id / specifications posées par la mutation).',
  'categories.chk_categorie_specs_objet':
    'Structure d’un JSONB : ne tombe que sur un appel programmatique fautif.',
  'categories.chk_categories_image_path_format':
    'Chemin d’image : posé par l’upload, jamais tapé.',
  'categories.chk_equipement_categorie_racine':
    'Inter-colonnes (scope / parent_id) : arbitré par l’écran, pas par une borne.',
  'batiments.chk_batiments_image_path_format':
    'Chemin d’image : posé par l’upload, jamais tapé.',
  'niveaux.chk_niveaux_image_path_format':
    'Chemin d’image : posé par l’upload, jamais tapé.',
  'locaux.chk_locaux_image_path_format':
    'Chemin d’image : posé par l’upload, jamais tapé.',
  'gammes.chk_gammes_image_path_format':
    'Chemin d’image : posé par l’upload, jamais tapé.',
  'modeles_equipements.chk_modeles_equipements_image_path_format':
    'Chemin d’image : posé par l’upload, jamais tapé.',
  'modeles_equipements.chk_modeles_equipements_specs_structure':
    'Structure d’un JSONB : validée par `champSchema`, pas par une borne de colonne.',
  'modeles_operations.chk_modeles_operations_image_path_format':
    'Chemin d’image : posé par l’upload, jamais tapé.',
  'prestataires.chk_prestataires_image_path_format':
    'Chemin d’image : posé par l’upload, jamais tapé.',
  'prestataires.prestataires_code_postal_format':
    'Colonne non saisie : le formulaire prestataire est allégé (nom + description + image).',
  'prestataires.prestataires_email_format':
    'Colonne non saisie : le formulaire prestataire est allégé.',
  'prestataires.prestataires_siret_format':
    'Colonne non saisie : le formulaire prestataire est allégé.',
  'travaux_taches.travaux_taches_statut_check':
    'Colonne non saisie dans `tacheSchema` : le statut se change depuis la fiche.',
  'users.users_photo_path_format':
    'Chemin d’avatar : posé par l’upload, jamais tapé.',
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Le test de concordance proprement dit
// ─────────────────────────────────────────────────────────────────────────────

interface Cas {
  concordance: Concordance
  champ: string
  colonne: string
  sonde: Sonde
}

/** Toutes les sondes de toutes les concordances, à plat. */
function tousLesCas(): Cas[] {
  const cas: Cas[] = []
  for (const concordance of CONCORDANCES) {
    const table = tableSql(concordance.table)
    const checks = Object.values(table.checks)
      .map(traduireCheck)
      .filter((c): c is CheckTraduit => c !== null)

    for (const [champ, cible] of Object.entries(concordance.champs)) {
      const colonne = table.colonnes[cible.colonne]
      if (colonne === undefined) continue
      const sondes = [
        ...sondesDuType(colonne, cible.forme),
        ...checks
          .filter((c) => c.colonne === cible.colonne)
          .flatMap((c) => sondesDeRegle(c.regle, colonne, cible.forme)),
      ]
      for (const sonde of sondes) {
        cas.push({ concordance, champ, colonne: cible.colonne, sonde })
      }
    }
  }
  return cas
}

const CAS = tousLesCas()

describe('concordance Zod / SQL — la carte est exacte', () => {
  // ORACLE : sans objet de base VALIDE, chaque sonde « réussirait » parce que
  // l'objet est refusé pour une tout autre raison — le test serait vert et
  // vide. C'est la garantie que les sondes sondent vraiment ce qu'elles disent.
  it.each(CONCORDANCES.map((c) => [c.nom, c] as const))(
    '%s : l’objet de base est accepté par le schéma',
    (_nom, concordance) => {
      const resultat = concordance.schema.safeParse(concordance.base)
      expect(
        resultat.success ? null : JSON.stringify(resultat.error.issues),
      ).toBeNull()
    },
  )

  // ORACLE : une colonne citée dans la carte doit exister en base. Une colonne
  // renommée par une migration doit faire tomber le test, pas le rendre muet.
  it.each(
    CONCORDANCES.flatMap((c) =>
      Object.entries(c.champs).map(
        ([champ, cible]) => [c.nom, champ, c.table, cible.colonne] as const,
      ),
    ),
  )('%s.%s vise une colonne réelle de %s', (_nom, _champ, table, colonne) => {
    expect(Object.keys(tableSql(table).colonnes)).toContain(colonne)
  })

  // ORACLE : un jeu de sondes vide serait un test vert qui ne teste rien. On
  // fige donc un plancher : si une migration retire des contraintes, on veut
  // le voir plutôt que de continuer à afficher « tout va bien ».
  it('produit un nombre substantiel de sondes', () => {
    expect(CAS.length).toBeGreaterThanOrEqual(80)
  })
})

describe('concordance Zod / SQL — le front n’est jamais plus permissif', () => {
  // ORACLE : la valeur injectée est celle que la BASE refuserait (dérivée
  // mécaniquement de `pg_constraint` / `information_schema`, jamais écrite à la
  // main). Si le schéma Zod l'accepte, l'utilisateur part en aller-retour
  // réseau pour récolter un 23514 ou un 22003 brut — et le champ fautif n'est
  // même pas désigné.
  it.each(
    CAS.map(
      (c) =>
        [
          `${c.concordance.nom}.${c.champ} → ${c.concordance.table}.${c.colonne} — ${c.sonde.refusePar}`,
          c,
        ] as const,
    ),
  )('%s', (_libelle, cas) => {
    const entree = { ...cas.concordance.base, [cas.champ]: cas.sonde.valeur }
    const resultat = cas.concordance.schema.safeParse(entree)
    if (resultat.success) {
      throw new Error(
        `${cas.concordance.nom}.${cas.champ} accepte ${JSON.stringify(cas.sonde.valeur)}, ` +
          `que la colonne ${cas.concordance.table}.${cas.colonne} refuse : ${cas.sonde.refusePar}.\n` +
          `Le schéma Zod est PLUS PERMISSIF que sa colonne : ajoutez la borne manquante ` +
          `dans le \`schemas.ts\` de la feature (message en français, comme ses voisins).`,
      )
    }
  })
})

describe('concordance Zod / SQL — aucune contrainte n’échappe au classement', () => {
  // ORACLE : le danger d'un tel test n'est pas qu'il échoue, c'est qu'il
  // rassure. Une contrainte CHECK ajoutée demain sur une table de formulaire
  // doit soit devenir une sonde, soit être déclarée à la main avec sa raison.
  // Sans ce contrôle, elle passerait inaperçue — exactement ce qui vient
  // d'arriver.
  const colonnesSondees = new Map<string, Set<string>>()
  for (const c of CONCORDANCES) {
    const set = colonnesSondees.get(c.table) ?? new Set<string>()
    for (const cible of Object.values(c.champs)) set.add(cible.colonne)
    colonnesSondees.set(c.table, set)
  }

  it.each(
    TABLES_DE_FORMULAIRE.flatMap((table) =>
      Object.entries(tableSql(table).checks).map(
        ([nom, definition]) => [`${table}.${nom}`, table, definition] as const,
      ),
    ),
  )('%s est sondée ou déclarée non sondable', (cle, table, definition) => {
    const traduit = traduireCheck(definition)
    const sondee =
      traduit !== null &&
      (colonnesSondees.get(table)?.has(traduit.colonne) ?? false)
    if (sondee) return
    expect(
      CHECKS_NON_SONDES[cle],
      `La contrainte ${cle} n'est ni traduite en sonde, ni déclarée.\n` +
        `Définition : ${definition}\n` +
        `Soit vous mappez sa colonne dans CONCORDANCES, soit vous l'ajoutez à ` +
        `CHECKS_NON_SONDES avec la raison pour laquelle une sonde ne peut pas l'exprimer.`,
    ).toBeTypeOf('string')
  })

  // ORACLE : une déclaration périmée est un mensonge qui dure. Si une
  // contrainte disparaît de la base, sa dispense doit disparaître aussi.
  it('aucune dispense ne survit à la contrainte qu’elle dispensait', () => {
    const existantes = new Set(
      TABLES_DE_FORMULAIRE.flatMap((table) =>
        Object.keys(tableSql(table).checks).map((nom) => `${table}.${nom}`),
      ),
    )
    const perimees = Object.keys(CHECKS_NON_SONDES).filter(
      (cle) => !existantes.has(cle),
    )
    expect(perimees).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Bénéfice collatéral : le schéma versionné ne dérive plus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `schema_complete.sql` est la SEULE source de schéma versionnée (les
 * migrations sont gitignorées). Sa dérive a déjà coûté deux fois : un audit RLS
 * a dû se rabattre sur la production, et le premier jet de ce garde-fou s'était
 * adossé à lui. Le même instantané permet de la rendre rouge.
 *
 * CE QUI EST COMPARÉ : l'ensemble des tables, l'ensemble des colonnes de chaque
 * table, et les contraintes CHECK NOMMÉES (`CONSTRAINT x CHECK`) écrites dans le
 * fichier.
 *
 * CE QUI NE L'EST PAS, et pourquoi : le sens production → fichier sur les CHECK.
 * Postgres nomme automatiquement les CHECK écrits en ligne (`nom TEXT NOT NULL
 * CHECK (…)` devient `sites_nom_check`), et une partie des contraintes du projet
 * est posée par du SQL DYNAMIQUE (`format()` dans un bloc DO, pour les
 * `chk_*_image_path_format`) : aucun de ces noms n'est extractible du fichier.
 * Comparer les EXPRESSIONS ne marche pas davantage — Postgres les réécrit sous
 * forme canonique (`IN (…)` devient `= ANY (ARRAY[…])`, `strpos` devient
 * `POSITION(… IN …)`, `LIKE` devient `~~`), si bien que 21 contraintes pourtant
 * présentes paraissaient manquantes.
 */
function colonnesDuFichier(): Map<string, Set<string>> {
  const par = new Map<string, Set<string>>()
  const creation =
    /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\n\)\s*;/gi
  let bloc
  while ((bloc = creation.exec(schemaVersionne)) !== null) {
    const table = bloc[1]
    const corps = bloc[2]
    if (table === undefined || corps === undefined) continue
    const set = new Set<string>()
    for (const ligne of corps.split('\n')) {
      const trouve = /^"?([a-z0-9_]+)"?\s+[a-zA-Z]/.exec(ligne.trim())
      const mot = trouve?.[1]
      if (mot === undefined) continue
      if (
        [
          'constraint',
          'primary',
          'foreign',
          'unique',
          'check',
          'exclude',
          'like',
        ].includes(mot.toLowerCase())
      ) {
        continue
      }
      set.add(mot)
    }
    par.set(table, set)
  }
  const ajout =
    /ALTER TABLE\s+(?:ONLY\s+)?(?:public\.)?"?([a-z0-9_]+)"?[\s\S]{0,200}?ADD COLUMN(?: IF NOT EXISTS)?\s+"?([a-z0-9_]+)"?/gi
  let colonne
  while ((colonne = ajout.exec(schemaVersionne)) !== null) {
    const table = colonne[1]
    const nom = colonne[2]
    if (table === undefined || nom === undefined) continue
    const set = par.get(table) ?? new Set<string>()
    set.add(nom)
    par.set(table, set)
  }
  return par
}

const COLONNES_FICHIER = colonnesDuFichier()

describe('schema_complete.sql ne dérive pas de la production', () => {
  // ORACLE : une migration appliquée en production sans resynchronisation du
  // fichier versionné laisse une table absente. C'est la forme la plus grossière
  // de la dérive, et la plus fréquente.
  it('déclare exactement les mêmes tables', () => {
    const production = Object.keys(INSTANTANE.tables).sort()
    const fichier = [...COLONNES_FICHIER.keys()].sort()
    expect(fichier).toEqual(production)
  })

  // ORACLE : une colonne ajoutée en production et pas au fichier (ou l'inverse)
  // rend le fichier inutilisable comme référence — c'est très exactement ce qui
  // a fait tomber le premier jet de ce garde-fou.
  it.each(Object.keys(INSTANTANE.tables).sort())(
    '%s : les mêmes colonnes des deux côtés',
    (table) => {
      const production = Object.keys(tableSql(table).colonnes).sort()
      const fichier = [...(COLONNES_FICHIER.get(table) ?? new Set())].sort()
      expect(fichier).toEqual(production)
    },
  )

  // ORACLE : une contrainte NOMMÉE dans le fichier mais absente de la
  // production signale soit une migration jamais appliquée, soit une contrainte
  // supprimée sans que le fichier suive.
  it('ne nomme aucune contrainte CHECK absente de la production', () => {
    const enProduction = new Set(
      Object.values(INSTANTANE.tables).flatMap((t) => Object.keys(t.checks)),
    )
    const nommeesDansLeFichier = [
      ...schemaVersionne.matchAll(
        /(?:ADD\s+)?CONSTRAINT\s+([a-z0-9_]+)\s+CHECK/gi,
      ),
    ]
      .map((m) => m[1])
      .filter((n): n is string => n !== undefined)
    const fantomes = [
      ...new Set(nommeesDansLeFichier.filter((n) => !enProduction.has(n))),
    ].sort()
    expect(fantomes).toEqual([])
  })
})
