import { Fragment, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { statutPlanningOt } from '@/features/ordres-travail/statut-affichage'
import type { StatusTone } from '@/components/common/status-badge'
import type {
  GroupeDomaine,
  LigneFamille,
  PlanningOt,
} from '@/features/planning/grille'
import { CELL_SIZE } from '@/features/planning/use-colonnes-auto'
import { labelSemaine } from '@/features/planning/semaines'
import type { SemaineIso } from '@/features/planning/semaines'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Couleur de fond SOLIDE d'une cellule selon la TONALITÉ du statut d'affichage
 * de l'OT — même source que la grille et le popup du planning (`statutPlanningOt`),
 * donc toute évolution du code couleur se répercute ici. Remplissage plein (≠
 * pastille teintée du badge) pour une lecture dense ; chaque tonalité a son couple
 * `-foreground` garantissant le contraste en thème clair comme sombre.
 */
const TONE_CELL: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-white',
  info: 'bg-info text-info-foreground',
  violet: 'bg-violet text-violet-foreground',
  yellow: 'bg-yellow text-yellow-foreground',
}

/** Priorité d'affichage quand une cellule mélange plusieurs tonalités (le plus « à
 *  signaler » d'abord : en retard/annulé → rouvert → en cours → planifié → clôturé →
 *  programmé). Tableau COMPLET de toutes les tonalités (`yellow` n'est pas produit par
 *  `statutPlanningOt` — il n'apparaît qu'en repeignant Programmé dans la semaine
 *  courante —, mais le lister évite qu'un ton inattendu domine via `indexOf` = -1). */
const PRIORITE_TONE: StatusTone[] = [
  'destructive',
  'warning',
  'info',
  'violet',
  'success',
  'neutral',
  'yellow',
]

/** Statut d'affichage (libellé + tonalité) d'un OT, version PLANNING (dépouillée des
 *  nuances de proximité calendaire — cf. `statutPlanningOt`). */
function affichageOt(ot: PlanningOt) {
  return statutPlanningOt({
    statut: ot.statut,
    origine: ot.origine,
    datePrevue: ot.date_prevue,
  })
}

/** Statut d'affichage le plus prioritaire de la cellule (couleur dominante). */
function affichageDominant(ots: PlanningOt[]) {
  return ots
    .map(affichageOt)
    .reduce((meilleur, courant) =>
      PRIORITE_TONE.indexOf(courant.tone) < PRIORITE_TONE.indexOf(meilleur.tone)
        ? courant
        : meilleur,
    )
}

/**
 * Tonalité de FOND d'une cellule = tonalité dominante (`affichageDominant`), SAUF que
 * « Programmé » (gris / `neutral`) est repeint en JAUNE dans la SEULE colonne de la
 * semaine COURANTE : le gris s'y confond avec le surlignage `bg-accent`. Les semaines
 * FUTURES gardent le gris (décision PO).
 */
function toneCellule(ots: PlanningOt[], estSemaineCourante: boolean): StatusTone {
  const tone = affichageDominant(ots).tone
  return estSemaineCourante && tone === 'neutral' ? 'yellow' : tone
}

/** Cellule réglementaire = au moins un OT de contrôle réglementaire. */
function aReglementaire(ots: PlanningOt[]): boolean {
  return ots.some((ot) => ot.nature_gamme === 'controle_reglementaire')
}

/** Infobulle (native `title`) : les premiers OT « gamme — statut » + reste compté. */
function tooltipCellule(ots: PlanningOt[]): string {
  const MAX = 5
  const lignes = ots
    .slice(0, MAX)
    .map((ot) => `${ot.nom_gamme} — ${affichageOt(ot).label}`)
  if (ots.length > MAX) lignes.push(`… +${String(ots.length - MAX)}`)
  return lignes.join('\n')
}

// Légende : tonalité → libellé, dans l'ordre de priorité d'affichage. MÊME source de
// couleur (TONE_CELL) que les cellules de la grille → la légende ne peut plus diverger.
// Plus de proximité calendaire (Cette semaine / À venir / Mois prochain…) : sur un
// calendrier la position de la case dit déjà « quand » (décision PO).
const LEGENDE_PLANNING: { tone: StatusTone; libelle: string }[] = [
  { tone: 'destructive', libelle: 'En retard / annulé' },
  { tone: 'info', libelle: 'En cours' },
  { tone: 'warning', libelle: 'Rouvert' },
  { tone: 'violet', libelle: 'Planifié' },
  { tone: 'neutral', libelle: 'Programmé' },
  { tone: 'success', libelle: 'Clôturé' },
]

/**
 * Légende des couleurs du planning. Dérivée de `TONE_CELL` (source UNIQUE,
 * partagée avec le coloriage des cellules) : changer une couleur de statut met à
 * jour la grille ET la légende d'un seul geste.
 */
export function PlanningLegende() {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
      {LEGENDE_PLANNING.map((i) => (
        <span key={i.tone} className="flex items-center gap-1.5">
          <span className={cn('size-3 rounded', TONE_CELL[i.tone])} />
          {i.libelle}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="ring-primary inline-block size-3 rounded ring-1 ring-inset" />
        Contrôle réglementaire
      </span>
    </div>
  )
}

/** Largeurs (en % de la colonne de gauche) des libellés simulés — varié = naturel. */
const SKEL_FACTEURS = [0.8, 0.55, 0.7, 0.9, 0.6, 0.5, 0.85, 0.65]

/**
 * Squelette de chargement calqué sur la grille : en-tête (coin + bandes) puis
 * lignes (colonne de gauche + cases clairsemées), aux MÊMES dimensions que la vraie
 * grille (`familleWidth` / `nbSemaines`) → pas de saut de mise en page à l'arrivée
 * des données. Cases à 24px de pas (`size-5` + `gap-1`), ~1 sur 5 « pleines » pour
 * évoquer le planning réel (majoritairement vide).
 */
export function PlanningSkeleton({
  familleWidth,
  nbSemaines,
}: {
  familleWidth: number
  nbSemaines: number
}) {
  const cols = Array.from({ length: nbSemaines })
  const rows = Array.from({ length: 14 })
  return (
    <div className="w-full overflow-hidden">
      {/* En-tête simulé (coin de navigation + bandes/semaines). */}
      <div className="border-border flex items-end gap-1 border-b py-2">
        <div className="shrink-0 px-2" style={{ width: familleWidth }}>
          <Skeleton className="h-6 w-full rounded" />
        </div>
        {cols.map((_, i) => (
          <Skeleton key={i} className="h-4 w-5 shrink-0 rounded-[3px]" />
        ))}
      </div>
      {/* Lignes : libellé de sous-catégorie + cases. */}
      {rows.map((_, r) => (
        <div
          key={r}
          className="border-border/60 flex items-center gap-1 border-b py-1"
        >
          <div className="shrink-0 px-2" style={{ width: familleWidth }}>
            <Skeleton
              className="h-3 rounded"
              style={{
                width: `${String((SKEL_FACTEURS[r % SKEL_FACTEURS.length] ?? 0.7) * 100)}%`,
              }}
            />
          </div>
          {cols.map((_, i) =>
            (r * 7 + i * 3) % 5 === 0 ? (
              <Skeleton key={i} className="size-5 shrink-0 rounded-[3px]" />
            ) : (
              <div key={i} className="size-5 shrink-0" />
            ),
          )}
        </div>
      ))}
    </div>
  )
}

interface PlanningGrilleProps {
  groupes: GroupeDomaine[]
  semaines: SemaineIso[]
  /** Largeur (px) de la colonne de gauche, élastique (cf. `useColonnesAuto`). */
  familleWidth: number
  /** Clé de la semaine COURANTE (colonne surlignée en permanence). */
  cleSemaineCourante: string
  /** Libellé de la période visible (« 2025 · S10–S22 »), dans le coin de navigation. */
  periodeLabel: string
  /** Recule / avance la fenêtre d'un trimestre (coin haut-gauche). */
  onReculer: () => void
  onAvancer: () => void
  /** Clic sur le libellé de période → retour à aujourd'hui. */
  onAujourdhui: () => void
  /** Clic sur une cellule pleine → la page décide (1 OT = nav directe, ≥2 = dialog).
   *  `nomFamille` = sous-catégorie de la ligne (titre du dialog). */
  onSelect: (
    ots: PlanningOt[],
    semaine: SemaineIso,
    nomFamille: string,
  ) => void
  /** Clic sur un n° de semaine → tous les OT de cette semaine (toutes familles). */
  onSelectSemaine: (ots: PlanningOt[], semaine: SemaineIso) => void
  /** Clic sur le nom d'une sous-catégorie navigable → explorateur Plan de maintenance. */
  onOuvrirFamille: (famille: LigneFamille) => void
}

// Ombre droite simulant une bordure sur la colonne GELÉE (sticky) : `border-collapse`
// ne suit pas les cellules sticky → ce repère délimite la colonne de gauche au défilement.
const STICKY_SHADOW = 'shadow-[1px_0_0_0_var(--border)]'

interface BandeGroupe {
  cle: string
  label: string
  count: number
}

/**
 * Regroupe les semaines CONSÉCUTIVES partageant la même clé (mois, année…) pour les
 * bandes d'en-tête : chaque groupe couvre `count` colonnes (`colSpan`). Factorisé
 * entre la bande des années et celle des mois.
 */
function grouperSemaines(
  semaines: SemaineIso[],
  cleDe: (s: SemaineIso) => string,
  labelDe: (s: SemaineIso) => string,
): BandeGroupe[] {
  const res: BandeGroupe[] = []
  for (const s of semaines) {
    const cle = cleDe(s)
    const dernier = res[res.length - 1]
    if (dernier?.cle === cle) {
      dernier.count += 1
      continue
    }
    res.push({ cle, label: labelDe(s), count: 1 })
  }
  return res
}

/**
 * Jeudi de la semaine `s` — le jour qui DÉFINIT la semaine ISO (son année + son
 * numéro, cf. `s.annee`/`s.numero`). Les bandes ANNÉE et MOIS de l'en-tête s'y calent,
 * et NON sur le lundi (`s.debut`) : sinon une semaine à cheval sur deux mois/années
 * tombait sous la mauvaise étiquette (ex. la semaine ISO 1 affichée sous « décembre »
 * parce que son lundi est encore en décembre) → décalage visible avec le n° de semaine.
 */
function jeudiDe(s: SemaineIso): Date {
  return new Date(s.debut.getFullYear(), s.debut.getMonth(), s.debut.getDate() + 3)
}

/**
 * Grille dense : lignes = SOUS-CATÉGORIES (familles), séparées par leur catégorie
 * (domaine) via un TRAIT ÉPAIS, SANS afficher le nom de la catégorie. Colonnes =
 * semaines ISO de largeur FIXE (`CELL_SIZE`) — cases carrées régulières ; la colonne
 * de gauche est élastique (`familleWidth`). `table-layout: fixed` + `<colgroup>`
 * verrouillent les largeurs (le navigateur ne redistribue plus). En-tête sur 3
 * lignes (bande ANNÉE, bande MOIS, n° de semaine ISO), COLLANT en haut (`thead
 * sticky`) ; la colonne de gauche est gelée (`sticky left`). Le DÉFILEMENT
 * (vertical + horizontal) est porté par le conteneur PARENT (cf. page).
 */
export function PlanningGrille({
  groupes,
  semaines,
  familleWidth,
  cleSemaineCourante,
  periodeLabel,
  onReculer,
  onAvancer,
  onAujourdhui,
  onSelect,
  onSelectSemaine,
  onOuvrirFamille,
}: PlanningGrilleProps) {
  // Colonne survolée : surligne toute la semaine (en-tête + cellules) pour aligner
  // l'œil. État local léger — la semaine courante reste surlignée même sans survol.
  const [cleSurvol, setCleSurvol] = useState<string | null>(null)
  const colonneActive = (cle: string) =>
    cle === cleSurvol || cle === cleSemaineCourante
  const nbColonnes = semaines.length + 1
  const largeurTable = familleWidth + semaines.length * CELL_SIZE

  // Surbrillance d'une colonne (semaine survolée OU semaine courante) : token
  // `--col-active` (gris DISTINCT de `muted`/`accent`, qui valent le même token que le
  // badge « Programmé » et s'y confondaient ; défini dans index.css). Opaque → MÊME
  // teinte en-tête ET cellules, et l'en-tête collant ne laisse pas voir le corps défiler.
  const COL_ACTIVE = 'bg-col-active'
  // Cellules du CORPS : transparentes hors surbrillance.
  const classeColonne = (cle: string) => (colonneActive(cle) ? COL_ACTIVE : '')
  // Cellules d'EN-TÊTE : fond OPAQUE obligatoire (`bg-card`) — l'en-tête est collant,
  // sans fond on voit les lignes du corps défiler À TRAVERS lui et ses bordures.
  const classeEntete = (cle: string) =>
    colonneActive(cle) ? COL_ACTIVE : 'bg-card'

  // Bandes d'en-tête : années puis mois (sans l'année, portée par la bande du dessus),
  // chacune étalée sur ses semaines consécutives.
  const anneeGroupes = useMemo(
    () =>
      grouperSemaines(
        semaines,
        (s) => String(jeudiDe(s).getFullYear()),
        (s) => String(jeudiDe(s).getFullYear()),
      ),
    [semaines],
  )
  const moisGroupes = useMemo(
    () =>
      grouperSemaines(
        semaines,
        (s) => `${String(jeudiDe(s).getFullYear())}-${String(jeudiDe(s).getMonth())}`,
        (s) => jeudiDe(s).toLocaleDateString('fr-FR', { month: 'long' }),
      ),
    [semaines],
  )

  // OT par semaine (toutes familles), calculés UNE fois : sert l'affordance du n° de
  // semaine cliquable (présence) ET la liste passée au clic. Le parcours de la grille
  // est de toute façon déjà fait pour le rendu du corps.
  const otsParSemaine = useMemo(() => {
    const parSemaine = new Map<string, PlanningOt[]>()
    for (const domaine of groupes)
      for (const famille of domaine.familles)
        for (const [cle, cellule] of famille.parSemaine) {
          if (cellule.length === 0) continue
          const acc = parSemaine.get(cle)
          if (acc) acc.push(...cellule)
          else parSemaine.set(cle, [...cellule])
        }
    return parSemaine
  }, [groupes])

  return (
    // Le DÉFILEMENT (vertical des lignes + horizontal des semaines) est porté par le
    // conteneur PARENT (cf. page). Ici l'en-tête de table reste COLLANT en haut
    // (`thead sticky`) et la colonne de gauche reste gelée (`sticky left`).
    <table
      // `border-separate` (et non `collapse`) : les bordures appartiennent aux
      // CELLULES, donc elles COLLENT avec l'en-tête figé / la colonne gelée (en
      // `collapse` elles restent sur la table → on voit le corps défiler à travers).
      className="border-separate border-spacing-0 text-sm"
      style={{ tableLayout: 'fixed', width: largeurTable }}
      onMouseLeave={() => setCleSurvol(null)}
    >
      {/* Largeurs VERROUILLÉES : colonne de gauche élastique + semaines fixes. */}
      <colgroup>
        <col style={{ width: familleWidth }} />
        {semaines.map((s) => (
          <col key={s.cle} style={{ width: CELL_SIZE }} />
        ))}
      </colgroup>
      <thead className="bg-card sticky top-0 z-20">
        {/* Bande des ANNÉES : trait fort + libellé, divise visuellement les années. */}
        <tr>
          {/* Coin haut-gauche figé : navigation par trimestre sur 2 lignes
              (période au-dessus, flèches ◀ ▶ en dessous) pour exploiter la hauteur. */}
          <th
            rowSpan={3}
            className={cn(
              'bg-card border-border sticky left-0 z-30 border-b px-1.5 py-1',
              STICKY_SHADOW,
            )}
          >
            <div className="flex flex-col justify-center gap-1">
              <button
                type="button"
                onClick={onAujourdhui}
                title="Revenir à aujourd’hui"
                className="hover:bg-accent truncate rounded px-1 py-0.5 text-center text-xs font-semibold"
              >
                {periodeLabel}
              </button>
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={onReculer}
                  aria-label="Trimestre précédent"
                  className="hover:bg-accent flex size-6 items-center justify-center rounded"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={onAvancer}
                  aria-label="Trimestre suivant"
                  className="hover:bg-accent flex size-6 items-center justify-center rounded"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </th>
          {anneeGroupes.map((a) => (
            <th
              key={a.cle}
              colSpan={a.count}
              title={a.label}
              className="border-border bg-card text-muted-foreground truncate border-b border-l px-1 pt-1 pb-0.5 text-center text-[11px] font-semibold"
            >
              {a.label}
            </th>
          ))}
        </tr>
        {/* Bande des MOIS (sans l'année, portée par la bande du dessus). */}
        <tr>
          {moisGroupes.map((m) => (
            <th
              key={m.cle}
              colSpan={m.count}
              title={m.label}
              className="border-border border-l-border/60 bg-card text-muted-foreground truncate border-b border-l px-1 py-0.5 text-center text-[10px] font-medium first-letter:uppercase"
            >
              {m.label}
            </th>
          ))}
        </tr>
        {/* Semaine : n° ISO seul. */}
        <tr>
          {semaines.map((s) => (
            <th
              key={s.cle}
              title={labelSemaine(s)}
              className={cn(
                'border-border overflow-hidden border-b px-0 py-1 text-center',
                classeEntete(s.cle),
              )}
              onMouseEnter={() => setCleSurvol(s.cle)}
            >
              {otsParSemaine.has(s.cle) ? (
                <button
                  type="button"
                  onClick={() => onSelectSemaine(otsParSemaine.get(s.cle) ?? [], s)}
                  title={`Voir tous les ordres de travail de la semaine S${String(s.numero)}`}
                  className="text-foreground hover:text-primary w-full text-[10px] leading-none font-semibold hover:underline"
                >
                  {s.numero}
                </button>
              ) : (
                <div className="text-foreground text-[10px] leading-none font-semibold">
                  {s.numero}
                </div>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groupes.map((domaine, di) => (
          <Fragment key={domaine.cle}>
            {/* Séparateur de CATÉGORIE : trait épais entre domaines, SANS libellé
                  (décision PO). Pas avant le tout premier groupe. */}
            {di > 0 && (
              <tr aria-hidden>
                <td
                  colSpan={nbColonnes}
                  className="border-border h-0 border-t-4 p-0"
                />
              </tr>
            )}
            {domaine.familles.map((famille) => (
              <tr key={famille.cle}>
                <th
                  scope="row"
                  className={cn(
                    'bg-card border-border sticky left-0 z-10 h-6 truncate border-b px-2 text-left font-normal',
                    STICKY_SHADOW,
                  )}
                >
                  {famille.splat !== null ? (
                    <button
                      type="button"
                      onClick={() => onOuvrirFamille(famille)}
                      title={`${famille.nomFamille} — ouvrir dans le Plan de maintenance`}
                      className="hover:text-primary block w-full truncate text-left hover:underline"
                    >
                      {famille.nomFamille}
                    </button>
                  ) : (
                    <span className="block truncate" title={famille.nomFamille}>
                      {famille.nomFamille}
                    </span>
                  )}
                </th>
                {semaines.map((s) => {
                  const ots = famille.parSemaine.get(s.cle)
                  if (!ots || ots.length === 0) {
                    return (
                      <td
                        key={s.cle}
                        className={cn(
                          'border-border border-b p-0',
                          classeColonne(s.cle),
                        )}
                        onMouseEnter={() => setCleSurvol(s.cle)}
                      />
                    )
                  }
                  const tone = toneCellule(ots, s.cle === cleSemaineCourante)
                  return (
                    <td
                      key={s.cle}
                      className={cn(
                        'border-border border-b p-0',
                        classeColonne(s.cle),
                      )}
                      onMouseEnter={() => setCleSurvol(s.cle)}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(ots, s, famille.nomFamille)}
                        title={tooltipCellule(ots)}
                        className="flex h-6 w-full items-center justify-center"
                      >
                        <span
                          className={cn(
                            'flex size-5 items-center justify-center rounded-[3px] text-[10px] leading-none font-semibold transition-opacity hover:opacity-80',
                            TONE_CELL[tone],
                            // Contour réglementaire : au moins un OT de contrôle
                            // réglementaire dans la cellule (obligation légale).
                            aReglementaire(ots) &&
                              'ring-primary ring-1 ring-inset',
                          )}
                        >
                          {ots.length > 1 ? ots.length : ''}
                        </span>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}
