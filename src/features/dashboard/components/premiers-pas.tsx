import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Circle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface EtapeAmorcage {
  to: string
  label: string
  description: string
  fait: boolean
}

interface PremiersPasProps {
  /** Présence d'au moins un site (toujours vrai si on est ici, mais explicite). */
  aSite: boolean
}

/**
 * Checklist d'amorçage affichée quand le site n'a encore aucun OT (base quasi
 * vierge). Guide la mise en route : référentiels puis premier OT. Les états
 * « fait » sont volontairement simples (V1) : seul « Sites » est dérivé d'une
 * donnée réelle, les autres sont des jalons à parcourir.
 */
export function PremiersPas({ aSite }: PremiersPasProps) {
  const etapes: EtapeAmorcage[] = [
    {
      to: '/sites',
      label: 'Créer un site',
      description: "L'établissement à suivre.",
      fait: aSite,
    },
    {
      to: '/localisations',
      label: 'Décrire les localisations',
      description: 'Bâtiments, niveaux et locaux.',
      fait: false,
    },
    {
      to: '/equipements',
      label: 'Inventorier les équipements',
      description: 'Le parc à maintenir.',
      fait: false,
    },
    {
      to: '/prestataires',
      label: 'Référencer les prestataires',
      description: 'Et leurs contrats.',
      fait: false,
    },
    {
      to: '/gammes',
      label: 'Définir les gammes',
      description: 'Opérations préventives récurrentes.',
      fait: false,
    },
    {
      to: '/ordres-travail',
      label: 'Générer un premier OT',
      description: 'Lancer la maintenance.',
      fait: false,
    },
  ]

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
          {etapes.map((etape) => (
            <li key={etape.to}>
              <Link
                to={etape.to}
                className="hover:border-ring group flex items-start gap-3 rounded-lg border p-3 transition-colors"
              >
                <span
                  className={
                    etape.fait
                      ? 'text-primary mt-0.5 shrink-0'
                      : 'text-muted-foreground mt-0.5 shrink-0'
                  }
                >
                  {etape.fait ? (
                    <Check className="size-5" />
                  ) : (
                    <Circle className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {etape.label}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {etape.description}
                  </span>
                </span>
                <ArrowRight className="text-muted-foreground mt-0.5 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
