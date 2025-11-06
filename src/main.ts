import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import '@opentiny/tiny-robot/dist/style.css'

// Register service worker
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', async () => {
//     try {
//       const registration = await navigator.serviceWorker.register('/sw.js')
//       console.log('Service Worker registered successfully:', registration.scope)
//     } catch (error) {
//       console.error('Service Worker registration failed:', error)
//     }
//   })
// }

createApp(App).mount('#app')
