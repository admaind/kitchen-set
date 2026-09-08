<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
const props = defineProps({ group: Object, product: Object, matches: Array, criteria: Array, money: Function, ordinal: Number, url: String })
const emit = defineEmits(['refine', 'move', 'detail'])
const imageFailed = ref(false)
watch(() => props.product?.image, () => imageFailed.value = false)
const index = computed(() => props.matches.findIndex(product => product.id === props.product?.id))
const cheaper = computed(() => props.matches.slice(0, index.value).reverse().find(product => product.price < props.product?.price))
const dearer = computed(() => props.matches.slice(index.value + 1).find(product => product.price > props.product?.price))
</script>
<template>
  <article class="result-group">
    <header class="result-group-header">
      <div class="flex items-center gap-2.5 min-w-0"><span class="result-ordinal">{{ String(ordinal).padStart(2, '0') }}</span><h3>{{ group.title }}</h3></div>
      <button class="refine-button" :aria-label="'Уточнить: ' + group.title" @click="emit('refine', group.id)"><AppIcon name="SlidersHorizontal" :size="15" /><span>Уточнить</span></button>
    </header>
    <div v-if="product" class="product-card">
      <div class="product-main">
        <div class="product-image-box">
          <img v-if="!imageFailed" :src="product.image || group.image" :alt="group.title + ' — ' + product.name" class="product-image" loading="lazy" @error="imageFailed = true" />
          <div v-else class="image-fallback"><AppIcon :name="group.icon" :size="44" /><span>Фото недоступно</span></div>
        </div>
        <div class="product-information">
          <span class="product-series">{{ product.series }}</span>
          <h4>{{ product.name }}</h4>
          <p class="product-caption">{{ product.description }}</p>
          <div class="product-price-row"><strong>{{ money(product.price) }}</strong><a v-if="url" :href="url" target="_blank" rel="noopener noreferrer" class="product-link" :aria-label="'Открыть товар ' + product.name + ' в магазине'"><AppIcon name="ArrowUpRight" :size="20" /></a><button v-else class="product-link" :aria-label="'Открыть карточку ' + product.name" @click="emit('detail', product)"><AppIcon name="ArrowUpRight" :size="20" /></button></div>
        </div>
      </div>
      <div class="product-criteria"><span v-for="criterion in criteria" :key="criterion"><AppIcon name="Check" :size="13" />{{ criterion }}</span><span v-if="!criteria.length"><AppIcon name="Check" :size="13" />Без ограничений</span></div>
      <div class="product-carousel">
        <button :disabled="!cheaper" :aria-label="'Выбрать дешевле: ' + group.title" @click="emit('move', group.id, cheaper.id)"><AppIcon name="ArrowLeft" :size="15" />Дешевле</button>
        <span>{{ index + 1 }} <span class="muted-separator">/</span> {{ matches.length }}</span>
        <button :disabled="!dearer" :aria-label="'Выбрать дороже: ' + group.title" @click="emit('move', group.id, dearer.id)">Дороже<AppIcon name="ArrowRight" :size="15" /></button>
      </div>
    </div>
    <div v-else class="no-match-card"><AppIcon name="SlidersHorizontal" :size="28" /><h4>Не нашли точного совпадения</h4><p>Попробуйте изменить цвет или убрать несколько требований к этому прибору.</p><button class="secondary-button" @click="emit('refine', group.id)">Изменить параметры</button></div>
  </article>
</template>
