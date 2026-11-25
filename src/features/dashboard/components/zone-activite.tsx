import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ClipboardList, HardHat, OctagonAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { StatusBadge } from '@/components/common/status-badge'
import { StatutColonne } from '@/components/common/statut-colonne'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActionsDemande } from '@/features/demandes/use-actions-demande'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useAuth } from '@/auth'
import { LIEU_NON_PRECISE } from '@/features/demandes/etat'
import { TitreLieu } from '@/features/demandes/components/titre-lieu'
import { statutsTravauxQueries } from '@/features/travaux/queries'
import { statutsEvenementsQueries } from '@/features/evenements/queries'
import { activiteQueries } from '../activite-queries'
import { listStack } from '@/lib/responsive'
import { useNonClotures } from '../use-non-clotures'
import { PastilleATraiter } from '@/components/common/pastille-a-traiter'
import {
  lignesDemandes,
  lignesEvenements,
  lignesTravaux,
  type LigneActivite,
} from '../activite'
import { DashboardListCard } from './dashboard-list-card'

/** `select` STABLE (hors composant) : l'index n'est recalculé qu'au rafraîchissement. */
function demandesIndexees<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((d) => [d.id, d]))
}

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

/** Repli partagé tant que les lieux ne sont pas chargés (jamais muté). */
const AUCUN_LIEU = new Map<string, string>()

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
  // Compteur sur l'onglet : lignes non clôturées (même source que la sidebar).
  const nonClotures = useNonClotures(siteId)

  // Référentiels de statuts : les travaux et les événements tirent leur libellé
  // de la base (les demandes ont trois statuts figés côté front).
  const { data: statutsTravaux = [] } = useQuery(statutsTravauxQueries.list())
  const { data: statutsEvenements = [] } = useQuery(
    statutsEvenementsQueries.list(),
  )
  const labelsTravaux = new Map(statutsTravaux.map((s) => [s.id, s.nom]))
  const labelsEvenements = new Map(statutsEvenements.map((s) => [s.id, s.nom]))

  // `select` : la normalisation se fait DANS la query (donc une fois par
  // rafraîchissement, pas à chaque rendu) et les trois requêtes en ressortent
  // avec le même type — c'est ce qui permet de passer celle de l'onglet actif à
  // la carte sans cast. Les clés restent celles des features : la liste des
  // demandes est ainsi partagée avec le reste du tableau de bord. Les deux
  // journaux dont le libellé de statut vient d'un référentiel referment dessus,
  // d'où une fonction par journal, d'identité stable tant que le référentiel ne
  // change pas (mémoïsée par React Compiler ; `lignesDemandes`, elle, est déjà
  // stable).
  const selTravaux = (rows: Parameters<typeof lignesTravaux>[0]) =>
    lignesTravaux(rows, labelsTravaux)
  const selEvenements = (rows: Parameters<typeof lignesEvenements>[0]) =>
    lignesEvenements(rows, labelsEvenements)

  // APERÇUS bornés (30 lignes par journal : ce qui reste à traiter, puis le
  // plus récent) — jamais l'historique entier : la carte en montre une vingtaine.
  const demandesQuery = useQuery({
    ...activiteQueries.demandes(siteId),
    select: lignesDemandes,
  })
  // Menu contextuel des demandes : MÊME brique que la page Demandes (statut,
  // modifier, supprimer), sur la ligne complète de la DI (même cache de requête).
  const { session } = useAuth()
  const { data: role } = useCurrentRole()
  const { actionsDe, dialogues } = useActionsDemande({
    siteId,
    role,
    userId: session?.user.id,
  })
  const { data: demandesParId } = useQuery({
    ...activiteQueries.demandes(siteId),
    select: demandesIndexees,
  })

  // Lieu(x) des SEULES demandes de l'aperçu : titre des cartes, comme sur la
  // page Demandes. L'ancien aperçu reste affiché pendant un rafraîchissement.
  const idsDemandes = [...(demandesParId?.keys() ?? [])]
  const { data: lieux = AUCUN_LIEU, isPending: lieuxEnChargement } = useQuery({
    ...activiteQueries.lieuxDemandes(siteId, idsDemandes),
    placeholderData: keepPreviousData,
  })
  const travauxQuery = useQuery({
    ...activiteQueries.travaux(siteId),
    select: selTravaux,
  })
  const evenementsQuery = useQuery({
    ...activiteQueries.evenements(siteId),
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
                <PastilleATraiter nombre={nonClotures[o.value]} />
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
                ? lignes.slice(0, nbLignes).map((l) => {
                    // Demandes : même carte que la page Demandes (lieu, puis
                    // constat ; statut + date à droite), en version serrée
                    // pour garder la hauteur `xs` des lignes du tableau de bord.
                    if (o.value === 'demandes') {
                      const lieu = lieux.get(l.id) ?? null
                      const demande = demandesParId?.get(l.id)
                      const actions = demande ? actionsDe(demande) : []
                      const colonne = (
                        <StatutColonne
                          dense
                          statut={{ label: l.statut, tone: l.tone }}
                          meta={l.sousTitre}
                        />
                      )
                      return (
                        <ListRow
                          key={l.id}
                          size="xs"
                          tone={l.tone}
                          media={<RowMediaIcon icon={o.icon} />}
                          title={
                            <TitreLieu
                              lieu={lieu}
                              chargement={lieuxEnChargement}
                            />
                          }
                          titleLabel={`${lieu ?? LIEU_NON_PRECISE} — ${l.titre}`}
                          subtitle={l.titre}
                          badges={colonne}
                          mobileBadge={colonne}
                          onClick={() => ouvrir(l)}
                          menuActions={actions.length ? actions : undefined}
                        />
                      )
                    }
                    return (
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
                    )
                  })
                : null}
            </TabsContent>
          ))
        }
      </DashboardListCard>
      {dialogues}
    </Tabs>
  )
}
