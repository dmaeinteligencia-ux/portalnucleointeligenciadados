<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { listarAplicacoes, rotuloStatus, rotuloTipo } from '../lib/dados'
import CartaoApp from '../components/CartaoApp.vue'
import HudPanel from '../components/HudPanel.vue'

const route = useRoute()
const apps = ref([])
const busca = ref(route.query.q || '')
const area = ref('')
const status = ref('')
const tipo = ref(route.query.tipo || '')

watch(() => route.query.q, q => { busca.value = q || '' })
watch(() => route.query.tipo, t => { tipo.value = t || '' })
onMounted(async () => { apps.value = await listarAplicacoes() })

const areas = computed(() => [...new Set(apps.value.map(a => a.area).filter(Boolean))].sort())
const filtradas = computed(() => {
  const termo = busca.value.trim().toLowerCase()
  return apps.value.filter(a =>
    (!termo || `${a.nome} ${a.descricao} ${a.area}`.toLowerCase().includes(termo)) &&
    (!area.value || a.area === area.value) &&
    (!status.value || a.status === status.value) &&
    (!tipo.value || (a.tipo || 'sistema') === tipo.value))
})
</script>

<template>
<div>
  <h1 class="titulo-tela">{{ tipo === 'painel' ? 'Painéis de BI' : 'Aplicações' }}</h1>
  <HudPanel>
  <div class="filtros">
    <input v-model="busca" type="search" placeholder="Buscar por nome ou descrição" aria-label="Buscar" />
    <select v-model="tipo" aria-label="Tipo">
      <option value="">Sistemas e painéis</option>
      <option v-for="(rotulo, valor) in rotuloTipo" :key="valor" :value="valor">{{ valor === 'painel' ? 'Só painéis de BI' : 'Só sistemas' }}</option>
    </select>
    <select v-model="area" aria-label="Área">
      <option value="">Todas as áreas</option>
      <option v-for="a in areas" :key="a">{{ a }}</option>
    </select>
    <select v-model="status" aria-label="Status">
      <option value="">Todos os status</option>
      <option v-for="(rotulo, valor) in rotuloStatus" :key="valor" :value="valor">{{ rotulo }}</option>
    </select>
  </div>
  <p class="contagem">{{ filtradas.length }} {{ filtradas.length === 1 ? 'item encontrado' : 'itens encontrados' }}</p>
  </HudPanel>
  <div class="grade-apps colunas">
    <CartaoApp v-for="(app, i) in filtradas" :key="app.id" :app="app" :indice="i" />
  </div>
</div>
</template>
