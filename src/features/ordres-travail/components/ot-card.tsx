import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ClipboardList, FileText } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import {
  statutAffichageOt,
  statutPlanningOt,
} from '@/features/ordres-travail/statut-affichage'
import { formatDate, formatDateAvecSemaineIso } from '@/lib/date'
import { ListRow } from '@/components/common/list-row'
import { StatutColonne } from '@/components/common/statut-colonne'
import { StatusBadge } from '@/components/common/status-badge'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import { OtDocumentsDialog } from './ot-documents-dialog'
import type { DocumentMeta } from '@/features/documents/format'

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
   * Relevé (somme de consommation, ex. « 80 kWh ») calculé en amont par
   * `calculerRelevesParOt`. Affiché À GAUCHE de la colonne statut/date, masqué si
   * vide. Injecté par CHAQUE conteneur d'OT (page liste, panneau par-gamme, popup
   * planning) → même valeur partout. IGNORÉ en mode `compact`.
   */
  releve?: string | null
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
  // rouvert) la date PRÉVUE — l'échéance reste la donnée pertinente. La date prévue
  // garde son n° de semaine ISO (repère de planification) ; la date de clôture est un
  // horodatage passé → format simple, sans semaine.
  const estTerminal = ot.statut === 'cloture' || ot.statut === 'annule'
  const dateAffichee =
    estTerminal && ot.date_cloture
      ? formatDate(ot.date_cloture)
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
        <FileText className={compact ? 'size-10' : 'size-12'} />
      </button>
    ) : null
  // Emplacements RÉSERVÉS (grille) : icône documents et relevé gardent une
  // largeur FIXE que leur contenu soit présent ou non, pour que le badge de
  // statut ne se décale jamais selon les OT qui n'ont ni document ni relevé.
  const documentIconSlot = (
    <div className="flex w-16 shrink-0 items-center justify-center">
      {documentIcon}
    </div>
  )
  const releveSlot = (
    <div className="w-24 shrink-0 truncate text-right text-sm text-muted-foreground">
      {releve}
    </div>
  )

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
        // À droite (bureau) : grille à emplacements RÉSERVÉS — icône documents,
        // relevé puis colonne statut/date restent chacun à une place FIXE, qu'ils
        // aient ou non un contenu à afficher (pas de décalage d'une carte à
        // l'autre selon la présence de documents/relevé). En mode compact, même
        // icône puis un badge de statut nu, pas de relevé.
        badges={
          compact ? (
            <div className="flex items-center gap-2">
              {documentIconSlot}
              {badgeCompact}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {documentIconSlot}
              {releveSlot}
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
