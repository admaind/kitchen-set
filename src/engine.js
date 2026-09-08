export const clone = value => JSON.parse(JSON.stringify(value))
export const optionValue = option => typeof option === 'object' ? option.value : option
export const optionLabel = option => typeof option === 'object' ? option.label : String(option)
export const normalizedOptions = field => field.options.map(option => ({ value: optionValue(option), label: optionLabel(option) }))

export function matchesProduct(product, group, filters, color) {
  if (product.groupId !== group.id || product.available === false) return false
  const useColor = group.colorApplies || (group.id === 'dishwasher' && product.attributes.installation === 'freestanding')
  if (color && useColor && product.color !== color) return false
  return Object.entries(filters || {}).every(([key, value]) => {
    if (value === null || value === undefined || value === '' || value === false || (Array.isArray(value) && !value.length)) return true
    const actual = product.attributes[key]
    if (Array.isArray(value)) return value.every(item => Array.isArray(actual) && actual.includes(item))
    return actual === value
  })
}

export function findMatches(products, group, filters, color) {
  return products.filter(product => matchesProduct(product, group, filters, color)).sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))
}

export function hasMatches(products, group, filters, color) {
  return products.some(product => matchesProduct(product, group, filters, color))
}

// Use the exact same proposed change for availability and for committing a click.
export function nextFilters(filters, field, value) {
  const next = clone(filters || {})
  if (field.type === 'multi') {
    let values = [...(next[field.id] || [])]
    if (values.includes(value)) values = values.filter(item => item !== value)
    else {
      for (const exclusive of field.exclusive || []) if (exclusive.includes(value)) values = values.filter(item => !exclusive.includes(item))
      values.push(value)
    }
    next[field.id] = values
  } else if (field.type === 'toggle') next[field.id] = !next[field.id]
  else if (next[field.id] === value && !field.required) delete next[field.id]
  else next[field.id] = value
  return next
}

export function canSelectOption(products, group, filters, color, field, value) {
  if (field.type !== 'toggle' && !field.options.some(option => optionValue(option) === value)) return false
  return hasMatches(products, group, nextFilters(filters, field, value), color)
}

// Reconcile defaults, color changes and old shared links before exposing state to
// the UI. Required fields stay selected; other conditions keep their JSON order.
// Every retained condition must leave at least one available product.
export function normalizeGroupFilters(products, group, filters = {}, color) {
  const required = group.fields.filter(field => field.required)
  const candidates = products.filter(product => matchesProduct(product, group, {}, color)
    && required.every(field => field.options.some(option => optionValue(option) === product.attributes[field.id])))
  if (!candidates.length) return null
  const next = {}
  const supported = proposal => hasMatches(candidates, group, proposal, color)
  for (const field of required) {
    const options = field.options.map(optionValue)
    const preferences = [filters[field.id], group.defaults?.[field.id], ...options]
    next[field.id] = preferences.find(value => options.includes(value) && supported({ ...next, [field.id]: value }))
  }
  for (const field of group.fields.filter(field => !field.required)) {
    const value = filters[field.id]
    if (field.type === 'multi' && Array.isArray(value)) {
      next[field.id] = []
      for (const item of new Set(value)) {
        if (!field.options.some(option => optionValue(option) === item)) continue
        if ((field.exclusive || []).some(exclusive => exclusive.includes(item) && next[field.id].some(current => exclusive.includes(current)))) continue
        const proposal = { ...next, [field.id]: [...next[field.id], item] }
        if (supported(proposal)) next[field.id].push(item)
      }
    } else if (field.type === 'toggle' && typeof value === 'boolean') {
      if (supported({ ...next, [field.id]: value })) next[field.id] = value
    } else if (field.options?.some(option => optionValue(option) === value) && supported({ ...next, [field.id]: value })) next[field.id] = value
  }
  return next
}

export function chooseProduct(matches, budget, selectedId) {
  if (!matches.length) return null
  return matches.find(product => product.id === selectedId) || matches[Math.round((matches.length - 1) * (budget?.quantile ?? 0.5))]
}

export function getTotals(products, discounts) {
  const groups = new Map(products.filter(Boolean).map(product => [product.groupId, product]))
  const count = groups.size
  const subtotal = [...groups.values()].reduce((sum, product) => sum + Math.round(product.price * 100), 0)
  const percent = [...discounts].sort((a, b) => b.minGroups - a.minGroups).find(rule => count >= rule.minGroups)?.percent || 0
  const saving = Math.round(subtotal * percent / 100)
  return { count, percent, subtotal: subtotal / 100, saving: saving / 100, total: (subtotal - saving) / 100 }
}

export function describeFilters(group, filters) {
  return group.fields.flatMap(field => {
    const value = filters?.[field.id]
    if (value === undefined || value === null || value === false || (Array.isArray(value) && !value.length)) return []
    if (field.type === 'toggle') return [field.label]
    const label = v => {
      const option = field.options.find(option => optionValue(option) === v)
      if (option === undefined) return String(v)
      return optionLabel(option) + (field.unit ? ' ' + field.unit : '')
    }
    return Array.isArray(value) ? value.map(label) : [label(value)]
  })
}

export function sanitizeState(raw, config, products) {
  if (!raw || typeof raw !== 'object') return null
  const colorSection = config.sections.find(section => section.type === 'color-select')
  const budgetSection = config.sections.find(section => section.type === 'budget-select')
  const color = colorSection.options.some(option => option.value === raw.color) ? raw.color : config.initialState.color
  const requested = Array.isArray(raw.selectedGroups) ? config.groups.filter(group => raw.selectedGroups.includes(group.id)) : []
  const selected = []
  const filters = {}
  for (const group of requested) {
    const normalized = normalizeGroupFilters(products, group, raw.filters?.[group.id] || {}, color)
    if (!normalized) continue
    selected.push(group.id)
    filters[group.id] = normalized
  }
  const productIds = {}
  for (const group of requested.filter(group => selected.includes(group.id))) {
    const id = raw.productIds?.[group.id]
    if (products.some(product => product.id === id && matchesProduct(product, group, filters[group.id], color))) productIds[group.id] = id
  }
  return {
    color,
    budget: budgetSection.options.some(option => option.value === raw.budget) ? raw.budget : config.initialState.budget,
    selectedGroups: selected, filters, productIds
  }
}

export function encodeState(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(state))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function decodeState(value) {
  if (!value || value.length > 16000) throw new Error('Некорректная ссылка на комплект')
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0))))
}
