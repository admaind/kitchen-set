import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { findMatches, chooseProduct, getTotals, sanitizeState, encodeState, decodeState, describeFilters } from '../src/engine.js'

const config = JSON.parse(readFileSync(new URL('../public/data/config.json', import.meta.url)))
const { products } = JSON.parse(readFileSync(new URL('../public/data/products.json', import.meta.url)))
const group = id => config.groups.find(group => group.id === id)
const budgets = config.sections.find(section => section.type === 'budget-select').options

test('discount boundaries use distinct groups: 0%, 0%, 5%, 8%, 10%, 10%, 10%', () => {
  for (const [count, percent] of [0, 0, 5, 8, 10, 10, 10].entries()) {
    const items = Array.from({ length: count }, (_, index) => ({ groupId: `group-${index}`, price: 10000 }))
    const total = getTotals(items, config.discounts)
    assert.equal(total.percent, percent)
    assert.equal(total.total, count * 10000 * (1 - percent / 100))
  }
  assert.deepEqual(getTotals([{ groupId: 'oven', price: 10000 }, { groupId: 'oven', price: 10000 }], config.discounts), { count: 1, percent: 0, subtotal: 10000, saving: 0, total: 10000 })
})

test('default kit selects two matching products with an exact total', () => {
  const selected = config.initialState.selectedGroups.map(id => chooseProduct(findMatches(products, group(id), group(id).defaults, 'black'), budgets[1]))
  assert.ok(selected.every(Boolean))
  const total = getTotals(selected, config.discounts)
  assert.equal(total.subtotal, 78980)
  assert.equal(total.saving, 3949)
  assert.equal(total.total, 75031)
})

test('color, size and every selected feature are enforced together', () => {
  const matches = findMatches(products, group('oven'), { width: 40, features: ['airfry', 'pyrolytic'] }, 'white')
  assert.ok(matches.length >= 2)
  assert.ok(matches.every(item => item.color === 'white' && item.attributes.width === 40 && item.attributes.features.includes('airfry') && item.attributes.features.includes('pyrolytic')))
  assert.equal(findMatches(products, group('oven'), { features: ['pyrolytic', 'catalytic'] }, 'black').length, 0)
})

test('concealed appliances ignore color; freestanding dishwashers obey it', () => {
  assert.equal(findMatches(products, group('fridge'), {}, 'black').length, findMatches(products, group('fridge'), {}, 'white').length)
  const integrated = findMatches(products, group('dishwasher'), { installation: 'integrated', baskets: 3, autoOpen: true }, 'steel')
  assert.ok(integrated.length)
  assert.ok(integrated.every(item => item.color === 'panel' && item.attributes.baskets === 3 && item.attributes.autoOpen))
  const standing = findMatches(products, group('dishwasher'), { installation: 'freestanding' }, 'white')
  assert.ok(standing.length)
  assert.ok(standing.every(item => item.color === 'white'))
})

test('budget endpoints, manual selection and invalidated selections behave correctly', () => {
  const matches = findMatches(products, group('hob'), { power: 'induction', width: 60 }, 'black')
  assert.equal(chooseProduct(matches, budgets[0]).id, matches[0].id)
  assert.equal(chooseProduct(matches, budgets[2]).id, matches.at(-1).id)
  assert.equal(chooseProduct(matches, budgets[1], matches[0].id).id, matches[0].id)
  assert.equal(chooseProduct(matches, budgets[1], 'deleted-product').id, matches[2].id)
  assert.equal(chooseProduct([], budgets[1]), null)
  assert.ok(matches.every((item, index) => !index || item.price > matches[index - 1].price))
})

test('shared state roundtrips exact products and extra filters while invalid input is removed', () => {
  const product = findMatches(products, group('oven'), { width: 60, convection: true, features: ['airfry'] }, 'black')[0]
  const original = { color: 'black', budget: 'premium', selectedGroups: ['oven'], filters: { oven: { width: 60, convection: true, features: ['airfry'] } }, productIds: { oven: product.id } }
  assert.deepEqual(sanitizeState(decodeState(encodeState(original)), config, products), original)
  const corrupt = sanitizeState({ color: 'invalid', budget: 'invalid', selectedGroups: ['oven', 'oven', 'microwave', 'alien'], filters: { oven: { width: 500, malware: true, features: ['airfry', 'nonexistent', 'pyrolytic', 'catalytic'] } }, productIds: { oven: 'missing' } }, config, products)
  assert.equal(corrupt.color, 'black')
  assert.deepEqual(corrupt.selectedGroups, ['oven', 'microwave'])
  assert.equal(corrupt.filters.oven.width, undefined)
  assert.equal(corrupt.filters.oven.malware, undefined)
  assert.deepEqual(corrupt.filters.oven.features, ['airfry', 'pyrolytic'])
  assert.equal(corrupt.filters.microwave.installation, 'integrated')
  assert.throws(() => decodeState('x'.repeat(20000)))
})

test('empty kit restores as empty; filter labels include advanced criteria', () => {
  const empty = sanitizeState({ selectedGroups: [], color: 'steel', budget: 'economy' }, config, products)
  assert.deepEqual(empty.selectedGroups, [])
  assert.deepEqual(describeFilters(group('oven'), { width: 60, features: ['airfry'], convection: true }), ['60 см', 'AirFry', 'Конвекция'])
})

test('catalog has unique products, valid groups and assets, and covers every configured option', () => {
  assert.equal(new Set(products.map(product => product.id)).size, products.length)
  for (const product of products) {
    assert.ok(group(product.groupId))
    assert.ok(Number.isFinite(product.price) && product.price > 0)
    assert.ok(existsSync(new URL('../public' + product.image, import.meta.url)))
    assert.ok(product.url.includes(product.id))
  }
  for (const category of config.groups) for (const field of category.fields) {
    for (const option of field.options || [true]) {
      const value = typeof option === 'object' ? option.value : option
      const filters = { [field.id]: field.type === 'multi' ? [value] : value }
      assert.ok(findMatches(products, category, filters, 'black').length, `${category.id}.${field.id}=${value} is not represented`)
    }
  }
})
