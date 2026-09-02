/**
 * Lecture CSV minimale (RFC 4180) : séparateur configurable (`;` par défaut,
 * cf. doctrine import équipements — la virgule sert de séparateur décimal en
 * France), champs entre guillemets doubles (séparateur/retour à la ligne
 * échappés dedans, `""` = un guillemet littéral). Pas d'écriture — ce module
 * ne fait QUE lire un CSV collé/déposé par l'utilisateur.
 */
export function parseCsv(text: string, delimiter = ';'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // \r\n / \r / \n tous acceptés : la source est un copier-coller, pas un
  // fichier maîtrisé.
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
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
    } else {
      field += c
    }
  }
  // Dernière ligne (pas de retour final) : ne la pousse que si elle porte du
  // contenu réel (évite une ligne vide fantôme en fin de collage).
  if (field !== '' || row.length > 0) pushRow()

  // Lignes ENTIÈREMENT vides (ex. ligne blanche en fin de collage) écartées.
  return rows.filter((r) => !(r.length === 1 && (r[0] ?? '').trim() === ''))
}
