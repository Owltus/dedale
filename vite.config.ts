import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Alias @/ -> src/ (doit être cohérent avec tsconfig.app.json).
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
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
    // React Compiler : mémoïsation automatique des composants et des hooks
    // (supposée par le code et la doc, mais jamais installée avant le 24/11/2026).
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
})
