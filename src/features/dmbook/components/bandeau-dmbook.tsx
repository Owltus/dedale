import { lazy, Suspense, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MailWarning, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { writeErrorMessage } from '@/lib/form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { dmbookQueries } from '../queries'
import { useConnexionDmbook } from '../mutations'
// Chargées seulement à l'ouverture : sans cela, ces deux formulaires (et leur
// moteur de formulaire) entraient dans le code de CHAQUE page de l'application.
const ModaleCodeDmbook = lazy(() =>
  import('./modale-code-dmbook').then((m) => ({ default: m.ModaleCodeDmbook })),
)
const ConnexionDmbookDialog = lazy(() =>
  import('./connexion-dmbook-dialog').then((m) => ({
    default: m.ConnexionDmbookDialog,
  })),
)

const ROLES_DMBOOK = ['admin', 'manager', 'technicien']

/**
 * Bandeau « Dmbook » du SITE ACTIF (D7, D15, D18-D19), visible de l'admin, du
 * manager et du technicien du site, seulement quand il y a quelque chose à faire :
 *  - Dmbook attend le code reçu par e-mail → « Saisir le code » ;
 *  - le site n'est pas connecté (jamais, ou après une erreur) → « Se connecter »,
 *    UNE tentative, après confirmation (Dmbook peut envoyer un e-mail) ;
 *  - les identifiants n'ont pas encore été saisis dans Dédale → « Régler ».
 * Le site est toujours nommé : jamais de doute sur ce qui est relié à quoi.
 */
export function BandeauDmbook() {
  const { data: role } = useCurrentRole()
  const { activeSite } = useSiteContext()
  const concerne = !!role && ROLES_DMBOOK.includes(role)
  const connexions = useQuery({
    ...dmbookQueries.connexions(),
    enabled: concerne,
  })
  const { connecter } = useConnexionDmbook()
  const [ouvert, setOuvert] = useState<'code' | 'connecter' | 'regler' | null>(
    null,
  )

  const c = connexions.data?.find((x) => x.site_id === activeSite?.id) ?? null
  const action: typeof ouvert = !c
    ? null
    : c.etat === 'code_requis'
      ? 'code'
      : !c.identifiants_enregistres &&
          (c.etat === 'erreur' || c.etat === 'jamais_connecte')
        ? 'regler'
        : c.etat === 'erreur' || c.etat === 'jamais_connecte'
          ? 'connecter'
          : null
  // L'état a changé ailleurs (code saisi, autre site choisi) : on ferme ce qui ne sert plus.
  if (ouvert !== null && ouvert !== action) setOuvert(null)

  if (!concerne || !c || action === null) return null

  const lancer = async () => {
    try {
      const r = await connecter.mutateAsync(c.site_id)
      if (r.etat === 'ok') toast.success(`${c.site_nom} est connecté à Dmbook`)
      else if (r.etat === 'code_requis')
        toast.info('Dmbook a envoyé un code par e-mail : saisis-le ici.')
      else toast.error(r.message)
      setOuvert(null)
    } catch (err) {
      toast.error(writeErrorMessage(err))
    }
  }

  const Icone = action === 'code' ? MailWarning : Unplug
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/20 bg-warning/10 px-4 py-2 text-sm"
    >
      <Icone className="size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        {action === 'code' ? (
          <span>
            Dmbook demande le code reçu par e-mail
            {c.boite_code ? ` (${c.boite_code})` : ''} pour reconnecter{' '}
            {c.site_nom}.
          </span>
        ) : (
          <>
            <span>
              {c.site_nom} n’est pas connecté à Dmbook
              {action === 'regler'
                ? ' : les identifiants Dmbook ne sont pas encore saisis dans Dédale.'
                : '.'}
            </span>
            {c.message && (
              <span className="block text-muted-foreground">{c.message}</span>
            )}
          </>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={() => setOuvert(action)}>
        {action === 'code'
          ? 'Saisir le code'
          : action === 'regler'
            ? 'Régler'
            : 'Se connecter'}
      </Button>

      {ouvert === 'code' || ouvert === 'regler' ? (
        <Suspense fallback={null}>
          <ModaleCodeDmbook
            key={`code-${String(ouvert === 'code')}`}
            open={ouvert === 'code'}
            onOpenChange={(o) => setOuvert(o ? 'code' : null)}
            connexion={c}
          />
          <ConnexionDmbookDialog
            key={`regler-${String(ouvert === 'regler')}`}
            open={ouvert === 'regler'}
            onOpenChange={(o) => setOuvert(o ? 'regler' : null)}
            siteId={c.site_id}
            siteNom={c.site_nom}
            connexion={c}
          />
        </Suspense>
      ) : null}
      <ConfirmDialog
        open={ouvert === 'connecter'}
        onOpenChange={(o) => setOuvert(o ? 'connecter' : null)}
        title={`Connecter ${c.site_nom} à Dmbook ?`}
        description="Dédale va se connecter une seule fois avec le compte Dmbook enregistré pour ce site. Si Dmbook envoie un code par e-mail, il faudra le saisir ici."
        confirmLabel={connecter.isPending ? 'Connexion…' : 'Se connecter'}
        loading={connecter.isPending}
        onConfirm={() => void lancer()}
      />
    </div>
  )
}
