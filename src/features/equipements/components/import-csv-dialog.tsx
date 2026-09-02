import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Copy, TriangleAlert, X } from 'lucide-react'
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
import { DialogShell } from '@/components/common/dialog-shell'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
 * un CSV généré par une IA générative externe : étape 1, un prompt prêt à
 * coller (décrit exactement les colonnes attendues selon le gabarit courant,
 * copiable en un clic) ; étape 2, coller le CSV obtenu → aperçu ligne par
 * ligne (résolution du local + validation de chaque caractéristique) avant
 * de confirmer. Chaque ligne valide passe par `useCreateEquipementParc`, le
 * MÊME chemin que la création manuelle (front présente, la base valide).
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
  const [etape, setEtape] = useState<'prompt' | 'csv'>('prompt')
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
  const lignesEnErreur = resultat.lignes.filter((l) => !l.ok)

  function reinitialiser() {
    setEtape('prompt')
    setCsvTexte('')
    setImporting(false)
  }

  async function copierPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success('Prompt copié')
    } catch {
      toast.error('Impossible de copier — sélectionne le texte manuellement.')
    }
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
    <DialogShell
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reinitialiser()
      }}
      title="Importer des équipements via CSV"
      description={`Sous-catégorie « ${sousCategorieNom} ».`}
      size="xl"
      footer={
        etape === 'prompt' ? (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={() => setEtape('csv')}>
              J'ai mon CSV, continuer
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setEtape('prompt')}>
              Retour au prompt
            </Button>
            <Button
              onClick={() => void confirmerImport()}
              disabled={lignesValides.length === 0 || importing}
            >
              {importing
                ? 'Import en cours…'
                : `Importer ${String(lignesValides.length)} équipement${lignesValides.length > 1 ? 's' : ''}`}
            </Button>
          </>
        )
      }
    >
      {etape === 'prompt' ? (
        <>
          <p className="text-sm text-muted-foreground">
            Copie ce prompt dans une IA générative (ChatGPT, Claude…), colle à
            la suite tes données brutes (PDF, tableau, notes…), puis récupère le
            CSV qu'elle te renvoie.
          </p>
          <Textarea
            readOnly
            value={prompt}
            rows={16}
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button variant="outline" onClick={() => void copierPrompt()}>
            <Copy /> Copier le prompt
          </Button>
        </>
      ) : (
        <>
          <Textarea
            value={csvTexte}
            onChange={(e) => setCsvTexte(e.target.value)}
            placeholder="Colle ici le CSV renvoyé par l'IA…"
            rows={8}
            className="font-mono text-xs"
          />
          {resultat.colonnesManquantes.length > 0 && csvTexte.trim() !== '' && (
            <p className="text-sm text-destructive">
              Colonne{resultat.colonnesManquantes.length > 1 ? 's' : ''}{' '}
              manquante{resultat.colonnesManquantes.length > 1 ? 's' : ''} dans
              l'en-tête : {resultat.colonnesManquantes.join(', ')}.
            </p>
          )}
          {resultat.lignes.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {lignesValides.length} ligne
                {lignesValides.length > 1 ? 's' : ''} valide
                {lignesValides.length > 1 ? 's' : ''}
                {lignesEnErreur.length > 0 &&
                  ` · ${String(lignesEnErreur.length)} en erreur`}
              </p>
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {resultat.lignes.map((l) => (
                  <div
                    key={l.ligne}
                    className="flex items-start gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                  >
                    {l.ok && l.avertissement ? (
                      <StatusBadge tone="warning" className="shrink-0 gap-1">
                        <TriangleAlert className="size-3" /> L{l.ligne}
                      </StatusBadge>
                    ) : l.ok ? (
                      <Badge variant="outline" className="shrink-0 gap-1">
                        <Check className="size-3" /> L{l.ligne}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="shrink-0 gap-1">
                        <X className="size-3" /> L{l.ligne}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      {l.ok
                        ? (l.avertissement ??
                          locaux.find((loc) => loc.local_id === l.localId)
                            ?.chemin_court ??
                          l.localId)
                        : l.erreurs.join(' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </DialogShell>
  )
}
