<script setup>
import { ArrowUpRight, ArrowRight, ArrowLeft, Check, Plus, X, ChevronDown, ChevronRight, Palette, Layers, Wallet, PackageCheck, Receipt, ShoppingBag, Share2, SlidersHorizontal, Microwave, Grid2X2, Fan, WashingMachine, PanelTop, Refrigerator, Leaf, Scale, Sparkles, Info, RotateCcw, Copy, CheckCheck, LoaderCircle, Link, AlertCircle, Trash2, ExternalLink, ShieldCheck } from 'lucide-vue-next'
defineProps({ name: String, size: { type: [Number, String], default: 20 }, strokeWidth: { type: [Number, String], default: 1.65 } })
const icons = { ArrowUpRight, ArrowRight, ArrowLeft, Check, Plus, X, ChevronDown, ChevronRight, Palette, Layers, Wallet, PackageCheck, Receipt, ShoppingBag, Share2, SlidersHorizontal, Microwave, Grid2X2, Fan, WashingMachine, PanelTop, Refrigerator, Leaf, Scale, Sparkles, Info, RotateCcw, Copy, CheckCheck, LoaderCircle, Link, AlertCircle, Trash2, ExternalLink, ShieldCheck }
</script>
<template><component :is="icons[name] || icons.Layers" :size="size" :stroke-width="strokeWidth" aria-hidden="true" /></template>
