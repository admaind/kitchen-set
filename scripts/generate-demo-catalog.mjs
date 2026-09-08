import { readFileSync, writeFileSync } from 'node:fs'

// Fictional products and prices for exercising the configurator, not a live offer.
const config = JSON.parse(readFileSync(new URL('../public/data/config.json', import.meta.url)))
const products = []
const colors = ['black', 'white', 'steel']
const colorSuffix = { black: 'B', white: 'W', steel: 'S', panel: 'I' }
const series = ['Essential', 'Comfort', 'Linea', 'Advanced', 'Signature']
const groups = Object.fromEntries(config.groups.map(group => [group.id, group]))
function add(groupId, color, attributes, tier, price, model, description) {
  const id = `${groupId}-${String(products.length + 1).padStart(4, '0')}`
  products.push({ id, groupId, name: `${series[tier]} ${model}${colorSuffix[color]}`, series: `FORMA / ${series[tier].toUpperCase()}`, description, price, currency: 'RUB', color, available: true, image: groups[groupId].image, imageIllustrative: true, url: `/?product=${id}`, attributes })
}
for (const color of colors) for (const width of [40, 60]) for (let tier = 0; tier < 5; tier++) {
  const features = [[], ['catalytic'], ['airfry', 'catalytic'], ['airfry', 'pyrolytic'], ['airfry', 'pyrolytic']][tier]
  const volume = width === 40 ? 45 : tier > 1 ? 72 : 65
  add('oven', color, { width, features, convection: tier > 0, volume }, tier, 29990 + tier * 6500 + (width === 40 ? 2000 : 0), `O${width}${tier}`, `Электрический · ${volume} л`)
}
for (const color of colors) for (const power of ['induction', 'electric', 'gas']) for (const width of [30, 45, 60, 70, 80, 90]) for (let tier = 0; tier < 5; tier++) {
  const burners = width === 30 ? 2 : width === 45 ? 3 : width >= 80 ? 5 : 4
  add('hob', color, { power, width, burners, childLock: power !== 'gas' && tier > 0 }, tier, 22990 + tier * 6500 + (width - 60) * 150 + (power === 'gas' ? -5000 : power === 'electric' ? -3000 : 0), `H${width}${tier}`, ({ induction: 'Индукционная', electric: 'Электрическая', gas: 'Газовая' })[power] + ` · ${burners} конфорки`)
}
for (const color of colors) for (const installation of ['integrated', 'angled', 'cylindrical', 'dome', 'island']) for (const width of [40, 45, 50, 60, 70, 90]) for (const tier of [0, 2, 4]) {
  const capacity = tier === 0 ? 500 : tier === 2 ? 700 : 1000
  add('hood', color, { installation, width, capacity, quiet: tier >= 2 }, tier, 13990 + tier * 4500 + (width - 40) * 150 + (installation === 'island' ? 12000 : 0), `A${width}${tier}`, `${capacity} м³/ч · LED-подсветка`)
}
for (const installation of ['integrated', 'freestanding']) for (const color of installation === 'integrated' ? ['panel'] : colors) for (const width of [45, 60]) for (const tier of [0, 2, 4]) {
  const baskets = tier === 0 ? 2 : 3
  const noise = tier === 0 ? 49 : tier === 2 ? 44 : 42
  add('dishwasher', color, { installation, width, baskets, autoOpen: tier > 0, noise, leakProtection: tier > 0 }, tier, 34990 + tier * 5500 + (width === 60 ? 3000 : 0), `D${width}${tier}`, `${width === 45 ? 10 : 14} комплектов · ${noise} дБ`)
}
for (const color of colors) for (let tier = 0; tier < 5; tier++) {
  const volume = tier <= 1 ? 20 : tier <= 3 ? 25 : 32
  add('microwave', color, { installation: 'integrated', grill: tier > 0, volume }, tier, 18990 + tier * 4500, `M${volume}${tier}`, `${volume} л · ${tier > 0 ? 'С грилем' : 'Сенсорное управление'}`)
}
for (const kind of ['fridge-freezer', 'freezer']) for (const height of [80, 200]) for (const tier of [0, 2, 4]) {
  add('fridge', 'panel', { installation: 'integrated', kind, height, noFrost: tier > 0, inverter: tier === 4 }, tier, 39990 + tier * 10000 + (height === 200 ? 20000 : 0), `${kind === 'freezer' ? 'F' : 'R'}${height}${tier}`, `${kind === 'freezer' ? 'Морозильник' : 'Холодильник с морозильником'} · ${height} см`)
}
writeFileSync(new URL('../public/data/products.json', import.meta.url), JSON.stringify({ version: 1, demo: true, note: 'Вымышленные модели и цены для проверки подбора. Фотографии иллюстрируют категории и могут отличаться от цвета, установки и характеристик демонстрационных товаров.', products }, null, 2) + '\n')
console.log(`Generated ${products.length} demo products.`)
