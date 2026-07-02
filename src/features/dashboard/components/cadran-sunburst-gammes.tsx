import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Sunburst,
  type SunburstNode,
} from '@/components/common/charts/sunburst'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { statutAffichageGamme } from '@/features/gammes/statut-affichage'
import type { StatutAffichage } from '@/features/ordres-travail/statut-affichage'
import type { PlanningOt } from '@/features/planning/grille'
import { segOfUnique } from '@/lib/slug'
import { DashboardCard } from './dashboard-card'
import { CLASSE_CARRE_CADRAN } from './synthese-layout'
import { useDashboardData } from '../use-dashboard-data'

interface CadranSunburstGammesProps {
  siteId: string
}

/**
 * SANTÉ d'une gamme réduite à quatre familles d'affichage, DÉRIVÉE de la synthèse
 * partagée `statutAffichageGamme` (mêmes libellés/couleurs que les badges du Plan
 * de maintenance) :
 *   - « bon »       : « À jour » (tous les OT terminaux ou rien d'imminent) ;
 *   - « probleme »  : « En retard » / « Rouvert » (à traiter maintenant) ;
 *   - « aTraiter »  : engagé (« En cours ») ou proximité (« Cette semaine »…) ;
 *   - « inactif »   : gamme désactivée ou sans OT (rien à suivre).
 * On ne teste JAMAIS la couleur du badge pour décider (elle est présentation) sauf
 * comme raccourci de lecture non ambigu : succès ⇒ à jour, neutre ⇒ inactif ; les
 * deux états « problème » sont reconnus par leur libellé canonique.
 */
type Sante = 'bon' | 'aTraiter' | 'probleme' | 'inactif'

function classifierSante(aff: StatutAffichage): Sante {
  if (aff.label === 'En retard' || aff.label === 'Rouvert') return 'probleme'
  if (aff.tone === 'success') return 'bon'
  if (aff.tone === 'neutral') return 'inactif'
  return 'aTraiter'
}

/**
 * Palette catégorielle des DOMAINES : couleurs CHOISIES et STABLES — un domaine garde
 * toujours la même (assignation par index), réutilisée en rotation au-delà de douze.
 * L'ordre est volontairement « en désordre » (les teintes sautent d'un bout à l'autre
 * de la roue) pour que deux domaines VOISINS sur l'anneau contrastent franchement.
 * Luminosité et chroma proches → style d'ensemble cohérent. La couleur est REPRISE
 * telle quelle (pleine) par les familles et les gammes ; seul le statut de la gamme la
 * module (cf. `couleurGamme`).
 */
const PALETTE_DOMAINES = [
  'oklch(0.62 0.17 255)', // bleu
  'oklch(0.68 0.16 40)', // orange
  'oklch(0.6 0.15 155)', // vert
  'oklch(0.58 0.2 340)', // magenta
  'oklch(0.72 0.15 90)', // or
  'oklch(0.55 0.2 295)', // violet
  'oklch(0.64 0.13 200)', // sarcelle
  'oklch(0.58 0.19 20)', // rouge
  'oklch(0.66 0.15 130)', // vert clair
  'oklch(0.6 0.16 275)', // indigo
  'oklch(0.68 0.15 60)', // ambre
  'oklch(0.6 0.18 320)', // pourpre
]

/** Base neutre (grise) du repli « Non classé » — hors de la roue catégorielle. */
const BASE_NON_CLASSE = 'var(--muted-foreground)'

/** Gamme inactive : on l'ÉTEINT vers le fond de carte → segment discret et sombre. */
const eteindre = (base: string, pct: number) =>
  `color-mix(in oklab, ${base} ${String(pct)}%, var(--card))`

/**
 * Couleur finale d'une GAMME (anneau extérieur) : la couleur PLEINE du domaine (comme
 * l'anneau intérieur) pour toute gamme active ; seule l'INACTIVE est estompée vers le
 * fond (segment discret). Le reste du statut se lit HORS couleur : « en retard » CLIGNOTE,
 * réglementaire = hachures (cf. `feuilleGamme`).
 */
function couleurGamme(base: string, sante: Sante): string {
  return sante === 'inactif' ? eteindre(base, 22) : base
}

/** Nœud interne (domaine / famille) sans santé propre : teinte + navigation. */
interface ArbreResultat {
  noeuds: SunburstNode[]
  /** Nombre TOTAL de gammes du site (dénominateur du % — inclut inactives). */
  totalGammes: number
  /** Nombre de gammes « à jour » (numérateur du %). */
  gammesAJour: number
}

/**
 * Cadran « Complétion des gammes » (zone 1 droite du tableau de bord) : un sunburst
 * à trois anneaux domaine → famille → gamme. Chaque DOMAINE a sa COULEUR franche, REPRISE
 * TELLE QUELLE (pleine) par ses familles et ses gammes — les anneaux se distinguent par
 * les interstices, pas par la luminosité. Sur l'anneau extérieur, le STATUT de chaque
 * gamme (dérivé des MÊMES helpers que les badges du Plan de maintenance) se lit sans
 * délaver la couleur : à jour = couleur pleine, inactive = estompée (segment sombre),
 * « en retard » CLIGNOTE, gammes réglementaires HACHURÉES.
 *
 * Au centre, le POURCENTAGE de gammes « à jour » sur TOUTES les gammes du site (une
 * gamme abandonnée / non maintenue pèse comme un manque — exigence PO). Clic sur un
 * domaine/famille → explorateur Plan de maintenance ; clic sur une gamme → sa fiche ;
 * clic sur le centre → même sunburst en plein écran.
 *
 * **Aucune gamme sur le site → le cadran ne se rend pas** (`null`).
 */
export function CadranSunburstGammes({ siteId }: CadranSunburstGammesProps) {
  const { ordresTravail, categoriesQuery, gammesQuery } =
    useDashboardData(siteId)
  const navigate = useNavigate()
  const [pleinEcran, setPleinEcran] = useState(false)

  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data],
  )
  const gammes = useMemo(() => gammesQuery.data ?? [], [gammesQuery.data])

  const { noeuds, totalGammes, gammesAJour } = useMemo<ArbreResultat>(() => {
    // OT regroupés par gamme (via `gamme_id`, jamais par nom) : source de la santé.
    const otsParGamme = new Map<string, PlanningOt[]>()
    for (const ot of ordresTravail) {
      if (ot.gamme_id === null) continue
      const arr = otsParGamme.get(ot.gamme_id)
      if (arr) arr.push(ot)
      else otsParGamme.set(ot.gamme_id, [ot])
    }

    // Gammes regroupées par sous-catégorie (rattachement direct `categorie_id`).
    const gammesParCat = new Map<string, typeof gammes>()
    for (const g of gammes) {
      const arr = gammesParCat.get(g.categorie_id)
      if (arr) arr.push(g)
      else gammesParCat.set(g.categorie_id, [g])
    }

    // Hiérarchie visible des catégories de GAMME (calque de l'explorateur) : sert
    // au squelette domaine/famille, à la navigabilité et aux slugs d'URL.
    const parId = new Map(categories.map((c) => [c.id, c]))
    const gammeCats = categories.filter(
      (c) => c.est_actif && (c.scope === 'gamme' || c.scope === 'mixte'),
    )
    const gammeCatIds = new Set(gammeCats.map((c) => c.id))
    const racines = gammeCats
      .filter((c) => c.parent_id === null)
      .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))
    const racinesSlug = racines.map((c) => ({ nom: c.nom, id: c.id }))
    const enfantsParParent = new Map<
      string,
      { nom: string; id: string; ordre: number; categorieId: string }[]
    >()
    for (const c of gammeCats) {
      if (c.parent_id === null) continue
      const parent = parId.get(c.parent_id)
      // Famille = sous-catégorie dont le parent est une racine visible.
      if (parent === undefined) continue
      if (parent.parent_id !== null || !gammeCatIds.has(parent.id)) continue
      const arr = enfantsParParent.get(c.parent_id) ?? []
      arr.push({ nom: c.nom, id: c.id, ordre: c.ordre, categorieId: c.id })
      enfantsParParent.set(c.parent_id, arr)
    }

    // Feuille « gamme » : couleur PLEINE du domaine (estompée si inactive), hachures
    // réglementaire, clignotement des problèmes, infobulle = état, fiche au clic.
    const feuilleGamme = (
      g: (typeof gammes)[number],
      base: string,
    ): { noeud: SunburstNode; aJour: boolean } => {
      const aff = statutAffichageGamme({
        estActive: g.est_active,
        ots: otsParGamme.get(g.id) ?? [],
      })
      const sante = classifierSante(aff)
      return {
        aJour: sante === 'bon',
        noeud: {
          key: `g:${g.id}`,
          label: g.nom,
          couleur: couleurGamme(base, sante),
          statutLabel: aff.label,
          poids: 1,
          blink: sante === 'probleme',
          hachures: g.nature === 'controle_reglementaire',
          onClick: () =>
            void navigate({
              to: '/gammes/$',
              params: { _splat: '' },
              search: { open: g.id },
            }),
        },
      }
    }

    let totalGammes = 0
    let gammesAJour = 0
    const placees = new Set<string>()
    const noeuds: SunburstNode[] = []

    // Domaines dans l'ordre de l'explorateur ; couleur STABLE par index (rotation de la
    // palette « en désordre » → domaines voisins bien contrastés).
    racines.forEach((racine, i) => {
      const base =
        PALETTE_DOMAINES[i % PALETTE_DOMAINES.length] ?? 'oklch(0.62 0.17 255)'
      const domSeg = segOfUnique(
        { nom: racine.nom, id: racine.id },
        racinesSlug,
      )
      const familles = enfantsParParent.get(racine.id) ?? []
      const famillesSlug = familles.map((f) => ({ nom: f.nom, id: f.id }))
      const famillesNoeuds: SunburstNode[] = []

      familles
        .slice()
        .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'))
        .forEach((fam) => {
          const gammesFam = (gammesParCat.get(fam.categorieId) ?? [])
            .slice()
            .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
          if (gammesFam.length === 0) return
          const feuilles: SunburstNode[] = []
          for (const g of gammesFam) {
            placees.add(g.id)
            totalGammes += 1
            const { noeud, aJour } = feuilleGamme(g, base)
            if (aJour) gammesAJour += 1
            feuilles.push(noeud)
          }
          const famSeg = segOfUnique({ nom: fam.nom, id: fam.id }, famillesSlug)
          famillesNoeuds.push({
            key: `f:${fam.id}`,
            label: fam.nom,
            // La famille reprend la couleur PLEINE du domaine (séparée par l'interstice).
            couleur: base,
            poids: 0,
            onClick: () =>
              void navigate({
                to: '/gammes/$',
                params: { _splat: `${domSeg}/${famSeg}` },
              }),
            enfants: feuilles,
          })
        })

      if (famillesNoeuds.length === 0) return
      noeuds.push({
        key: `d:${racine.id}`,
        label: racine.nom,
        // Anneau intérieur : couleur pleine et saturée du domaine.
        couleur: base,
        poids: 0,
        onClick: () =>
          void navigate({ to: '/gammes/$', params: { _splat: domSeg } }),
        enfants: famillesNoeuds,
      })
    })

    // Gammes non rattachées à une famille visible (catégorie masquée/purgée) : repli
    // « Non classé », non navigable — mais COMPTÉES dans le total (exigence PO).
    const orphelines = gammes.filter((g) => !placees.has(g.id))
    if (orphelines.length > 0) {
      const feuilles: SunburstNode[] = []
      for (const g of orphelines
        .slice()
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
        totalGammes += 1
        const { noeud, aJour } = feuilleGamme(g, BASE_NON_CLASSE)
        if (aJour) gammesAJour += 1
        feuilles.push(noeud)
      }
      noeuds.push({
        key: 'd:__non_classe__',
        label: 'Non classé',
        couleur: BASE_NON_CLASSE,
        poids: 0,
        enfants: [
          {
            key: 'f:__non_classe__',
            label: 'Non classé',
            couleur: BASE_NON_CLASSE,
            poids: 0,
            enfants: feuilles,
          },
        ],
      })
    }

    return { noeuds, totalGammes, gammesAJour }
  }, [categories, gammes, ordresTravail, navigate])

  // Aucune gamme sur le site → cadran masqué (l'orchestrateur retire la colonne).
  if (totalGammes === 0) return null

  const pct = Math.round((gammesAJour / totalGammes) * 100)

  // Pourcentage seul (sans libellé), taille PROPORTIONNELLE à la largeur du sunburst :
  // `cqw` (le sunburst est un conteneur `@container`) → lisible et bien calé dans le trou
  // central aussi bien sur un petit cadran mobile qu'en plein écran, sans taille fixe qui
  // paraît énorme quand le cadran rétrécit. Le « % » fait la moitié des chiffres
  // (`text-[0.5em]`, relatif → suit la même échelle).
  const centre = (
    <span className="text-[11cqw] leading-none font-semibold">
      {pct}
      <span className="text-[0.5em]">%</span>
    </span>
  )

  return (
    <DashboardCard
      square
      dense
      className={CLASSE_CARRE_CADRAN}
      contentClassName="flex flex-col"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Sunburst
          noeuds={noeuds}
          centre={centre}
          onCentreClick={() => setPleinEcran(true)}
          className="aspect-square h-full max-h-full max-w-full"
        />
      </div>

      <Dialog open={pleinEcran} onOpenChange={setPleinEcran}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Complétion des gammes</DialogTitle>
            <DialogDescription>
              Une couleur pleine par domaine, reprise par ses familles et
              gammes. Sur l'anneau extérieur : gammes inactives estompées,
              contrôles réglementaires hachurés, retards qui clignotent.
            </DialogDescription>
          </DialogHeader>
          <Sunburst
            noeuds={noeuds}
            centre={centre}
            className="mx-auto w-full max-w-xl"
          />
        </DialogContent>
      </Dialog>
    </DashboardCard>
  )
}
