import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { dashboardQueries } from '../queries'

interface EtapeAmorcage {
  to: string
  label: string
  description: string
  fait: boolean
}

interface PremiersPasProps {
  /** Site actif : sert à dériver l'avancement (counts d'onboarding). */
  siteId: string
}

/**
 * Checklist d'amorçage affichée quand le site n'a encore aucun OT (base quasi
 * vierge). Guide la mise en route : référentiels puis premier OT. Chaque étape
 * se coche automatiquement (marque verte « Fait ») dès qu'une donnée réelle
 * existe pour le site — dérivé de `dashboardQueries.onboarding` (booléens
 * « existe ≥ 1 »). Fail-soft : tant que les counts chargent, l'étape reste « à
 * faire » (badge numéroté) sans casser le rendu.
 */
export function PremiersPas({ siteId }: PremiersPasProps) {
  const { data: onboarding } = useQuery(dashboardQueries.onboarding(siteId))

  const etapes: EtapeAmorcage[] = [
    {
      to: '/sites',
      label: 'Créer un site',
      description: "L'établissement à suivre.",
      // On est ici parce qu'un site actif existe.
      fait: true,
    },
    {
      to: '/localisations',
      label: 'Décrire les localisations',
      description: 'Bâtiments, niveaux et locaux.',
      fait: onboarding?.aBatiment ?? false,
    },
    {
      to: '/equipements',
      label: 'Inventorier les équipements',
      description: 'Le parc à maintenir.',
      fait: onboarding?.aEquipement ?? false,
    },
    {
      to: '/prestataires',
      label: 'Référencer les prestataires',
      description: 'Et leurs contrats.',
      fait: onboarding?.aPrestataire ?? false,
    },
    {
      to: '/gammes',
      label: 'Définir les gammes',
      description: 'Opérations préventives récurrentes.',
      fait: onboarding?.aGamme ?? false,
    },
    {
      to: '/ordres-travail',
      label: 'Générer un premier OT',
      description: 'Lancer la maintenance.',
      fait: onboarding?.aOt ?? false,
    },
  ]

  // Les étapes restantes sont numérotées dans l'ordre conseillé (1, 2, 3…).
  let numeroRestant = 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Premiers pas</CardTitle>
        <CardDescription>
          Ce site n'a pas encore d'ordre de travail. Suis ces étapes pour mettre
          la maintenance en route.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(16rem,100%),1fr))] gap-3">
          {etapes.map((etape) => {
            const numero = etape.fait ? null : ++numeroRestant
            return (
              <li key={etape.to}>
                <Link
                  to={etape.to}
                  className="hover:border-ring group flex items-start gap-3 rounded-lg border p-3 transition-colors"
                >
                  {etape.fait ? (
                    <span className="border-success bg-success text-success-foreground mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border">
                      <Check className="size-3.5" />
                    </span>
                  ) : (
                    <span className="border-border text-muted-foreground mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
                      {numero}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {etape.label}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {etape.description}
                    </span>
                  </span>
                  {etape.fait ? (
                    <span className="text-success mt-0.5 shrink-0 text-xs font-medium">
                      Fait
                    </span>
                  ) : (
                    <ArrowRight className="text-muted-foreground mt-0.5 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </Link>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
