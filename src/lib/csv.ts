/** Marque d'ordre des octets UTF-8, en échappement (invisible autrement). */
const BOM_UTF8 = '\uFEFF'

/** Un enregistrement lu, et le numéro de la ligne d'ORIGINE qui le commence. */
export interface CsvEnregistrement {
  cellules: string[]
  ligne: number
}

/**
 * Cœur du lecteur : rend les enregistrements AVEC leur numéro de ligne
 * d'origine. `parseCsv` et `parseCsvIndexe` n'en sont que deux vues — le
 * découpage lui-même n'existe qu'ici, en un seul exemplaire.
 */
function lireCsv(text: string, delimiter: string): CsvEnregistrement[] {
  const rows: CsvEnregistrement[] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // Ligne d'origine du caractère courant, et ligne où COMMENCE
  // l'enregistrement en cours (un champ protégé peut porter des sauts de
  // ligne : l'enregistrement s'étend alors sur plusieurs lignes du collage).
  let ligne = 1
  let ligneDebut = 1
  // BOM UTF-8 de tête retiré AVANT toute lecture : Excel en préfixe ses
  // exports, et `telechargerCsv` en écrit un lui-même (cf. plus bas) — un
  // export de l'app réimporté porterait sinon le BOM collé à son premier
  // en-tête. Ce défaut était jusqu'ici masqué par le `.trim()` que chaque
  // module d'import applique à ses en-têtes (U+FEFF est un blanc au sens
  // ECMA-262, production WhiteSpace) : ce filet reste REDONDANT, donc fragile —
  // une factorisation des sept modules qui le supprimerait réveillerait le
  // défaut dans les sept d'un coup. Le BOM se retire ICI, une fois pour toutes.
  // \r\n / \r / \n tous acceptés : la source est un copier-coller, pas un
  // fichier maîtrisé.
  const src = (text.startsWith(BOM_UTF8) ? text.slice(1) : text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push({ cellules: row, ligne: ligneDebut })
    row = []
  }

  for (let i = 0; i < src.length; i++) {
    const c = src[i] ?? ''
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        // Saut de ligne INTÉRIEUR à un champ protégé : il ne termine pas
        // l'enregistrement, mais il fait bien avancer la ligne d'origine.
        if (c === '\n') ligne++
        field += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
    } else if (c === delimiter) {
      pushField()
    } else if (c === '\n') {
      pushRow()
      ligne++
      ligneDebut = ligne
    } else {
      field += c
    }
  }
  // Dernière ligne (pas de retour final) : ne la pousse que si elle porte du
  // contenu réel (évite une ligne vide fantôme en fin de collage).
  if (field !== '' || row.length > 0) pushRow()

  // Lignes ENTIÈREMENT vides (ex. ligne blanche en fin de collage) écartées.
  // Leur disparition ne décale RIEN : chaque enregistrement conserve le numéro
  // de sa ligne d'origine.
  return rows.filter(
    (r) => !(r.cellules.length === 1 && (r.cellules[0] ?? '').trim() === ''),
  )
}

/**
 * Lecture CSV minimale (RFC 4180) : séparateur configurable (`;` par défaut,
 * cf. doctrine import équipements — la virgule sert de séparateur décimal en
 * France), champs entre guillemets doubles (séparateur/retour à la ligne
 * échappés dedans, `""` = un guillemet littéral). Pas d'écriture — ce module
 * ne fait QUE lire un CSV collé/déposé par l'utilisateur.
 *
 * Vue SANS numérotation : les modules d'import, qui doivent citer à
 * l'utilisateur la ligne fautive de son fichier, passent par `parseCsvIndexe`.
 */
export function parseCsv(text: string, delimiter = ';'): string[][] {
  return lireCsv(text, delimiter).map((r) => r.cellules)
}

/**
 * Comme `parseCsv`, mais conserve le numéro de ligne d'ORIGINE de chaque
 * enregistrement. Les lignes blanches sont toujours écartées — mais leur
 * disparition ne décale plus la numérotation rapportée à l'utilisateur.
 */
export function parseCsvIndexe(
  text: string,
  delimiter = ';',
): CsvEnregistrement[] {
  return lireCsv(text, delimiter)
}

/**
 * Sérialise des lignes en texte CSV (RFC 4180, `;` par défaut — cf. doctrine
 * import équipements, la virgule sert de séparateur décimal en France) :
 * n'entoure de guillemets que les champs qui en ont besoin.
 */
export function formaterCsv(
  entetes: string[],
  lignes: string[][],
  delimiter = ';',
): string {
  // Le `\r` compte autant que le `\n` : `parseCsv` lit un retour chariot isolé
  // comme une fin de ligne (RFC 4180 : CR en fait partie). Une cellule qui en
  // porte un — copier-coller d'un vieux tableur ou d'un PDF — doit donc être
  // protégée, faute de quoi la ligne est coupée en deux et tout le reste du
  // fichier se décale d'une colonne. Le délimiteur, lui, est une DONNÉE : on
  // l'échappe avant de l'interpoler dans la classe de caractères, sinon un
  // délimiteur comme `-` y formerait un intervalle invalide (RegExp qui jette).
  const echapperCaracteresSpeciaux = new RegExp(
    `["\\r\\n${delimiter.replace(/[\\\]^-]/g, '\\$&')}]`,
  )
  const echapper = (v: string) =>
    echapperCaracteresSpeciaux.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  return [entetes, ...lignes]
    .map((ligne) => ligne.map(echapper).join(delimiter))
    .join('\r\n')
}

/**
 * Déclenche le téléchargement d'un CSV dans le navigateur. BOM UTF-8 en tête :
 * sans lui, Excel (FR, le lecteur cible ici) interprète le fichier en ANSI et
 * corrompt les caractères accentués. `parseCsv` sait le relire (il le retire).
 */
export function telechargerCsv(
  nomFichier: string,
  entetes: string[],
  lignes: string[][],
): void {
  const contenu = BOM_UTF8 + formaterCsv(entetes, lignes)
  const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}
