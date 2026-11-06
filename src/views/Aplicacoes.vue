<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { listarAplicacoes, rotuloStatus } from '../lib/dados'
import CartaoApp from '../components/CartaoApp.vue'

const route = useRoute()
const apps = ref([])
const busca = ref(route.query.q || '')
const area = ref('')
const status = ref('')

watch(() => route.query.q, q => { busca.value = q || '' })
onMounted(async () => { apps.value = await listarAplicacoes() })

const areas = computed(() => [...new Set(apps.value.map(a => a.area).filter(Boolean))].sort())
const filtradas = computed(() => {
  const termo = busca.value.trim().toLowerCase()
  return apps.value.filter(a =>
    (!termo || `${a.nome} ${a.descricao} ${a.area}`.toLowerCase().includes(termo)) &&
    (!area.value || a.area === area.value) &&
    (!status.value || a.status === status.value))
})
</script>

<template>
  <h1>Aplicações</h1>
  <div class="filtros">
    <input v-model="busca" type="search" placeholder="Buscar por nome ou descrição" aria-label="Buscar" />
    <select v-model="area" aria-label="Área">
      <option value="">Todas as áreas</option>
      <option v-for="a in areas" :key="a">{{ a }}</option>
    </select>
    <select v-model="status" aria-label="Status">
      <option value="">Todos os status</option>
      <option v-for="(rotulo, valor) in rotuloStatus" :key="valor" :value="valor">{{ rotulo }}</option>
    </select>
  </div>
  <p class="suave">{{ filtradas.length }} {{ filtradas.length === 1 ? 'aplicação' : 'aplicações' }}</p>
  <div class="lista-apps colunas">
    <CartaoApp v-for="app in filtradas" :key="app.id" :app="app" />
  </div>
</template>
