<template>
  <section class="page" data-module="stability">
    <header class="page-head">
      <div>
        <h2>稳定性考察管理</h2>
        <p class="page-desc">留样状态反映到稳定性考察待办；在存留样按批号自动开出待办，建立考察后即视为已反映。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出稳定性考察清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <h3 class="block-title">留样反映待办</h3>
    <table class="data-table">
      <thead>
        <tr><th>批号</th><th>留样编号</th><th>留样期限</th><th>考察条件（同存放条件口径）</th><th>留样到期</th><th>反映状态</th><th>办理</th></tr>
      </thead>
      <tbody>
        <tr v-for="todo in todos" :key="todo.batchNo" :class="{ 'row-done': todo.linked }">
          <td>{{ todo.batchNo }}</td>
          <td>{{ todo.retainCode }}</td>
          <td>{{ todo.period }}</td>
          <td>{{ todo.condition }}</td>
          <td>{{ todo.expiry }}</td>
          <td>
            <span v-if="todo.linked" class="tag tag-ok">已反映</span>
            <span v-else class="tag tag-warn">待建立考察</span>
          </td>
          <td class="row-actions">
            <button v-if="!todo.linked" class="link" type="button" @click="reflect(todo.batchNo)">建立考察</button>
            <span v-else class="cell-sub">已在考察清单中</span>
          </td>
        </tr>
        <tr v-if="!todos.length">
          <td colspan="7" class="empty-state">暂无从留样反映过来的待办</td>
        </tr>
      </tbody>
    </table>
    <p v-if="todoMessage" :class="todoOk ? 'ok-text' : 'error-text'" style="margin: 6px 0">{{ todoMessage }}</p>

    <h3 class="block-title">稳定性考察记录</h3>
    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 1" class="empty-state">暂无稳定性考察数据</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条稳定性考察记录；待办随留样台账状态实时联动</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { downloadEntries, listEntries, moduleMeta } from '@/api/local-service'
import { createStabilityFromRetain, stabilityTodos, type StabilityTodo } from '@/api/retain'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('stability')
const store = useSessionStore()
const columns = ['考察编号', '考察批号', '考察条件', '考察时间点', '检验项目', '考察结果', '考察人', '考察状态']
const statuses = ['待考察', '考察中', '已完成', '已终止']

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const todos = ref<StabilityTodo[]>([])
const todoMessage = ref('')
const todoOk = ref(false)

const stats = computed(() => [
  { label: '待考察', value: rows.value.filter((row) => String(row.status) === '待考察').length },
  { label: '考察中', value: rows.value.filter((row) => String(row.status) === '考察中').length },
  { label: '留样待办', value: todos.value.filter((todo) => !todo.linked).length },
  { label: '已完成考察', value: rows.value.filter((row) => String(row.status) === '已完成').length },
])

const statusSummary = computed(() =>
  statuses.map((status) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function reflect(batchNo: string) {
  const result = createStabilityFromRetain(batchNo, store.operator)
  todoOk.value = result.ok
  todoMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    todos.value = stabilityTodos()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '稳定性考察列表读取失败'
  }
}

onMounted(reload)
</script>
