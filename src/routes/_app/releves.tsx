import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'

export const Route = createFileRoute('/_app/releves')({
  beforeLoad: ({ context }) => requireNav('/releves', context.queryClient),
})
