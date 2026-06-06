import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CASCADE, ROLE_LABELS, emptyInvite, inviteSchema } from '../schemas'
import type { InviteFormValues, RoleCode } from '../schemas'
import { useInviteUser } from '../mutations'
import { sitesQueries } from '@/features/sites/queries'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { Label } from '@/components/ui/label'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
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

  const [values, setValues] = useState<InviteFormValues>(() => ({
    ...emptyInvite,
    role: invitableRoles[0] ?? 'technicien',
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})

  function set<K extends keyof InviteFormValues>(
    key: K,
    value: InviteFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function toggleSite(id: string) {
    setValues((v) => ({
      ...v,
      site_ids: v.site_ids.includes(id)
        ? v.site_ids.filter((s) => s !== id)
        : [...v.site_ids, id],
    }))
  }

  async function handleSubmit() {
    const parsed = inviteSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      await invite.mutateAsync(parsed.data)
      toast.success(`Invitation envoyée à ${parsed.data.email}`)
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Inviter un utilisateur"
      description="Un e-mail d’invitation sera envoyé. Le compte est créé avec le rôle et les sites choisis."
      onSubmit={() => void handleSubmit()}
      submitLabel="Inviter"
      pendingLabel="Envoi…"
      pending={invite.isPending}
    >
      <TextField
        label="Adresse e-mail"
        type="email"
        value={values.email}
        onChange={(v) => set('email', v)}
        error={errors.email}
        required
      />
      <TextField
        label="Nom complet"
        value={values.nom_complet}
        onChange={(v) => set('nom_complet', v)}
        error={errors.nom_complet}
        required
      />

      <SelectField
        label="Rôle"
        required
        value={values.role}
        onChange={(v) => set('role', v as RoleCode)}
        error={errors.role}
      >
        {invitableRoles.map((code) => (
          <option key={code} value={code}>
            {ROLE_LABELS[code]}
          </option>
        ))}
      </SelectField>

      <div className="grid gap-2">
        <Label>Sites</Label>
        {sites.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun site disponible.
          </p>
        ) : (
          <div className="border-input flex max-h-44 flex-col gap-1 overflow-y-auto rounded-md border p-2">
            {sites.map((site) => (
              <label
                key={site.id}
                className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={values.site_ids.includes(site.id)}
                  onChange={() => toggleSite(site.id)}
                />
                <span className="truncate">{site.nom}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          {values.role === 'admin'
            ? 'Un administrateur a accès à tous les sites, le rattachement est facultatif.'
            : 'Les sites définissent le périmètre visible par l’utilisateur.'}
        </p>
      </div>
    </FormDialog>
  )
}
