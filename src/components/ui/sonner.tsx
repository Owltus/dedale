import type { ComponentProps } from 'react'
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import { Toaster as Sonner } from 'sonner'
import { useTheme } from '@/components/theme'

function Toaster(props: ComponentProps<typeof Sonner>) {
  const { resolved } = useTheme()
  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      position="bottom-center"
      // Icône lucide colorée par type, pour souligner la nature du message.
      icons={{
        success: <CircleCheck className="size-5 text-success" />,
        error: <CircleX className="text-destructive size-5" />,
        info: <Info className="text-info size-5" />,
        warning: <TriangleAlert className="text-warning size-5" />,
      }}
      // Surface neutre calée sur les tokens (popover/border) → suit le thème
      // clair/sombre ; seul le TITRE prend la couleur sémantique du type.
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:rounded-lg group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          success: 'group-[.toaster]:[&_[data-title]]:text-success',
          error: 'group-[.toaster]:[&_[data-title]]:text-destructive',
          info: 'group-[.toaster]:[&_[data-title]]:text-info',
          warning: 'group-[.toaster]:[&_[data-title]]:text-warning',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
