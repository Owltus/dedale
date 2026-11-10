import { useRef, useState, type DragEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileUp, Paperclip } from 'lucide-react'
import { documentsQueries } from '@/features/documents/queries'
import { MIME_PDF } from '@/features/documents/upload'
import { DocumentsTab } from '@/components/common/documents-tab'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Attribut posé sur le cadre : le dépôt pleine page de la fiche l'ignore. */
export const ATTR_ZONE_DEVIS = 'data-zone-devis'

/** Vrai si un fichier est tombé DANS le cadre Devis (il le traite lui-même). */
export function estDansZoneDevis(cible: EventTarget | null): boolean {
  return (
    cible instanceof Element && cible.closest(`[${ATTR_ZONE_DEVIS}]`) !== null
  )
}

const aDesFichiers = (e: DragEvent) => e.dataTransfer.types.includes('Files')

/**
 * Cadre « Devis » de la fiche d'un investissement (demande PO du 10/11/2026) :
 * à côté de la proposition, il reçoit LE devis — les documents de type
 * « Devis » rattachés au dossier ; le cadre « Documents » garde les annexes.
 *
 * Vide : toute la zone est un bouton « clique ou glisse le devis ici ». Un
 * fichier lâché sur le cadre y est rangé en « Devis » ; lâché ailleurs sur la
 * page, il va aux documents (cf. `estDansZoneDevis`). Plusieurs devis
 * possibles (ex. une V2 corrigée).
 */
export function CadreDevis({
  investissementId,
  fournisseur,
  devisTypeId,
  canManage,
  glissement,
}: {
  investissementId: string
  fournisseur: string | null
  /** Id du type de document « Devis » (référentiel), `undefined` en chargement. */
  devisTypeId: number | undefined
  canManage: boolean
  /** Un fichier est en train d'être glissé sur la page. */
  glissement: boolean
}) {
  const [ouvert, setOuvert] = useState(false)
  const [fichiers, setFichiers] = useState<File[]>([])
  const [survol, setSurvol] = useState(false)
  const profondeur = useRef(0)
  const { data: docs = [] } = useQuery(
    documentsQueries.byEntity(
      'documents_investissements',
      'investissement_id',
      investissementId,
    ),
  )
  const nbDevis = docs.filter((d) => d.type_document_id === devisTypeId).length

  const ouvrir = (f: File[] = []) => {
    setFichiers(f)
    setOuvert(true)
  }
  const deposable = canManage
  const surDepot = deposable
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!aDesFichiers(e)) return
          profondeur.current += 1
          setSurvol(true)
        },
        onDragLeave: (e: DragEvent) => {
          if (!aDesFichiers(e)) return
          profondeur.current = Math.max(0, profondeur.current - 1)
          if (profondeur.current === 0) setSurvol(false)
        },
        onDrop: (e: DragEvent) => {
          if (!aDesFichiers(e)) return
          e.preventDefault()
          profondeur.current = 0
          setSurvol(false)
          ouvrir(Array.from(e.dataTransfer.files))
        },
      }
    : {}

  return (
    <Card
      {...{ [ATTR_ZONE_DEVIS]: '' }}
      {...surDepot}
      className={cn(
        'relative gap-3 py-4 transition-colors',
        deposable && glissement && 'border-dashed border-primary/50',
        deposable && survol && 'border-primary bg-primary/5',
      )}
    >
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle className="min-w-0 truncate text-base">
          Devis
          {fournisseur && (
            <span className="font-normal text-muted-foreground">
              {' '}
              · {fournisseur}
            </span>
          )}
        </CardTitle>
        {canManage && nbDevis > 0 && (
          <TooltipIconButton
            icon={<Paperclip />}
            label="Ajouter un devis"
            variant="ghost"
            onClick={() => ouvrir()}
          />
        )}
      </CardHeader>
      <CardContent>
        {nbDevis === 0 &&
          (canManage ? (
            <button
              type="button"
              onClick={() => ouvrir()}
              className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <FileUp aria-hidden className="size-6" />
              {survol
                ? 'Lâche le fichier ici'
                : 'Clique ou glisse le devis ici'}
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun devis.</p>
          ))}
        {/* Toujours monté (sa fenêtre d'ajout en dépend) ; caché tant
            qu'il n'y a aucun devis à lister. */}
        <DocumentsTab
          className={cn(nbDevis === 0 && 'hidden')}
          liaison="documents_investissements"
          parentColumn="investissement_id"
          parentId={investissementId}
          acceptedMimes={MIME_PDF}
          filtre={(d) => d.type_document_id === devisTypeId}
          emptyTitle="Aucun devis"
          uploadOpen={ouvert}
          onUploadOpenChange={(o) => {
            setOuvert(o)
            if (!o) setFichiers([])
          }}
          uploadInitialFiles={fichiers}
          uploadDefaultTypeNom="Devis"
        />
      </CardContent>
    </Card>
  )
}
