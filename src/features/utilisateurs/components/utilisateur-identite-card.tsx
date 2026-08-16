import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { utilisateursQueries } from '../queries'
import {
  useSetUserPassword,
  useUpdateUser,
  useUpdateUserEmail,
} from '../mutations'
import { passwordAvecConfirmation, profileSchema, roleLabel } from '../schemas'
import type {
  PasswordAvecConfirmationValues,
  ProfileFormValues,
} from '../schemas'
import type { UserRow } from './utilisateur-types'
import { errorMessage, writeErrorMessage } from '@/lib/form'
import { TextField } from '@/components/common/fields/text-field'
import { PasswordField } from '@/components/common/fields/password-field'
import { PasswordRules } from '@/components/common/password-rules'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectDropdown } from '@/components/ui/select-dropdown'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// --- Identité : nom, téléphone, rôle, e-mail ---

export function IdentityCard({
  user,
  isAdmin,
  canEdit,
}: {
  user: UserRow
  isAdmin: boolean
  canEdit: boolean
}) {
  const { data: telephone, isPending } = useQuery(
    utilisateursQueries.telephone(user.id),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identité</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isAdmin && (
          <>
            <EmailBlock userId={user.id} />
            <div className="h-px bg-border" />
          </>
        )}

        {/* Le mot de passe se redéfinit dès qu'on peut éditer le compte, et non
            seulement en tant qu'admin : un manager dépanne les siens sur ses
            sites (décision PO). L'autorité reste l'Edge Function — cette
            condition ne fait que refléter sa règle. */}
        {canEdit && (
          <>
            <PasswordBlock userId={user.id} />
            <div className="h-px bg-border" />
          </>
        )}

        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ProfileForm
            key={user.id}
            user={user}
            initialTelephone={telephone ?? ''}
            isAdmin={isAdmin}
            canEdit={canEdit}
          />
        )}
      </CardContent>
    </Card>
  )
}

function ProfileForm({
  user,
  initialTelephone,
  isAdmin,
  canEdit,
}: {
  user: UserRow
  initialTelephone: string
  isAdmin: boolean
  canEdit: boolean
}) {
  const update = useUpdateUser()
  const { data: roles = [] } = useQuery(utilisateursQueries.roles())
  const [roleId, setRoleId] = useState(user.role_id)
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nom_complet: user.nom_complet,
      telephone: initialTelephone,
    },
  })

  async function onSubmit(data: ProfileFormValues) {
    try {
      await update.mutateAsync({
        id: user.id,
        nom_complet: data.nom_complet,
        telephone: data.telephone,
        role_id: isAdmin ? roleId : undefined,
      })
      toast.success('Profil mis à jour')
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="flex flex-col gap-4"
      >
        <TextField
          control={form.control}
          name="nom_complet"
          label="Nom complet"
          required
          disabled={!canEdit}
        />
        <TextField
          control={form.control}
          name="telephone"
          label="Téléphone"
          disabled={!canEdit}
        />
        <div className="grid gap-2">
          <Label htmlFor="role">Rôle</Label>
          {isAdmin ? (
            // Radix, comme le champ « Rôle » de la modale d'invitation dans
            // cette même feature — qui, lui, était déjà thémé.
            <SelectDropdown
              id="role"
              value={String(roleId)}
              onValueChange={(v) => {
                setRoleId(Number(v))
              }}
              options={roles.map((r) => ({
                value: String(r.id),
                label: roleLabel(r.code),
              }))}
              ariaLabel="Rôle"
            />
          ) : (
            <p className="text-sm">{roleLabel(user.roles?.code)}</p>
          )}
        </div>
        {canEdit && (
          <Button
            type="submit"
            disabled={update.isPending}
            className="self-start"
          >
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        )}
      </form>
    </Form>
  )
}

// --- Bloc e-mail (admin uniquement, dans la carte Identité) ---

function EmailBlock({ userId }: { userId: string }) {
  const {
    data: email = '',
    isPending,
    isError,
  } = useQuery(utilisateursQueries.email(userId))

  if (isPending) return <Skeleton className="h-20 w-full" />
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Lecture de l’e-mail indisponible (l’Edge Function{' '}
        <code>update_user_email</code> n’est peut-être pas déployée).
      </p>
    )
  }
  return <EmailForm key={userId} userId={userId} current={email} />
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Schéma e-mail local (pas de source dans schemas.ts) : validation identique à
// l'ancien contrôle EMAIL_RE sur la valeur détourée, valeur laissée telle quelle.
const emailSchema = z.object({
  email: z
    .string()
    .refine((v) => EMAIL_RE.test(v.trim()), 'Adresse e-mail invalide.'),
})
type EmailFormValues = z.infer<typeof emailSchema>

function EmailForm({ userId, current }: { userId: string; current: string }) {
  const updateEmail = useUpdateUserEmail()
  const form = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: current },
  })
  const email = useWatch({ control: form.control, name: 'email' })

  async function onSubmit(data: EmailFormValues) {
    try {
      await updateEmail.mutateAsync({ userId, email: data.email })
      toast.success('E-mail mis à jour')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="flex flex-col gap-3"
      >
        <div className="grid gap-1">
          <Label htmlFor="email" className="text-base font-semibold">
            Adresse e-mail
          </Label>
          <p className="text-xs text-muted-foreground">
            Identifiant de connexion de l’utilisateur.
          </p>
        </div>
        <div className="grid gap-2">
          <Input
            id="email"
            type="email"
            {...form.register('email')}
            className="h-11 text-base"
          />
          {form.formState.errors.email && (
            <p className="text-sm text-destructive">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={updateEmail.isPending || email.trim() === current}
          className="self-start"
        >
          {updateEmail.isPending ? 'Mise à jour…' : 'Changer l’e-mail'}
        </Button>
      </form>
    </div>
  )
}

/**
 * Redéfinition du mot de passe d'un compte, par un administrateur ou par un
 * manager sur ses subordonnés.
 *
 * Il n'y a plus d'envoi de lien : on pose directement le nouveau mot de passe et
 * on le transmet à la personne (ADR 0007). La phrase « ne peut jamais être lu »
 * reste vraie et le reste — ce qui change, c'est qu'on peut en poser un nouveau,
 * pas le consulter.
 */
function PasswordBlock({ userId }: { userId: string }) {
  const setPassword = useSetUserPassword()

  const form = useForm<PasswordAvecConfirmationValues>({
    resolver: zodResolver(passwordAvecConfirmation),
    defaultValues: { password: '', password_confirm: '' },
  })
  const password = useWatch({ control: form.control, name: 'password' })

  async function onSubmit(data: PasswordAvecConfirmationValues) {
    try {
      await setPassword.mutateAsync({ userId, password: data.password })
      toast.success('Mot de passe redéfini')
      // Vider les deux champs : le mot de passe n'a plus à rester à l'écran une
      // fois posé.
      form.reset({ password: '', password_confirm: '' })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Form {...form}>
      {/* Formulaire HORS dialogue : l'événement DOIT être transmis à
          handleSubmit, contrairement aux modales où FormDialog s'en charge. */}
      <form
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="flex flex-col gap-3"
      >
        <div className="grid gap-1">
          <Label className="text-base font-semibold">Mot de passe</Label>
          <p className="text-xs text-muted-foreground">
            Le mot de passe ne peut jamais être lu. Vous pouvez en définir un
            nouveau et le transmettre à la personne — aucun e-mail n’est envoyé.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField
            control={form.control}
            name="password"
            label="Nouveau mot de passe"
            autoComplete="new-password"
            required
          />
          <PasswordField
            control={form.control}
            name="password_confirm"
            label="Confirmer"
            autoComplete="new-password"
            required
          />
        </div>
        <PasswordRules value={password} />
        <Button
          type="submit"
          variant="outline"
          disabled={setPassword.isPending}
          className="self-start"
        >
          <KeyRound />
          {setPassword.isPending
            ? 'Enregistrement…'
            : 'Définir le mot de passe'}
        </Button>
      </form>
    </Form>
  )
}
