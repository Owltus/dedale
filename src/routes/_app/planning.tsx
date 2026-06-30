import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarCheck, CalendarRange, Target } from 'lucide-react'
import { planningQueries } from '@/features/planning/queries'
import {
  construireGroupes,
  dateSemaineOt,
  type CategorieInfo,
  type PlanningOt,
  type ResolveCategorie,
} from '@/features/planning/grille'
import {
  ajouterSemaines,
  cleSemaine,
  clesProchaines,
  fenetreSemaines,
  formatPeriode,
  isoLocale,
  labelSemaine,
  lundiDeLaSemaine,
} from '@/features/planning/semaines'
import {
  PlanningGrille,
  PlanningLegende,
  PlanningSkeleton,
} from '@/features/planning/components/planning-grille'
import { CelluleDialog } from '@/features/planning/components/cellule-dialog'
import {
  categoriesQueries,
  type Categorie,
} from '@/features/categories/queries'
import { gammesQueries } from '@/features/gammes/queries'
import { useSiteContext } from '@/lib/site-context'
import { segOfUnique } from '@/lib/slug'
import { cn } from '@/lib/utils'
import { useColonnesAuto } from '@/features/planning/use-colonnes-auto'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'

export const Route = createFileRoute('/_app/planning')({
  beforeLoad: ({ context }) => requireNav('/planning', context.queryClient),
  component: PlanningPage,
})

const JOUR_MS = 24 * 60 * 60 * 1000
/** Fenêtre du « Focus » et du sur-fetch : 12 semaines (≈ un trimestre). */
const FOCUS_SEMAINES = 12
/** Pas FIXE des flèches de navigation (~1 trimestre), indépendant du nb de colonnes. */
const PAS_NAV = 13

/** Gamme minimale nécessaire à la résolution OT → sous-catégorie. */
interface GammeSkelInput {
  id: string
  categorie_id: string
}

/**
 * À partir des catégories + des GAMMES du site, expose :
 *  - `skeleton` : TOUTES les sous-catégories de gamme (= lignes/familles),
 *    affichées en permanence même sans OT, rattachées à leur catégorie (domaine) ;
 *  - `ofOt` : la famille d'un OT (pour remplir les cases) via `gamme_id →
 *    categorie_id`. Repli « Non classé » si la gamme est purgée / non résolue.
 *
 * Famille = sous-catégorie (où pointe `gammes.categorie_id`) ; domaine = sa
 * catégorie parente — utilisé pour TRIER et SÉPARER les familles (son nom n'est PAS
 * affiché). Le `splat` (chemin explorateur) n'est calculé que pour une famille
 * NAVIGABLE (catégorie active, scope gamme, domaine racine).
 */
function useResolveCategorie(
  categories: Categorie[],
  gammes: GammeSkelInput[],
): { skeleton: CategorieInfo[]; ofOt: ResolveCategorie } {
  return useMemo(() => {
    const parId = new Map(categories.map((c) => [c.id, c]))
    const gammeCategorie = new Map(gammes.map((g) => [g.id, g.categorie_id]))
    // Catégories de GAMME visibles (calque de l'explorateur Plan de maintenance) :
    // squelette des familles + décide la navigabilité + compose les slugs.
    const gammeCats = categories.filter(
      (c) => c.est_actif && (c.scope === 'gamme' || c.scope === 'mixte'),
    )
    const gammeCatIds = new Set(gammeCats.map((c) => c.id))
    const racines = gammeCats
      .filter((c) => c.parent_id === null)
      .map((c) => ({ nom: c.nom, id: c.id }))
    const enfantsParParent = new Map<string, { nom: string; id: string }[]>()
    for (const c of gammeCats) {
      if (c.parent_id === null) continue
      const arr = enfantsParParent.get(c.parent_id) ?? []
      arr.push({ nom: c.nom, id: c.id })
      enfantsParParent.set(c.parent_id, arr)
    }

    // Projette une sous-catégorie (famille) en `CategorieInfo` (domaine = parent).
    const infoDeCategorie = (fam: Categorie): CategorieInfo => {
      const parent = fam.parent_id ? parId.get(fam.parent_id) : undefined
      let splat: string | null = null
      if (
        parent &&
        gammeCatIds.has(fam.id) &&
        gammeCatIds.has(parent.id) &&
        parent.parent_id === null
      ) {
        const domSeg = segOfUnique({ nom: parent.nom, id: parent.id }, racines)
        const famSeg = segOfUnique(
          { nom: fam.nom, id: fam.id },
          enfantsParParent.get(parent.id) ?? [],
        )
        splat = `${domSeg}/${famSeg}`
      }
      // Domaine = parent ; cas défensif (sous-cat racine) → son propre domaine.
      return {
        familleCle: fam.id,
        familleNom: fam.nom,
        familleOrdre: fam.ordre,
        domaineCle: parent ? parent.id : `racine:${fam.id}`,
        domaineOrdre: parent ? parent.ordre : fam.ordre,
        splat,
      }
    }

    // Squelette = toutes les sous-catégories de gamme (parent non nul).
    const skeleton = gammeCats
      .filter((c) => c.parent_id !== null)
      .map(infoDeCategorie)

    const nonClasse = (label: string | null): CategorieInfo => ({
      familleCle: label ? `cat-nom:${label.toLowerCase()}` : '__non_classe__',
      familleNom: label ?? 'Non classé',
      familleOrdre: Number.MAX_SAFE_INTEGER,
      domaineCle: '__non_classe__',
      domaineOrdre: Number.MAX_SAFE_INTEGER,
      splat: null,
    })

    const ofOt = (ot: PlanningOt): CategorieInfo => {
      const categorieId = ot.gamme_id
        ? gammeCategorie.get(ot.gamme_id)
        : undefined
      const fam = categorieId ? parId.get(categorieId) : undefined
      if (!fam) {
        // Chaîne vide → « Non classé » (≠ `??` : `''` doit retomber sur `null`).
        const label = ot.nom_categorie?.trim()
        return nonClasse(label && label.length > 0 ? label : null)
      }
      return infoDeCategorie(fam)
    }

    return { skeleton, ofOt }
  }, [categories, gammes])
}

function PlanningPage() {
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Planning"
        description="Charge prévisionnelle par famille de gammes et par semaine."
        hint="Choisis un site pour voir son planning."
        icon={CalendarRange}
      />
    )
  }

  return <PlanningContent siteId={activeSiteId} />
}

function PlanningContent({ siteId }: { siteId: string }) {
  const navigate = useNavigate()
  // Nombre de colonnes et largeur de la colonne de gauche calculés depuis la
  // largeur RÉELLE du conteneur (cases fixes 24 px, cf. `useColonnesAuto`).
  const grilleRef = useRef<HTMLDivElement>(null)
  const { nbSemaines, familleWidth } = useColonnesAuto(grilleRef)

  // Mise à jour LIVE : tout changement d'OT (clôture, statut, date…) — fait ici, dans
  // un autre onglet ou par un autre utilisateur — rafraîchit la grille sans F5.
  useRealtimeRefresh('ordres_travail', planningQueries.all())

  // `centre` = semaine placée AU MILIEU de la fenêtre (passé à gauche, futur à
  // droite). Défaut : la semaine courante.
  const [centre, setCentre] = useState(() => lundiDeLaSemaine(new Date()))
  const [focus, setFocus] = useState(false)
  const [cellule, setCellule] = useState<{
    ots: PlanningOt[]
    /** Titre du modal : la sous-catégorie (clic cellule) ou la semaine (clic n° de semaine). */
    titre: string
    /** Ligne secondaire (la semaine), pour un clic sur une cellule. */
    sousTitre?: string
  } | null>(null)

  // Ancre = lundi de la 1ʳᵉ semaine visible : on recule de la moitié de la fenêtre
  // pour centrer `centre`. Recentrage automatique au redimensionnement (nbSemaines).
  const ancre = useMemo(
    () => ajouterSemaines(centre, -Math.floor(nbSemaines / 2)),
    [centre, nbSemaines],
  )
  const semaines = useMemo(
    () => fenetreSemaines(ancre, nbSemaines),
    [ancre, nbSemaines],
  )
  const cleSemaineCourante = useMemo(() => cleSemaine(new Date()), [])

  // Flèches « trimestre » = décalage d'un PAS FIXE (~3 mois) du centre, indépendant
  // du nombre de colonnes visibles : sur grand écran (jusqu'à ~156 semaines) un
  // décalage d'une fenêtre entière sauterait plusieurs années. Recouvrement = continuité.
  const reculer = () => setCentre((c) => ajouterSemaines(c, -PAS_NAV))
  const avancer = () => setCentre((c) => ajouterSemaines(c, PAS_NAV))
  const revenirAujourdhui = () => setCentre(lundiDeLaSemaine(new Date()))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      )
        return
      if (e.key === 'ArrowLeft') setCentre((c) => ajouterSemaines(c, -PAS_NAV))
      else if (e.key === 'ArrowRight')
        setCentre((c) => ajouterSemaines(c, PAS_NAV))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Plage de fetch = fenêtre VISIBLE uniquement (remplit les cases).
  const { debut, fin, clesFenetre } = useMemo(() => {
    const winStart = semaines[0]?.debut ?? ancre
    const winEndExcl = ajouterSemaines(winStart, nbSemaines)
    return {
      debut: isoLocale(winStart),
      fin: isoLocale(new Date(winEndExcl.getTime() - JOUR_MS)),
      clesFenetre: new Set(semaines.map((s) => s.cle)),
    }
  }, [semaines, nbSemaines, ancre])

  // Plage du « Focus » : les 12 prochaines semaines depuis AUJOURD'HUI — FIXE, donc
  // le jeu de sous-catégories actives ne change PAS quand on navigue (passé/futur).
  const { focusDebut, focusFin, cles12 } = useMemo(() => {
    const lundiAuj = lundiDeLaSemaine(new Date())
    const endExcl = ajouterSemaines(lundiAuj, FOCUS_SEMAINES)
    return {
      focusDebut: isoLocale(lundiAuj),
      focusFin: isoLocale(new Date(endExcl.getTime() - JOUR_MS)),
      cles12: clesProchaines(lundiAuj, FOCUS_SEMAINES),
    }
  }, [])

  // `keepPreviousData` : en naviguant, on GARDE la fenêtre précédente affichée le
  // temps que la nouvelle arrive (pas de squelette à chaque clic ; les colonnes qui
  // se chevauchent gardent leurs cases) → transition souple plutôt que brute.
  const query = useQuery({
    ...planningQueries.fenetre(siteId, debut, fin),
    placeholderData: keepPreviousData,
  })
  // Requête DÉDIÉE au Focus (plage fixe = aujourd'hui + 12 s), seulement quand actif.
  const focusQuery = useQuery({
    ...planningQueries.fenetre(siteId, focusDebut, focusFin),
    enabled: focus,
  })
  const categoriesQuery = useQuery(categoriesQueries.list(siteId))
  // Gammes du site = SQUELETTE des lignes (toujours affichées, même sans OT). Même
  // requête que l'explorateur Plan de maintenance ; gammes actives ET inactives.
  const gammesQuery = useQuery(gammesQueries.list(siteId))

  const { skeleton, ofOt } = useResolveCategorie(
    useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]),
    useMemo(() => gammesQuery.data ?? [], [gammesQuery.data]),
  )

  // OT de la fenêtre (le row shape de la requête EST déjà `PlanningOt`).
  const ots = useMemo<PlanningOt[]>(() => query.data ?? [], [query.data])

  // OT positionnés DANS la fenêtre visible (par date PRÉVUE) → cellules.
  const otsFenetre = useMemo(
    () => ots.filter((ot) => clesFenetre.has(cleSemaine(dateSemaineOt(ot)))),
    [ots, clesFenetre],
  )
  // Lignes = TOUTES les sous-catégories (squelette), toujours affichées ; les OT
  // de la fenêtre ne font que remplir les cases.
  const groupes = useMemo(
    () => construireGroupes(skeleton, otsFenetre, ofOt),
    [skeleton, otsFenetre, ofOt],
  )

  // Familles ayant ≥ 1 OT dans les 12 prochaines semaines depuis AUJOURD'HUI (jeu
  // FIXE, issu de la requête Focus dédiée → stable quand on navigue).
  const famillesActives12 = useMemo(() => {
    const set = new Set<string>()
    for (const ot of focusQuery.data ?? [])
      if (cles12.has(cleSemaine(dateSemaineOt(ot))))
        set.add(ofOt(ot).familleCle)
    return set
  }, [focusQuery.data, cles12, ofOt])

  // Filtrage des lignes : Focus 12 s (masque les familles sans OT à venir), basé sur
  // aujourd'hui. On n'élague PAS tant que la requête Focus n'a pas répondu (évite un
  // flash « vide »). Les domaines devenus vides sont retirés.
  const groupesAffichage = useMemo(() => {
    if (!focus || focusQuery.data === undefined) return groupes
    return groupes
      .map((d) => ({
        ...d,
        familles: d.familles.filter((f) => famillesActives12.has(f.cle)),
      }))
      .filter((d) => d.familles.length > 0)
  }, [groupes, focus, focusQuery.data, famillesActives12])

  // Ouverture directe de la fiche d'un OT (cellule / semaine à un seul OT).
  const ouvrirOt = (otId: string) =>
    void navigate({ to: '/ordres-travail/$otId', params: { otId } })
  // Clic sur une cellule / un n° de semaine : 1 seul OT → fiche directe (pas de
  // modal) ; ≥ 2 → modal listant les OT (titre = sous-catégorie ou semaine).
  const ouvrir = (ots: PlanningOt[], titre: string, sousTitre?: string) => {
    const [premier] = ots
    if (ots.length === 1 && premier) ouvrirOt(premier.id)
    else if (ots.length > 1) setCellule({ ots, titre, sousTitre })
  }

  const enChargement =
    query.isPending || categoriesQuery.isPending || gammesQuery.isPending

  let contenu
  if (enChargement) {
    contenu = (
      <PlanningSkeleton familleWidth={familleWidth} nbSemaines={nbSemaines} />
    )
  } else if (query.isError) {
    contenu = <ErrorState onRetry={() => void query.refetch()} />
  } else if (groupesAffichage.length === 0) {
    contenu = (
      <EmptyState
        icon={focus ? Target : CalendarRange}
        title={
          focus
            ? 'Rien dans les 12 prochaines semaines'
            : 'Aucune sous-catégorie'
        }
        description={
          focus
            ? 'Aucune sous-catégorie n’a d’ordre de travail prévu dans les 12 prochaines semaines. Désactive le focus pour tout voir.'
            : 'Aucune sous-catégorie de gamme n’est configurée pour ce site (Plan de maintenance).'
        }
      />
    )
  } else {
    contenu = (
      <PlanningGrille
        groupes={groupesAffichage}
        semaines={semaines}
        familleWidth={familleWidth}
        cleSemaineCourante={cleSemaineCourante}
        periodeLabel={formatPeriode(semaines)}
        onReculer={reculer}
        onAvancer={avancer}
        onAujourdhui={revenirAujourdhui}
        onSelect={(ots, semaine, nomFamille) =>
          ouvrir(ots, nomFamille, labelSemaine(semaine))
        }
        onSelectSemaine={(ots, semaine) => ouvrir(ots, labelSemaine(semaine))}
        onOuvrirFamille={(f) => {
          if (f.splat === null) return
          void navigate({ to: '/gammes/$', params: { _splat: f.splat } })
        }}
      />
    )
  }

  return (
    // `fill` : on gère soi-même en-tête FIXE → grille DÉFILANTE (interne) → légende
    // FIXE en bas (toujours visible). Le défilement vertical/horizontal vit dans la
    // boîte grille, pas au niveau de la page.
    <PageContainer fill>
      <div className="shrink-0 px-4 pt-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Planning"
          description="Maintenance par sous-catégorie, semaine par semaine (semaine en cours centrée)."
          action={
            <>
              <TooltipIconButton
                icon={<CalendarCheck />}
                label="Recentrer sur aujourd’hui"
                variant="outline"
                onClick={revenirAujourdhui}
              />
              <TooltipIconButton
                icon={<Target />}
                label={
                  focus ? 'Désactiver le focus 12 semaines' : 'Focus 12 semaines'
                }
                variant={focus ? 'default' : 'outline'}
                onClick={() => setFocus((f) => !f)}
              />
            </>
          }
        />
      </div>

      {/* Zone grille : bordée, DÉFILE en interne (lignes ↕ + semaines ↔). Le ref
          mesure sa largeur intérieure (clientWidth) pour le calcul des colonnes. */}
      <div className="min-h-0 flex-1 px-4 sm:px-6 lg:px-8">
        <div
          ref={grilleRef}
          // JAMAIS de barre horizontale (`overflow-x-hidden`) : le calcul
          // auto-colonnes ajuste déjà la table à la largeur. `scrollbar-gutter: stable`
          // réserve la gouttière de l'ascenseur vertical → `clientWidth` stable
          // (présent ou non) → la table tient pile, sans rien rogner. Seul le
          // défilement VERTICAL est permis. Léger fondu au chargement (nav souple).
          className={cn(
            'border-border h-full overflow-x-hidden overflow-y-auto rounded-md border transition-opacity duration-200 [scrollbar-gutter:stable]',
            query.isPlaceholderData && 'opacity-60',
          )}
        >
          {contenu}
        </div>
      </div>

      {/* Légende TOUJOURS visible en bas (hors zone de défilement). */}
      {!enChargement && !query.isError && (
        <div className="shrink-0 px-4 py-3 sm:px-6 lg:px-8">
          <PlanningLegende />
        </div>
      )}

      <CelluleDialog
        ots={cellule?.ots ?? null}
        titre={cellule?.titre ?? ''}
        sousTitre={cellule?.sousTitre}
        onClose={() => setCellule(null)}
      />
    </PageContainer>
  )
}
