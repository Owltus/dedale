import { useRef, type ComponentProps } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  // Élément qui avait le focus au moment de l'OUVERTURE, pour le lui rendre à
  // la fermeture.
  //
  // Pourquoi c'est à nous de le faire : `DialogContent` en mode modal appelle
  // `preventDefault()` sur `onCloseAutoFocus` — ce qui ANNULE la restauration
  // du `FocusScope` — puis focalise `context.triggerRef`, une référence que
  // seul `<DialogTrigger>` renseigne. Or aucune modale de Dédale ne l'utilise :
  // toutes sont pilotées par un `open` contrôlé depuis un bouton extérieur. Le
  // ref est donc toujours nul, et le focus n'est rendu à personne.
  //
  // Sans cela, fermer une modale au clavier renvoie sur `<body>` : la
  // tabulation suivante repart du haut de la page. Sur une fiche d'ordre de
  // travail à quinze opérations, c'est vingt tabulations à refaire à chaque
  // saisie.
  //
  // La capture se fait sur `onOpenAutoFocus` et NON au premier rendu : la
  // plupart des appelants (`DialogShell`) montent ce composant en permanence et
  // laissent Radix décider de l'affichage. Au premier rendu, le focus est donc
  // encore sur `<body>` — une valeur non nulle, qu'un `??=` figerait pour de
  // bon. `onOpenAutoFocus` est dispatché AVANT que le `FocusScope` ne déplace
  // le focus : l'élément lu est bien le déclencheur.
  const declencheurRef = useRef<HTMLElement | null>(null)

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed top-[50%] left-[50%] z-50 grid max-h-[calc(100%-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg',
          className,
        )}
        {...props}
        // Après `{...props}`, donc ces deux gestionnaires COMPOSENT avec ceux
        // d'un appelant au lieu d'être écrasés par le spread : le sien est
        // appelé, et la restauration du focus a lieu dans tous les cas.
        onOpenAutoFocus={(e) => {
          declencheurRef.current = document.activeElement as HTMLElement | null
          props.onOpenAutoFocus?.(e)
        }}
        onCloseAutoFocus={(e) => {
          props.onCloseAutoFocus?.(e)
          if (e.defaultPrevented) return
          e.preventDefault()
          // `isConnected` : le déclencheur peut avoir disparu pendant que la
          // modale était ouverte — une ligne de liste supprimée, un élément de
          // menu contextuel démonté à la fermeture. On ne focalise alors rien
          // plutôt que de jeter.
          const el = declencheurRef.current
          if (el?.isConnected) el.focus()
        }}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Fermer</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
