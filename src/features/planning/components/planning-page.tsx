import { useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarCheck, CalendarRange, Target } from 'lucide-react'
import { planningQueries } from '@/features/planning/queries'
import {
  construireGroupes,
  dateSemaineOt,
  useResolveCategorie,
  type PlanningOt,
} from '@/features/planning/grille'
import {
  ajouterSemaines,
  cleSemaine,
  clesProchaines,
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
import { categoriesQueries } from '@/features/categories/queries'
import { gammesQueries } from '@/features/gammes/queries'
import { cn } from '@/lib/utils'
import { useColonnesAuto } from '@/features/planning/use-colonnes-auto'
import { useFenetreTemporelle } from '@/features/planning/use-fenetre-temporelle'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { OT_QUERY_KEYS } from '@/features/ordres-travail/query-keys'
import { FillHeader, PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'

/** Fenêtre du « Focus » et du sur-fetch : 12 semaines (≈ un trimestre). */
const FOCUS_SEMAINES = 12

/**
 * Corps du planning (le site est déjà résolu par la route). Grille famille ×
 * semaine : en-tête FIXE → grille DÉFILANTE (interne) → légende FIXE en bas.
 */
export function PlanningContent({ siteId }: { siteId: string }) {
  const navigate = useNavigate()
  // Nombre de colonnes et largeur de la colonne de gauche calculés depuis la
  // largeur RÉELLE du conteneur (cases fixes 24 px, cf. `useColonnesAuto`).
  const grilleRef = useRef<HTMLDivElement>(null)
  const { nbSemaines, familleWidth } = useColonnesAuto(grilleRef)

  // Mise à jour LIVE : tout changement d'OT (clôture, statut, date…) — fait ici, dans
  // un autre onglet ou par un autre utilisateur — rafraîchit la grille sans F5.
  useRealtimeRefresh('ordres_travail', OT_QUERY_KEYS)

  const [focus, setFocus] = useState(false)
  const [cellule, setCellule] = useState<{
    ots: PlanningOt[]
    /** Titre du modal : la sous-catégorie (clic cellule) ou la semaine (clic n° de semaine). */
    titre: string
    /** Ligne secondaire (la semaine), pour un clic sur une cellule. */
    sousTitre?: string
  } | null>(null)

  // Fenêtre temporelle glissante (centre + `ancre`/`semaines` + navigation
  // flèches/clavier), factorisée dans `useFenetreTemporelle` (réutilisée par le
  // tableau de bord). Le recentrage au redimensionnement est porté par `nbSemaines`
  // (dépendance interne du hook). Comportement strictement identique à l'inline.
  const { ancre, semaines, reculer, avancer, revenirAujourdhui } =
    useFenetreTemporelle({ nbSemaines })
  const cleSemaineCourante = useMemo(() => cleSemaine(new Date()), [])

  // Plage de fetch = fenêtre VISIBLE uniquement (remplit les cases).
  const { debut, fin, clesFenetre } = useMemo(() => {
    const winStart = semaines[0]?.debut ?? ancre
    const winEndExcl = ajouterSemaines(winStart, nbSemaines)
    return {
      debut: isoLocale(winStart),
      // Dernier jour visible = veille (calendaire) du lundi exclu → dimanche de la
      // dernière semaine. Calendaire (pas `- JOUR_MS` en ms) pour rester juste au DST.
      fin: isoLocale(
        new Date(
          winEndExcl.getFullYear(),
          winEndExcl.getMonth(),
          winEndExcl.getDate() - 1,
        ),
      ),
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
      focusFin: isoLocale(
        new Date(
          endExcl.getFullYear(),
          endExcl.getMonth(),
          endExcl.getDate() - 1,
        ),
      ),
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

  // OT positionnés DANS la fenêtre visible (par leur date de positionnement selon le
  // statut, cf. `dateSemaineOt` : clôture si terminal, sinon prévue) → cellules.
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
      <FillHeader>
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
                  focus
                    ? 'Désactiver le focus 12 semaines'
                    : 'Focus 12 semaines'
                }
                variant={focus ? 'default' : 'outline'}
                onClick={() => setFocus((f) => !f)}
              />
            </>
          }
        />
      </FillHeader>

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
            'border-border h-full [scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto rounded-md border transition-opacity duration-200',
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
