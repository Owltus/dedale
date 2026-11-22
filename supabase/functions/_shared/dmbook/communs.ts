/**
 * Parties communes : mots du texte Dmbook → local Dédale (nom exact).
 * L'ordre compte : la PREMIÈRE règle qui correspond gagne (du plus précis au
 * plus général). Ce qui ne correspond à rien reste « sans lieu ».
 * Liste montrée au PO avant import. Porté depuis poc-dmbook.local/communs.ts.
 */
export const REGLES_COMMUNS: [RegExp, string][] = [
  [/r[ée]serve s[èe]che|table froide|plonge|cong[ée]l/i, 'Cuisine Club'],
  [/front[\s-]?desk|r[ée]cep\b|t[ée]l[ée]phone (principal|r[ée]cep)/i, "Hall d'entrée"],
  [/garage/i, 'Entrée Parking'],
  [/ascen[cs]eur/i, "Cage d'ascenseur"],
  [/toilettes|\bwc\b|chasse d'eau/i, 'Sanitaires'],
  [/vestiaire[^.]{0,20}sauna|sauna|hammam/i, 'Vestiaire - Sauna'],
  [/salle de sport|salle de sports|\bgym\b|fitness|tapis de course|v[ée]lo d'appartement/i, 'Salle de sports'],
  [/cuisine/i, 'Cuisine Club'],
  [/r[ée]serve club/i, 'Réserve Club'],
  [/\bclub\b|\bbar\b|lobby|restaurant|machine [àa] caf[ée]|\bwmf\b/i, 'Club'],
  [/back[\s-]?office|\bbo\b/i, 'Back Office'],
  [/bureau (de )?(la )?direction|bureau direction|bureau directeur/i, 'Bureau Direction'],
  [/bureau technique|atelier/i, 'Bureau Technique'],
  [/bagagerie|bagages/i, 'Bagagerie'],
  [/hall|r[ée]ception|accueil/i, "Hall d'entrée"],
  [/sas d'entr[ée]e|porte (d'entr[ée]e|ext[ée]rieure|principale)|porte de l'h[ôo]tel/i, "SAS d'entrée"],
  [/vestiaire[^.]{0,15}(homme|hommes)/i, 'Vestiaire Hommes'],
  [/vestiaire[^.]{0,15}(femme|femmes)/i, 'Vestiaire Femmes'],
  [/vestiaire[^.]{0,15}(housekeeping|hk|femme de chambre)/i, 'Vestiaire Housekeeping'],
  [/(wc|toilettes?|sanitaires?|chasse d'eau)[^.]{0,20}(femme|homme|client|public|rdc)|sanitaires/i, 'Sanitaires'],
  [/lingerie sale|linge sale/i, 'Lingerie Sale'],
  [/lingerie propre/i, 'Lingerie Propre'],
  [/stock linge/i, 'Stock Linge'],
  [/stock lingerie/i, 'Stock Lingerie'],
  [/stock h[ée]bergement/i, 'Stock Hébergement'],
  [/repassage|calandre/i, 'Local repassage'],
  [/lingerie|lave[\s-]linge|s[èe]che[\s-]linge|machine [àa] laver/i, 'Lingerie'],
  [/gouvernante/i, 'Local Gouvernante'],
  [/salle de pause|salle du personnel|r[ée]fectoire/i, 'Salle de pause'],
  [/poubelle|d[ée]chets|conteneur/i, 'Local poubelle'],
  [/quai|livraison/i, 'Quai de livraison'],
  [/chaufferie|chaudi[èe]re|ballon d'eau chaude|eau chaude sanitaire/i, 'Chaufferie'],
  [/surpresseur/i, 'Local Surpresseur'],
  [/tgbt|tableau g[ée]n[ée]ral/i, 'LOCAL TGBT'],
  [/\bvdi\b|baie (de )?brassage|local informatique|serveur/i, 'LOCAL VDI'],
  [/ascenseur/i, "Cage d'ascenseur"],
  [/entr[ée]e (du )?parking|barri[èe]re|portail parking/i, 'Entrée Parking'],
  [/parking/i, 'Zonne Parking'],
  [/toiture|terrasse technique|\bcta\b|groupe froid|zone technique/i, 'Zone technique'],
  // Ajouts du contrôle du 19/11/2026 (demandes restées sans lieu) — en fin de liste
  // pour ne rien changer aux demandes déjà placées.
  [/tapis (de )?course/i, 'Salle de sports'],
  [/chasse d'?eau/i, 'Sanitaires'],
  [/porche/i, "SAS d'entrée"],
  [/\bfour\b|lave[\s-]?vaisselle|trancheuse|bac [àa] graisse|machine [àa] (oeuf|œuf)|cuire les (oeufs|œufs)|frigo [àa] lait/i, 'Cuisine Club'],
  [/gla[cç]on|buffet|viennoiserie|planche [àa] pain|\bpdj\b|castalie|fontaine [àa] eau|machine [àa] eau|machine [àa] k?f[ée]/i, 'Club'],
]

/** Un local Dédale : nom + niveau (les « Circulation » existent à chaque étage). */
export type LocalVise = { nom: string; niveau?: string }

// « couloir du 4ème », « 1er étage », « palier 6eme »… → Circulation R+N.
const ETAGE = /(couloir|[ée]tage|palier|plinthe|signal[ée]tique)[^.#\d]{0,25}?([1-6])\s?(?:er|[èée]me|e|ėme)(?![a-z])|\b([1-6])\s?(?:er|[èée]me|ėme)\s+(?:[ée]tage|couloir)/i

// Écritures plus libres (« #2em … couloir », « #5èm spot », « réserve du 3ème »,
// « 3e étage ») — essayées seulement si ETAGE n'a rien trouvé.
const RANG = '([1-6])\\s?(?:er|[èéeė]me|[èée]m|em|e)\\b'
const LIEU_ETAGE = 'couloir|moquette|spot|escalier|peinture|baguette|[ée]tage|extincteur|hublot'
const ETAGE_LARGE = new RegExp(`(?:^|[\\s#])${RANG}(?=[^.]{0,40}(?:${LIEU_ETAGE}))|(?:${LIEU_ETAGE}|r[ée]serve)[^.#\\d]{0,30}?(?:^|\\s)(?:du |au )?${RANG}`, 'i')

export function lireCommun(texte: string): LocalVise | null {
  for (const [re, nom] of REGLES_COMMUNS) if (re.test(texte)) return { nom }
  const m = texte.match(ETAGE)
  if (m) return { nom: 'Circulation', niveau: `R+${m[2] ?? m[3]}` }
  const m2 = texte.match(ETAGE_LARGE)
  if (m2) return { nom: 'Circulation', niveau: `R+${m2[1] ?? m2[2]}` }
  return null
}

