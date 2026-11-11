import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FileText, X } from 'lucide-react'
import { devisSchema } from '../schemas'
import type { DevisFormValues } from '../schemas'
import type { Devis } from '../queries'
import { useCreerDevis, useModifierDevis } from '../mutations'
import { MIME_PDF, validerFichier } from '@/features/documents/upload'
import { useUploadAndAttach } from '@/features/documents/mutations'
import { useAuth } from '@/auth'
import { useSiteContext } from '@/lib/site-context'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { FormDialog } from '@/components/common/form-dialog'
import { FileDropField } from '@/components/common/file-drop-field'
import { TextField } from '@/components/common/fields/text-field'

/** Le PDF du devis : déjà en base (id), ou un fichier à envoyer. */
export type PieceDevis =
  | { type: 'document'; id: string; nom: string }
  | { type: 'fichier'; fichier: File }

interface DevisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projetId: string
  /** Id du type de document « Devis » (pour un fichier envoyé ici). */
  devisTypeId: number | undefined
  /** Devis modifié ; absent = nouveau devis. */
  devis?: Devis
  /** PDF de départ : celui du devis modifié, ou celui qu'on vient de lâcher. */
  piece?: PieceDevis | null
}

/**
 * Un devis d'un projet (147, demande PO du 11/11/2026) : son PDF, qui le
 * fait, ce qu'il couvre (facultatif — distingue deux devis d'un même
 * fournisseur) et combien HT. Le PDF est facultatif : un devis reçu par
 * téléphone se note quand même.
 *
 * Un fichier choisi ici est envoyé dans les documents du projet (type
 * « Devis ») PUIS rattaché au devis — même chaîne que partout ailleurs.
 */
export function DevisDialog({
  open,
  onOpenChange,
  projetId,
  devisTypeId,
  devis,
  piece: pieceInitiale = null,
}: DevisDialogProps) {
  const { session } = useAuth()
  const { activeSiteId } = useSiteContext()
  const upload = useUploadAndAttach()
  const creer = useCreerDevis()
  const modifier = useModifierDevis()
  const [piece, setPiece] = useState<PieceDevis | null>(pieceInitiale)
  const [erreurFichier, setErreurFichier] = useState<string | null>(null)
  const form = useForm<DevisFormValues>({
    resolver: zodResolver(devisSchema),
    defaultValues: {
      fournisseur: devis?.fournisseur ?? '',
      objet: devis?.objet ?? '',
      montant_ht: devis ? String(devis.montant_ht) : '',
    },
  })

  /** Id du PDF à poser sur le devis (envoi du fichier si besoin). */
  async function idDocument(): Promise<string | null> {
    if (!piece) return null
    if (piece.type === 'document') return piece.id
    if (!session || !activeSiteId || devisTypeId === undefined)
      throw new Error('Session expirée, reconnecte-toi.')
    const doc = await upload.mutateAsync({
      file: piece.fichier,
      siteId: activeSiteId,
      uploadedBy: session.user.id,
      typeDocumentId: devisTypeId,
      liaison: 'documents_investissements',
      parentColumn: 'investissement_id',
      parentId: projetId,
    })
    return doc.id
  }

  const submit = useSubmitDialog<DevisFormValues>({
    onSubmit: async (values) => {
      const documentId = await idDocument()
      if (devis)
        await modifier.mutateAsync({ id: devis.id, values, documentId })
      else await creer.mutateAsync({ projetId, values, documentId })
    },
    successMessage: devis ? 'Devis modifié' : 'Devis ajouté',
    close: () => onOpenChange(false),
  })

  function choisir(fichiers: File[]) {
    const fichier = fichiers[0]
    if (!fichier) return
    const erreur = validerFichier(fichier, MIME_PDF)
    setErreurFichier(erreur)
    if (!erreur) setPiece({ type: 'fichier', fichier })
  }

  const nomPiece =
    piece === null
      ? null
      : piece.type === 'document'
        ? piece.nom
        : piece.fichier.name

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={devis ? 'Modifier le devis' : 'Nouveau devis'}
        description="Qui fait le devis, ce qu'il couvre et combien hors taxes."
        size="lg"
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={devis ? 'Enregistrer' : 'Ajouter'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="fournisseur"
            label="Fournisseur"
            placeholder="Qui a fait le devis ?"
            required
          />
          <TextField
            control={form.control}
            name="montant_ht"
            label="Montant HT (€)"
            inputMode="decimal"
            required
          />
          <div className="sm:col-span-2">
            <TextField
              control={form.control}
              name="objet"
              label="Objet"
              placeholder="Ce que couvre ce devis (ex. 14 ciels de douche)"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>PDF du devis</Label>
            {nomPiece ? (
              <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <FileText
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">{nomPiece}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Retirer le PDF"
                  onClick={() => setPiece(null)}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <FileDropField
                onFiles={choisir}
                accept={MIME_PDF.join(',')}
                hint="PDF · facultatif"
              />
            )}
            {erreurFichier && (
              <p className="text-sm text-destructive">{erreurFichier}</p>
            )}
          </div>
        </div>
      </FormDialog>
    </Form>
  )
}
