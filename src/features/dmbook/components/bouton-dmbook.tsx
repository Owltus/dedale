import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight } from 'lucide-react'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { dmbookQueries } from '../queries'
import { ConnexionDmbookDialog } from './connexion-dmbook-dialog'

interface BoutonDmbookProps {
  siteId: string
  siteNom: string
}

/**
 * Bouton « Connexion Dmbook » de l'en-tête de la page Demandes (D18-D19) :
 * admin, manager et technicien du site (garde portée par l'appelant, la base
 * re-vérifie). Ouvre le réglage de la connexion du site affiché.
 */
export function BoutonDmbook({ siteId, siteNom }: BoutonDmbookProps) {
  const [ouvert, setOuvert] = useState(false)
  const connexions = useQuery(dmbookQueries.connexions())
  const connexion = connexions.data?.find((c) => c.site_id === siteId) ?? null
  const relie = connexion?.etat === 'ok'
  return (
    <>
      <TooltipIconButton
        icon={<ArrowLeftRight />}
        label={relie ? `Dmbook : ${siteNom} est connecté` : 'Connexion Dmbook'}
        variant="outline"
        onClick={() => setOuvert(true)}
      />
      <ConnexionDmbookDialog
        key={`${siteId}-${String(ouvert)}`}
        open={ouvert}
        onOpenChange={setOuvert}
        siteId={siteId}
        siteNom={siteNom}
        connexion={connexion}
      />
    </>
  )
}
