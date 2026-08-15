import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { CASCADE, ROLE_LABELS, emptyInvite, inviteSchema } from '../schemas'
import type { InviteFormValues, RoleCode } from '../schemas'
import { useInviteUser } from '../mutations'
import { sitesQueries } from '@/features/sites/queries'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { TextField } from '@/components/common/fields/text-field'
import { SelectField } from '@/components/common/fields/select-field'

interface InviteUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Rôle de l'appelant — détermine les rôles invitables (cascade). */
  callerRole: RoleCode
}

export function InviteUserDialog({
  open,
  onOpenChange,
  callerRole,
}: InviteUserDialogProps) {
  const invite = useInviteUser()
  // Sites que l'appelant peut rattacher (admin = tous, sinon ses sites).
  const { data: sites = [] } = useQuery(sitesQueries.mine())
  const invitableRoles = CASCADE[callerRole]

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { ...emptyInvite, role: invitableRoles[0] ?? 'technicien' },
  })
  const submit = useSubmitDialog<InviteFormValues, string>({
    // Le toast dépend de l'e-mail SAISI : on le renvoie comme résultat pour que
    // `successMessage` (fonction du résultat) l'affiche.
    onSubmit: async (data) => {
      await invite.mutateAsync(data)
      return data.email
    },
    successMessage: (email) => `Invitation envoyée à ${email}`,
    close: () => onOpenChange(false),
  })

  const role = useWatch({ control: form.control, name: 'role' })
  const roleOptions = invitableRoles.map((code) => ({
    value: code,
    label: ROLE_LABELS[code],
  }))

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Inviter un utilisateur"
        description="Un e-mail d’invitation sera envoyé. Le compte est créé avec le rôle et les sites choisis."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel="Inviter"
        pendingLabel="Envoi…"
        pending={form.formState.isSubmitting}
      >
        <TextField
          control={form.control}
          name="email"
          label="Adresse e-mail"
          type="email"
          required
        />
        <TextField
          control={form.control}
          name="nom_complet"
          label="Nom complet"
          required
        />

        <SelectField
          control={form.control}
          name="role"
          label="Rôle"
          required
          options={roleOptions}
        />

        <div className="grid gap-2">
          <Label id="invite-sites-label">Sites</Label>
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun site disponible.
            </p>
          ) : (
            <Controller
              control={form.control}
              name="site_ids"
              render={({ field }) => (
                <div
                  role="group"
                  aria-labelledby="invite-sites-label"
                  className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-md border border-input p-2"
                >
                  {sites.map((site) => (
                    <label
                      key={site.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={field.value.includes(site.id)}
                        onCheckedChange={(next) =>
                          field.onChange(
                            next === true
                              ? [...field.value, site.id]
                              : field.value.filter((s) => s !== site.id),
                          )
                        }
                      />
                      <span className="truncate">{site.nom}</span>
                    </label>
                  ))}
                </div>
              )}
            />
          )}
          <p className="text-xs text-muted-foreground">
            {role === 'admin'
              ? 'Un administrateur a accès à tous les sites, le rattachement est facultatif.'
              : 'Les sites définissent le périmètre visible par l’utilisateur.'}
          </p>
        </div>
      </FormDialog>
    </Form>
  )
}
