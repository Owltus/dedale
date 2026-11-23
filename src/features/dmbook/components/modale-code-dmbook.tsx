import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/form'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { useConnexionDmbook } from '../mutations'
import type { ConnexionDmbook } from '../queries'

const schema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\s+/g, ''))
    .pipe(
      z
        .string()
        .regex(
          /^[A-Za-z0-9]{4,12}$/,
          'Le code fait de 4 à 12 chiffres ou lettres.',
        ),
    ),
})
type Saisie = z.input<typeof schema>
type Code = z.output<typeof schema>

interface ModaleCodeDmbookProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connexion: ConnexionDmbook
}

/**
 * Saisie du code envoyé par Dmbook (D7) pour UN site. Le code part UNE fois :
 * s'il est refusé, le serveur passe en « erreur » et il faudra relancer la
 * connexion. Volontairement AUCUN bouton « renvoyer le code » (pas de spam).
 */
export function ModaleCodeDmbook({
  open,
  onOpenChange,
  connexion,
}: ModaleCodeDmbookProps) {
  const { envoyerCode } = useConnexionDmbook()
  const form = useForm<Saisie, unknown, Code>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  })

  const soumettre = async ({ code }: Code) => {
    try {
      const r = await envoyerCode.mutateAsync({
        siteId: connexion.site_id,
        code,
      })
      if (r.etat === 'ok')
        toast.success(`${connexion.site_nom} est reconnecté à Dmbook`)
      else toast.error(r.message)
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const boite = connexion.boite_code
  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={`Code Dmbook — ${connexion.site_nom}`}
        description={`Dmbook a envoyé un code par e-mail${boite ? ` à ${boite}` : ''} pour reconnecter Dédale. Saisis-le une seule fois.`}
        onSubmit={() => void form.handleSubmit(soumettre)()}
        submitLabel="Valider"
        pendingLabel="Vérification…"
        pending={form.formState.isSubmitting}
      >
        <TextField
          control={form.control}
          name="code"
          label="Code reçu par e-mail"
          required
          autoComplete="one-time-code"
          inputMode="text"
          autoFocus
        />
      </FormDialog>
    </Form>
  )
}
