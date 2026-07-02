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
import type { StatusTone } from '@/components/common/status-badge'
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
 * Traduction SANTÉ → rendu du secteur : `opacite` module la santé (pleine = à jour,
 * estompée = à traiter, quasi invisible = inactive), `blink` signale un problème.
 * La TEINTE (couleur) reste celle du domaine — la santé ne joue QUE sur l'opacité.
 */
const STYLE_SANTE: Record<Sante, { opacite: number; blink: boolean }> = {
  bon: { opacite: 1, blink: false },
  aTraiter: { opacite: 0.55, blink: false },
  probleme: { opacite: 1, blink: true },
  inactif: { opacite: 0.12, blink: false },
}

/**
 * Palette catégorielle : une teinte par DOMAINE (répartie en rotation). On évite
 * `destructive` en tête (réservé aux alertes) — elle ne sert que si le nombre de
 * domaines dépasse la palette. Les tons sont éclaircis vers l'extérieur par le
 * composant `Sunburst` (opacité par profondeur), on ne fournit que la teinte.
 */
const TEINTES_DOMAINES: StatusTone[] = [
  'info',
  'violet',
  'success',
  'warning',
  'yellow',
  'neutral',
  'destructive',
]

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
 * à trois anneaux domaine → famille → gamme. La SANTÉ de chaque gamme (dérivée des
 * MÊMES helpers que les badges du Plan de maintenance) est rendue par l'OPACITÉ du
 * secteur (à jour = pleine, à traiter = estompée, inactive = quasi invisible), les
 * gammes réglementaires sont HACHURÉES et les gammes en problème CLIGNOTENT. Chaque
 * anneau porte la TEINTE de son domaine, éclaircie vers l'extérieur.
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

    // Feuille « gamme » : santé (opacité + blink) + hachures réglementaire + fiche.
    const feuilleGamme = (
      g: (typeof gammes)[number],
      tone: StatusTone,
    ): { noeud: SunburstNode; aJour: boolean } => {
      const aff = statutAffichageGamme({
        estActive: g.est_active,
        ots: otsParGamme.get(g.id) ?? [],
      })
      const sante = classifierSante(aff)
      const style = STYLE_SANTE[sante]
      return {
        aJour: sante === 'bon',
        noeud: {
          key: `g:${g.id}`,
          label: g.nom,
          tone,
          poids: 1,
          opacite: style.opacite,
          blink: style.blink,
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

    // Domaines dans l'ordre de l'explorateur ; teinte par rotation de palette.
    racines.forEach((racine, i) => {
      const tone = TEINTES_DOMAINES[i % TEINTES_DOMAINES.length] ?? 'info'
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
            const { noeud, aJour } = feuilleGamme(g, tone)
            if (aJour) gammesAJour += 1
            feuilles.push(noeud)
          }
          const famSeg = segOfUnique({ nom: fam.nom, id: fam.id }, famillesSlug)
          famillesNoeuds.push({
            key: `f:${fam.id}`,
            label: fam.nom,
            tone,
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
        tone,
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
        const { noeud, aJour } = feuilleGamme(g, 'neutral')
        if (aJour) gammesAJour += 1
        feuilles.push(noeud)
      }
      noeuds.push({
        key: 'd:__non_classe__',
        label: 'Non classé',
        tone: 'neutral',
        poids: 0,
        enfants: [
          {
            key: 'f:__non_classe__',
            label: 'Non classé',
            tone: 'neutral',
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

  // Pourcentage seul (sans libellé) ; le « % » fait la moitié de la taille des
  // chiffres via `text-[0.5em]` (relatif → vaut pour les deux tailles).
  const centre = (taille: 'normal' | 'grand') => (
    <span
      className={
        taille === 'grand'
          ? 'text-6xl leading-none font-semibold'
          : 'text-4xl leading-none font-semibold'
      }
    >
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
          centre={centre('normal')}
          onCentreClick={() => setPleinEcran(true)}
          className="aspect-square h-full max-h-full max-w-full"
        />
      </div>

      <Dialog open={pleinEcran} onOpenChange={setPleinEcran}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Complétion des gammes</DialogTitle>
            <DialogDescription>
              Santé des gammes par domaine et famille — opacité = état, hachures
              = contrôle réglementaire, clignotement = à traiter.
            </DialogDescription>
          </DialogHeader>
          <Sunburst
            noeuds={noeuds}
            centre={centre('grand')}
            className="mx-auto w-full max-w-xl"
          />
        </DialogContent>
      </Dialog>
    </DashboardCard>
  )
}
