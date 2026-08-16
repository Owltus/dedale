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
import { CheckRow } from '@/components/common/checklist-dialog'
import { CheckboxList } from '@/components/common/checkbox-list'
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
                <CheckboxList
                  role="group"
                  aria-labelledby="invite-sites-label"
                  className="flex flex-col gap-1 rounded-md border border-input p-2"
                >
                  {sites.map((site) => (
                    // CheckRow (et non un label recomposé) : elle porte le lien
                    // htmlFor/useId entre la case et son libellé — le point que
                    // la version artisanale perdait.
                    <CheckRow
                      key={site.id}
                      titre={site.nom}
                      checked={field.value.includes(site.id)}
                      className="rounded px-1 py-1 hover:bg-muted"
                      onToggle={() => {
                        field.onChange(
                          field.value.includes(site.id)
                            ? field.value.filter((s) => s !== site.id)
                            : [...field.value, site.id],
                        )
                      }}
                    />
                  ))}
                </CheckboxList>
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
