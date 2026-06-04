import type { ComponentProps } from 'react'
import { Toaster as Sonner } from 'sonner'
import { useTheme } from '@/components/theme'

function Toaster(props: ComponentProps<typeof Sonner>) {
  const { resolved } = useTheme()
  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      richColors
      position="top-right"
      {...props}
    />
  )
}

export { Toaster }
