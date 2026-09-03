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
  const echapperCaracteresSpeciaux = new RegExp(`["${delimiter}\n]`)
  const echapper = (v: string) =>
    echapperCaracteresSpeciaux.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  return [entetes, ...lignes]
    .map((ligne) => ligne.map(echapper).join(delimiter))
    .join('\r\n')
}

/**
 * Déclenche le téléchargement d'un CSV dans le navigateur. BOM UTF-8 en tête :
 * sans lui, Excel (FR, le lecteur cible ici) interprète le fichier en ANSI et
 * corrompt les caractères accentués.
 */
export function telechargerCsv(
  nomFichier: string,
  entetes: string[],
  lignes: string[][],
): void {
  const BOM_UTF8 = '﻿'
  const contenu = BOM_UTF8 + formaterCsv(entetes, lignes)
  const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}
