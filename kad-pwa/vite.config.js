import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: false // <-- Desativa o SW no modo teste para o SSL falso não bloquear o app
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'KAD Mobile - Active Directory Console',
        short_name: 'KAD Mobile',
        description: 'Console Corporativo de Gestão Active Directory',
        theme_color: '#0B111E',
        background_color: '#0B111E',
        display: 'standalone', // A CHAVE DE OURO: Remove a barra de endereços do navegador
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // Garante que o ícone se adapte ao formato do Android
          }
        ]
      },
      workbox: {
        // TUDO UNIFICADO AQUI DENTRO:
        cleanupOutdatedCaches: true, // <-- DELETA CACHES ANTIGOS AUTOMATICAMENTE
        skipWaiting: true,           // <-- NÃO ESPERA O USUÁRIO FECHAR TODAS AS ABAS
        clientsClaim: true,          // <-- ASSUME O CONTROLE IMEDIATAMENTE
        // A LINHA MÁGICA: Diz pro KAD ignorar o Movimex e as APIs do Python
        navigateFallbackDenylist: [/^\/Movimex/, /^\/api/], 
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 444,
    strictPort: true,
    https: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})