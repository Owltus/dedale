import type { QueryClient } from '@tanstack/react-query'
import type { NavKey } from '@/lib/nav'
import { demandesQueries } from '@/features/demandes/queries'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import {
  travauxQueries,
  statutsTravauxQueries,
} from '@/features/travaux/queries'
import {
  evenementsQueries,
  statutsEvenementsQueries,
} from '@/features/evenements/queries'
import {
  documentsQueries,
  typesDocumentsQueries,
} from '@/features/documents/queries'
import {
  investissementsQueries,
  statutsCapexQueries,
} from '@/features/investissements/queries'
import {
  prestatairesQueries,
  contratsQueries,
} from '@/features/prestataires/queries'
import { gammesQueries } from '@/features/gammes/queries'
import { equipementsQueries } from '@/features/equipements/queries'
import { localisationsQueries } from '@/features/localisations/queries'
import { relevesQueries } from '@/features/releves/queries'

/**
 * Données PRINCIPALES de chaque page, demandées dès que le pointeur survole (ou
 * que le clavier atteint) son lien dans la sidebar. Le code de la page est déjà
 * préchargé au survol par le routeur (`defaultPreload: 'intent'`) ; ici, ce sont
 * ses données : au clic, la page s'ouvre souvent déjà remplie.
 *
 * Mêmes `queryOptions` que les pages, donc même clé de cache : rien n'est lu
 * deux fois, et une donnée encore fraîche n'est pas redemandée (`prefetchQuery`
 * respecte le `staleTime`). Une page absente de la table (tableau de bord,
 * planning dont la fenêtre dépend de la largeur d'écran, référentiels) se
 * charge simplement au clic, comme avant.
 */
const PAGES: Partial<
  Record<NavKey, (qc: QueryClient, siteId: string) => Promise<unknown>[]>
> = {
  '/demandes': (qc, s) => [
    qc.prefetchQuery(demandesQueries.list(s)),
    qc.prefetchQuery(demandesQueries.locauxParDi(s)),
  ],
  '/ordres-travail': (qc, s) => [
    qc.prefetchQuery(ordresTravailQueries.list(s)),
    qc.prefetchQuery(ordresTravailQueries.documentsParOt(s)),
    qc.prefetchQuery(ordresTravailQueries.relevesListe(s)),
  ],
  '/travaux': (qc, s) => [
    qc.prefetchQuery(travauxQueries.list(s)),
    qc.prefetchQuery(travauxQueries.documentsParTravaux(s)),
    qc.prefetchQuery(statutsTravauxQueries.list()),
  ],
  '/evenements': (qc, s) => [
    qc.prefetchQuery(evenementsQueries.list(s)),
    qc.prefetchQuery(statutsEvenementsQueries.list()),
  ],
  '/documents': (qc, s) => [
    qc.prefetchQuery(documentsQueries.list(s)),
    qc.prefetchQuery(typesDocumentsQueries.list()),
  ],
  '/investissements': (qc, s) => [
    qc.prefetchQuery(investissementsQueries.list(s)),
    qc.prefetchQuery(statutsCapexQueries.list()),
  ],
  '/prestataires': (qc, s) => [
    qc.prefetchQuery(prestatairesQueries.list()),
    qc.prefetchQuery(contratsQueries.countsBySite(s)),
  ],
  '/gammes': (qc, s) => [qc.prefetchQuery(gammesQueries.list(s))],
  '/equipements': (qc, s) => [
    qc.prefetchQuery(equipementsQueries.list(s)),
    qc.prefetchQuery(equipementsQueries.locaux(s)),
  ],
  '/localisations': (qc, s) => [
    qc.prefetchQuery(localisationsQueries.batiments(s)),
    qc.prefetchQuery(localisationsQueries.typesLocaux()),
  ],
  '/releves': (qc, s) => [qc.prefetchQuery(relevesQueries.gammesListe(s))],
}

/**
 * Lance le préchargement des données d'une page. Sans effet sans site actif ou
 * pour une page non listée ; un échec est ignoré (la page refera la demande et
 * affichera l'erreur elle-même).
 */
export function prechargerPage(
  qc: QueryClient,
  page: NavKey,
  siteId: string | null,
): void {
  const lancer = PAGES[page]
  if (!lancer || !siteId) return
  void Promise.allSettled(lancer(qc, siteId))
}
