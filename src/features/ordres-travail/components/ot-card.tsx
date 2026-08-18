import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ClipboardList, FileText } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import {
  statutAffichageOt,
  statutPlanningOt,
} from '@/features/ordres-travail/statut-affichage'
import { formatDateAvecSemaineIso } from '@/lib/date'
import { ListRow } from '@/components/common/list-row'
import { StatutColonne } from '@/components/common/statut-colonne'
import { StatusBadge } from '@/components/common/status-badge'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import { OtDocumentsDialog } from './ot-documents-dialog'
import type { DocumentMeta } from '@/features/documents/format'
import type { ReleveAffiche } from '@/features/ordres-travail/releves'
import { cn } from '@/lib/utils'

/**
 * Champs nécessaires au rendu d'une carte OT — communs aux requêtes `list`
 * (page Ordres de travail) et `byGammes` (panneau OT du Plan de maintenance).
 */
export interface OtCardData {
  id: string
  statut: string
  /** Origine (enum ot_origine) — Planifié (date posée par un humain) / Programmé (généré par le cycle). */
  origine: string
  nom_gamme: string
  nom_equipement: string | null
  /** Description (snapshot de la gamme) — sous-titre de repli quand l'OT n'a pas d'équipement. */
  description_gamme: string | null
  date_prevue: string | null
  /**
   * Date/heure de clôture (TIMESTAMPTZ, NULL tant que l'OT n'est pas terminal).
   * Affichée à la place de la date prévue une fois l'OT CLÔTURÉ.
   */
  date_cloture: string | null
  /** Fenêtre de tolérance (jours) : pilote la bascule vers les statuts temporels. */
  tolerance_jours: number
  /** Vignette esthétique de l'OT (héritée de la gamme — migration 067). */
  miniature_id: string | null
}

/**
 * Carte (ListRow) d'un ordre de travail : icône + gamme + équipement/prestataire +
 * badge de statut + date prévue. Source UNIQUE du rendu d'un OT → partagée par la
 * page liste « Ordres de travail » ET par `OtListeParGammes` (Plan de maintenance,
 * onglet OT d'une fiche gamme). Le clic ouvre le détail (`/ordres-travail/<id>`).
 * La page fournit les `menuActions` autorisées (ex. Supprimer pour un gestionnaire).
 *
 * Les vignettes (`urlOf`/`refreshMiniatures`) sont INJECTÉES par le conteneur (qui
 * appelle `useMiniatureUrls` UNE fois pour toute la liste) → un seul canal Realtime
 * et une seule map d'URL, pas un par carte.
 */
export function OtCard({
  ot,
  urlOf,
  refreshMiniatures,
  menuActions,
  releve,
  documents = [],
  simplifierStatut = false,
  compact = false,
}: {
  ot: OtCardData
  urlOf: (id: string | null) => string | null
  refreshMiniatures: () => void
  menuActions?: RowAction[]
  /**
   * Relevé (valeur brute + consommation, ex. « 4 455 m³ » / « +219 m³ ») calculé
   * en amont par `calculerRelevesParOt` — même information que `OperationRow` en
   * lecture seule, affichée sur deux lignes. Affiché À GAUCHE de la colonne
   * statut/date, masqué si vide. Injecté par CHAQUE conteneur d'OT (page liste,
   * panneau par-gamme, popup planning) → même valeur partout. IGNORÉ en mode
   * `compact`.
   */
  releve?: ReleveAffiche | null
  /**
   * Documents rattachés à cet OT, calculés en amont par le conteneur (une seule
   * requête groupée pour toute la liste, jamais une par carte — cf.
   * `ordresTravailQueries.documentsParOt`). Vide/omis → aucune icône. Visible sur
   * TOUTES les densités (bureau, compact, mobile), contrairement à `releve`.
   */
  documents?: DocumentMeta[]
  /**
   * Version PLANNING du statut : dépouillée des nuances de proximité calendaire
   * (Cette semaine / À venir / Mois prochain…) — cf. `statutPlanningOt`. Réservé au
   * popup du planning, pour rester cohérent avec le coloriage de la grille. Défaut
   * `false` → cartes de liste et fiche détail gardent le statut riche.
   */
  simplifierStatut?: boolean
  /**
   * Variante DENSE pour le popup du planning (modal étroit) : ligne `size="sm"`,
   * badge de statut NU (sans la colonne fixe `w-36`) et SANS relevé → la carte ne
   * peut plus déborder horizontalement. Défaut `false` → rendu inchangé partout
   * ailleurs (page liste, fiche gamme).
   */
  compact?: boolean
}) {
  const navigate = useNavigate()
  // Statut d'affichage (métier ou temporel) — calculé UNE fois, partagé entre le
  // badge de la colonne et le `mobileMeta` (plus de double calcul via un sous-badge).
  const statut = simplifierStatut
    ? statutPlanningOt({
        statut: ot.statut,
        origine: ot.origine,
        datePrevue: ot.date_prevue,
      })
    : statutAffichageOt({
        statut: ot.statut,
        origine: ot.origine,
        datePrevue: ot.date_prevue,
        toleranceJours: ot.tolerance_jours,
      })
  // Date affichée dans la colonne : pour un OT TERMINAL (clôturé ou annulé), la date
  // de clôture réelle — `date_cloture` porte l'horodatage de clôture OU d'annulation
  // (le schéma l'impose NON NULL sur tout statut terminal). Sinon (planifié, en cours,
  // rouvert) la date PRÉVUE — l'échéance reste la donnée pertinente. Toute date
  // affichée porte SYSTÉMATIQUEMENT son n° de semaine ISO 8601 (convention FR :
  // la semaine commence le lundi, cf. `formatDateAvecSemaineIso`) — y compris la
  // date de clôture, qui ne faisait jusqu'ici exception à tort.
  const estTerminal = ot.statut === 'cloture' || ot.statut === 'annule'
  const dateAffichee =
    estTerminal && ot.date_cloture
      ? formatDateAvecSemaineIso(ot.date_cloture)
      : formatDateAvecSemaineIso(ot.date_prevue)
  // Colonne de statut (badge + date, largeur fixe centrée) — affichée à l'identique
  // au BUREAU (slot `badges`) ET sur MOBILE (slot `mobileBadge`) → badges et dates
  // centrés et alignés d'une carte à l'autre, à toutes les tailles.
  const statutColonne = <StatutColonne statut={statut} meta={dateAffichee} />
  // Mode COMPACT (popup planning) : badge de statut NU, sans la colonne fixe `w-36`
  // ni le relevé → la ligne ne peut plus déborder dans un modal étroit.
  const badgeCompact = (
    <StatusBadge tone={statut.tone}>{statut.label}</StatusBadge>
  )

  // Icône documents : un seul → aperçu direct ; plusieurs → modal de choix.
  // Posée dans `badges`/`mobileBadge`, tous deux `relative z-10` dans `ListRow`
  // → reçoit le clic sans être recouverte par l'overlay de navigation, sans
  // `stopPropagation` (même mécanisme que le slot `actions`).
  const [preview, setPreview] = useState<DocumentMeta | null>(null)
  const [listeOpen, setListeOpen] = useState(false)
  function ouvrirDocuments() {
    if (documents.length === 1) setPreview(documents[0] ?? null)
    else if (documents.length > 1) setListeOpen(true)
  }
  const documentIcon =
    documents.length > 0 ? (
      <button
        type="button"
        onClick={ouvrirDocuments}
        aria-label={
          documents.length > 1 ? 'Voir les documents' : 'Voir le document'
        }
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        <FileText
          strokeWidth={1.25}
          className={compact ? 'size-10' : 'size-12'}
        />
      </button>
    ) : null
  // Emplacement pour compact/mobile (où le relevé n'existe pas) : SANS icône,
  // ne rend RIEN — pas de largeur à réserver pour un OT sans document, la
  // place revient au titre/sous-titre (priorité responsive, cf. `indicateurZone`
  // ci-dessous pour le raisonnement complet).
  const documentIconSlot = documentIcon ? (
    <div className="flex w-16 shrink-0 items-center justify-center">
      {documentIcon}
    </div>
  ) : null
  // Valeur brute + consommation en dessous, MÊME style que la colonne valeur
  // d'`OperationRow` en lecture seule (fiche détail, onglet Opérations) : la
  // carte de liste montre donc la même information, agrégée au niveau de l'OT.
  const releveTexte = releve ? (
    <span className="flex flex-col items-center leading-tight">
      <span className="text-sm font-medium whitespace-nowrap tabular-nums">
        {releve.valeur}
      </span>
      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {releve.conso}
      </span>
    </span>
  ) : null
  // Zone à largeur FIXE (`w-28`) et contenu CENTRÉ, MAIS SEULEMENT si un
  // indicateur existe : un OT SANS document ni relevé (le cas le plus
  // fréquent) ne réserve plus aucune largeur ici — priorité au titre et au
  // sous-titre, qui en ont besoin. Réserver une colonne vide sur la majorité
  // des cartes juste pour garder le badge pixel-aligné sur la minorité de
  // cartes qui ont un indicateur n'est pas un bon compromis responsive
  // (texte tronqué inutilement). Quand un indicateur EST présent, la boîte
  // fixe + centrée garde la même logique que `StatutColonne` juste à côté :
  // ses bords ne bougent pas tant que le contenu tient dans `w-28`. Seul le
  // cas RARE où icône ET relevé coexistent bascule en largeur MINIMALE (la
  // boîte s'élargit pour les deux).
  const indicateurs = [documentIcon, releveTexte].filter(
    (n): n is NonNullable<typeof n> => n !== null,
  )
  const indicateurZone =
    indicateurs.length > 0 ? (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center gap-2',
          indicateurs.length > 1 ? 'min-w-28' : 'w-28',
        )}
      >
        {indicateurs}
      </div>
    ) : null

  return (
    <>
      <ListRow
        media={
          <MiniatureThumb
            url={urlOf(ot.miniature_id)}
            fallback={
              <ClipboardList className={compact ? 'size-6' : 'size-10'} />
            }
            alt=""
            onError={refreshMiniatures}
            className="size-full rounded-none"
          />
        }
        title={ot.nom_gamme}
        subtitle={ot.nom_equipement ?? ot.description_gamme ?? undefined}
        // Liséré de statut au bord gauche (code couleur lié au statut, comme les
        // Demandes d'intervention).
        tone={statut.tone}
        size={compact ? 'sm' : 'md'}
        // À droite (bureau) : icône/relevé centrés dans leur colonne fixe (cf.
        // `indicateurZone`) puis colonne statut/date. En mode compact, même
        // icône puis un badge de statut nu, pas de relevé.
        badges={
          compact ? (
            <div className="flex items-center gap-2">
              {documentIconSlot}
              {badgeCompact}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {indicateurZone}
              {statutColonne}
            </div>
          )
        }
        // Sous `sm` : MÊME icône documents (décision : visible aussi sur mobile,
        // contrairement au relevé) + la colonne de statut (ou le badge compact).
        mobileBadge={
          <div className="flex items-center gap-2">
            {documentIconSlot}
            {compact ? badgeCompact : statutColonne}
          </div>
        }
        onClick={() =>
          void navigate({
            to: '/ordres-travail/$otId',
            params: { otId: ot.id },
          })
        }
        menuActions={menuActions}
      />
      {documents.length > 0 && (
        <>
          <DocumentPreviewDialog
            doc={preview}
            onOpenChange={(open) => {
              if (!open) setPreview(null)
            }}
          />
          {documents.length > 1 && (
            <OtDocumentsDialog
              open={listeOpen}
              onOpenChange={setListeOpen}
              documents={documents}
              otNom={ot.nom_gamme}
            />
          )}
        </>
      )}
    </>
  )
}
