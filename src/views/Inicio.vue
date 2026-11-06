<script setup>
import { ref, onMounted } from 'vue'
import { auth } from '../lib/auth'
import { listarAplicacoes, listarAvisos } from '../lib/dados'
import CartaoApp from '../components/CartaoApp.vue'

const apps = ref([])
const avisos = ref([])
const primeiroNome = (auth.usuario.nome || '').split(' ')[0]
const data = d => new Date(d).toLocaleDateString('pt-BR')

onMounted(async () => {
  ;[apps.value, avisos.value] = await Promise.all([listarAplicacoes(), listarAvisos()])
})
</script>

<template>
  <section class="boas-vindas">
    <h1>Olá{{ primeiroNome ? `, ${primeiroNome}` : '' }}</h1>
    <p class="suave">Estas são as aplicações do Núcleo que você pode usar.</p>
  </section>

  <div class="grade-inicio">
    <section>
      <h2>Suas aplicações</h2>
      <div class="lista-apps">
        <CartaoApp v-for="app in apps" :key="app.id" :app="app" />
        <p v-if="!apps.length" class="suave">Nenhuma aplicação liberada para você ainda.</p>
      </div>
    </section>

    <aside>
      <h2>Avisos do Núcleo</h2>
      <div v-for="aviso in avisos" :key="aviso.id" class="cartao aviso">
        <small class="suave">{{ data(aviso.publicado_em) }}</small>
        <h3>{{ aviso.titulo }}</h3>
        <p>{{ aviso.texto }}</p>
      </div>
      <p v-if="!avisos.length" class="suave">Nenhum aviso no momento.</p>
    </aside>
  </div>
</template>
