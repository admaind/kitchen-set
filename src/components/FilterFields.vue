<script setup>
import { computed } from 'vue'
import { normalizedOptions, nextFilters, canSelectOption } from '../engine'
import AppIcon from './AppIcon.vue'
const props = defineProps({ fields: Array, modelValue: Object, prefix: String, group: Object, products: Array, color: String })
const emit = defineEmits(['update:modelValue'])
const availability = computed(() => Object.fromEntries(props.fields.map(field => [field.id,
  Object.fromEntries((field.type === 'toggle' ? [{ value: true }] : normalizedOptions(field)).map(option => [option.value,
    canSelectOption(props.products, props.group, props.modelValue, props.color, field, option.value)
  ]))
])))
const hasDisabledOptions = computed(() => Object.values(availability.value).some(field => Object.values(field).some(enabled => !enabled)))
const unavailableReason = 'Недоступно с выбранными параметрами и цветом техники'
function isDisabled(field, value = true) { return !availability.value[field.id]?.[value] }
function setField(field, value) {
  if (isDisabled(field, value)) return
  emit('update:modelValue', nextFilters(props.modelValue, field, value))
}
function isSelected(field, value) { return field.type === 'multi' ? props.modelValue?.[field.id]?.includes(value) : props.modelValue?.[field.id] === value }
</script>
<template>
  <div class="filter-fields">
    <template v-for="field in fields" :key="field.id">
      <label v-if="field.type === 'toggle'" class="toggle-label" :class="{ 'is-disabled': isDisabled(field) }" :title="isDisabled(field) ? unavailableReason : undefined">
        <input type="checkbox" :checked="!!modelValue?.[field.id]" :disabled="isDisabled(field)" :aria-describedby="isDisabled(field) ? `${prefix}-availability-note` : undefined" @change="setField(field, true)" class="sr-only peer" />
        <span class="check-box" :class="{ checked: modelValue?.[field.id] }"><AppIcon v-if="modelValue?.[field.id]" name="Check" :size="13" /></span>
        <span>{{ field.label }}</span>
      </label>
      <fieldset v-else class="field-set">
        <legend>{{ field.label }} <span v-if="field.type === 'multi'" class="optional-label">можно несколько</span></legend>
        <div class="flex flex-wrap gap-2">
          <button v-for="option in normalizedOptions(field)" :key="option.value" type="button" class="option-chip" :class="{ 'is-selected': isSelected(field, option.value), 'is-disabled': isDisabled(field, option.value) }" :disabled="isDisabled(field, option.value)" :aria-disabled="isDisabled(field, option.value)" :title="isDisabled(field, option.value) ? unavailableReason : undefined" :aria-describedby="isDisabled(field, option.value) ? `${prefix}-availability-note` : undefined" :aria-pressed="!!isSelected(field, option.value)" @click="setField(field, option.value)">
            <AppIcon v-if="isSelected(field, option.value) && field.type === 'multi'" name="Check" :size="14" />{{ option.label }}
          </button>
        </div>
      </fieldset>
    </template>
    <p v-if="hasDisabledOptions" :id="`${prefix}-availability-note`" class="availability-note"><AppIcon name="Info" :size="14" />Серые параметры недоступны для текущего выбора.</p>
  </div>
</template>
