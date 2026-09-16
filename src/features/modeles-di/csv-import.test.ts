import { describe, expect, it } from 'vitest'
import { buildImportPrompt, parseImportCsv } from './csv-import'

const ENTETE = 'Libellé;Constat'
const existants = [{ libelle: 'Fuite d’eau' }]
/** Dernière phrase du prompt : les données brutes se collent juste après. */
const INVITATION =
  'Voici les données brutes à convertir (colle-les à la suite de ce message) :'

describe('parseImportCsv (modèles de DI)', () => {
  it('exige les deux colonnes', () => {
    const r = parseImportCsv('Nom;Texte\nx;y')
    expect(r.colonnesManquantes).toEqual(['Libellé', 'Constat'])
    expect(r.lignes).toEqual([])
  })

  it('lit un modèle complet, guillemets compris', () => {
    const r = parseImportCsv(
      `${ENTETE}\nÉclairage en panne;"Je constate qu'un éclairage ne fonctionne plus ; merci de préciser le local."`,
    )
    const [l] = r.lignes
    expect(l?.ok).toBe(true)
    if (l?.ok) {
      expect(l.libelle).toBe('Éclairage en panne')
      expect(l.constat).toContain('merci de préciser le local')
    }
  })

  it('refuse une ligne incomplète', () => {
    const r = parseImportCsv(
      [ENTETE, 'Sans constat;', ';Sans libellé'].join('\n'),
    )
    expect(r.lignes.every((l) => !l.ok)).toBe(true)
    const messages = r.lignes.flatMap((l) => (l.ok ? [] : l.erreurs)).join(' ')
    expect(messages).toContain('Constat est obligatoire')
    expect(messages).toContain('Libellé est obligatoire')
  })

  it('ignore un libellé déjà en base, et un doublon interne au CSV', () => {
    const r = parseImportCsv(
      [
        ENTETE,
        'Fuite d’eau;Je constate une fuite.',
        'Porte bloquée;La porte ne s’ouvre plus.',
        'porte bloquée;Doublon de casse différente.',
      ].join('\n'),
      existants,
    )
    expect(r.lignes[0]?.ok === false && r.lignes[0].ignoree).toBe(true)
    expect(r.lignes[1]?.ok).toBe(true)
    expect(r.lignes[2]?.ok === false && r.lignes[2].ignoree).toBe(true)
  })
})

describe('parseImportCsv (modèles de DI) — cas limites', () => {
  it('ne réclame aucune colonne quand rien n’a été collé', () => {
    // ORACLE : « colonnes manquantes » accuse l'EN-TÊTE. Sur un collage vide il
    // n'y a pas d'en-tête fautif : le parseur doit rester muet, sinon la modale
    // reproche à l'utilisateur une erreur de format qu'il n'a pas commise.
    for (const texte of ['', '   ', '\n\n']) {
      expect(parseImportCsv(texte)).toEqual({
        colonnesManquantes: [],
        lignes: [],
      })
    }
  })

  it('ne réclame que la colonne réellement absente', () => {
    // ORACLE : le message doit désigner ce qui manque, pas tout l'en-tête.
    expect(parseImportCsv('Libellé;Autre\nx;y').colonnesManquantes).toEqual([
      'Constat',
    ])
    expect(parseImportCsv('Autre;Constat\nx;y').colonnesManquantes).toEqual([
      'Libellé',
    ])
  })

  it('tolère la casse et les blancs dans l’en-tête', () => {
    // ORACLE : l'en-tête est écrit par une IA puis recollé (parfois depuis
    // Excel) : sa casse et ses espaces sont du bruit de mise en forme, pas une
    // donnée. Seul le NOM de colonne fait foi.
    const r = parseImportCsv('  libellé ;CONSTAT\nFuite;Je constate une fuite.')
    expect(r.colonnesManquantes).toEqual([])
    expect(r.lignes[0]?.ok).toBe(true)
  })

  it('numérote les lignes en comptant l’en-tête comme ligne 1', () => {
    // ORACLE : le numéro rapporté sert à retrouver la ligne dans le texte
    // collé ; la 1re ligne de données est donc la ligne 2.
    const r = parseImportCsv(
      [ENTETE, 'A;Constat A.', ';', 'C;Constat C.'].join('\n'),
    )
    expect(r.lignes.map((l) => l.ligne)).toEqual([2, 3, 4])
  })

  it('trime les cellules et traite une cellule ABSENTE comme vide', () => {
    // ORACLE : une cellule manquante en fin de ligne (l'IA en oublie une) vaut
    // une cellule vide — jamais un `undefined` qui filerait jusqu'en base.
    const r = parseImportCsv(`${ENTETE}\n  Fuite  ;  Je constate une fuite.  `)
    expect(r.colonnesManquantes).toEqual([])
    expect(r.lignes[0]).toEqual({
      ok: true,
      ligne: 2,
      libelle: 'Fuite',
      constat: 'Je constate une fuite.',
    })
    const sansLibelle = parseImportCsv(
      'Constat;Libellé\nJe constate une fuite.',
    )
    expect(sansLibelle.lignes[0]).toEqual({
      ok: false,
      ligne: 2,
      erreurs: ['Libellé est obligatoire.'],
    })
    const sansConstat = parseImportCsv(`${ENTETE}\nFuite`)
    expect(sansConstat.lignes[0]).toEqual({
      ok: false,
      ligne: 2,
      erreurs: ['Constat est obligatoire.'],
    })
    // Une cellule de blancs n'est pas une valeur.
    const blancs = parseImportCsv(`${ENTETE}\n   ;   `)
    expect(blancs.lignes[0]).toEqual({
      ok: false,
      ligne: 2,
      erreurs: ['Libellé est obligatoire.', 'Constat est obligatoire.'],
    })
  })

  it('borne le libellé à 200 et le constat à 5000 caractères', () => {
    // ORACLE : bornes annoncées par le prompt ET tenues par la base — la
    // longueur MAXIMALE passe, le caractère suivant est refusé nommément.
    const l200 = 'L'.repeat(200)
    const c5000 = 'C'.repeat(5000)
    expect(parseImportCsv(`${ENTETE}\n${l200};${c5000}`).lignes[0]).toEqual({
      ok: true,
      ligne: 2,
      libelle: l200,
      constat: c5000,
    })
    expect(parseImportCsv(`${ENTETE}\n${l200}X;${c5000}C`).lignes[0]).toEqual({
      ok: false,
      ligne: 2,
      erreurs: [
        'Libellé dépasse 200 caractères.',
        'Constat dépasse 5000 caractères.',
      ],
    })
  })

  it('nomme le modèle déjà pris dans le message de la ligne ignorée', () => {
    // ORACLE : l'utilisateur doit lire QUEL libellé a été écarté, dans la
    // graphie qu'il a collée — sinon il cherche la ligne à l'aveugle.
    const r = parseImportCsv(
      `${ENTETE}\nFUITE D’EAU;Je constate une fuite.`,
      existants,
    )
    expect(r.lignes[0]).toEqual({
      ok: false,
      ligne: 2,
      ignoree: true,
      erreurs: ['« FUITE D’EAU » existe déjà — ligne ignorée.'],
    })
  })

  it('reconnaît un libellé en base entouré d’espaces', () => {
    // ORACLE : un libellé stocké avec des blancs parasites désigne le MÊME
    // modèle — sans ce recadrage, l'import le recrée en double.
    const r = parseImportCsv(`${ENTETE}\nFuite d’eau;Je constate une fuite.`, [
      { libelle: '  Fuite d’eau  ' },
    ])
    expect(r.lignes[0]?.ok === false && r.lignes[0].ignoree).toBe(true)
  })
})

describe('buildImportPrompt (modèles de DI)', () => {
  it('adapte le texte au périmètre et liste les modèles existants', () => {
    const commun = buildImportPrompt({ existants, portee: 'entreprise' })
    expect(commun).toContain("communs à toute l'entreprise")
    expect(commun).toContain('- Fuite d’eau')

    const site = buildImportPrompt({
      existants: [],
      portee: 'site',
      siteNom: 'Tour A',
    })
    expect(site).toContain('« Tour A »')
  })

  it('énonce toutes les règles de format que le parseur suppose', () => {
    // ORACLE : le prompt est le CONTRAT passé à l'IA. Chaque règle listée ici
    // correspond à une hypothèse du parseur (séparateur, en-tête unique,
    // échappement des guillemets, aucune phrase parasite) : si elle disparaît
    // du prompt, l'IA produit un CSV « conforme au prompt » que l'import
    // refusera.
    const lignes = buildImportPrompt({
      existants: [],
      portee: 'entreprise',
    }).split('\n')
    for (const regle of [
      'Format EXACT attendu :',
      '- Séparateur de colonnes : point-virgule ( ; )',
      '- Encodage : UTF-8',
      "- Une ligne d'en-tête avec EXACTEMENT ces noms de colonnes, dans cet ordre, puis une ligne par modèle.",
      '- Si une cellule contient un point-virgule ou un retour à la ligne, entoure-la de guillemets doubles.',
      "- Ne réponds RIEN d'autre que le contenu du CSV (pas de phrase avant/après, pas de bloc de code superflu).",
      'Colonnes :',
    ]) {
      expect(lignes).toContain(regle)
    }
    // Les deux colonnes EXIGÉES par le parseur sont décrites, chacune en puce.
    for (const colonne of ['Libellé', 'Constat']) {
      expect(
        lignes.some((l) => l.startsWith(`- ${colonne} — obligatoire.`)),
      ).toBe(true)
    }
  })

  it('reste un document lisible : paragraphes séparés, invitation en dernier', () => {
    // ORACLE : le prompt est collé dans une IA avec les données brutes À LA
    // SUITE. Sa structure (un paragraphe par idée, une ligne vide entre
    // chacun, une invitation finale suivie d'une ligne vide) est ce qui évite
    // que les données collées se retrouvent soudées au texte d'instruction.
    const lignes = buildImportPrompt({
      existants: [],
      portee: 'entreprise',
    }).split('\n')
    expect(lignes[0]).toContain("modèles de « demande d'intervention »")
    expect(lignes[1]).toBe('')
    expect(lignes[2]).toContain('constat type, prérempli')
    expect(lignes[3]).toBe('')
    expect(lignes[4]).toBe(
      "Ces modèles seront communs à toute l'entreprise : reste générique, sans référence à un bâtiment précis.",
    )
    expect(lignes[5]).toBe('')
    expect(lignes[6]).toBe('Format EXACT attendu :')
    // Ligne vide avant chaque titre de section.
    expect(lignes[lignes.indexOf('Colonnes :') - 1]).toBe('')

    const i = lignes.indexOf(INVITATION)
    expect(i).toBeGreaterThan(0)
    expect(lignes[i - 1]).toBe('')
    // Sans modèle existant, rien ne s'intercale entre les colonnes et l'invitation.
    expect(lignes[i - 2]?.startsWith('- Constat —')).toBe(true)
    expect(lignes.slice(i + 1)).toEqual([''])
  })

  it('annonce le site quand le périmètre est un site', () => {
    // ORACLE : hors entreprise, l'IA doit savoir qu'elle écrit POUR un site.
    const lignes = buildImportPrompt({
      existants: [],
      portee: 'site',
      siteNom: 'Tour A',
    }).split('\n')
    expect(lignes[4]).toBe('Ces modèles seront propres au site « Tour A ».')
    const sansNom = buildImportPrompt({ existants: [], portee: 'site' }).split(
      '\n',
    )
    expect(sansNom[4]).toBe('Ces modèles seront propres au site.')
  })

  it('n’ouvre la liste des modèles existants que s’il y en a', () => {
    // ORACLE : annoncer une liste vide invite l'IA à la remplir — exactement
    // le doublon qu'on cherche à éviter.
    const sans = buildImportPrompt({ existants: [], portee: 'entreprise' })
    expect(sans).not.toContain('Modèles DÉJÀ enregistrés')

    const avec = buildImportPrompt({ existants, portee: 'entreprise' }).split(
      '\n',
    )
    const i = avec.indexOf(
      'Modèles DÉJÀ enregistrés (ne les remets PAS dans le CSV, même si tes données sources les mentionnent) :',
    )
    expect(i).toBeGreaterThan(0)
    expect(avec[i - 1]).toBe('')
    expect(avec[i - 2]?.startsWith('- Constat —')).toBe(true)
    expect(avec[i + 1]).toBe('- Fuite d’eau')
    expect(avec[i + 2]).toBe('')
  })
})
