<template>
  <section class="page" data-module="retainsample">
    <header class="page-head">
      <div>
        <h2>留样管理</h2>
        <p class="page-desc">
          留样台账按留样期限分册，导出后立即下载，可直接下发库房与车间两处；状态一节一节流转，销毁前经质量部核准、经手人签字。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记留样记录</button>
        <button class="btn primary" type="button" @click="exportVolumes">按留样期限分册导出（下发库房/车间）</button>
        <button class="btn" type="button" @click="showBooks = true">导出留痕</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in statCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
      <span class="legend-item">同一留样重复导出只计一次，已下发 {{ stats.distributed }} 份</span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>留样编号/对应批号</span>
        <input v-model="filters.keyword" placeholder="按编号或批号检索" />
      </label>
      <label class="filter-item">
        <span>留样期限</span>
        <select v-model="filters.tier">
          <option value="">全部期限</option>
          <option v-for="tier in RETAIN_TIERS" :key="tier.key" :value="tier.key">{{ tier.label }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>存放条件</span>
        <select v-model="filters.condition">
          <option value="">全部条件</option>
          <option v-for="cond in STORAGE_CONDITIONS" :key="cond.key" :value="cond.key">{{ cond.label }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>状态</span>
        <select v-model="filters.status">
          <option value="">全部状态</option>
          <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
        </select>
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
          <td>{{ row['留样编号'] }}</td>
          <td>{{ row['对应批号'] }}</td>
          <td>{{ row['留样数量'] }}</td>
          <td>{{ tierLabel(String(row['留样期限册'])) }}</td>
          <td>{{ row['到期日期'] || '长期' }}</td>
          <td>{{ conditionLabel(String(row['存放条件'])) }}（{{ row['登记温度'] }}℃ / {{ row['登记湿度'] }}%）</td>
          <td>{{ sourceLabel(String(row['登记入口'])) }}</td>
          <td>{{ row['经手人'] || '—' }}</td>
          <td>{{ row['质量部核准人'] || '—' }}</td>
          <td>{{ row['销毁日期'] || '—' }}</td>
          <td>
            <span :class="['status-pill', statusClass(String(row.status))]">{{ row.status }}</span>
          </td>
          <td class="row-actions">
            <template v-for="action in availableActions(String(row.status))" :key="action">
              <button class="link" type="button" @click="runAction(action, row)">{{ action }}</button>
            </template>
            <span v-if="!availableActions(String(row.status)).length" class="muted-text">已到终态</span>
            <span class="reject-hint" title="状态只能一节一节流转，跨级拒收">跨级动作已拒收</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无符合条件的留样记录，可先登记留样记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条留样记录 · 存放条件、期限分册、入口优先级均取自统一目录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-else-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
    </footer>

    <!-- 登记留样 -->
    <div v-if="createOpen" class="modal-mask" @click.self="createOpen = false">
      <div class="modal">
        <h3>登记留样记录</h3>
        <div class="form-grid">
          <label>
            <span>留样编号 *</span>
            <input v-model="draft.留样编号" placeholder="如 RETA-2609" />
          </label>
          <label>
            <span>对应批号 *</span>
            <input v-model="draft.对应批号" placeholder="如 P20260501" />
          </label>
          <label>
            <span>留样数量 *</span>
            <input v-model.number="draft.留样数量" type="number" min="1" />
          </label>
          <label>
            <span>留样期限（分册）*</span>
            <select v-model="draft.留样期限册">
              <option value="" disabled>请选择期限</option>
              <option v-for="tier in RETAIN_TIERS" :key="tier.key" :value="tier.key">{{ tier.label }}</option>
            </select>
          </label>
          <label>
            <span>到期日期（长期可不填）</span>
            <input v-model="draft.到期日期" type="date" :disabled="draft.留样期限册 === 'long'" />
          </label>
          <label>
            <span>取样日期</span>
            <input v-model="draft.取样日期" type="date" />
          </label>
          <label>
            <span>存放条件 *（各入口同一套目录）</span>
            <select v-model="draft.存放条件">
              <option value="" disabled>请选择存放条件</option>
              <option v-for="cond in STORAGE_CONDITIONS" :key="cond.key" :value="cond.key">
                {{ cond.label }}（{{ cond.note }}）
              </option>
            </select>
          </label>
          <label>
            <span>登记温度 ℃ *（越界挡回）</span>
            <input v-model.number="draft.登记温度" type="number" />
          </label>
          <label>
            <span>相对湿度 % *（超限挡回）</span>
            <input v-model.number="draft.登记湿度" type="number" />
          </label>
          <label>
            <span>登记入口 *（决定数量/期限撞车时的优先级）</span>
            <select v-model="draft.登记入口">
              <option value="" disabled>请选择入口</option>
              <option v-for="src in ENTRY_SOURCES" :key="src.key" :value="src.key">
                {{ src.label }}（优先级 {{ src.priority }}）
              </option>
            </select>
          </label>
        </div>
        <p class="field-hint">
          同编号留样在数量或期限上撞车时，按入口优先级（质量部 &gt; 库房 &gt; 车间）取高的一版；温湿度超出所选条件范围直接挡回。
        </p>
        <p v-if="createError" class="error-text">{{ createError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="createOpen = false">取消</button>
          <button class="btn primary" type="button" @click="submitCreate">提交登记</button>
        </div>
      </div>
    </div>

    <!-- 销毁签字 -->
    <div v-if="signOpen" class="modal-mask" @click.self="signOpen = false">
      <div class="modal modal-sm">
        <h3>{{ signAction }}</h3>
        <p class="field-hint">留样 {{ signRow?.['留样编号'] }}（批号 {{ signRow?.['对应批号'] }}），当前「{{ signRow?.status }}」</p>
        <label class="sign-field">
          <span>{{ signAction === '申请销毁' ? '经手人签字 *' : '质量部核准人签字 *' }}</span>
          <input v-model="signName" :placeholder="signAction === '申请销毁' ? '经手人手写签名后录入姓名' : '质量部核准人姓名'" />
        </label>
        <p v-if="signError" class="error-text">{{ signError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="signOpen = false">取消</button>
          <button class="btn primary" type="button" @click="confirmSign">确认提交</button>
        </div>
      </div>
    </div>

    <!-- 导出留痕 -->
    <div v-if="showBooks" class="modal-mask" @click.self="showBooks = false">
      <div class="modal">
        <h3>分册导出留痕</h3>
        <p class="field-hint">同一份留样重复导出只算一次：新下发只统计首次出现的留样，重复的记入重复数。</p>
        <table class="data-table">
          <thead>
            <tr><th>导出时间</th><th>包名</th><th>分册数</th><th>新下发留样</th><th>重复留样</th></tr>
          </thead>
          <tbody>
            <tr v-for="(book, idx) in exportBooks" :key="idx">
              <td>{{ formatTime(book.exportedAt) }}</td>
              <td>{{ book.filename }}</td>
              <td>{{ book.volumes }}</td>
              <td>{{ book.newSampleIds.length }}</td>
              <td>{{ book.knownSampleIds.length }}</td>
            </tr>
            <tr v-if="!exportBooks.length">
              <td colspan="5" class="empty-state">还没有导出记录</td>
            </tr>
          </tbody>
        </table>
        <div class="modal-actions">
          <button class="btn primary" type="button" @click="showBooks = false">关闭</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { listEntries } from '@/api/local-service'
import {
  exportRetainVolumes,
  listRetainExportBooks,
  registerRetain,
  retainStats,
  retainVolumes,
  runRetainAction,
} from '@/api/retain-service'
import {
  ENTRY_SOURCES,
  RETAIN_TIERS,
  STORAGE_CONDITIONS,
  entrySource,
  retainTier,
  storageCondition,
  todayText,
} from '@/data/retain-catalog'
import type { EntryRow, RetainDraft, RetainExportBook } from '@/data/types'
import { downloadBlob } from '@/utils/exporter'

const columns = [
  '留样编号',
  '对应批号',
  '留样数量',
  '留样期限',
  '到期日期',
  '存放条件',
  '登记入口',
  '经手人',
  '质量部核准人',
  '销毁日期',
]
const statuses = ['待留样', '已留样', '已到期', '待销毁', '已销毁']
// 状态一节一节流转，每行只给紧邻的下一节动作；其余动作按跨级拒收处理。
const NEXT_ACTION: Record<string, string> = {
  待留样: '登记留样',
  已留样: '标记到期',
  已到期: '申请销毁',
  待销毁: '质量部核准销毁',
}

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const stats = ref(retainStats())
const filters = reactive({ keyword: '', tier: '', condition: '', status: '' })

const statCards = computed(() => [
  { label: '待留样批次', value: stats.value.pending },
  { label: '已留样批次', value: stats.value.retained },
  { label: '待销毁批次', value: stats.value.awaitingDestroy },
  { label: '本月销毁数', value: stats.value.destroyedThisMonth },
  { label: '已下发留样数', value: stats.value.distributed },
])

const statusSummary = computed(() =>
  statuses.map((status) => ({ status, count: rows.value.filter((row) => row.status === status).length })),
)

function tierLabel(key: string): string {
  return retainTier(key)?.label.replace('留样期限：', '') ?? key
}
function conditionLabel(key: string): string {
  return storageCondition(key)?.label ?? key
}
function sourceLabel(key: string): string {
  return entrySource(key)?.label ?? key
}
function statusClass(status: string): string {
  return {
    待留样: 'pill-gray',
    已留样: 'pill-blue',
    已到期: 'pill-amber',
    待销毁: 'pill-orange',
    已销毁: 'pill-green',
  }[status] ?? 'pill-gray'
}
function availableActions(status: string): string[] {
  const action = NEXT_ACTION[status]
  return action ? [action] : []
}

function applyFilters(source: EntryRow[]): EntryRow[] {
  return source.filter((row) => {
    const keyword = filters.keyword.trim()
    if (
      keyword &&
      !String(row['留样编号'] ?? '').includes(keyword) &&
      !String(row['对应批号'] ?? '').includes(keyword)
    ) {
      return false
    }
    if (filters.tier && String(row['留样期限册']) !== filters.tier) return false
    if (filters.condition && String(row['存放条件']) !== filters.condition) return false
    if (filters.status && String(row.status) !== filters.status) return false
    return true
  })
}

function reload() {
  errorMessage.value = ''
  noticeMessage.value = ''
  const payload = listEntries('retainsample')
  rows.value = applyFilters(payload.items)
  total.value = rows.value.length
  stats.value = retainStats()
}

function resetFilters() {
  filters.keyword = ''
  filters.tier = ''
  filters.condition = ''
  filters.status = ''
  reload()
}

// ---- 登记 ----

const createOpen = ref(false)
const createError = ref('')
const emptyDraft = (): RetainDraft => ({
  留样编号: '',
  对应批号: '',
  留样数量: 0,
  留样期限册: '',
  到期日期: '',
  存放条件: '',
  登记温度: 20,
  登记湿度: 55,
  取样日期: todayText(),
  登记入口: '',
})
const draft = reactive<RetainDraft>(emptyDraft())

function openCreate() {
  createError.value = ''
  Object.assign(draft, emptyDraft())
  createOpen.value = true
}

function submitCreate() {
  createError.value = ''
  const result = registerRetain({ ...draft })
  if (!result.ok) {
    createError.value = result.message
    return
  }
  createOpen.value = false
  noticeMessage.value = result.message
  reload()
}

// ---- 销毁签字 ----

const signOpen = ref(false)
const signError = ref('')
const signAction = ref('')
const signName = ref('')
const signRow = ref<EntryRow | null>(null)

function runAction(action: string, row: EntryRow) {
  if (action === '申请销毁' || action === '质量部核准销毁') {
    signAction.value = action
    signRow.value = row
    signName.value = ''
    signError.value = ''
    signOpen.value = true
    return
  }
  finishAction(action, row, {})
}

function confirmSign() {
  if (!signRow.value) return
  const payload =
    signAction.value === '申请销毁' ? { 经手人: signName.value } : { 质量部核准人: signName.value }
  signOpen.value = false
  finishAction(signAction.value, signRow.value, payload)
}

function finishAction(action: string, row: EntryRow, payload: { 经手人?: string; 质量部核准人?: string }) {
  const result = runRetainAction(Number(row.id), action, payload)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  reload()
}

// ---- 分册导出 ----

const showBooks = ref(false)
const exportBooks = ref<RetainExportBook[]>([])

function exportVolumes() {
  // 导出前自检：每个期限分册要么有台账行，要么会落一页说明，绝不交空壳包。
  const volumes = retainVolumes()
  if (volumes.every((volume) => volume.rows.length === 0)) {
    errorMessage.value = '所有留样期限分册均无在册留样，无法下发台账'
    return
  }
  const result = exportRetainVolumes()
  downloadBlob(result.blob, result.filename)
  exportBooks.value = listRetainExportBooks()
  stats.value = retainStats()
  noticeMessage.value = `已生成 ${result.filename} 并开始下载，共 ${result.book.volumes} 册；本次新下发留样 ${result.book.sampleCount} 份${
    result.repeatedCount > 0 ? `，${result.repeatedCount} 份为重复导出只计一次` : ''
  }`
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

onMounted(() => {
  exportBooks.value = listRetainExportBooks()
  reload()
})
</script>
