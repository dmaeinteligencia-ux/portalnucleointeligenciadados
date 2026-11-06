import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { iniciarAuth } from './lib/auth'
import './estilo.css'

iniciarAuth().then(() => createApp(App).use(router).mount('#app'))
