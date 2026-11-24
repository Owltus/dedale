import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { writeErrorMessage } from '@/lib/erreurs'
import { formatDateAvecSemaineIso } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { FormDialog } from '@/components/common/form-dialog'
import { InfoNote } from '@/components/common/info-note'
import { TextField } from '@/components/common/fields/text-field'
import { PasswordField } from '@/components/common/fields/password-field'
import { useConnexionDmbook } from '../mutations'
import type { ConnexionDmbook } from '../queries'

const ADRESSE_CARNET =
  /^https:\/\/[a-z0-9-]+\.dmbook\.pro\/tickets\/\d{1,12}\/?(?:[?#].*)?$/

const schema = (motDePasseConnu: boolean) =>
  z
    .object({
      adresse: z
        .string()
        .trim()
        .regex(
          ADRESSE_CARNET,
          'Colle l’adresse de la page des tickets Dmbook (https://….dmbook.pro/tickets/…).',
        ),
      identifiant: z
        .string()
        .trim()
        .min(1, 'L’identifiant Dmbook est obligatoire.')
        .max(200),
      motDePasse: z.string().max(200),
    })
    .refine((v) => motDePasseConnu || v.motDePasse !== '', {
      path: ['motDePasse'],
      message: 'Le mot de passe Dmbook est obligatoire.',
    })
type Valeurs = z.infer<ReturnType<typeof schema>>

const LIBELLE_ETAT: Record<string, string> = {
  jamais_connecte: 'Pas encore connecté',
  ok: 'Connecté',
  code_requis: 'Attend le code reçu par e-mail',
  pause: 'Synchro en pause',
  erreur: 'Connexion perdue',
}

interface ConnexionDmbookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  siteNom: string
  /** Connexion déjà réglée pour ce site, ou null. */
  connexion: ConnexionDmbook | null
}

/**
 * « Connexion Dmbook — <site> » (D18-D20) : quel carnet Dmbook est relié à ce
 * site, avec quel compte, et son état. L'identifiant et le mot de passe partent
 * dans le coffre chiffré du serveur ; ils ne sont JAMAIS réaffichés (mot de passe
 * vide = on garde celui enregistré). Enregistrer ne contacte pas Dmbook : la
 * connexion se lance ensuite, une seule fois, avec « Se connecter ».
 */
export function ConnexionDmbookDialog({
  open,
  onOpenChange,
  siteId,
  siteNom,
  connexion,
}: ConnexionDmbookDialogProps) {
  const { enregistrer, connecter } = useConnexionDmbook()
  const motDePasseConnu = connexion?.identifiants_enregistres ?? false
  const form = useForm<Valeurs>({
    resolver: zodResolver(schema(motDePasseConnu)),
    defaultValues: {
      adresse: connexion?.adresse ?? '',
      identifiant: '',
      motDePasse: '',
    },
  })

  const soumettre = async (v: Valeurs) => {
    try {
      const r = await enregistrer.mutateAsync({ siteId, ...v })
      toast.success(r.message)
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  const lancer = async () => {
    try {
      const r = await connecter.mutateAsync(siteId)
      if (r.etat === 'ok') toast.success(`${siteNom} est connecté à Dmbook`)
      else if (r.etat === 'code_requis')
        toast.info(
          'Dmbook a envoyé un code par e-mail : saisis-le dans le bandeau.',
        )
      else toast.error(r.message)
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  const peutConnecter =
    !!connexion &&
    connexion.identifiants_enregistres &&
    (connexion.etat === 'jamais_connecte' || connexion.etat === 'erreur')

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={`Connexion Dmbook — ${siteNom}`}
        description="Le carnet Dmbook dont les tickets se synchronisent avec les demandes de ce site, et le compte Dmbook qui sert à s’y connecter."
        onSubmit={() => void form.handleSubmit(soumettre)()}
        submitLabel="Enregistrer"
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
        size="lg"
      >
        {connexion && (
          <InfoNote>
            <span className="block font-medium">
              {LIBELLE_ETAT[connexion.etat] ?? connexion.etat}
              {connexion.boite_code ? ` · compte ${connexion.boite_code}` : ''}
            </span>
            {connexion.message && (
              <span className="block text-muted-foreground">
                {connexion.message}
              </span>
            )}
            {connexion.regle_le && (
              <span className="block text-muted-foreground">
                {/* Nom vide : le compte qui l'a réglée a été supprimé. */}
                Réglée
                {connexion.regle_par_nom
                  ? ` par ${connexion.regle_par_nom}`
                  : ''}{' '}
                le {formatDateAvecSemaineIso(connexion.regle_le)}
              </span>
            )}
            {peutConnecter && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={connecter.isPending}
                onClick={() => void lancer()}
              >
                {connecter.isPending ? 'Connexion…' : 'Se connecter'}
              </Button>
            )}
          </InfoNote>
        )}
        <TextField
          control={form.control}
          name="adresse"
          label="Adresse du carnet Dmbook"
          required
          placeholder="https://….dmbook.pro/tickets/…"
          hint="Ouvre le carnet dans Dmbook (par exemple « TECHNIQUE ») et copie l’adresse de la page."
          autoComplete="off"
        />
        <TextField
          control={form.control}
          name="identifiant"
          label="Identifiant Dmbook"
          required
          autoComplete="off"
          hint={
            connexion?.boite_code
              ? `Compte enregistré : ${connexion.boite_code}. Ressaisis-le pour confirmer, ou saisis-en un autre.`
              : 'En général celui du technicien du site.'
          }
        />
        <PasswordField
          control={form.control}
          name="motDePasse"
          label="Mot de passe Dmbook"
          required={!motDePasseConnu}
          autoComplete="new-password"
          hint={
            motDePasseConnu
              ? 'Laisse vide pour garder le mot de passe enregistré. Il n’est jamais réaffiché.'
              : 'Rangé chiffré sur le serveur. Il n’est jamais réaffiché.'
          }
        />
      </FormDialog>
    </Form>
  )
}
