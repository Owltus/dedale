import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import exceptionsBrutes from './conventions-exceptions.json'

/**
 * Conventions du CLAUDE.md et de `docs/conventions/` — test à CLIQUET.
 *
 * Chaque règle vérifiable qui demande de lire plusieurs fichiers (ou dont
 * l'heuristique peut se tromper) vit ici ; les règles d'UN fichier vivent dans
 * `eslint.config.js`. Les écarts connus au 25/11/2026 sont gelés dans
 * `conventions-exceptions.json`, une entrée motivée par (règle, fichier) avec
 * son nombre d'occurrences. Trois verrous :
 *
 *  1. un écart sans exception, ou plus d'occurrences que gelé → ROUGE ;
 *  2. une exception sans motif, en double ou d'une règle inconnue → ROUGE ;
 *  3. une exception devenue inutile (écart corrigé, ou moins d'occurrences)
 *     → ROUGE « exception périmée » : la liste ne peut que rétrécir.
 *
 * Ce que ce test NE contrôle PAS (laissé à la revue) est listé dans chaque
 * `docs/conventions/*.md`, section « Contrôlé par la revue ».
 */

// ---------------------------------------------------------------------------
// Lecture du dépôt
// ---------------------------------------------------------------------------

const RACINE = process.cwd()
const CE_FICHIER = 'src/lib/conventions.test.ts'
const FICHIER_EXCEPTIONS = 'src/lib/conventions-exceptions.json'

const versRel = (p: string) => relative(RACINE, p).split(sep).join('/')
const lire = (rel: string) =>
  readFileSync(join(RACINE, rel), 'utf8').replace(/\r\n/g, '\n')

function lister(dossier: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name)
    if (e.isDirectory()) out.push(...lister(p))
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(versRel(p))
  }
  return out
}

interface Fichier {
  rel: string
  texte: string
  lignes: string[]
  estTest: boolean
  ast: ts.SourceFile
}

const GENERES = /(^|\/)(routeTree\.gen\.ts|database\.types\.ts)$/
const TESTS = /\.test\.tsx?$|^src\/test\//

const FICHIERS: Fichier[] = lister(join(RACINE, 'src'))
  .filter((rel) => !GENERES.test(rel) && rel !== CE_FICHIER)
  .map((rel) => {
    const texte = lire(rel)
    return {
      rel,
      texte,
      lignes: texte.split('\n'),
      estTest: TESTS.test(rel),
      ast: ts.createSourceFile(
        rel,
        texte,
        ts.ScriptTarget.Latest,
        true,
        rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      ),
    }
  })
const PROD = FICHIERS.filter((f) => !f.estTest)

const ligneDe = (f: Fichier, n: ts.Node) =>
  f.ast.getLineAndCharacterOfPosition(n.getStart(f.ast)).line + 1
const ligneDeIndex = (texte: string, index: number) =>
  texte.slice(0, index).split('\n').length
const estCommentaire = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l)

function parcourir(n: ts.Node, visite: (n: ts.Node) => void) {
  visite(n)
  n.forEachChild((c) => {
    parcourir(c, visite)
  })
}

const nomPropriete = (n: ts.Node): string | undefined =>
  (ts.isPropertyAssignment(n) || ts.isJsxAttribute(n)) &&
  (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))
    ? n.name.text
    : undefined

/** Nom de la méthode appelée (`a.b.c()` → `c`, `f()` → `f`). */
const nomAppel = (n: ts.CallExpression): string | undefined =>
  ts.isPropertyAccessExpression(n.expression)
    ? n.expression.name.text
    : ts.isIdentifier(n.expression)
      ? n.expression.text
      : undefined

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

interface Ecart {
  regle: string
  /** Fichier (ou cible : cycle « a ⇄ b », élément SQL). */
  fichier: string
  ligne: number
  detail: string
}

interface Regle {
  id: string
  titre: string
  /** Où la règle est écrite. */
  doc: string
  /** Comment corriger. */
  quoiFaire: string
  /** Taille du corpus examiné : la garde anti-vacuité exige > 0. */
  corpus: () => number
  ecarts: () => Ecart[]
}

/** Une occurrence par ligne qui matche `rx` (lignes de commentaire exclues). */
function parLigne(regle: string, liste: Fichier[], rx: RegExp): Ecart[] {
  const out: Ecart[] = []
  for (const f of liste)
    f.lignes.forEach((l, i) => {
      if (rx.test(l) && !estCommentaire(l))
        out.push({ regle, fichier: f.rel, ligne: i + 1, detail: l.trim() })
    })
  return out
}

const imports = (f: Fichier) =>
  f.ast.statements.flatMap((s) =>
    ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)
      ? [{ chemin: s.moduleSpecifier.text, ligne: ligneDe(f, s) }]
      : [],
  )

const ROUTES = PROD.filter((f) => f.rel.startsWith('src/routes/'))
const MUTATIONS = PROD.filter((f) => f.rel.endsWith('/mutations.ts'))
const SOCLE = new Set([
  'sites',
  'utilisateurs',
  'documents',
  'miniatures',
  'taches',
])

// --- SQL (schema_complete.sql) ----------------------------------------------

/** Commentaires blanchis à longueur égale : les positions restent justes. */
const SQL = lire('schema_complete.sql')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length))

interface FonctionSql {
  nom: string
  ligne: number
  /** Le texte hors corps ($…$), où vivent SECURITY DEFINER et SET. */
  entete: string
}

function fonctionsSql(): FonctionSql[] {
  const out: FonctionSql[] = []
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w."]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(SQL))) {
    const debut = m.index
    const ouverture = /\$(\w*)\$/.exec(SQL.slice(debut))
    if (!ouverture) continue
    const tag = ouverture[0]
    const debutCorps = debut + ouverture.index
    const finCorps = SQL.indexOf(tag, debutCorps + tag.length)
    if (finCorps < 0) continue
    const fin = SQL.indexOf(';', finCorps)
    out.push({
      nom: (m[1] ?? '').replace(/^public\./, '').replace(/"/g, ''),
      ligne: ligneDeIndex(SQL, debut),
      entete:
        SQL.slice(debut, debutCorps) +
        SQL.slice(finCorps + tag.length, fin < 0 ? undefined : fin),
    })
    re.lastIndex = finCorps + tag.length
  }
  return out
}
const FONCTIONS_SQL = fonctionsSql()

const sansSchema = (nom: string) =>
  nom.replace(/^public\./, '').replace(/"/g, '')

interface VueSql {
  nom: string
  ligne: number
  index: number
  invoker: boolean
}
const VUES_SQL: VueSql[] = [
  ...SQL.matchAll(
    /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([\w."]+)([\s\S]*?)\bAS\b/gi,
  ),
].map((m) => ({
  nom: sansSchema(m[1] ?? ''),
  ligne: ligneDeIndex(SQL, m.index),
  index: m.index,
  invoker: /security_invoker\s*=\s*(true|on)/i.test(m[2] ?? ''),
}))
const ALTER_VUES = [
  ...SQL.matchAll(
    /ALTER\s+VIEW\s+([\w."]+)\s+SET\s*\(\s*security_invoker\s*=\s*(?:true|on)\s*\)/gi,
  ),
].map((m) => ({ nom: sansSchema(m[1] ?? ''), index: m.index }))

// --- Textes affichés ----------------------------------------------------------

/**
 * Mots courants écrits sans leur accent (comparaison en minuscules). Les formes
 * verbales justes sans accent (« il modifie », « il enregistre », « il
 * supprime », « il annule ») sont volontairement absentes.
 */
const MOTS_SANS_ACCENT = [
  'echec',
  'echoue',
  'cree',
  'creee',
  'crees',
  'creees',
  'etat',
  'etats',
  'electricite',
  'securite',

  'supprimee',

  'annulee',
  'cloture',
  'cloturee',
  'debut',
  'equipement',
  'equipements',
  'element',
  'elements',
  'evenement',
  'evenements',

  'modifiee',

  'enregistree',
  'periode',
  'precedent',
  'prevue',
  'prevu',
  'realise',
  'realisee',
  'categorie',
  'categories',
  'delai',
  'donnees',
  'echeance',
  'interieur',
  'exterieur',
  'verifie',
  'verifiez',
  'telecharger',
  'deja',
  'apres',
  'tres',
  'numero',
  'selectionner',
  'selectionnez',
  'resultat',
  'resultats',
  'reessayer',
  'acces',
  'controle',
  'controles',
  'demarrer',
  'genere',
  'generee',
  'operation',
  'operations',
  'reference',
]
const RX_SANS_ACCENT = new RegExp(
  `(?<![\\p{L}\\d_-])(${MOTS_SANS_ACCENT.join('|')})(?![\\p{L}\\d_-])`,
  'iu',
)
/** Attributs JSX techniques : leur valeur n'est jamais lue par une personne. */
const ATTRIBUTS_TECHNIQUES = new Set([
  'className',
  'id',
  'key',
  'name',
  'type',
  'variant',
  'size',
  'to',
  'href',
  'src',
  'role',
  'side',
  'align',
  'htmlFor',
  'value',
  'defaultValue',
  'autoComplete',
  'inputMode',
  'mode',
  'orientation',
  'tone',
  'form',
  'target',
  'rel',
  'accept',
  'pattern',
  'dataKey',
  'scope',
  'pivot',
  'kind',
])
/** Clés d'objet qui portent un libellé affiché. */
const CLES_AFFICHEES = new Set([
  'label',
  'title',
  'description',
  'message',
  'placeholder',
  'hint',
  'successMessage',
  'errorMessage',
  'subtitle',
  'warning',
  'blockedReason',
  'emptyLabel',
  'titre',
  'libelle',
  'texte',
  'aide',
])
/** Un identifiant technique (`'equipement'`) n'est pas de la prose. */
const estProse = (s: string) => /\s/.test(s.trim()) || /^\p{Lu}/u.test(s.trim())

function texteDe(n: ts.Node): string | undefined {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
    return n.text
  if (ts.isTemplateExpression(n))
    return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(
      ' ',
    )
  return undefined
}

/** Le littéral est-il un texte montré à l'écran ? */
function estAffiche(n: ts.Node): boolean {
  let p = n.parent
  // Remonte les ternaires / `??` / `||` / parenthèses : `{x ? 'A' : 'B'}`.
  while (
    ts.isConditionalExpression(p) ||
    ts.isParenthesizedExpression(p) ||
    (ts.isBinaryExpression(p) &&
      [
        ts.SyntaxKind.QuestionQuestionToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.AmpersandAmpersandToken,
      ].includes(p.operatorToken.kind) &&
      p.right === n)
  ) {
    n = p
    p = p.parent
  }
  if (ts.isJsxExpression(p)) {
    const q = p.parent
    if (ts.isJsxAttribute(q)) return !ATTRIBUTS_TECHNIQUES.has(q.name.getText())
    return ts.isJsxElement(q) || ts.isJsxFragment(q)
  }
  if (ts.isJsxAttribute(p)) return !ATTRIBUTS_TECHNIQUES.has(p.name.getText())
  if (ts.isPropertyAssignment(p) && p.initializer === n)
    return CLES_AFFICHEES.has(nomPropriete(p) ?? '')
  if (ts.isCallExpression(p) && p.arguments[0] === n) {
    const cible = p.expression
    return (
      ts.isPropertyAccessExpression(cible) &&
      ts.isIdentifier(cible.expression) &&
      cible.expression.text === 'toast'
    )
  }
  if (ts.isNewExpression(p) && p.arguments?.[0] === n)
    return p.expression.getText() === 'Error'
  return false
}

const REGLES: Regle[] = [
  {
    id: 'route-mince',
    titre: 'Route non mince (> 60 lignes, ou données / état dans la route)',
    doc: 'CLAUDE.md « Routes minces » ; docs/conventions/architecture.md → Arborescence',
    quoiFaire:
      'déplacer l’écran dans features/<x>/components/<x>-liste.tsx : la route ne garde que createFileRoute, ses gardes et SiteScopedRoute',
    corpus: () => ROUTES.length,
    ecarts: () =>
      ROUTES.flatMap((f) => {
        const n = f.texte.trimEnd().split('\n').length
        const out = parLigne(
          'route-mince',
          [f],
          /supabase\.|\buse(Suspense)?Query\(|\buseMutation\(|\buseState\(/,
        )
        if (n > 60)
          out.unshift({
            regle: 'route-mince',
            fichier: f.rel,
            ligne: 61,
            detail: `${String(n)} lignes (plafond 60)`,
          })
        return out
      }),
  },
  {
    id: 'cycle-features',
    titre: 'Cycle d’import entre deux features non socle',
    doc: 'docs/conventions/architecture.md → Règles de dépendances',
    quoiFaire:
      'casser une des deux directions : importer queries/schemas/format/types dans un seul sens, ou remonter la pièce partagée dans le socle',
    corpus: () => PROD.filter((f) => f.rel.startsWith('src/features/')).length,
    ecarts: () => {
      const aretes = new Map<string, { fichier: string; ligne: number }>()
      for (const f of PROD) {
        const a = /^src\/features\/([^/]+)\//.exec(f.rel)?.[1]
        if (!a) continue
        for (const i of imports(f)) {
          const b = /^@\/features\/([^/]+)/.exec(i.chemin)?.[1]
          if (b && b !== a && !SOCLE.has(b) && !SOCLE.has(a)) {
            const cle = `${a}>${b}`
            if (!aretes.has(cle))
              aretes.set(cle, { fichier: f.rel, ligne: i.ligne })
          }
        }
      }
      const out: Ecart[] = []
      for (const [cle, ici] of aretes) {
        const [a = '', b = ''] = cle.split('>')
        const retour = aretes.get(`${b}>${a}`)
        if (retour && a < b)
          out.push({
            regle: 'cycle-features',
            fichier: `src/features/${a} ⇄ src/features/${b}`,
            ligne: ici.ligne,
            detail: `${ici.fichier}:${String(ici.ligne)} → ${b} ; ${retour.fichier}:${String(retour.ligne)} → ${a}`,
          })
      }
      return out
    },
  },
  {
    id: 'cle-litterale',
    titre: 'queryKey littérale hors d’un fichier queries',
    doc: 'docs/conventions/architecture.md → Règles de dépendances ; CLAUDE.md « clé d’une autre feature = sa fabrique »',
    quoiFaire:
      'dériver la clé de la fabrique de la feature (`...xQueries.all()`), déclarée dans son queries.ts',
    corpus: () => PROD.length,
    ecarts: () => {
      const out: Ecart[] = []
      for (const f of PROD.filter((x) => !x.rel.endsWith('queries.ts')))
        parcourir(f.ast, (n) => {
          if (
            ts.isPropertyAssignment(n) &&
            nomPropriete(n) === 'queryKey' &&
            ts.isArrayLiteralExpression(n.initializer) &&
            n.initializer.elements[0] !== undefined &&
            ts.isStringLiteral(n.initializer.elements[0])
          )
            out.push({
              regle: 'cle-litterale',
              fichier: f.rel,
              ligne: ligneDe(f, n),
              detail: n.getText(f.ast).slice(0, 100),
            })
        })
      return out
    },
  },
  {
    id: 'ecran-sans-page-container',
    titre: 'Écran liste sans <PageContainer>',
    doc: 'CLAUDE.md « Mobile-first » ; docs/conventions/ui.md → Responsive design',
    quoiFaire: 'ouvrir l’écran sur <PageContainer> (common/page-container.tsx)',
    corpus: () =>
      PROD.filter((f) =>
        /^src\/features\/[^/]+\/components\/[^/]+-liste\.tsx$/.test(f.rel),
      ).length,
    ecarts: () =>
      PROD.filter(
        (f) =>
          /^src\/features\/[^/]+\/components\/[^/]+-liste\.tsx$/.test(f.rel) &&
          !/\bPageContainer\b/.test(f.texte),
      ).map((f) => ({
        regle: 'ecran-sans-page-container',
        fichier: f.rel,
        ligne: 1,
        detail: 'aucun PageContainer dans le fichier',
      })),
  },
  {
    id: 'mutation-multi-ecritures',
    titre:
      'mutationFn qui enchaîne ≥ 2 écritures PostgREST (insert/update/upsert/delete/rpc)',
    doc: 'CLAUDE.md « écriture sur plusieurs tables = une RPC » ; docs/conventions/donnees.md → Écriture — mutations',
    quoiFaire:
      'regrouper les écritures dans UNE RPC transactionnelle (SECURITY INVOKER) appelée par un seul .rpc()',
    corpus: () => MUTATIONS.length,
    ecarts: () => {
      const out: Ecart[] = []
      const ECRITURES = new Set(['insert', 'update', 'upsert', 'delete'])
      /** La chaîne part-elle de `.from(…)` hors Storage ? */
      const surTable = (n: ts.Expression): boolean => {
        let x: ts.Expression = n
        let vuFrom = false
        for (;;) {
          if (ts.isCallExpression(x)) {
            if (nomAppel(x) === 'from') vuFrom = true
            x = x.expression
          } else if (ts.isPropertyAccessExpression(x)) {
            if (x.name.text === 'storage') return false
            x = x.expression
          } else return vuFrom
        }
      }
      for (const f of PROD)
        parcourir(f.ast, (n) => {
          if (!(ts.isPropertyAssignment(n) && nomPropriete(n) === 'mutationFn'))
            return
          let ecritures = 0
          parcourir(n.initializer, (c) => {
            if (!ts.isCallExpression(c)) return
            const nom = nomAppel(c)
            if (
              nom === 'rpc' ||
              (nom && ECRITURES.has(nom) && surTable(c.expression))
            )
              ecritures++
          })
          if (ecritures >= 2)
            out.push({
              regle: 'mutation-multi-ecritures',
              fichier: f.rel,
              ligne: ligneDe(f, n),
              detail: `${String(ecritures)} écritures dans la même mutationFn`,
            })
        })
      return out
    },
  },
  {
    id: 'statut-nombre',
    titre: 'Statut comparé à un nombre en dur',
    doc: 'CLAUDE.md « statuts = constantes nommées (etat.ts), jamais === 3 »',
    quoiFaire:
      'comparer à la constante nommée du etat.ts de la feature (STATUT_…)',
    corpus: () => PROD.length,
    ecarts: () =>
      parLigne(
        'statut-nombre',
        PROD,
        /[sS]tatut\w*\s*[!=]==?\s*\d|\b\d+\s*[!=]==?\s*[\w.]*[sS]tatut|\.(eq|neq)\(\s*'statut\w*'\s*,\s*\d/,
      ),
  },
  {
    id: 'nommage-hooks-crud',
    titre:
      'Hook CRUD hors convention dans mutations.ts (useCreate/useUpdate/useDelete)',
    doc: 'CLAUDE.md « Glossaire » ; docs/conventions/architecture.md → Glossaire (verbes)',
    quoiFaire:
      'renommer en useCreate… / useUpdate… / useDelete… (anglais pour le CRUD)',
    corpus: () => MUTATIONS.length,
    ecarts: () =>
      MUTATIONS.flatMap((f) =>
        [
          ...f.texte.matchAll(
            /export (?:function|const) (use(?:Creer|Modifier|Supprimer|Ajouter|Add|Remove|Edit|Save|Insert)\w*)/g,
          ),
        ].map((m) => ({
          regle: 'nommage-hooks-crud',
          fichier: f.rel,
          ligne: ligneDeIndex(f.texte, m.index),
          detail: m[1] ?? '',
        })),
      ),
  },
  {
    id: 'deleted-at',
    titre: 'Colonne deleted_at (supprimée : hard-delete)',
    doc: 'CLAUDE.md « Doctrine backend » point 4 ; docs/conventions/donnees.md → Lecture',
    quoiFaire:
      'retirer le filtre : la colonne n’existe plus (migrations 034-036)',
    corpus: () => FICHIERS.length,
    ecarts: () => parLigne('deleted-at', FICHIERS, /deleted_at/),
  },
  {
    id: 'couleur-brute',
    titre:
      'Couleur en dur (palette Tailwind brute ou hexadécimal dans une classe)',
    doc: 'CLAUDE.md « Couleurs » ; docs/conventions/ui.md → Couleurs = tokens sémantiques',
    quoiFaire:
      'utiliser un token sémantique (bg-primary, text-warning, StatusTone…)',
    corpus: () => PROD.length,
    ecarts: () =>
      parLigne(
        'couleur-brute',
        PROD,
        /\b(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|shadow|accent|caret|decoration)-(red|green|blue|yellow|orange|amber|emerald|sky|slate|gray|zinc|neutral|stone|rose|pink|purple|violet|indigo|teal|cyan|lime|fuchsia)-\d{2,3}\b|\b(bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/,
      ),
  },
  {
    id: 'any',
    titre: 'Type `any` (TypeScript strict)',
    doc: 'CLAUDE.md « Conventions de code » (pas de any)',
    quoiFaire:
      'typer précisément (unknown + garde, type généré Database, générique)',
    corpus: () => FICHIERS.length,
    ecarts: () => {
      const out: Ecart[] = []
      for (const f of FICHIERS)
        parcourir(f.ast, (n) => {
          if (n.kind === ts.SyntaxKind.AnyKeyword)
            out.push({
              regle: 'any',
              fichier: f.rel,
              ligne: ligneDe(f, n),
              detail: (f.lignes[ligneDe(f, n) - 1] ?? '').trim(),
            })
        })
      return out
    },
  },
  {
    id: 'texte-sans-accent',
    titre: 'Texte affiché écrit sans accent (« Equipement », « Echec »…)',
    doc: 'CLAUDE.md « Tout en français — accents corrects, jamais d’ASCII dégradé »',
    quoiFaire: 'rétablir les accents (É, è, à…) dans le texte affiché',
    corpus: () => {
      let n = 0
      for (const f of PROD.filter((x) => x.rel.endsWith('.tsx')))
        parcourir(f.ast, (x) => {
          if (ts.isJsxText(x) && x.text.trim()) n++
        })
      return n
    },
    ecarts: () => {
      const out: Ecart[] = []
      const signaler = (f: Fichier, n: ts.Node, texte: string) => {
        const m = RX_SANS_ACCENT.exec(texte)
        if (m)
          out.push({
            regle: 'texte-sans-accent',
            fichier: f.rel,
            ligne: ligneDe(f, n),
            detail: `« ${m[0]} » dans « ${texte.trim().slice(0, 80)} »`,
          })
      }
      for (const f of PROD)
        parcourir(f.ast, (n) => {
          if (ts.isJsxText(n)) signaler(f, n, n.text)
          else {
            const t = texteDe(n)
            if (t !== undefined && estProse(t) && estAffiche(n))
              signaler(f, n, t)
          }
        })
      return out
    },
  },
  {
    id: 'use-memo-callback',
    titre: 'useMemo / useCallback dans du code nouveau (React Compiler actif)',
    doc: 'CLAUDE.md « React Compiler actif » ; docs/conventions/donnees.md → Mémoïsation',
    quoiFaire:
      'retirer la mémoïsation manuelle : React Compiler s’en charge (les fichiers anciens sont gelés, leur compte ne peut que baisser)',
    corpus: () => PROD.length,
    ecarts: () => parLigne('use-memo-callback', PROD, /\buse(Memo|Callback)\(/),
  },
  {
    id: 'enabled-skiptoken',
    titre: '`enabled:` dans une query (préférer skipToken)',
    doc: 'docs/conventions/donnees.md → Lecture (Paramètre absent → skipToken)',
    quoiFaire:
      'écrire `queryFn: param === null ? skipToken : ({ signal }) => …` au lieu de `enabled` + assertion',
    corpus: () => PROD.length,
    ecarts: () => {
      const QUERIES = new Set([
        'queryOptions',
        'infiniteQueryOptions',
        'useQuery',
        'useInfiniteQuery',
        'useSuspenseQuery',
      ])
      const out: Ecart[] = []
      for (const f of PROD)
        parcourir(f.ast, (n) => {
          if (!(ts.isPropertyAssignment(n) && nomPropriete(n) === 'enabled'))
            return
          const objet = n.parent
          const appel = objet.parent
          if (
            ts.isCallExpression(appel) &&
            appel.arguments.some((a) => a === objet) &&
            QUERIES.has(nomAppel(appel) ?? '')
          )
            out.push({
              regle: 'enabled-skiptoken',
              fichier: f.rel,
              ligne: ligneDe(f, n),
              detail: n.getText(f.ast).slice(0, 100),
            })
        })
      return out
    },
  },
  {
    id: 'sql-definer-sans-search-path',
    titre: 'SQL : fonction SECURITY DEFINER sans search_path figé',
    doc: 'CLAUDE.md « Helpers/RPC en public. » ; skill migration-sql',
    quoiFaire:
      'ajouter `SET search_path = public` (ou pg_catalog, public) à la fonction',
    corpus: () =>
      FONCTIONS_SQL.filter((f) => /SECURITY\s+DEFINER/i.test(f.entete)).length,
    ecarts: () => {
      const alteres = new Set(
        [
          ...SQL.matchAll(
            /ALTER\s+FUNCTION\s+([\w."]+)[^;]*SET\s+search_path/gi,
          ),
        ].map((m) => sansSchema(m[1] ?? '')),
      )
      return FONCTIONS_SQL.filter(
        (f) =>
          /SECURITY\s+DEFINER/i.test(f.entete) &&
          !/search_path/i.test(f.entete) &&
          !alteres.has(f.nom),
      ).map((f) => ({
        regle: 'sql-definer-sans-search-path',
        fichier: `schema_complete.sql (fonction ${f.nom})`,
        ligne: f.ligne,
        detail: 'SECURITY DEFINER sans SET search_path',
      }))
    },
  },
  {
    id: 'sql-vue-sans-invoker',
    titre: 'SQL : vue sans security_invoker (contourne la RLS)',
    doc: 'CLAUDE.md « Sécurité = rôle + sites (RLS) » ; skill migration-sql',
    quoiFaire:
      'créer la vue `WITH (security_invoker = true)`, ou la suivre d’un `ALTER VIEW … SET (security_invoker = true)`',
    corpus: () => VUES_SQL.length,
    ecarts: () => {
      // Seule compte la DERNIÈRE création de chaque vue : un CREATE OR REPLACE
      // remplace ses options, l'ALTER doit donc venir après.
      const derniere = new Map<string, VueSql>()
      for (const v of VUES_SQL) derniere.set(v.nom, v)
      return [...derniere.values()]
        .filter(
          (v) =>
            !v.invoker &&
            !ALTER_VUES.some((a) => a.nom === v.nom && a.index > v.index),
        )
        .map((v) => ({
          regle: 'sql-vue-sans-invoker',
          fichier: `schema_complete.sql (vue ${v.nom})`,
          ligne: v.ligne,
          detail: 'ni WITH (security_invoker = true) ni ALTER VIEW postérieur',
        }))
    },
  },
  {
    id: 'sql-helper-auth',
    titre: 'SQL : appel auth.xxx() autre que auth.uid()',
    doc: 'CLAUDE.md « Doctrine backend » point 7',
    quoiFaire: 'passer par le helper public. (current_role, get_my_sites…)',
    corpus: () => [...SQL.matchAll(/\bauth\.uid\s*\(/g)].length,
    ecarts: () =>
      [
        // Un nom de TABLE (`REFERENCES auth.users(id)`, `INSERT INTO auth.users (`)
        // n'est pas un appel de fonction.
        ...SQL.matchAll(
          /(?<!\b(?:REFERENCES|INTO|FROM|JOIN|UPDATE|TABLE|ON)\s+)\bauth\.(\w+)\s*\(/gi,
        ),
      ]
        .filter((m) => m[1]?.toLowerCase() !== 'uid')
        .map((m) => ({
          regle: 'sql-helper-auth',
          fichier: `schema_complete.sql (auth.${m[1] ?? ''})`,
          ligne: ligneDeIndex(SQL, m.index),
          detail: m[0],
        })),
  },
  {
    id: 'dossier-non-documente',
    titre: 'Dossier ou script non cité dans CLAUDE.md ni README.md',
    doc: 'plan garde-fous permanents, étape 3 (contrôle « inverse » : du code vers la doc)',
    quoiFaire:
      'citer l’entrée (son nom) dans CLAUDE.md ou README.md, avec une phrase sur son rôle',
    corpus: () => ENTREES_A_DOCUMENTER.length,
    ecarts: () => {
      const doc = `${lire('CLAUDE.md')}\n${lire('README.md')}`
      return ENTREES_A_DOCUMENTER.filter((e) => {
        const nom = e.split('/').pop() ?? e
        const echappe = nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return !new RegExp(`(?<![\\w-])${echappe}(?![\\w-])`).test(doc)
      }).map((e) => ({
        regle: 'dossier-non-documente',
        fichier: e,
        ligne: 1,
        detail: 'nom absent de CLAUDE.md et de README.md',
      }))
    },
  },
]

/** Entrées de premier niveau qui doivent être documentées. */
const ENTREES_A_DOCUMENTER: string[] = (
  [
    ['supabase/functions', true],
    ['scripts', false],
    ['tests', false],
  ] as const
).flatMap(([dossier, dossiersSeuls]) => {
  let noms: string[]
  try {
    noms = readdirSync(join(RACINE, dossier))
  } catch {
    return []
  }
  return noms
    .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
    .filter(
      (n) => !dossiersSeuls || statSync(join(RACINE, dossier, n)).isDirectory(),
    )
    .map((n) => `${dossier}/${n}`)
})

// ---------------------------------------------------------------------------
// Exceptions et cliquet
// ---------------------------------------------------------------------------

interface Exception {
  regle: string
  fichier: string
  occurrences: number
  motif: string
}
const EXCEPTIONS = exceptionsBrutes as Exception[]

const cle = (regle: string, fichier: string) => `${regle}\u0000${fichier}`
const regleDe = (id: string) => REGLES.find((r) => r.id === id)

const ECARTS: Ecart[] = REGLES.flatMap((r) => r.ecarts())
const PAR_CIBLE = new Map<string, Ecart[]>()
for (const e of ECARTS) {
  const k = cle(e.regle, e.fichier)
  PAR_CIBLE.set(k, [...(PAR_CIBLE.get(k) ?? []), e])
}

function entreeJson(regle: string, fichier: string, occurrences: number) {
  return JSON.stringify({
    regle,
    fichier,
    occurrences,
    motif: '<raison métier>',
  })
}

function messageEcarts(regle: Regle, ecarts: Ecart[], gele: number) {
  const premier = ecarts[0]
  const fichier = premier?.fichier ?? ''
  return [
    `✗ [${regle.id}] ${regle.titre}`,
    ...ecarts.map((e) => `    ${e.fichier}:${String(e.ligne)}  ${e.detail}`),
    gele > 0
      ? `  ${String(ecarts.length)} occurrence(s), ${String(gele)} gelée(s) dans ${FICHIER_EXCEPTIONS} : c'est un NOUVEL écart.`
      : `  Aucune exception pour ce fichier : c'est un NOUVEL écart.`,
    `  Règle : ${regle.doc}`,
    `  À faire : ${regle.quoiFaire}.`,
    `  Si c'est voulu : ${gele > 0 ? 'porter `occurrences` à ' + String(ecarts.length) + ' et justifier' : 'ajouter'} dans ${FICHIER_EXCEPTIONS} :`,
    `    ${entreeJson(regle.id, fichier, ecarts.length)}`,
  ].join('\n')
}

describe('conventions du CLAUDE.md et de docs/conventions/', () => {
  it('lit réellement le dépôt (garde anti-vacuité, par règle)', () => {
    expect(FICHIERS.length).toBeGreaterThan(0)
    const vides = REGLES.filter((r) => !(r.corpus() > 0)).map((r) => r.id)
    expect(
      vides,
      'règles dont le corpus est vide : elles ne vérifient plus rien',
    ).toEqual([])
  })

  it('aucun nouvel écart', () => {
    const erreurs: string[] = []
    for (const [k, ecarts] of PAR_CIBLE) {
      const premier = ecarts[0]
      if (!premier) continue
      const regle = regleDe(premier.regle)
      if (!regle) continue
      const exc = EXCEPTIONS.find((x) => cle(x.regle, x.fichier) === k)
      const gele = exc?.occurrences ?? 0
      if (ecarts.length > gele) erreurs.push(messageEcarts(regle, ecarts, gele))
    }
    if (erreurs.length > 0)
      throw new Error(
        `${String(erreurs.length)} nouvel(s) écart(s) :\n\n${erreurs.join('\n\n')}`,
      )
  })

  it('chaque exception est motivée, unique et vise une règle connue', () => {
    const erreurs: string[] = []
    const vues = new Set<string>()
    for (const x of EXCEPTIONS) {
      const ou = `${x.regle} — ${x.fichier}`
      if (!regleDe(x.regle))
        erreurs.push(
          `✗ ${ou} : règle inconnue (ids valides : ${REGLES.map((r) => r.id).join(', ')}).`,
        )
      if (
        typeof x.motif !== 'string' ||
        x.motif.trim().length < 10 ||
        x.motif.includes('<raison')
      )
        erreurs.push(
          `✗ ${ou} : motif absent ou trop court — dire POURQUOI l'écart est toléré.`,
        )
      if (!Number.isInteger(x.occurrences) || x.occurrences < 1)
        erreurs.push(`✗ ${ou} : \`occurrences\` doit être un entier ≥ 1.`)
      const k = cle(x.regle, x.fichier)
      if (vues.has(k)) erreurs.push(`✗ ${ou} : exception en double.`)
      vues.add(k)
    }
    if (erreurs.length > 0)
      throw new Error(`${FICHIER_EXCEPTIONS} :\n${erreurs.join('\n')}`)
  })

  it('aucune exception périmée (la liste ne peut que rétrécir)', () => {
    const erreurs: string[] = []
    for (const x of EXCEPTIONS) {
      const n = PAR_CIBLE.get(cle(x.regle, x.fichier))?.length ?? 0
      if (n === 0)
        erreurs.push(
          `✗ exception périmée [${x.regle}] ${x.fichier} : l'écart a disparu (corrigé, renommé ou déplacé). Retirer cette entrée de ${FICHIER_EXCEPTIONS}.`,
        )
      else if (n < x.occurrences)
        erreurs.push(
          `✗ exception périmée [${x.regle}] ${x.fichier} : ${String(n)} occurrence(s) au lieu de ${String(x.occurrences)} gelée(s). Abaisser \`occurrences\` à ${String(n)} dans ${FICHIER_EXCEPTIONS} (le cliquet ne remonte pas).`,
        )
    }
    if (erreurs.length > 0) throw new Error(erreurs.join('\n'))
  })
})
