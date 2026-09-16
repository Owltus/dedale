import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { formatMime, formatTaille } from './format'

const TIRAGES = { numRuns: 1000, seed: 42 } as const

/** Taille de fichier réaliste : de l'octet au gigaoctet. */
const taille = fc.integer({ min: 0, max: 2_000_000_000 })

/**
 * Taille tirée AUTOUR des seuils de bascule d'unité : c'est là que vivent les
 * erreurs d'arrondi, et le hasard uniforme sur 0-2 Go n'y tombe jamais.
 */
const tailleAuxBords = fc
  .tuple(
    fc.constantFrom(1024, 1024 * 1024, 1024 * 1024 * 1024),
    fc.integer({ min: -2048, max: 2048 }),
  )
  .map(([seuil, ecart]) => Math.max(0, seuil + ecart))

/** Toutes les tailles : uniformes ET concentrées sur les seuils de bascule. */
const tailleQuelconque = fc.oneof(taille, tailleAuxBords)

/** Décompose « 1023 Ko » en { valeur: 1023, unite: 'Ko' }. */
function lire(rendu: string): { valeur: number; unite: string } {
  const m = /^(-?[\d.]+) (o|Ko|Mo)$/.exec(rendu)
  expect(m, `rendu illisible : « ${rendu} »`).not.toBeNull()
  return { valeur: Number(m?.[1]), unite: m?.[2] ?? '' }
}

describe('formatTaille', () => {
  it('rend toujours un nombre suivi d’une unité connue', () => {
    // ORACLE (totalité) : la taille s'affiche telle quelle dans la liste des
    // documents. Le rendu doit rester lisible (nombre + unité) sur toute la
    // plage possible d'une colonne `taille_octets`, 0 et les très gros fichiers
    // compris.
    fc.assert(
      fc.property(taille, (octets) => {
        const { valeur, unite } = lire(formatTaille(octets))
        expect(Number.isFinite(valeur)).toBe(true)
        expect(['o', 'Ko', 'Mo']).toContain(unite)
      }),
      TIRAGES,
    )
    expect(formatTaille(0)).toBe('0 o')
    expect(() => formatTaille(-1)).not.toThrow()
    expect(() => formatTaille(Number.MAX_SAFE_INTEGER)).not.toThrow()
  })

  it('est monotone : à unité égale, un fichier plus gros n’affiche jamais moins', () => {
    // ORACLE (monotonie d'un formatage de grandeur) : l'arrondi peut égaliser
    // deux tailles voisines, jamais les inverser. Une liste triée par taille
    // réelle doit rester lisiblement croissante à l'écran.
    fc.assert(
      fc.property(tailleQuelconque, tailleQuelconque, (a, b) => {
        const [petit, grand] = a <= b ? [a, b] : [b, a]
        const rp = lire(formatTaille(petit))
        const rg = lire(formatTaille(grand))
        if (rp.unite === rg.unite) {
          expect(rg.valeur).toBeGreaterThanOrEqual(rp.valeur)
        }
      }),
      TIRAGES,
    )
  })

  it('l’unité choisie ne DÉCROÎT jamais quand la taille croît', () => {
    // ORACLE (même monotonie, au niveau de l'unité) : o puis Ko puis Mo. Un
    // fichier plus gros ne peut pas redescendre d'un cran d'unité.
    const rang: Record<string, number> = { o: 0, Ko: 1, Mo: 2 }
    fc.assert(
      fc.property(tailleQuelconque, tailleQuelconque, (a, b) => {
        const [petit, grand] = a <= b ? [a, b] : [b, a]
        expect(rang[lire(formatTaille(grand)).unite]).toBeGreaterThanOrEqual(
          rang[lire(formatTaille(petit)).unite]!,
        )
      }),
      TIRAGES,
    )
  })

  it('une taille exprimée en Ko reste strictement sous 1024 Ko', () => {
    // ORACLE (définition d'un changement d'unité) : on passe aux Mo à 1024 Ko.
    // Afficher « 1024 Ko » est la marque d'un arrondi appliqué APRÈS le choix de
    // l'unité : la valeur mérite alors le cran supérieur. Même règle pour les
    // octets, qui ne doivent pas atteindre 1024 o.
    //
    // Régression couverte : le seuil de bascule était comparé sur les octets
    // bruts (< 1024 * 1024) alors que l'affichage arrondit ensuite à l'entier.
    // Tout fichier entre 1 023,5 Ko et 1 024 Ko s'affichait donc « 1024 Ko »,
    // une taille qui n'existe pas. Fenêtre étroite — 512 octets — mais elle
    // tombe là où les PDF sont nombreux.
    expect(lire(formatTaille(1_048_064)).unite).toBe('Mo')
    fc.assert(
      fc.property(tailleAuxBords, (octets) => {
        const { valeur, unite } = lire(formatTaille(octets))
        if (unite === 'Ko') expect(valeur).toBeLessThan(1024)
        if (unite === 'o') expect(valeur).toBeLessThan(1024)
      }),
      TIRAGES,
    )
  })

  it('les seuils de bascule d’unité sont posés aux puissances de 1024', () => {
    // ORACLE (doc : « Taille fichier lisible (Ko / Mo) ») : 1023 octets restent
    // des octets, 1024 font 1 Ko, et 1 Mio fait 1,0 Mo.
    expect(formatTaille(1023)).toBe('1023 o')
    expect(formatTaille(1024)).toBe('1 Ko')
    expect(formatTaille(1024 * 1024)).toBe('1.0 Mo')
  })
})

describe('formatMime', () => {
  it('ne rend jamais une chaîne vide', () => {
    // ORACLE (totalité) : le libellé sert de badge de format dans la liste des
    // documents. Un type MIME inconnu doit s'afficher brut plutôt que rien.
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (mime) => {
        expect(formatMime(mime).length).toBeGreaterThan(0)
      }),
      TIRAGES,
    )
  })

  it('reconnaît les deux seuls formats acceptés par le bucket (PDF et WebP)', () => {
    // ORACLE (CLAUDE.md / mémoire projet) : « bucket serveur = PDF/WebP seul ».
    // Ce sont les deux libellés que l'utilisateur verra en pratique.
    expect(formatMime('application/pdf')).toBe('PDF')
    expect(formatMime('image/webp')).toBe('WebP')
  })

  it('toute autre image reste identifiée comme image', () => {
    // ORACLE (doc) : « Libellé court du format ». Une image non WebP (avant
    // compression, ou pièce héritée) se lit « Image », pas « image/png ».
    fc.assert(
      fc.property(
        fc.constantFrom('png', 'jpeg', 'gif', 'avif', 'heic'),
        (sous) => {
          expect(formatMime(`image/${sous}`)).toBe('Image')
        },
      ),
      TIRAGES,
    )
    // Le filtre générique d'un `<input accept>` a son libellé propre.
    expect(formatMime('image/*')).toBe('image')
  })

  it('un type non reconnu est rendu tel quel, sans perte d’information', () => {
    // ORACLE (totalité) : plutôt afficher « application/zip » qu'un libellé
    // générique qui masquerait la nature réelle du fichier.
    fc.assert(
      fc.property(
        fc.constantFrom(
          'application/zip',
          'text/csv',
          'video/mp4',
          'application/vnd.ms-excel',
        ),
        (mime) => {
          expect(formatMime(mime)).toBe(mime)
        },
      ),
      TIRAGES,
    )
  })
})
