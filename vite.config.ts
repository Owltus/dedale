import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Port dédié à Dédale (le 5173 par défaut est utilisé par un autre projet).
  // strictPort : on échoue plutôt que de basculer silencieusement sur un autre port.
  server: {
    port: 5181,
    strictPort: true,
  },
  plugins: [
    // Le plugin TanStack Router doit passer AVANT react().
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
})
