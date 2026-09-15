import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, HardHat, OctagonAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { StatusBadge } from '@/components/common/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { demandesQueries } from '@/features/demandes/queries'
import {
  travauxQueries,
  statutsTravauxQueries,
} from '@/features/travaux/queries'
import {
  evenementsQueries,
  statutsEvenementsQueries,
} from '@/features/evenements/queries'
import { listStack } from '@/lib/responsive'
import {
  lignesDemandes,
  lignesEvenements,
  lignesTravaux,
  type LigneActivite,
} from '../activite'
import { DashboardListCard } from './dashboard-list-card'

interface ZoneActiviteProps {
  siteId: string
}

type Onglet = 'demandes' | 'travaux' | 'evenements'

interface MetaOnglet {
  value: Onglet
  label: string
  icon: LucideIcon
  emptyTitle: string
  emptyDescription: string
}

const ONGLETS: MetaOnglet[] = [
  {
    value: 'demandes',
    label: 'Demandes',
    icon: ClipboardList,
    emptyTitle: 'Aucune demande',
    emptyDescription: 'Aucun signalement pour ce site.',
  },
  {
    value: 'travaux',
    label: 'Travaux',
    icon: HardHat,
    emptyTitle: 'Aucun travaux',
    emptyDescription: 'Aucun travaux en cours ou passé sur ce site.',
  },
  {
    value: 'evenements',
    label: 'Événements',
    icon: OctagonAlert,
    emptyTitle: 'Aucun événement',
    emptyDescription: 'Aucun événement consigné pour ce site.',
  },
]

/**
 * Colonne « Activité » du tableau de bord (zone 3, gauche) : les trois journaux
 * du site — demandes d'intervention, travaux, événements — sous des onglets,
 * dans UNE seule carte.
 *
 * Les trois onglets se comportent à l'identique : mêmes lignes (titre, date,
 * pastille de statut), même ordre (ce qui n'est pas terminé en tête, puis par
 * récence), même clic qui ouvre la fiche par son slug d'URL. C'est le rôle de
 * `activite.ts` : chaque feature garde ses règles (couleurs, date à afficher en
 * regard du statut), la normalisation les ramène à une forme commune plutôt que
 * de dupliquer trois listes presque identiques.
 *
 * Le fit-to-height, la carte et l'état vide restent ceux de `DashboardListCard`,
 * partagés avec la colonne Documents ; la barre d'onglets passe par son `header`
 * (sa hauteur est donc retranchée de la place disponible pour les lignes — cf.
 * `CHROME_ONGLETS` côté `dashboard.tsx`).
 */
export function ZoneActivite({ siteId }: ZoneActiviteProps) {
  // `null` = l'utilisateur n'a pas encore choisi : l'onglet d'ouverture est
  // alors déduit des données (cf. plus bas). Dès qu'il clique, son choix tient.
  const [onglet, setOnglet] = useState<Onglet | null>(null)
  const navigate = useNavigate()

  // Référentiels de statuts : les travaux et les événements tirent leur libellé
  // de la base (les demandes ont trois statuts figés côté front).
  const { data: statutsTravaux = [] } = useQuery(statutsTravauxQueries.list())
  const { data: statutsEvenements = [] } = useQuery(
    statutsEvenementsQueries.list(),
  )
  const labelsTravaux = useMemo(
    () => new Map(statutsTravaux.map((s) => [s.id, s.nom])),
    [statutsTravaux],
  )
  const labelsEvenements = useMemo(
    () => new Map(statutsEvenements.map((s) => [s.id, s.nom])),
    [statutsEvenements],
  )

  // `select` : la normalisation se fait DANS la query (donc une fois par
  // rafraîchissement, pas à chaque rendu) et les trois requêtes en ressortent
  // avec le même type — c'est ce qui permet de passer celle de l'onglet actif à
  // la carte sans cast. Les clés restent celles des features : la liste des
  // demandes est ainsi partagée avec le reste du tableau de bord. Les deux
  // journaux dont le libellé de statut vient d'un référentiel referment dessus,
  // d'où le `useCallback` (`lignesDemandes`, elle, est déjà stable).
  const selTravaux = useCallback(
    (rows: Parameters<typeof lignesTravaux>[0]) =>
      lignesTravaux(rows, labelsTravaux),
    [labelsTravaux],
  )
  const selEvenements = useCallback(
    (rows: Parameters<typeof lignesEvenements>[0]) =>
      lignesEvenements(rows, labelsEvenements),
    [labelsEvenements],
  )

  const demandesQuery = useQuery({
    ...demandesQueries.list(siteId),
    select: lignesDemandes,
  })
  const travauxQuery = useQuery({
    ...travauxQueries.list(siteId),
    select: selTravaux,
  })
  const evenementsQuery = useQuery({
    ...evenementsQueries.list(siteId),
    select: selEvenements,
  })

  // Onglet d'OUVERTURE : le premier, dans l'ordre Demandes → Travaux →
  // Événements, où il reste quelque chose d'OUVERT ; à défaut le premier qui a
  // au moins une ligne (mieux vaut de l'historique qu'une carte vide) ; à défaut
  // Demandes. Le choix est ARRÊTÉ une fois pour toutes dès que les trois listes
  // sont chargées, en le posant dans l'état : sans cela, une clôture faite
  // ailleurs (le tableau de bord est en live) déplacerait l'onglet sous les
  // doigts de l'utilisateur.
  const listes: Record<Onglet, LigneActivite[]> = {
    demandes: demandesQuery.data ?? [],
    travaux: travauxQuery.data ?? [],
    evenements: evenementsQuery.data ?? [],
  }
  const chargees =
    !demandesQuery.isPending &&
    !travauxQuery.isPending &&
    !evenementsQuery.isPending
  if (onglet === null && chargees) {
    // Ajustement d'état PENDANT le rendu (patron React) : conditionné, donc il
    // n'a lieu qu'une fois et ne provoque pas de boucle.
    setOnglet(
      ONGLETS.find((o) => listes[o.value].some((l) => !l.termine))?.value ??
        ONGLETS.find((o) => listes[o.value].length > 0)?.value ??
        'demandes',
    )
  }
  const actif = onglet ?? 'demandes'

  const query =
    actif === 'demandes'
      ? demandesQuery
      : actif === 'travaux'
        ? travauxQuery
        : evenementsQuery
  const meta = ONGLETS.find((o) => o.value === actif) ?? ONGLETS[0]!

  function ouvrir(ligne: LigneActivite) {
    if (actif === 'demandes') {
      void navigate({
        to: '/demandes/$demande',
        params: { demande: ligne.slug },
      })
      return
    }
    if (actif === 'travaux') {
      void navigate({
        to: '/travaux/$travaux',
        params: { travaux: ligne.slug },
      })
      return
    }
    void navigate({
      to: '/evenements/$evenement',
      params: { evenement: ligne.slug },
    })
  }

  return (
    <Tabs
      value={actif}
      onValueChange={(v) => setOnglet(v as Onglet)}
      // La carte occupe toute la cellule : le `Tabs` qui l'enveloppe doit se
      // comporter comme elle (sinon la hauteur s'arrête au contenu et le
      // fit-to-height n'a plus de place à mesurer).
      className="min-w-0 gap-0 md:flex md:min-h-0 md:flex-1 md:flex-col"
    >
      <DashboardListCard
        query={query}
        emptyIcon={meta.icon}
        emptyTitle={meta.emptyTitle}
        emptyDescription={meta.emptyDescription}
        headerFlush
        header={
          // Barre d'onglets en EN-TÊTE de carte : d'un bord à l'autre, à ras du
          // haut, séparée du contenu par un filet. Les onglets « soulignés »
          // (plutôt que le segmenté par défaut, fait pour un groupe de boutons
          // au milieu d'un formulaire) sont le patron d'un en-tête pleine
          // largeur : l'onglet actif se rattache visuellement au contenu qu'il
          // commande, et la carte ne gagne pas un second cadre à l'intérieur
          // d'elle-même.
          <TabsList className="h-10 w-full rounded-none border-b bg-transparent p-0">
            {ONGLETS.map((o) => (
              <TabsTrigger
                key={o.value}
                value={o.value}
                className="-mb-px h-full flex-1 rounded-none border-0 border-b-2 border-transparent text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <o.icon />
                {o.label}
              </TabsTrigger>
            ))}
          </TabsList>
        }
      >
        {(lignes, nbLignes) =>
          // Un panneau par onglet, porteur de l'empilement des lignes. Radix ne
          // monte QUE le panneau actif : la condition évite simplement de
          // construire les lignes des deux autres (`lignes` est la liste de
          // l'onglet actif, elle n'a de sens que pour lui).
          ONGLETS.map((o) => (
            <TabsContent key={o.value} value={o.value} className={listStack}>
              {o.value === actif
                ? lignes
                    .slice(0, nbLignes)
                    .map((l) => (
                      <ListRow
                        key={l.id}
                        size="xs"
                        tone={l.tone}
                        media={<RowMediaIcon icon={o.icon} />}
                        title={l.titre}
                        subtitle={l.sousTitre}
                        badges={
                          <StatusBadge tone={l.tone}>{l.statut}</StatusBadge>
                        }
                        mobileBadge={
                          <StatusBadge tone={l.tone}>{l.statut}</StatusBadge>
                        }
                        onClick={() => ouvrir(l)}
                      />
                    ))
                : null}
            </TabsContent>
          ))
        }
      </DashboardListCard>
    </Tabs>
  )
}
