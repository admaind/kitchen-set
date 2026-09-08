<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import AppIcon from './components/AppIcon.vue'
import FilterFields from './components/FilterFields.vue'
import ProductCard from './components/ProductCard.vue'
import BaseModal from './components/BaseModal.vue'
import { clone, findMatches, hasMatches, normalizeGroupFilters, chooseProduct, getTotals, describeFilters, sanitizeState, encodeState, decodeState } from './engine'

const config = ref(null)
const products = ref([])
const loadError = ref('')
const loading = ref(true)
const state = reactive({ color: 'black', budget: 'optimal', selectedGroups: [], filters: {}, productIds: {} })
const expanded = ref('oven')
const activeStep = ref(0)
const toast = ref('')
let toastTimer
const modalType = ref(null)
const refineId = ref(null)
const draft = ref({})
const detailProduct = ref(null)
const shareUrl = ref('')
const shareCopied = ref(false)
const shareInput = ref(null)
const cartIds = ref([])
const cartBusy = ref(false)
const cartError = ref('')
const addedSignature = ref('')
const storageKey = 'forma-demo-cart-v1'

const sections = computed(() => config.value?.sections || [])
const configurationSections = computed(() => sections.value.filter(section => section.area === 'configuration'))
const resultSections = computed(() => sections.value.filter(section => section.area === 'result'))
const colors = computed(() => sections.value.find(section => section.type === 'color-select')?.options || [])
const colorLabel = computed(() => colors.value.find(option => option.value === state.color)?.label || '')
const budgetOptions = computed(() => sections.value.find(section => section.type === 'budget-select')?.options || [])
const selectedBudget = computed(() => budgetOptions.value.find(option => option.value === state.budget))
const selectedGroups = computed(() => config.value?.groups.filter(group => state.selectedGroups.includes(group.id)) || [])
const groupAvailability = computed(() => Object.fromEntries((config.value?.groups || []).map(group => [group.id,
normalizeGroupFilters(products.value, group, {}, state.color) !== null
])))
const colorAvailability = computed(() => Object.fromEntries(colors.value.map(color => [color.value,
selectedGroups.value.length
  ? selectedGroups.value.every(group => normalizeGroupFilters(products.value, group, {}, color.value) !== null)
  : config.value.groups.some(group => normalizeGroupFilters(products.value, group, {}, color.value) !== null)
])))
const resultRows = computed(() => selectedGroups.value.map(group => {
  const matches = findMatches(products.value, group, state.filters[group.id], state.color)
  const product = chooseProduct(matches, selectedBudget.value, state.productIds[group.id])
  const useColor = group.colorApplies || (group.id === 'dishwasher' && product?.attributes.installation === 'freestanding')
  return { group, matches, product, criteria: [...(useColor ? [colorLabel.value] : []), ...describeFilters(group, state.filters[group.id])] }
}))
const chosenProducts = computed(() => resultRows.value.map(row => row.product).filter(Boolean))
const totals = computed(() => getTotals(chosenProducts.value, config.value?.discounts || []))
const canAdd = computed(() => !!totals.value.count && totals.value.count === selectedGroups.value.length && !cartBusy.value)
const signature = computed(() => chosenProducts.value.map(product => product.id).join(','))
const alreadyAdded = computed(() => !!signature.value && signature.value === addedSignature.value)
const discountRules = computed(() => [...(config.value?.discounts || [])].filter(rule => rule.percent > 0).sort((a, b) => a.minGroups - b.minGroups))
const nextDiscount = computed(() => discountRules.value.find(rule => rule.minGroups > totals.value.count))
const refinementGroup = computed(() => config.value?.groups.find(group => group.id === refineId.value))
const draftMatches = computed(() => refinementGroup.value ? findMatches(products.value, refinementGroup.value, draft.value, state.color) : [])
const cartProducts = computed(() => config.value?.groups.flatMap(group => products.value.find(product => cartIds.value.includes(product.id) && product.groupId === group.id) || []) || [])
const cartTotals = computed(() => getTotals(cartProducts.value, config.value?.discounts || []))
const detailGroup = computed(() => config.value?.groups.find(group => group.id === detailProduct.value?.groupId))
const modalTitle = computed(() => ({ refine: refinementGroup.value?.title || 'Уточнить параметры', share: 'Поделиться комплектом', cart: 'Ваша корзина', detail: detailProduct.value?.name || 'Карточка товара' })[modalType.value] || '')
const moneyFormatter = computed(() => new Intl.NumberFormat(config.value?.locale || 'ru-RU', { style: 'currency', currency: config.value?.currency || 'RUB', maximumFractionDigits: 0 }))
const money = value => moneyFormatter.value.format(value)
function noun(count, one, few, many) { const mod = count % 100; return mod >= 11 && mod <= 14 ? many : count % 10 === 1 ? one : count % 10 >= 2 && count % 10 <= 4 ? few : many }
const appliances = count => `${count} ${noun(count, 'прибор', 'прибора', 'приборов')}`

function notify(message) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', 4200) }
async function load() {
  loading.value = true; loadError.value = ''
  try {
    const responses = await Promise.all([fetch('/data/config.json'), fetch('/data/products.json')])
    if (responses.some(response => !response.ok)) throw new Error('Не удалось загрузить каталог')
    const [settings, catalog] = await Promise.all(responses.map(response => response.json()))
    if (!settings.groups?.length || !settings.sections?.length || !Array.isArray(catalog.products)) throw new Error('Неверный формат каталога')
    config.value = settings; products.value = catalog.products
    const initial = { ...clone(settings.initialState), filters: Object.fromEntries(settings.groups.map(group => [group.id, clone(group.defaults || {})])), productIds: {} }
    Object.assign(state, sanitizeState(initial, settings, catalog.products))
    expanded.value = state.selectedGroups[0] || null
    const url = new URL(window.location.href)
    const shared = url.searchParams.get('set')
    if (shared) {
      try {
        const restored = sanitizeState(decodeState(shared), settings, catalog.products)
        if (!restored) throw new Error('Invalid state')
        Object.assign(state, restored); expanded.value = null; activeStep.value = settings.steps.length - 1
        notify('Комплект из ссылки восстановлен')
      } catch { notify('Не удалось восстановить комплект. Выберите параметры заново.') }
    }
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); cartIds.value = Array.isArray(saved) ? [...new Set(saved)].filter(id => products.value.some(product => product.id === id)) : [] } catch { cartIds.value = [] }
    const id = url.searchParams.get('product')
    if (id) {
      const product = catalog.products.find(product => product.id === id)
      if (product) { detailProduct.value = product; await nextTick(); modalType.value = 'detail' }
      else notify('Товар по этой ссылке не найден')
    }
  } catch (error) { loadError.value = error.message || 'Не удалось загрузить каталог' }
  finally { loading.value = false }
}
onMounted(load)
onBeforeUnmount(() => clearTimeout(toastTimer))

function activate(target, scroll = false) {
  const index = config.value.steps.findIndex(step => step.target === target)
  if (index >= 0) activeStep.value = index
  if (target !== 'composition') expanded.value = null
  if (scroll) nextTick(() => { const element = document.getElementById(target); element?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); })
}
function selectColor(value) {
  if (!colorAvailability.value[value] || value === state.color) return
  const filterSummary = () => JSON.stringify(selectedGroups.value.map(group => describeFilters(group, state.filters[group.id])))
  const previousFilters = filterSummary()
  const next = sanitizeState({ ...state, color: value, productIds: {} }, config.value, products.value)
  Object.assign(state, next)
  if (filterSummary() !== previousFilters) notify('Цвет изменён. Параметры автоматически скорректированы по наличию.')
  activate('color')
}
function selectBudget(value) { state.budget = value; state.productIds = {}; activate('budget') }
function addGroup(group) {
  if (!state.selectedGroups.includes(group.id)) {
    const filters = normalizeGroupFilters(products.value, group, group.defaults || {}, state.color)
    if (!filters) return
    state.filters[group.id] = filters
    state.selectedGroups.push(group.id)
  }
  expanded.value = group.id; activate('composition')
}
function toggleExpanded(group) { if (!state.selectedGroups.includes(group.id)) addGroup(group); else { expanded.value = expanded.value === group.id ? null : group.id; activate('composition') } }
function removeGroup(group) {
  state.selectedGroups = state.selectedGroups.filter(id => id !== group.id)
  delete state.filters[group.id]; delete state.productIds[group.id]
  if (expanded.value === group.id) expanded.value = null
  activate('composition'); notify(`${group.title}: удалён из комплекта`)
}
function updateFilters(groupId, value) {
  const group = selectedGroups.value.find(group => group.id === groupId)
  if (!group || !hasMatches(products.value, group, value, state.color)) return
  state.filters[groupId] = value; delete state.productIds[groupId]; activate('composition')
}
function openRefinement(id) {
  const group = selectedGroups.value.find(group => group.id === id)
  if (!group) return
  const filters = normalizeGroupFilters(products.value, group, state.filters[id], state.color)
  if (!filters) return
  refineId.value = id; draft.value = filters; modalType.value = 'refine'; activate('results')
}
function updateDraft(value) {
  if (refinementGroup.value && hasMatches(products.value, refinementGroup.value, value, state.color)) draft.value = value
}
function resetDraft() {
  if (!refinementGroup.value) return
  const filters = normalizeGroupFilters(products.value, refinementGroup.value, {}, state.color)
  if (filters) draft.value = filters
}
function applyRefinement() {
  if (!draftMatches.value.length || !state.selectedGroups.includes(refineId.value)) return
  state.filters[refineId.value] = clone(draft.value); delete state.productIds[refineId.value]; closeModal(); notify('Параметры применены')
}
function moveProduct(groupId, id) { if (id) { state.productIds[groupId] = id; activate('results') } }
function openDetail(product) { detailProduct.value = product; modalType.value = 'detail' }
function closeModal() {
  if (modalType.value === 'detail') { const url = new URL(location.href); if (url.searchParams.has('product')) { url.searchParams.delete('product'); history.replaceState({}, '', url) } }
  modalType.value = null
}
function safeUrl(value) { if (!value || typeof value !== 'string') return null; try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : null } catch { return null } }
function productUrl(product) {
  if (!product) return null
  const template = config.value.integrations.productUrlTemplate
  return safeUrl(template ? template.replace('{id}', encodeURIComponent(product.id)) : product.url)
}
function openCart() {
  const url = config.value.integrations.cartUrl && safeUrl(config.value.integrations.cartUrl)
  if (url) location.assign(url)
  else modalType.value = 'cart'
}
async function addToCart() {
  if (!canAdd.value) return
  if (alreadyAdded.value) { openCart(); return }
  cartBusy.value = true; cartError.value = ''
  // Capture the reviewed kit before a possibly asynchronous shop API call.
  const chosen = [...chosenProducts.value]
  const chosenSignature = signature.value
  try {
    const endpoint = config.value.integrations.cartEndpoint
    if (endpoint) {
      const safeEndpoint = safeUrl(endpoint)
      if (!safeEndpoint) throw new Error('Некорректный адрес корзины')
      const response = await fetch(safeEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ source: 'kit-builder', items: chosen.map(product => ({ productId: product.id, quantity: 1 })) }) })
      if (!response.ok) throw new Error('Магазин не подтвердил добавление. Попробуйте ещё раз.')
    }
    const next = new Map(cartProducts.value.map(product => [product.groupId, product.id]))
    for (const product of chosen) next.set(product.groupId, product.id)
    cartIds.value = [...next.values()]
    try { localStorage.setItem(storageKey, JSON.stringify(cartIds.value)) } catch { notify('Комплект добавлен на время этой сессии') }
    addedSignature.value = chosenSignature
    if (!endpoint) modalType.value = 'cart'
    else notify('Комплект добавлен в корзину магазина')
  } catch (error) { cartError.value = error.message || 'Не удалось добавить комплект. Попробуйте ещё раз.' }
  finally { cartBusy.value = false }
}
function removeCartItem(id) { cartIds.value = cartIds.value.filter(item => item !== id); addedSignature.value = ''; try { localStorage.setItem(storageKey, JSON.stringify(cartIds.value)) } catch { } }
function shareKit() {
  const sharedState = { color: state.color, budget: state.budget, selectedGroups: selectedGroups.value.map(group => group.id), filters: clone(state.filters), productIds: Object.fromEntries(chosenProducts.value.map(product => [product.groupId, product.id])) }
  const url = new URL(location.origin + location.pathname)
  url.searchParams.set('set', encodeState(sharedState))
  shareUrl.value = url.href; shareCopied.value = false; modalType.value = 'share'
}
async function copyShare() {
  try {
    await navigator.clipboard.writeText(shareUrl.value); shareCopied.value = true
  } catch {
    shareInput.value?.focus(); shareInput.value?.select()
    notify('Ссылка выделена. Скопируйте её вручную.')
  }
}
function stepComplete(index) {
  const target = config.value.steps[index].target
  if (target === 'color') return !!state.color
  if (target === 'composition') return !!selectedGroups.value.length
  if (target === 'budget') return !!state.budget
  if (target === 'results') return canAdd.value
  return false
}
</script>

<template>
  <div v-if="loading || loadError" class="loading-screen">
    <a class="wordmark" href="/">EXITEQ<span class="wordmark-dot">®</span></a>
    <template v-if="loadError">
      <AppIcon name="AlertCircle" :size="32" />
      <h1>Каталог пока недоступен</h1>
      <p>{{ loadError }}</p><button class="primary-button" @click="load">Попробовать снова</button>
    </template>
    <template v-else>
      <AppIcon name="LoaderCircle" class="animate-spin" :size="28" />
      <p>Готовим вашу будущую кухню…</p>
    </template>
  </div>
  <template v-else>
    <a href="#color" class="skip-link">Перейти к подбору техники</a>
    <header class="site-header">
      <div class="page-container header-inner">
        <a href="/" class="brand" aria-label="EXITEQ — главная"><span class="wordmark">{{ config.brand.name }}<span
              class="wordmark-dot">®</span></span><span class="brand-tagline">{{ config.brand.tagline }}</span></a>
        <div class="header-center"><span class="header-separator"></span>Конструктор кухни</div>
        <button class="header-cart" @click="openCart">
          <AppIcon name="ShoppingBag" :size="21" /><span>Корзина</span><span class="cart-badge">{{ cartProducts.length
          }}</span>
        </button>
      </div>
    </header>
    <main class="page-container">
      <div class="breadcrumb" aria-label="Навигационная цепочка"><span>Главная</span>
        <AppIcon name="ChevronRight" :size="12" /><span>Встраиваемая техника</span>
        <AppIcon name="ChevronRight" :size="12" /><span class="breadcrumb-current">Собрать комплект</span>
      </div>
      <section class="intro">
        <div>
          <div class="eyebrow"><span class="eyebrow-line"></span>ПРОДУМАНО ДО ДЕТАЛЕЙ</div>
          <h1>Ваша кухня. <span>Ваш комплект.</span></h1>
          <p>Техника, которая подходит друг другу. И вам.</p>
        </div>
        <div class="intro-offer"><span class="offer-icon">
            <AppIcon name="Layers" :size="25" />
          </span>
          <div><strong>Вместе выгоднее</strong>
            <p>До <b>10% скидки</b> на весь комплект</p>
          </div>
        </div>
      </section>

      <nav class="progress-nav" aria-label="Прогресс выбора">
        <ol class="progress-steps">
          <li v-for="(step, index) in config.steps" :key="step.id"
            :class="{ active: index === activeStep, complete: index < activeStep && stepComplete(index) }">
            <button :aria-current="index === activeStep ? 'step' : undefined" @click="activate(step.target, true)"><span
                class="step-circle">
                <AppIcon v-if="index < activeStep && stepComplete(index)" name="Check" :size="16" /><template v-else>{{
                  String(index + 1).padStart(2, '0') }}</template>
              </span><span>{{
                step.label }}</span>
              <AppIcon class="step-arrow" name="ChevronRight" :size="15" />
            </button>
          </li>
        </ol>
        <div class="progress-track" role="progressbar" aria-label="Шаг выбора" :aria-valuemin="1"
          :aria-valuemax="config.steps.length" :aria-valuenow="activeStep + 1"
          :aria-valuetext="`Шаг ${activeStep + 1} из ${config.steps.length}: ${config.steps[activeStep].label}`">
          <div :style="{ width: `${(activeStep + 1) / config.steps.length * 100}%` }"></div>
        </div>
      </nav>

      <div class="configurator-grid">
        <div class="configuration-column">
          <section v-for="section in configurationSections" :id="section.id" :key="section.id"
            class="configuration-section" :class="section.type">
            <header class="section-heading"><span class="section-number">
                <AppIcon :name="section.icon" :size="17" />
              </span>
              <div class="min-w-0">
                <h2>{{ section.title }}</h2>
                <p>{{ section.description }}</p>
              </div><span v-if="section.type === 'appliance-accordion'" class="group-count">{{ selectedGroups.length }}
                <span>/ {{ config.groups.length }}</span></span>
            </header>
            <div v-if="section.type === 'color-select'" class="color-options">
              <button v-for="option in section.options" :key="option.value" class="color-option"
                :class="{ selected: state.color === option.value }" :disabled="!colorAvailability[option.value]"
                :title="!colorAvailability[option.value] ? 'В этом цвете нет товаров для одной из выбранных групп' : undefined"
                :aria-pressed="state.color === option.value" @click="selectColor(option.value)"><span
                  class="color-swatch" :style="{ background: option.swatch }"></span>{{ option.label }}
                <AppIcon v-if="state.color === option.value" name="Check" :size="16" class="color-check" />
              </button>
            </div>
            <template v-else-if="section.type === 'appliance-accordion'">
              <div class="appliance-list">
                <article v-for="group in config.groups" :key="group.id" class="appliance"
                  :class="{ included: state.selectedGroups.includes(group.id), expanded: expanded === group.id }">
                  <div class="appliance-header">
                    <button class="appliance-toggle" :disabled="!groupAvailability[group.id]"
                      :title="!groupAvailability[group.id] ? 'В выбранном цвете пока нет товаров этой группы' : undefined"
                      :aria-expanded="expanded === group.id" :aria-controls="`filters-${group.id}`"
                      @click="toggleExpanded(group)"><span class="appliance-icon">
                        <AppIcon :name="group.icon" :size="23" />
                      </span><span class="appliance-name">{{ group.title }}</span><span
                        v-if="state.selectedGroups.includes(group.id) && expanded !== group.id"
                        class="appliance-summary">{{ describeFilters(group, state.filters[group.id]).join(' · ') ||
                          'Любые параметры' }}</span>
                      <AppIcon v-if="state.selectedGroups.includes(group.id)" name="ChevronDown" :size="15"
                        class="accordion-chevron" />
                    </button>
                    <button v-if="state.selectedGroups.includes(group.id)" class="remove-appliance icon-button"
                      :aria-label="'Удалить ' + group.title.toLowerCase() + ' из комплекта'"
                      @click="removeGroup(group)">
                      <AppIcon name="X" :size="17" />
                    </button>
                    <button v-else class="add-appliance" :disabled="!groupAvailability[group.id]"
                      :title="!groupAvailability[group.id] ? 'В выбранном цвете пока нет товаров этой группы' : undefined"
                      :aria-label="'Добавить: ' + group.title" @click="addGroup(group)">
                      <AppIcon name="Plus" :size="16" /><span>Добавить</span>
                    </button>
                  </div>
                  <div v-if="expanded === group.id" :id="`filters-${group.id}`" class="appliance-body">
                    <FilterFields :fields="group.fields.filter(field => !field.advanced)" :group="group"
                      :products="products" :color="state.color" :model-value="state.filters[group.id]"
                      :prefix="group.id" @update:model-value="updateFilters(group.id, $event)" />
                    <p v-if="group.colorNote && state.filters[group.id]?.installation !== 'freestanding'"
                      class="color-note">
                      <AppIcon name="Info" :size="14" />{{ group.colorNote }}
                    </p>
                    <button class="done-button" @click="expanded = null">
                      <AppIcon name="Check" :size="14" />Готово
                    </button>
                  </div>
                </article>
              </div>
              <div class="composition-footer"><span>
                  <AppIcon name="Info" :size="15" />Можно выбрать любой состав
                </span><button @click="activate('budget', true)">К бюджету
                  <AppIcon name="ArrowRight" :size="16" />
                </button></div>
            </template>
            <template v-else-if="section.type === 'budget-select'">
              <div class="budget-options"><button v-for="option in section.options" :key="option.value"
                  class="budget-option" :class="{ selected: state.budget === option.value }"
                  :aria-pressed="state.budget === option.value" @click="selectBudget(option.value)"><span
                    class="budget-icon">
                    <AppIcon :name="option.icon" :size="21" /><span class="radio-dot"
                      :class="{ checked: state.budget === option.value }"></span>
                  </span><strong>{{ option.label }}</strong><span class="budget-description">{{ option.description
                  }}</span></button></div>
              <button class="view-results-button" :disabled="!selectedGroups.length"
                @click="activate('results', true)">Посмотреть комплект
                <AppIcon name="ArrowRight" :size="18" />
              </button>
            </template>
          </section>
          <div class="configuration-note">
            <AppIcon name="SlidersHorizontal" :size="18" />
            <p>Нужно больше точности? Нажмите «Уточнить» рядом с&nbsp;прибором в&nbsp;комплекте.</p>
          </div>
        </div>

        <aside class="result-column" aria-label="Подобранный комплект">
          <div class="result-surface">
            <template v-for="section in resultSections" :key="section.id">
              <section v-if="section.type === 'product-results'" :id="section.id" class="results-section">
                <header class="results-heading">
                  <div>
                    <div class="eyebrow">СОБРАНО ДЛЯ ВАС</div>
                    <h2>{{ section.title }}<span class="result-count">{{ totals.count }}</span></h2>
                  </div><span v-if="totals.percent" class="discount-badge">−{{ totals.percent }}% на комплект</span>
                </header>
                <p class="results-subtitle">{{ selectedGroups.length ? 'Меняйте приборы — сумма обновится автоматически'
                  : 'Начните с приборов, которые нужны вашей кухне' }}</p>
                <div v-if="!selectedGroups.length" class="empty-results"><span class="empty-icon">
                    <AppIcon name="Layers" :size="40" />
                  </span>
                  <h3>Здесь будет ваша кухня</h3>
                  <p>Добавьте хотя бы один прибор.<br />От двух разных приборов действует скидка.</p><button
                    class="secondary-button" @click="activate('composition', true)">Выбрать приборы
                    <AppIcon name="ArrowRight" :size="16" />
                  </button>
                </div>
                <div v-else class="results-list">
                  <ProductCard v-for="(row, index) in resultRows" :key="row.group.id" v-bind="row" :ordinal="index + 1"
                    :money="money" :url="productUrl(row.product)" @refine="openRefinement" @move="moveProduct"
                    @detail="openDetail" />
                </div>
              </section>
              <section v-else-if="section.type === 'price-summary'" :id="section.id" class="price-summary">
                <div class="discount-ladder"><span v-for="rule in discountRules" :key="rule.minGroups"
                    :class="{ reached: totals.count >= rule.minGroups, current: totals.percent === rule.percent }">
                    <AppIcon v-if="totals.percent === rule.percent" name="Check" :size="13" />{{ rule.minGroups }}{{
                      rule.minGroups === Math.max(...discountRules.map(item => item.minGroups)) ? '+' : ''}} {{
                      noun(rule.minGroups, 'прибор', 'прибора', 'приборов') }}<b>−{{ rule.percent }}%</b>
                  </span></div>
                <p v-if="nextDiscount && totals.count > 0" class="next-discount">{{ nextDiscount.minGroups -
                  totals.count === 1 ? 'Ещё один прибор' : `Ещё ${appliances(nextDiscount.minGroups - totals.count)}` }}
                  из другой группы — и скидка {{ nextDiscount.percent }}%</p>
                <p v-else-if="totals.percent === 10" class="next-discount">Ваша максимальная скидка на комплект — 10%
                </p>
                <div class="summary-rows">
                  <div><span>Стоимость товаров</span><span>{{ money(totals.subtotal) }}</span></div>
                  <div class="saving-row"><span>Скидка за комплект <b>{{ totals.percent }}%</b></span><span>{{
                    totals.saving ? '−' : '' }}{{ money(totals.saving) }}</span></div>
                </div>
                <div class="total-row">
                  <div>
                    <h3>{{ section.title }}</h3><span>{{ appliances(totals.count) }} · скидка {{ totals.percent
                    }}%</span>
                  </div>
                  <div class="total-numbers"><del v-if="totals.percent">{{ money(totals.subtotal) }}</del><strong>{{
                    money(totals.total) }}</strong></div>
                </div>
                <p class="price-notice">{{ config.priceNotice }}</p>
              </section>
              <section v-else-if="section.type === 'checkout-actions'" :id="section.id" class="checkout-actions">
                <button class="primary-button add-to-cart" :disabled="!canAdd" @click="addToCart">
                  <AppIcon :name="cartBusy ? 'LoaderCircle' : alreadyAdded ? 'Check' : 'ShoppingBag'"
                    :class="{ 'animate-spin': cartBusy }" :size="20" />{{ cartBusy ? 'Добавляем…' : alreadyAdded ?
                      'Комплект в корзине' : 'Положить в корзину' }}
                  <AppIcon name="ArrowRight" :size="18" />
                </button>
                <p v-if="cartError" role="alert" class="inline-warning">{{ cartError }}</p>
                <button class="share-button" :disabled="!selectedGroups.length" @click="shareKit">
                  <AppIcon name="Share2" :size="17" />Поделиться комплектом
                </button>
              </section>
            </template>
          </div>
          <p class="demo-note">Демонстрационный каталог. Фото иллюстрируют категории; модели, параметры и цены —
            тестовые.</p>
        </aside>
      </div>
      <footer class="page-footer"><span class="footer-brand">EXITEQ</span><span>Хорошая кухня начинается с правильного
          комплекта.</span><span>© {{ new Date().getFullYear() }}</span></footer>
    </main>
    <div class="mobile-kit-bar">
      <div><span>{{ appliances(totals.count) }}<b v-if="totals.percent">−{{ totals.percent }}%</b></span><strong>{{
        money(totals.total) }}</strong></div><button class="primary-button" @click="activate('results', true)">Ваш
        комплект
        <AppIcon name="ArrowRight" :size="17" />
      </button>
    </div>
  </template>

  <BaseModal :open="!!modalType" :title="modalTitle" :wide="modalType === 'cart'" @close="closeModal">
    <template v-if="modalType === 'refine' && refinementGroup">
      <p class="modal-intro">Уточните параметры только для этого прибора. Остальной комплект сохранится.</p>
      <div class="refine-color"><span class="color-swatch small"
          :style="{ background: colors.find(color => color.value === state.color)?.swatch }"></span>{{
            refinementGroup.colorApplies || draft.installation === 'freestanding' ? colorLabel : 'За фасадом кухни'
          }}<span>Цвет комплекта</span></div>
      <FilterFields :fields="refinementGroup.fields" :group="refinementGroup" :products="products" :color="state.color"
        :model-value="draft" @update:model-value="updateDraft" :prefix="'refine-' + refinementGroup.id" />
      <div v-if="draftMatches.length" class="match-count">
        <AppIcon name="CheckCheck" :size="18" />{{ `Подходит ${draftMatches.length} ${noun(draftMatches.length, 'товар',
          'товара', 'товаров')}` }}
      </div>
    </template>
    <template v-else-if="modalType === 'share'">
      <div class="share-summary"><span class="empty-icon">
          <AppIcon name="Share2" :size="28" />
        </span>
        <h3>Ваша кухня по одной ссылке</h3>
        <p>{{ appliances(totals.count) }} · {{ money(totals.total) }}</p>
      </div>
      <p class="modal-intro">Ссылка сохранит выбранные приборы, цвет, бюджет и все уточнения. Получатель увидит тот же
        комплект по актуальным ценам каталога.</p>
      <label class="share-field"><span>Ссылка на комплект</span><textarea ref="shareInput" :value="shareUrl" readonly
          rows="3" @focus="$event.target.select()"></textarea></label>
    </template>
    <template v-else-if="modalType === 'cart'">
      <p v-if="!config.integrations.cartEndpoint" class="demo-cart-notice">
        <AppIcon name="Info" :size="18" />Демо-корзина сохраняется в этом браузере. Оформление заказа будет доступно
        после подключения магазина.
      </p>
      <div v-if="!cartProducts.length" class="empty-results">
        <AppIcon name="ShoppingBag" :size="42" />
        <h3>В корзине пока пусто</h3>
        <p>Соберите комплект и добавьте его целиком.</p>
      </div>
      <template v-else>
        <div class="cart-items">
          <div v-for="product in cartProducts" :key="product.id" class="cart-item"><img :src="product.image"
              :alt="product.name" />
            <div><span>{{config.groups.find(group => group.id === product.groupId)?.title}}</span>
              <h3>{{ product.name }}</h3><span>1 шт.</span>
            </div><strong>{{ money(product.price) }}</strong><button class="icon-button"
              :aria-label="'Убрать ' + product.name + ' из корзины'" @click="removeCartItem(product.id)">
              <AppIcon name="Trash2" :size="18" />
            </button>
          </div>
        </div>
        <div class="summary-rows">
          <div><span>{{ appliances(cartTotals.count) }}</span><span>{{ money(cartTotals.subtotal) }}</span></div>
          <div class="saving-row"><span>Скидка {{ cartTotals.percent }}%</span><span>{{ cartTotals.saving ? '−' : ''
          }}{{ money(cartTotals.saving) }}</span></div>
        </div>
        <div class="total-row">
          <h3>Итого со скидкой</h3><strong class="cart-total">{{ money(cartTotals.total) }}</strong>
        </div>
        <p class="price-notice">{{ config.priceNotice }}</p>
      </template>
    </template>
    <template v-else-if="modalType === 'detail' && detailProduct">
      <div class="detail-product"><img :src="detailProduct.image" :alt="detailGroup.title" />
        <div><span class="eyebrow">{{ detailGroup.title }}</span>
          <h3>{{ detailProduct.name }}</h3>
          <p>{{ detailProduct.description }}</p><strong>{{ money(detailProduct.price) }}</strong>
        </div>
      </div>
      <div class="detail-attributes">
        <div v-if="detailProduct.color !== 'panel'"><span>Цвет</span><b>{{colors.find(color => color.value ===
          detailProduct.color)?.label }}</b></div><template v-for="field in detailGroup.fields" :key="field.id">
          <div v-if="detailProduct.attributes[field.id] !== undefined"><span>{{ field.label }}</span><b>{{ field.type
            === 'toggle' ? (detailProduct.attributes[field.id] ? 'Да' : 'Нет') : describeFilters({ fields: [field] },
              detailProduct.attributes).join(', ') || 'Нет' }}</b></div>
        </template>
      </div>
      <p class="demo-note">Демонстрационная карточка товара. Фотография иллюстрирует категорию и может отличаться от
        указанных характеристик и цвета.</p>
    </template>
    <template #footer>
      <template v-if="modalType === 'refine'"><button class="reset-button" @click="resetDraft">
          <AppIcon name="RotateCcw" :size="16" />Сбросить
        </button><button class="primary-button" :disabled="!draftMatches.length" @click="applyRefinement">Применить
          <AppIcon name="Check" :size="17" />
        </button></template>
      <button v-else-if="modalType === 'share'" class="primary-button w-full" @click="copyShare">
        <AppIcon :name="shareCopied ? 'Check' : 'Copy'" :size="18" />
        <template v-if="shareCopied">Ссылка скопирована</template>
        <template v-else>Скопировать ссылку</template>
      </button>
      <button v-else class="primary-button w-full" @click="closeModal">Вернуться к комплекту
        <AppIcon name="ArrowRight" :size="17" />
      </button>
    </template>
  </BaseModal>
  <Transition name="toast">
    <div v-if="toast" class="toast-message" role="status">
      <AppIcon name="Check" :size="18" /><span>{{ toast }}</span><button aria-label="Закрыть уведомление"
        @click="toast = ''">
        <AppIcon name="X" :size="16" />
      </button>
    </div>
  </Transition>
  <span class="sr-only" aria-live="polite" aria-atomic="true">{{ totals.count }} товаров, скидка {{ totals.percent }}
    процентов, итого {{ money(totals.total) }}</span>
</template>
