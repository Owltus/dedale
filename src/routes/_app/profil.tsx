import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, KeyRound, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { useUpdateUser } from '@/features/utilisateurs/mutations'
import {
  passwordSchema,
  profileSchema,
  roleLabel,
  type ProfileFormValues,
} from '@/features/utilisateurs/schemas'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth'
import { errorMessage, writeErrorMessage } from '@/lib/form'
import { useSiteContext } from '@/lib/site-context'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { TextField } from '@/components/common/fields/text-field'
import { PasswordField } from '@/components/common/fields/password-field'
import { PasswordRules } from '@/components/common/password-rules'
import { EmptyState } from '@/components/common/empty-state'
import { InfoNote } from '@/components/common/info-note'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Form } from '@/components/ui/form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DetailSkeleton } from '@/components/common/detail-skeleton'

export const Route = createFileRoute('/_app/profil')({
  // Pas de requireNav : « Mon profil » est accessible à tout rôle connecté
  // (menu utilisateur, hors sidebar).
  component: ProfilPage,
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailFormSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(EMAIL_RE, 'Adresse e-mail invalide.'),
})
type EmailFormValues = z.infer<typeof emailFormSchema>

function ProfilPage() {
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const email = session?.user.email ?? ''

  const { data: me, isPending } = useQuery({
    ...utilisateursQueries.me(userId),
    enabled: userId !== '',
  })
  const { data: telephone = '', isPending: telPending } = useQuery({
    ...utilisateursQueries.telephone(userId),
    enabled: userId !== '',
  })

  return (
    // `bodyMaxWidth` centre le CORPS sans emporter l'en-tête : enveloppés
    // ensemble dans un seul div, ils ne faisaient qu'UN enfant de
    // PageContainer, qui envoyait alors tout dans la zone défilante — titre
    // compris. L'en-tête reste désormais épinglé, comme sur les 13 autres pages.
    <PageContainer bodyMaxWidth="max-w-2xl">
      <PageHeader
        title="Mon profil"
        description="Gère tes informations personnelles et ta sécurité."
      />
      <>
        {isPending || telPending ? (
          // Fiche (cartes), pas une liste : `DetailSkeleton` annonce la carte
          // d'en-tête puis les blocs, au lieu d'un pavé gris de hauteur fixe.
          <DetailSkeleton headerCard={false} blocs={3} />
        ) : !me ? (
          <EmptyState title="Profil introuvable" />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Identité</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <EmailBlock currentEmail={email} />
                <div className="h-px bg-border" />
                <ProfilForm
                  key={userId}
                  userId={userId}
                  initialNom={me.nom_complet}
                  initialTelephone={telephone}
                  role={me.roles.code}
                />
              </CardContent>
            </Card>

            <SitesCard />

            <SecurityCard email={email} />
          </>
        )}
      </>
    </PageContainer>
  )
}

// --- E-mail (self-service : change l'identifiant de connexion) ---

function EmailBlock({ currentEmail }: { currentEmail: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { email: currentEmail },
  })

  const mutation = useMutation({
    mutationFn: async (newEmail: string) => {
      const { error: err } = await supabase.auth.updateUser({ email: newEmail })
      if (err) throw err
    },
    onSuccess: (_data, newEmail) => setSentTo(newEmail),
    onError: (e) => toast.error(errorMessage(e)),
  })

  function onSubmit(values: EmailFormValues) {
    setSentTo(null)
    mutation.mutate(values.email)
  }

  const emailValue = useWatch({ control: form.control, name: 'email' })
  const unchanged =
    emailValue.trim().toLowerCase() === currentEmail.toLowerCase()

  return (
    <Form {...form}>
      <form
        // L'événement DOIT être transmis : c'est lui qui porte le
        // preventDefault de react-hook-form. Sans lui, le navigateur soumet
        // nativement et recharge la page (l'idiome sans événement n'est
        // valable que pour le prop onSubmit de FormDialog, dont la coquille
        // fait déjà preventDefault + stopPropagation).
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="flex flex-col gap-3"
      >
        <TextField
          control={form.control}
          name="email"
          type="email"
          label="Adresse e-mail"
          className="h-11 text-base"
          hint="Identifiant de connexion. Un e-mail de confirmation sera envoyé à la nouvelle adresse."
        />
        {sentTo && (
          <InfoNote icon={Mail}>
            Un lien de confirmation a été envoyé à <strong>{sentTo}</strong>.
            Clique dessus pour valider le changement — ton adresse actuelle
            reste active tant que ce n’est pas fait.
          </InfoNote>
        )}
        <Button
          type="submit"
          variant="outline"
          disabled={mutation.isPending || unchanged}
          className="self-start"
        >
          {mutation.isPending ? 'Envoi…' : 'Changer l’e-mail'}
        </Button>
      </form>
    </Form>
  )
}

// --- Profil : nom, téléphone (modifiables) ; rôle (lecture) ---

function ProfilForm({
  userId,
  initialNom,
  initialTelephone,
  role,
}: {
  userId: string
  initialNom: string
  initialTelephone: string
  role: string
}) {
  const update = useUpdateUser()
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { nom_complet: initialNom, telephone: initialTelephone },
  })

  async function onSubmit(values: ProfileFormValues) {
    try {
      await update.mutateAsync({
        id: userId,
        nom_complet: values.nom_complet,
        telephone: values.telephone,
      })
      toast.success('Profil mis à jour')
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <Form {...form}>
      <form
        // Idem EmailBlock : l'événement porte le preventDefault (cf. commentaire
        // ci-dessus). Sans lui, « Enregistrer » rechargeait l'application.
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="flex flex-col gap-4"
      >
        <TextField
          control={form.control}
          name="nom_complet"
          label="Nom complet"
          required
        />
        <TextField control={form.control} name="telephone" label="Téléphone" />
        <div className="grid gap-2">
          <Label>Rôle</Label>
          <p className="text-sm">{roleLabel(role)}</p>
        </div>
        <Button
          type="submit"
          disabled={update.isPending}
          className="self-start"
        >
          {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </Form>
  )
}

// --- Sites attribués (lecture seule) ---

function SitesCard() {
  const { sites, isPending } = useSiteContext()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mes sites</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : sites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun site ne t’est attribué pour le moment. Contacte un
            administrateur pour obtenir l’accès à un ou plusieurs sites.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sites.map((site) => (
              <li key={site.id} className="flex items-center gap-2 text-sm">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{site.nom}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// --- Sécurité : changement de son propre mot de passe ---

/**
 * Le mot de passe actuel s'ajoute au couple partagé : `updateUser` ne le demande
 * pas (une session valide lui suffit), mais l'exiger protège d'un détournement
 * de session — un poste laissé déverrouillé ne doit pas permettre de changer le
 * mot de passe et d'en verrouiller le titulaire dehors.
 */
const changerMotDePasseSchema = z
  .object({
    current_password: z.string().min(1, 'Le mot de passe actuel est requis.'),
    password: passwordSchema,
    password_confirm: z.string(),
  })
  .check((ctx) => {
    if (ctx.value.password !== ctx.value.password_confirm) {
      ctx.issues.push({
        code: 'custom',
        message: 'Les deux mots de passe ne correspondent pas.',
        path: ['password_confirm'],
        input: ctx.value.password_confirm,
      })
    }
  })

type ChangerMotDePasseValues = z.infer<typeof changerMotDePasseSchema>

function SecurityCard({ email }: { email: string }) {
  const form = useForm<ChangerMotDePasseValues>({
    resolver: zodResolver(changerMotDePasseSchema),
    defaultValues: { current_password: '', password: '', password_confirm: '' },
  })
  const password = useWatch({ control: form.control, name: 'password' })

  async function onSubmit(data: ChangerMotDePasseValues) {
    // Vérification de l'ancien mot de passe en le REJOUANT : GoTrue ne le
    // demande pas pour un changement, il faut donc le contrôler nous-mêmes.
    // L'appel renouvelle la session en cours sans la rompre — on reste connecté.
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password: data.current_password,
    })
    if (authErr) {
      form.setError('current_password', {
        type: 'value',
        message: 'Mot de passe actuel incorrect.',
      })
      return
    }

    const { error: err } = await supabase.auth.updateUser({
      password: data.password,
    })
    if (err) {
      toast.error(errorMessage(err))
      return
    }
    toast.success('Mot de passe modifié')
    form.reset({ current_password: '', password: '', password_confirm: '' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sécurité</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          {/* Formulaire HORS dialogue : l'événement DOIT être transmis. */}
          <form
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className="flex flex-col gap-4"
          >
            <PasswordField
              control={form.control}
              name="current_password"
              label="Mot de passe actuel"
              autoComplete="current-password"
              required
            />
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
            {/* Dit le comportement RÉEL : changer son mot de passe ne déconnecte
                pas les autres appareils. Le taire donnerait un faux sentiment de
                sécurité à qui le change justement parce qu'il le croit connu. */}
            <p className="text-xs text-muted-foreground">
              Les sessions déjà ouvertes sur d’autres appareils restent actives.
            </p>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="self-start"
            >
              <KeyRound />
              {form.formState.isSubmitting
                ? 'Enregistrement…'
                : 'Changer mon mot de passe'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
