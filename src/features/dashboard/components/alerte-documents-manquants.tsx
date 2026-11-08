import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, FileWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogShell } from '@/components/common/dialog-shell'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import {
  NATURE_GAMME_LABEL,
  gammeNatures,
  type NatureGamme,
} from '@/features/gammes/schemas'
import { formatDateAvecSemaineIso } from '@/lib/date'
import { listStack } from '@/lib/responsive'
import { cn } from '@/lib/utils'
import { useDashboardData } from '../use-dashboard-data'

interface AlerteDocumentsManquantsProps {
  siteId: string
}

/** Rang d'affichage d'une nature (ordre de la liste « Nature » des gammes). */
function rangNature(nature: NatureGamme): number {
  const i = (gammeNatures as readonly NatureGamme[]).indexOf(nature)
  return i === -1 ? gammeNatures.length : i
}

/**
 * Alerte « Documents manquants » (en tête de la colonne Documents) — 132.
 * Visible UNIQUEMENT s'il existe ≥ 1 intervention clôturée dont le document est
 * exigé par sa gamme (interrupteur « Exiger un document », 134) —
 * et qui n'en a aucun (vue `v_ot_documents_manquants`, historique compris).
 * Le clic ouvre la liste rangée par nature ; chaque ligne mène à la fiche de
 * l'OT pour y joindre le document.
 */
export function AlerteDocumentsManquants({
  siteId,
}: AlerteDocumentsManquantsProps) {
  const { documentsManquantsQuery } = useDashboardData(siteId)
  const navigate = useNavigate()
  const [ouvert, setOuvert] = useState(false)

  const groupes = useMemo(() => {
    const parNature = new Map<NatureGamme, typeof manquantsBruts>()
    const manquantsBruts = documentsManquantsQuery.data ?? []
    for (const ot of manquantsBruts) {
      const liste = parNature.get(ot.nature_gamme) ?? []
      liste.push(ot)
      parNature.set(ot.nature_gamme, liste)
    }
    return [...parNature.entries()].sort(
      ([a], [b]) => rangNature(a) - rangNature(b),
    )
  }, [documentsManquantsQuery.data])

  // Une PANNE ne doit pas se lire comme « tout est en règle » : sur des
  // documents exigés, le silence est une affirmation.
  if (documentsManquantsQuery.isError) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start text-muted-foreground"
        onClick={() => void documentsManquantsQuery.refetch()}
      >
        <AlertTriangle /> Documents : vérification impossible. Réessayer
      </Button>
    )
  }

  const n = documentsManquantsQuery.data?.length ?? 0
  if (n === 0) return null

  const libelle = `${String(n)} document${n > 1 ? 's' : ''} manquant${n > 1 ? 's' : ''}`

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        className="w-full justify-start"
        onClick={() => setOuvert(true)}
      >
        <AlertTriangle /> {libelle}
      </Button>

      <DialogShell
        open={ouvert}
        onOpenChange={setOuvert}
        title="Documents manquants"
        description="Ces interventions sont clôturées mais le document attendu (rapport, attestation, photo…) n'y est pas rattaché. Ouvre chaque intervention pour le joindre."
        // Les intitulés sont longs et doivent se lire en entier : c'est ce qui
        // permet de retrouver l'intervention.
        size="lg"
        bodyClassName={cn(
          listStack,
          'min-h-0 flex-1 overflow-y-auto px-6 py-1',
        )}
      >
        {groupes.map(([nature, ots]) => (
          <section key={nature} className={listStack}>
            <h3 className="pt-2 text-xs font-medium text-muted-foreground">
              {NATURE_GAMME_LABEL[nature]} · {ots.length}
            </h3>
            {ots.map((ot) => {
              const parts: string[] = []
              if (ot.nom_equipement) parts.push(ot.nom_equipement)
              if (ot.date_cloture)
                parts.push(
                  `Clôturé le ${formatDateAvecSemaineIso(ot.date_cloture)}`,
                )
              const sous = parts.length > 0 ? parts.join(' · ') : undefined
              return (
                <ListRow
                  key={ot.id}
                  size="sm"
                  tone="destructive"
                  media={<RowMediaIcon icon={FileWarning} />}
                  title={ot.nom_gamme}
                  subtitle={sous}
                  onClick={() => {
                    setOuvert(false)
                    void navigate({
                      to: '/ordres-travail/$otId',
                      params: { otId: ot.id },
                    })
                  }}
                />
              )
            })}
          </section>
        ))}
      </DialogShell>
    </>
  )
}
