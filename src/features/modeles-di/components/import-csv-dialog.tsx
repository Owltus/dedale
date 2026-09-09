import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { buildImportPrompt, parseImportCsv } from '../csv-import'
import { useCreateModeleDi } from '../mutations'
import type { ModeleDi } from '../queries'
import { useAuth } from '@/auth'
import { writeErrorMessage } from '@/lib/form'
import {
  CsvImportDialog,
  type CsvImportLigne,
} from '@/components/common/csv-import-dialog'

interface ImportCsvDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Périmètre d'écriture : Commun (`null`) ou un site. */
  siteId: string | null
  siteNom: string | null
  /** Modèles du périmètre courant : exclus du prompt et jamais recréés. */
  existants: ModeleDi[]
}

/**
 * Import en masse de modèles de DI via un CSV généré par une IA générative
 * externe (coquille commune `CsvImportDialog`). Une ligne = un modèle
 * (libellé + constat type) ; un libellé déjà présent n'est pas recréé. La
 * création passe par `useCreateModeleDi`, le MÊME chemin que le formulaire
 * manuel (le front présente, la base valide).
 */
export function ImportCsvDialog({
  open,
  onOpenChange,
  siteId,
  siteNom,
  existants,
}: ImportCsvDialogProps) {
  const [csvTexte, setCsvTexte] = useState('')
  const [importing, setImporting] = useState(false)
  const { session } = useAuth()
  const create = useCreateModeleDi()
  const portee = siteId === null ? 'entreprise' : 'site'

  const prompt = useMemo(
    () =>
      buildImportPrompt({
        existants: existants.map((m) => ({ libelle: m.libelle })),
        portee,
        siteNom,
      }),
    [existants, portee, siteNom],
  )

  const resultat = useMemo(
    () =>
      parseImportCsv(
        csvTexte,
        existants.map((m) => ({ libelle: m.libelle })),
      ),
    [csvTexte, existants],
  )
  const lignesValides = resultat.lignes.filter((l) => l.ok)
  const lignesApercu: CsvImportLigne[] = resultat.lignes.map((l) =>
    l.ok
      ? { ligne: l.ligne, ok: true, texte: l.libelle }
      : {
          ligne: l.ligne,
          ok: false,
          texte: l.erreurs.join(' '),
          ignoree: l.ignoree,
        },
  )

  function reinitialiser() {
    setCsvTexte('')
    setImporting(false)
  }

  async function confirmerImport() {
    if (lignesValides.length === 0 || !session) return
    setImporting(true)
    const resultats = await Promise.allSettled(
      lignesValides.map((l) =>
        create.mutateAsync({
          values: {
            libelle: l.libelle,
            constat_modele: l.constat,
            miniature_id: null,
            etat: 'actif',
            portee,
          },
          siteId,
          createdBy: session.user.id,
        }),
      ),
    )
    setImporting(false)
    const echecs = resultats.filter((r) => r.status === 'rejected')
    if (echecs.length === 0) {
      toast.success(
        `${String(lignesValides.length)} modèle${lignesValides.length > 1 ? 's' : ''} créé${lignesValides.length > 1 ? 's' : ''}`,
      )
      onOpenChange(false)
      reinitialiser()
      return
    }
    const premiere = echecs[0]
    const detail =
      premiere?.status === 'rejected' ? writeErrorMessage(premiere.reason) : ''
    toast.error(
      `${String(lignesValides.length - echecs.length)} créé(s), ${String(echecs.length)} échec(s) — ${detail}`,
    )
  }

  return (
    <CsvImportDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reinitialiser()
      }}
      title="Importer des modèles de DI via CSV"
      description={
        siteId === null
          ? 'Périmètre commun à toute l’entreprise.'
          : `Périmètre du site${siteNom ? ` « ${siteNom} »` : ''}.`
      }
      prompt={prompt}
      csvTexte={csvTexte}
      onCsvTexteChange={setCsvTexte}
      colonnesManquantes={resultat.colonnesManquantes}
      lignes={lignesApercu}
      importLabel={`Importer ${String(lignesValides.length)} modèle${lignesValides.length > 1 ? 's' : ''}`}
      importing={importing}
      onImport={() => void confirmerImport()}
    />
  )
}
