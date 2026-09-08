import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canSelectOption, nextFilters, normalizeGroupFilters, hasMatches, sanitizeState, encodeState, decodeState, findMatches, chooseProduct } from '../src/engine.js'

const config = JSON.parse(readFileSync(new URL('../public/data/config.json', import.meta.url)))
const { products } = JSON.parse(readFileSync(new URL('../public/data/products.json', import.meta.url)))
const oven = config.groups.find(group => group.id === 'oven')
const field = id => oven.fields.find(field => field.id === id)
const item = (id, width, features, color = 'black', extra = {}) => ({
  id, groupId: 'oven', price: 30000, color, available: true,
  attributes: { width, features, convection: false, volume: width === 40 ? 45 : 72, ...extra }
})
// Purposefully sparse, unlike the broad demo catalog: no 60 cm AirFry ovens.
const sparse = [
  item('narrow-air', 40, ['airfry'], 'black', { convection: true }),
  item('wide-basic', 60, [], 'black'),
  item('wide-catalytic', 60, ['catalytic'], 'black'),
  item('white-basic', 60, [], 'white')
]

test('60 cm without AirFry disables AirFry; incompatible width stays disabled until AirFry is cleared', () => {
  let filters = { width: 60, features: [] }
  assert.equal(canSelectOption(sparse, oven, filters, 'black', field('features'), 'airfry'), false)
  assert.equal(canSelectOption(sparse, oven, filters, 'black', field('features'), 'catalytic'), true)
  assert.equal(canSelectOption(sparse, oven, filters, 'black', field('width'), 40), true)
  filters = nextFilters(filters, field('width'), 40)
  assert.equal(canSelectOption(sparse, oven, filters, 'black', field('features'), 'airfry'), true)
  filters = nextFilters(filters, field('features'), 'airfry')
  assert.equal(canSelectOption(sparse, oven, filters, 'black', field('width'), 60), false)
  assert.equal(canSelectOption(sparse, oven, filters, 'black', field('features'), 'airfry'), true)
  filters = nextFilters(filters, field('features'), 'airfry')
  assert.equal(canSelectOption(sparse, oven, filters, 'black', field('width'), 60), true)
})

test('availability simulates exclusive replacements and requires all remaining selected tags', () => {
  const data = [item('catalytic', 60, ['airfry', 'catalytic']), item('pyrolytic', 60, ['airfry', 'pyrolytic'])]
  const filters = { width: 60, features: ['airfry', 'catalytic'] }
  assert.equal(canSelectOption(data, oven, filters, 'black', field('features'), 'pyrolytic'), true)
  assert.deepEqual(nextFilters(filters, field('features'), 'pyrolytic').features, ['airfry', 'pyrolytic'])
  assert.equal(canSelectOption([data[0], item('without-air', 60, ['pyrolytic'])], oven, filters, 'black', field('features'), 'pyrolytic'), false)
})

test('advanced filters and checkboxes constrain the main controls, including unchecked-to-checked transitions', () => {
  const filters = { width: 60 }
  assert.equal(canSelectOption(sparse, oven, filters, 'black', field('convection'), true), false)
  assert.equal(canSelectOption(sparse, oven, filters, 'black', field('volume'), 45), false)
  assert.equal(canSelectOption(sparse, oven, { volume: 45 }, 'black', field('width'), 60), false)
  assert.equal(canSelectOption(sparse, oven, { width: 40, convection: true }, 'black', field('convection'), true), true)
  assert.equal(canSelectOption(sparse, oven, { width: 40, convection: true }, 'black', field('width'), 60), false)
})

test('color changes repair incompatible conditions before returning state and clear mismatched product IDs', () => {
  const original = { color: 'black', budget: 'optimal', selectedGroups: ['oven'], filters: { oven: { width: 60, features: ['catalytic'] } }, productIds: { oven: 'wide-catalytic' } }
  const next = sanitizeState({ ...original, color: 'white' }, config, sparse)
  assert.equal(next.color, 'white')
  assert.deepEqual(next.selectedGroups, ['oven'])
  assert.deepEqual(next.filters.oven, { width: 60, features: [] })
  assert.deepEqual(next.productIds, {})
  assert.ok(hasMatches(sparse, oven, next.filters.oven, next.color))
  // The caller disables steel because there are no products even after relaxing filters.
  assert.equal(normalizeGroupFilters(sparse, oven, {}, 'steel'), null)
})

test('invalid defaults and old shared combinations are reconciled, unavailable groups cannot remain selected', () => {
  const filters = { width: 60, features: ['airfry', 'catalytic'], convection: true, volume: 45 }
  const normalized = normalizeGroupFilters(sparse, oven, filters, 'black')
  assert.deepEqual(normalized, { width: 60, features: ['catalytic'] })
  const old = { color: 'black', budget: 'optimal', selectedGroups: ['oven', 'hob'], filters: { oven: filters }, productIds: { oven: 'narrow-air', hob: 'missing' } }
  const restored = sanitizeState(decodeState(encodeState(old)), config, sparse)
  assert.deepEqual(restored.selectedGroups, ['oven'])
  assert.ok(hasMatches(sparse, oven, restored.filters.oven, restored.color))
  assert.deepEqual(restored.productIds, {})
  assert.equal(normalizeGroupFilters(sparse.map(product => ({ ...product, available: false })), oven, {}, 'black'), null)
})

test('required fields remain valid on initialization, reset and attempts to deselect', () => {
  const microwave = config.groups.find(group => group.id === 'microwave')
  const installation = microwave.fields.find(field => field.id === 'installation')
  const reset = normalizeGroupFilters(products, microwave, {}, 'black')
  assert.equal(reset.installation, 'integrated')
  assert.deepEqual(nextFilters(reset, installation, 'integrated'), reset)
  assert.ok(hasMatches(products, microwave, reset, 'black'))
})

test('every reachable click combination in a sparse catalog retains a matching product', () => {
  const stableKey = filters => JSON.stringify(Object.fromEntries(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b))))
  const initial = normalizeGroupFilters(sparse, oven, oven.defaults, 'black')
  const queue = [initial]
  const seen = new Set([stableKey(initial)])
  for (let index = 0; index < queue.length; index++) {
    const filters = queue[index]
    assert.ok(hasMatches(sparse, oven, filters, 'black'))
    for (const control of oven.fields) for (const option of control.options || [true]) {
      const value = typeof option === 'object' ? option.value : option
      const proposed = nextFilters(filters, control, value)
      const enabled = canSelectOption(sparse, oven, filters, 'black', control, value)
      if (!enabled) { assert.equal(hasMatches(sparse, oven, proposed, 'black'), false); continue }
      assert.ok(hasMatches(sparse, oven, proposed, 'black'))
      const key = stableKey(proposed)
      if (!seen.has(key)) { seen.add(key); queue.push(proposed) }
    }
  }
  assert.ok(seen.size > 25, 'Walk must cover combinations, clearing fields and checkbox changes')
})

test('all six groups remain selectable with valid totals after changing color and budget', () => {
  for (const color of ['black', 'white', 'steel']) {
    const initial = { color, budget: 'optimal', selectedGroups: config.groups.map(group => group.id), filters: Object.fromEntries(config.groups.map(group => [group.id, group.defaults])) }
    const state = sanitizeState(initial, config, products)
    assert.equal(state.selectedGroups.length, 6)
    for (const group of config.groups) {
      const matches = findMatches(products, group, state.filters[group.id], color)
      for (const quantile of [0, 0.5, 1]) assert.ok(chooseProduct(matches, { quantile }))
    }
  }
})
