import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { equipementsQueries } from '../queries'
import { useCreateEquipementParc } from '../mutations'
import { titreAffiche } from '../format'
import {
  buildImportPrompt,
  parseImportCsv,
  type CsvImportRow,
  type EquipementExistantPourImport,
} from '../csv-import'
import { parseChamps, type Champ } from '@/lib/champs'
import { writeErrorMessage } from '@/lib/form'
import {
  CsvImportDialog,
  type CsvImportLigne,
} from '@/components/common/csv-import-dialog'
import type { Database } from '@/lib/database.types'

type Equipement = Database['public']['Views']['v_equipements_complet']['Row']

interface ImportCsvDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  /** Sous-catégorie CIBLE : ses équipements héritent de ce gabarit + catégorie. */
  categorieId: string
  sousCategorieNom: string
  template: {
    champs: Champ[]
    miniatureId: string | null
    modeleId: string | null
  }
  /** Clé (Champ.cle) du champ PRINCIPAL de la sous-catégorie, pour la détection de doublon. */
  champPrincipalCle: string | null
  /** Équipements DÉJÀ enregistrés dans cette sous-catégorie — exclus du prompt (l'IA ne
   * doit pas les recréer) et comparés à chaque ligne du CSV (doublon probable). */
  equipementsExistants: Equipement[]
}

/**
 * Import en masse d'équipements dans une sous-catégorie DÉJÀ existante, via
 * un CSV généré par une IA générative externe (coquille commune
 * `CsvImportDialog` : prompt copiable, puis CSV collé avec aperçu). Ici : le
 * prompt décrit les colonnes attendues selon le gabarit courant, et chaque
 * ligne est résolue (local + validation de chaque caractéristique) avant de
 * passer par `useCreateEquipementParc`, le MÊME chemin que la création
 * manuelle (front présente, la base valide).
 */
export function ImportCsvDialog({
  open,
  onOpenChange,
  siteId,
  categorieId,
  sousCategorieNom,
  template,
  champPrincipalCle,
  equipementsExistants,
}: ImportCsvDialogProps) {
  const [csvTexte, setCsvTexte] = useState('')
  const [importing, setImporting] = useState(false)
  const create = useCreateEquipementParc()
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))

  // Titres pour le prompt (l'IA les exclut du CSV) + forme réduite pour la
  // détection de doublon (même local, même valeur de champ principal).
  const existantsTitres = useMemo(
    () => equipementsExistants.map((e) => titreAffiche(e)),
    [equipementsExistants],
  )
  const existantsPourDoublon = useMemo<EquipementExistantPourImport[]>(
    () =>
      equipementsExistants.map((e) => ({
        localId: e.local_id,
        principal: champPrincipalCle
          ? parseChamps(e.specifications).find(
              (c) => c.cle === champPrincipalCle,
            )?.valeur
          : undefined,
        titre: titreAffiche(e),
      })),
    [equipementsExistants, champPrincipalCle],
  )

  const prompt = useMemo(
    () =>
      buildImportPrompt({
        sousCategorieNom,
        champs: template.champs,
        locaux,
        equipementsExistants: existantsTitres,
      }),
    [sousCategorieNom, template.champs, locaux, existantsTitres],
  )

  const resultat = useMemo(
    () =>
      parseImportCsv(
        csvTexte,
        template.champs,
        locaux,
        champPrincipalCle,
        existantsPourDoublon,
      ),
    [
      csvTexte,
      template.champs,
      locaux,
      champPrincipalCle,
      existantsPourDoublon,
    ],
  )
  const lignesValides = resultat.lignes.filter(
    (l): l is Extract<CsvImportRow, { ok: true }> => l.ok,
  )
  const lignesApercu: CsvImportLigne[] = resultat.lignes.map((l) =>
    l.ok
      ? {
          ligne: l.ligne,
          ok: true,
          texte:
            locaux.find((loc) => loc.local_id === l.localId)?.chemin_court ??
            l.localId,
          avertissement: l.avertissement,
        }
      : { ligne: l.ligne, ok: false, texte: l.erreurs.join(' ') },
  )

  function reinitialiser() {
    setCsvTexte('')
    setImporting(false)
  }

  async function confirmerImport() {
    if (lignesValides.length === 0) return
    setImporting(true)
    const resultats = await Promise.allSettled(
      lignesValides.map((l) =>
        create.mutateAsync({
          localId: l.localId,
          categorieId,
          miniatureId: template.miniatureId,
          champs: l.champs,
          modeleId: template.modeleId,
          dateMiseEnService: l.dateMiseEnService,
          dateFinGarantie: l.dateFinGarantie,
        }),
      ),
    )
    setImporting(false)
    const echecs = resultats.filter((r) => r.status === 'rejected')
    if (echecs.length === 0) {
      toast.success(
        `${String(lignesValides.length)} équipement${lignesValides.length > 1 ? 's' : ''} créé${lignesValides.length > 1 ? 's' : ''}`,
      )
      onOpenChange(false)
      reinitialiser()
    } else {
      const premiereErreur = echecs[0]
      const detail =
        premiereErreur?.status === 'rejected'
          ? writeErrorMessage(premiereErreur.reason)
          : ''
      toast.error(
        `${String(lignesValides.length - echecs.length)} créé(s), ${String(echecs.length)} échec(s) — ${detail}`,
      )
    }
  }

  return (
    <CsvImportDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reinitialiser()
      }}
      title="Importer des équipements via CSV"
      description={`Sous-catégorie « ${sousCategorieNom} ».`}
      prompt={prompt}
      csvTexte={csvTexte}
      onCsvTexteChange={setCsvTexte}
      colonnesManquantes={resultat.colonnesManquantes}
      lignes={lignesApercu}
      importLabel={`Importer ${String(lignesValides.length)} équipement${lignesValides.length > 1 ? 's' : ''}`}
      importing={importing}
      onImport={() => void confirmerImport()}
    />
  )
}
