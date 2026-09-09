import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, Copy, TriangleAlert, X } from 'lucide-react'
import { DialogShell } from '@/components/common/dialog-shell'
import { StatusBadge } from '@/components/common/status-badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

/** Une ligne du CSV après analyse, réduite à ce que l'aperçu affiche. */
export interface CsvImportLigne {
  /** Numéro de ligne HUMAIN (l'en-tête compte 1). */
  ligne: number
  ok: boolean
  /** Ce qu'on affiche à droite du badge : résumé si valide, erreurs sinon. */
  texte: string
  /** Ligne valide mais à vérifier (doublon probable…) : badge d'alerte. */
  avertissement?: string
}

interface CsvImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Prompt prêt à coller dans une IA générative (étape 1). */
  prompt: string
  /** Texte CSV collé (étape 2) — l'état vit chez l'appelant, qui l'analyse. */
  csvTexte: string
  onCsvTexteChange: (texte: string) => void
  /** En-têtes attendus absents du CSV collé (bloque l'aperçu). */
  colonnesManquantes: string[]
  lignes: CsvImportLigne[]
  /** Résumé au-dessus de l'aperçu (ex. « 2 bâtiments, 5 locaux à créer »).
   * Par défaut : « N lignes valides · M en erreur ». */
  resume?: ReactNode
  /** Libellé du bouton d'import (ex. « Importer 3 équipements »). */
  importLabel: string
  importing: boolean
  onImport: () => void
}

/**
 * Coquille commune des imports en masse « via IA générative » : étape 1, un
 * prompt copiable qui décrit EXACTEMENT le CSV attendu ; étape 2, le CSV
 * collé avec un aperçu ligne par ligne (valide / à vérifier / en erreur)
 * avant confirmation. L'analyse du CSV et la création restent chez
 * l'appelant (une feature = son parseur + ses mutations) ; ici uniquement le
 * visuel et la mécanique des deux étapes.
 */
export function CsvImportDialog({
  open,
  onOpenChange,
  title,
  description,
  prompt,
  csvTexte,
  onCsvTexteChange,
  colonnesManquantes,
  lignes,
  resume,
  importLabel,
  importing,
  onImport,
}: CsvImportDialogProps) {
  const [etape, setEtape] = useState<'prompt' | 'csv'>('prompt')
  const nbValides = lignes.filter((l) => l.ok).length
  const nbErreurs = lignes.length - nbValides

  async function copierPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success('Prompt copié')
    } catch {
      toast.error('Impossible de copier — sélectionne le texte manuellement.')
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setEtape('prompt')
      }}
      title={title}
      description={description}
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
            <Button onClick={onImport} disabled={nbValides === 0 || importing}>
              {importing ? 'Import en cours…' : importLabel}
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
            onChange={(e) => onCsvTexteChange(e.target.value)}
            placeholder="Colle ici le CSV renvoyé par l'IA…"
            rows={8}
            className="font-mono text-xs"
          />
          {colonnesManquantes.length > 0 && csvTexte.trim() !== '' && (
            <p className="text-sm text-destructive">
              Colonne{colonnesManquantes.length > 1 ? 's' : ''} manquante
              {colonnesManquantes.length > 1 ? 's' : ''} dans l'en-tête :{' '}
              {colonnesManquantes.join(', ')}.
            </p>
          )}
          {lignes.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {resume ?? (
                  <>
                    {nbValides} ligne{nbValides > 1 ? 's' : ''} valide
                    {nbValides > 1 ? 's' : ''}
                    {nbErreurs > 0 && ` · ${String(nbErreurs)} en erreur`}
                  </>
                )}
              </p>
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {lignes.map((l) => (
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
                      {l.ok ? (l.avertissement ?? l.texte) : l.texte}
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
