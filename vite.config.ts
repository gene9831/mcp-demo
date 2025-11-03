import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('my-'),
        },
      },
    }),
    vueJsx(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5174,
  },
})
