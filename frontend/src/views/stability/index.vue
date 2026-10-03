<template>
  <section class="page" data-module="stability">
    <header class="page-head">
      <div>
        <h2>稳定性考察管理</h2>
        <p class="page-desc">维护稳定性考察记录，围绕考察编号、考察批号、考察条件、考察时间点做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记稳定性考察记录</button>
        <button class="btn" type="button" @click="exportRows">导出稳定性考察清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <section class="todo-panel">
      <h3 class="todo-title">留样联动待办（留样状态一节一节流转，自动反映到稳定性考察）</h3>
      <table class="data-table" v-if="todos.length">
        <thead>
          <tr>
            <th>留样编号</th>
            <th>对应批号</th>
            <th>留样期限</th>
            <th>存放条件</th>
            <th>留样状态</th>
            <th>到期日期</th>
            <th>待办事项</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="todo in todos" :key="todo.留样编号">
            <td>{{ todo.留样编号 }}</td>
            <td>{{ todo.对应批号 }}</td>
            <td>{{ todo.留样期限册.replace('留样期限：', '') }}</td>
            <td>{{ todo.存放条件 }}</td>
            <td><span :class="['status-pill', todo.留样状态 === '待销毁' ? 'pill-orange' : 'pill-amber']">{{ todo.留样状态 }}</span></td>
            <td>{{ todo.到期日期 || '长期' }}</td>
            <td>{{ todo.待办 }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state" style="padding: 10px;">暂无到期或待销毁留样带来的考察待办</p>
    </section>

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
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无稳定性考察数据，可先登记稳定性考察记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条稳定性考察记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { stabilityTodos } from '@/api/retain-service'
import type { EntryRow, StabilityTodo } from '@/data/types'

const meta = moduleMeta('stability')
const columns = ["考察编号", "考察批号", "考察条件", "考察时间点", "检验项目", "考察结果", "考察人", "考察状态"]
const actions = ["提交考察", "确认完成", "终止考察"]
const statuses = ["待考察", "考察中", "已完成", "已终止"]
const stats = [{"label": "待考察批次", "value": 0}, {"label": "考察中批次", "value": 0}, {"label": "已完成考察数", "value": 0}]

const rows = ref<EntryRow[]>([])
const todos = ref<StabilityTodo[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
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

function openCreate() {
  errorMessage.value = '稳定性考察记录登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
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
