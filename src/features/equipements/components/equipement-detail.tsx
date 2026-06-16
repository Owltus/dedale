import { Package } from 'lucide-react'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { parseChamps, formatChampValeur } from '@/lib/champs'
import { formatDate } from '@/lib/date'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Equipement = Database['public']['Views']['v_equipements_complet']['Row']

/**
 * Contenu de la fiche détail d'un équipement (vignette + informations +
 * caractéristiques techniques + cartes à venir). L'EN-TÊTE (fil d'Ariane, bouton
 * « Modifier ») et la navigation sont portés par l'explorateur parent : ce
 * composant ne rend QUE le corps de la fiche.
 */
export function EquipementDetail({ equipement }: { equipement: Equipement }) {
  const specs = parseChamps(equipement.specifications)
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  return (
    <div className="flex flex-col gap-4">
      <MiniatureThumb
        url={urlOf(equipement.miniature_id)}
        fallback={<Package className="size-10" />}
        alt=""
        onError={refreshMiniatures}
        className="size-24 rounded-lg"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <InfoRow label="Catégorie" value={equipement.categorie_nom} />
            <InfoRow
              label="Emplacement"
              value={equipement.localisation_complete ?? equipement.local_nom}
            />
            <InfoRow
              label="Mise en service"
              value={formatDate(equipement.date_mise_en_service)}
            />
            <InfoRow
              label="Fin de garantie"
              value={formatDate(equipement.date_fin_garantie)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Caractéristiques techniques</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {specs.length === 0 ? (
              <p className="text-muted-foreground">
                Aucune caractéristique renseignée.
              </p>
            ) : (
              <dl className="flex flex-col gap-2">
                {specs.map((champ, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <dt className="text-muted-foreground truncate">
                      {champ.cle}
                    </dt>
                    <dd className="font-medium break-words">
                      {formatChampValeur(champ, champ.valeur ?? null)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <PlaceholderCard title="Gammes" />
        <PlaceholderCard title="Ordres de travail" />
        <PlaceholderCard title="Documents" />
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words">{value ?? '—'}</span>
    </div>
  )
}

function PlaceholderCard({ title }: { title: string }) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-muted-foreground text-base">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        À venir.
      </CardContent>
    </Card>
  )
}
