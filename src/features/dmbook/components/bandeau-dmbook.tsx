import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MailWarning, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentRole } from '@/hooks/use-current-role'
import { errorMessage } from '@/lib/form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { dmbookQueries } from '../queries'
import { useConnexionDmbook } from '../mutations'
import { ModaleCodeDmbook } from './modale-code-dmbook'

const ROLES_DMBOOK = ['admin', 'manager', 'technicien']

/**
 * Bandeau « Dmbook » en haut de l'application (D7, D15). Visible des admin /
 * manager / technicien du site lié, et seulement quand il y a quelque chose à
 * faire :
 *  - Dmbook attend le code reçu par e-mail → « Saisir le code » ;
 *  - Dédale n'est pas connecté (jamais, ou après une erreur) → « Se connecter »,
 *    UNE tentative, après confirmation (Dmbook peut envoyer un e-mail).
 * Connecté ou en pause : rien.
 */
export function BandeauDmbook() {
  const { data: role } = useCurrentRole()
  const concerne = !!role && ROLES_DMBOOK.includes(role)
  const etat = useQuery({ ...dmbookQueries.etat(), enabled: concerne })
  const { connecter } = useConnexionDmbook()
  const [codeOuvert, setCodeOuvert] = useState(false)
  const [confirmOuvert, setConfirmOuvert] = useState(false)

  const e = etat.data
  const attendCode = e?.etat === 'code_requis'
  const deconnecte = e?.etat === 'erreur' || e?.etat === 'jamais_connecte'
  // Le code est arrivé ou l'état a changé ailleurs : on ferme ce qui ne sert plus.
  if (codeOuvert && !attendCode) setCodeOuvert(false)
  if (confirmOuvert && !deconnecte) setConfirmOuvert(false)

  if (!concerne || !e || (!attendCode && !deconnecte)) return null

  const lancer = async () => {
    try {
      const r = await connecter.mutateAsync()
      if (r.etat === 'ok') toast.success('Dédale est connecté à Dmbook')
      else if (r.etat === 'code_requis')
        toast.info('Dmbook a envoyé un code par e-mail : saisis-le ici.')
      else toast.error(r.message)
      setConfirmOuvert(false)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const Icone = attendCode ? MailWarning : Unplug
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/20 bg-warning/10 px-4 py-2 text-sm"
    >
      <Icone className="size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        {attendCode ? (
          <span>
            Dmbook demande le code reçu par e-mail
            {e.boite_code ? ` (${e.boite_code})` : ''} pour reconnecter Dédale.
          </span>
        ) : (
          <>
            <span>Dédale n’est pas connecté à Dmbook.</span>
            {e.message && (
              <span className="block text-muted-foreground">{e.message}</span>
            )}
          </>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          attendCode ? setCodeOuvert(true) : setConfirmOuvert(true)
        }
      >
        {attendCode ? 'Saisir le code' : 'Se connecter'}
      </Button>

      <ModaleCodeDmbook
        key={`code-${String(codeOuvert)}`}
        open={codeOuvert}
        onOpenChange={setCodeOuvert}
        boite={e.boite_code}
      />
      <ConfirmDialog
        open={confirmOuvert}
        onOpenChange={setConfirmOuvert}
        title="Connecter Dédale à Dmbook ?"
        description="Dédale va se connecter une seule fois avec le compte Dmbook enregistré. Si Dmbook envoie un code par e-mail, il faudra le saisir ici."
        confirmLabel={connecter.isPending ? 'Connexion…' : 'Se connecter'}
        loading={connecter.isPending}
        onConfirm={() => void lancer()}
      />
    </div>
  )
}
