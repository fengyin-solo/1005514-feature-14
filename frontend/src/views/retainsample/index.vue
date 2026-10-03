<template>
  <section class="page" data-module="retainsample">
    <header class="page-head">
      <div>
        <h2>留样台账（按期限分册）</h2>
        <p class="page-desc">
          台账按留样期限分册发库房、车间两处，每册写明留样编号、留样数量、存放条件与对应批号；
          销毁前经质量部核准、经手人签字，状态一节一节流转，跨级拒收。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openRegister">登记留样</button>
        <button class="btn" type="button" @click="openExport">按期限分册导出</button>
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

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>留样编号 / 批号</span>
        <input v-model="keyword" placeholder="按留样编号或对应批号检索" />
      </label>
      <label class="filter-item">
        <span>留样期限</span>
        <select v-model="periodFilter">
          <option value="">全部期限</option>
          <option v-for="period in periods" :key="period" :value="period">{{ period }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>存放条件</span>
        <select v-model="conditionFilter">
          <option value="">全部条件</option>
          <option v-for="cond in conditions" :key="cond.value" :value="cond.value">{{ cond.label }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>登记来源</span>
        <select v-model="sourceFilter">
          <option value="">全部来源</option>
          <option v-for="src in sources" :key="src" :value="src">{{ src }}</option>
        </select>
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>留样编号</th>
          <th>对应批号</th>
          <th>留样数量</th>
          <th>留样期限</th>
          <th>存放条件</th>
          <th>实测温度</th>
          <th>优先级</th>
          <th>来源</th>
          <th>取样日期</th>
          <th>到期日期</th>
          <th>当前状态</th>
          <th>办理</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in filteredVersions" :key="String(item.row.id)" :class="{ 'row-muted': !item.winner }">
          <td>
            {{ item.row['留样编号'] }}
            <span v-if="!item.winner" class="tag tag-warn" :title="item.reasonSuppressed">旧版</span>
            <span v-else class="tag tag-ok">生效版</span>
          </td>
          <td>{{ item.row['对应批号'] }}</td>
          <td>{{ item.row['留样数量'] }}</td>
          <td>{{ item.row['留样期限'] }}</td>
          <td>{{ conditionLabel(String(item.row['存放条件'])) }}</td>
          <td>{{ item.row['实测温度'] }}℃</td>
          <td>{{ item.row['数据优先级'] }}</td>
          <td>{{ item.row['登记来源'] }}</td>
          <td>{{ item.row['取样日期'] }}</td>
          <td>{{ item.row['到期日期'] }}</td>
          <td>
            {{ item.row.status }}
            <div v-if="item.row.status === '待销毁' && item.row['质量部核准人']" class="cell-sub">
              核准：{{ item.row['质量部核准人'] }}
            </div>
            <div v-if="item.row.status === '已销毁'" class="cell-sub">
              签字：{{ item.row['销毁经手人'] }} · {{ item.row['销毁日期'] }}
            </div>
          </td>
          <td class="row-actions">
            <button
              v-for="action in allowedActions(item.row.status)"
              :key="action"
              class="link"
              type="button"
              @click="openFlow(action, item.row)"
            >
              {{ action }}
            </button>
            <span v-if="allowedActions(item.row.status).length === 0" class="cell-sub">—</span>
          </td>
        </tr>
        <tr v-if="!filteredVersions.length">
          <td colspan="12" class="empty-state">暂无符合条件的留样记录，可先登记留样</td>
        </tr>
      </tbody>
    </table>

    <p class="rule-note">
      规则：同一留样编号多版时以数据优先级高的一版为准（台账、分册与稳定性待办均取生效版）；
      待留样未入存、已销毁已出库的不进下发册。
    </p>

    <footer class="page-foot">
      <span>共 {{ versions.length }} 条版本记录（生效版 {{ winnerCount }} 条）</span>
      <span>
        <button class="btn ghost" type="button" @click="resetData">恢复示例数据</button>
        <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
      </span>
    </footer>

    <!-- 登记留样 -->
    <div v-if="registerOpen" class="modal-mask" @click.self="registerOpen = false">
      <div class="modal">
        <h3>登记留样</h3>
        <p class="modal-sub">存放条件取自统一档案；温度越界或数量超限将被挡回。</p>
        <div class="form-grid">
          <label><span>留样编号 *</span><input v-model="form.留样编号" placeholder="如 RETA-0010" /></label>
          <label><span>对应批号 *</span><input v-model="form.对应批号" placeholder="如 P20261001" /></label>
          <label><span>留样数量 *</span><input v-model.number="form.留样数量" type="number" min="1" /></label>
          <label>
            <span>留样期限 *</span>
            <select v-model="form.留样期限">
              <option value="" disabled>请选择</option>
              <option v-for="period in periods" :key="period" :value="period">{{ period }}</option>
            </select>
          </label>
          <label>
            <span>存放条件 *</span>
            <select v-model="form.存放条件">
              <option value="" disabled>请选择</option>
              <option v-for="cond in conditions" :key="cond.value" :value="cond.value">{{ cond.label }}</option>
            </select>
          </label>
          <label>
            <span>实测温度(℃) *</span>
            <input v-model.number="form.实测温度" type="number" />
            <small v-if="selectedCondition">允许 {{ selectedCondition.tempMin }}～{{ selectedCondition.tempMax }}℃，数量 ≤ {{ selectedCondition.quantityMax }}</small>
          </label>
          <label>
            <span>数据优先级 *</span>
            <input v-model.number="form.数据优先级" type="number" min="1" max="9" />
            <small>同编号多版时数字大者生效</small>
          </label>
          <label>
            <span>登记来源 *</span>
            <select v-model="form.登记来源">
              <option v-for="src in sources" :key="src" :value="src">{{ src }}</option>
            </select>
          </label>
          <label><span>取样日期 *</span><input v-model="form.取样日期" type="date" /></label>
        </div>
        <p v-if="registerError" class="error-text">{{ registerError }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="registerOpen = false">取消</button>
          <button class="btn primary" type="button" @click="submitRegister">登记入存</button>
        </div>
      </div>
    </div>

    <!-- 核准 / 签字 -->
    <div v-if="flow.open" class="modal-mask" @click.self="flow.open = false">
      <div class="modal">
        <h3>{{ flow.action }} · {{ flow.row?.['留样编号'] }}</h3>
        <p class="modal-sub">
          当前状态「{{ flow.row?.status }}」→「{{ targetStatus(flow.action) }}」，只允许一节一节流转。
        </p>
        <div class="form-grid">
          <template v-for="input in flowInputs(flow.action)" :key="input.field">
            <label v-if="input.defaultToday">
              <span>{{ input.label }}</span>
              <input v-model="flow.params[input.field]" type="date" />
            </label>
            <label v-else>
              <span>{{ input.label }} *</span>
              <input v-model="flow.params[input.field]" :placeholder="`请填写${input.label}`" />
            </label>
          </template>
          <p v-if="!flowInputs(flow.action).length" class="modal-sub">该步骤无需补充签字信息，确认后直接流转。</p>
        </div>
        <p v-if="flow.error" class="error-text">{{ flow.error }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="flow.open = false">取消</button>
          <button class="btn primary" type="button" @click="submitFlow">确认办理</button>
        </div>
      </div>
    </div>

    <!-- 分册导出 -->
    <div v-if="exportOpen" class="modal-mask" @click.self="exportOpen = false">
      <div class="modal modal-wide">
        <h3>留样台账按期限分册导出</h3>
        <p class="modal-sub">
          固定 {{ periods.length }} 个期限各成一册（册名标期限），空期限补说明页；合成一个 ZIP 发库房、车间，不产出空壳包。
        </p>
        <table class="data-table">
          <thead>
            <tr><th>册名（留样期限）</th><th>份数</th><th>内容</th></tr>
          </thead>
          <tbody>
            <tr v-for="volume in previewVolumes" :key="volume.period">
              <td>{{ volume.filename }}</td>
              <td>{{ volume.count }}</td>
              <td>{{ volume.empty ? '空册：已补说明页' : '留样编号、留样数量、存放条件、对应批号' }}</td>
            </tr>
            <tr v-if="!previewVolumes.length">
              <td colspan="3" class="empty-state">没有任何在存留样，无法导出（拒绝空壳包）</td>
            </tr>
          </tbody>
        </table>
        <p v-if="exportMessage" :class="exportOk ? 'ok-text' : 'error-text'">{{ exportMessage }}</p>

        <h4 class="block-title">已下发批次（同一份留样重复导出只算一次）</h4>
        <table v-if="exportLog.length" class="data-table">
          <thead>
            <tr><th>批次</th><th>导出日期</th><th>册数</th><th>新发</th><th>重复(不计)</th><th>操作人</th></tr>
          </thead>
          <tbody>
            <tr v-for="batch in [...exportLog].reverse()" :key="batch.batchNo">
              <td>第 {{ batch.batchNo }} 批</td>
              <td>{{ batch.exportedAt }}</td>
              <td>{{ batch.volumeCount }}</td>
              <td>{{ batch.newCount }}</td>
              <td>{{ batch.repeatCount }}</td>
              <td>{{ batch.operator }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="modal-sub">尚未下发过。</p>

        <div class="modal-actions">
          <button class="btn" type="button" @click="exportOpen = false">关闭</button>
          <button class="btn primary" type="button" :disabled="!previewVolumes.length" @click="submitExport">
            打包并立即下载
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { downloadBytes, listEntries, moduleMeta, resetModule, runAction as applyAction } from '@/api/local-service'
import {
  buildRetainLedger,
  exportRetainLedger,
  registerRetain,
  retainExportLog,
  retainVersions,
  type RetainDraft,
  type RetainVersion,
} from '@/api/retain'
import { RETAIN_PERIODS, RETAIN_SOURCES, STORAGE_CONDITIONS, storageConditionLabel } from '@/data/retain-catalog'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('retainsample')
const store = useSessionStore()
const periods = RETAIN_PERIODS
const sources = RETAIN_SOURCES
const conditions = STORAGE_CONDITIONS
const conditionLabel = storageConditionLabel

const keyword = ref('')
const periodFilter = ref('')
const conditionFilter = ref('')
const sourceFilter = ref('')
const message = ref('')
const messageOk = ref(false)

const versions = ref<RetainVersion[]>([])
const winnerCount = computed(() => versions.value.filter((item) => item.winner).length)

const filteredVersions = computed(() => {
  const key = keyword.value.trim()
  return versions.value.filter((item) => {
    const row = item.row
    if (key && !String(row['留样编号']).includes(key) && !String(row['对应批号']).includes(key)) {
      return false
    }
    if (periodFilter.value && String(row['留样期限']) !== periodFilter.value) {
      return false
    }
    if (conditionFilter.value && String(row['存放条件']) !== conditionFilter.value) {
      return false
    }
    if (sourceFilter.value && String(row['登记来源']) !== sourceFilter.value) {
      return false
    }
    return true
  })
})

const stats = computed(() => {
  const winners = versions.value.filter((item) => item.winner).map((item) => item.row)
  const inStock = winners.filter((row) => ['在存', '已到期'].includes(String(row.status))).length
  const pendingDestroy = winners.filter((row) => ['待销毁核准', '待销毁'].includes(String(row.status))).length
  const destroyed = winners.filter((row) => String(row.status) === '已销毁').length
  const issuedTotal = exportLog.value.reduce((sum, batch) => sum + batch.newCount, 0)
  return [
    { label: '在存留样（生效版）', value: inStock },
    { label: '待销毁核准/执行', value: pendingDestroy },
    { label: '累计已下发份数', value: issuedTotal },
    { label: '已销毁份数', value: destroyed },
  ]
})

const statusSummary = computed(() =>
  meta.statuses.map((status) => ({
    status,
    count: versions.value.filter((item) => String(item.row.status) === status).length,
  })),
)

function allowedActions(status: string): string[] {
  return meta.actions.filter((action) => (meta.flowFrom?.[action] ?? []).includes(status))
}

function targetStatus(action: string): string {
  return meta.actionTargets[action] ?? ''
}

function flowInputs(action: string) {
  return meta.actionInputs?.[action] ?? []
}

function reload() {
  message.value = ''
  // 触发一次读取，保持与通用列表口径一致；台账版本判断走领域服务。
  listEntries(meta.key)
  versions.value = retainVersions()
}

function resetFilters() {
  keyword.value = ''
  periodFilter.value = ''
  conditionFilter.value = ''
  sourceFilter.value = ''
}

function flash(text: string, ok = false) {
  message.value = text
  messageOk.value = ok
}

function resetData() {
  resetModule(meta.key)
  reload()
  loadExportLog()
  flash('已恢复为示例留样数据，导出批次记录已清空', true)
}

// 登记留样
const registerOpen = ref(false)
const registerError = ref('')
const emptyDraft = (): RetainDraft => ({
  留样编号: '',
  对应批号: '',
  留样数量: 1,
  留样期限: '',
  存放条件: '',
  实测温度: 20,
  数据优先级: 1,
  登记来源: '库房',
  取样日期: '',
})
const form = reactive<RetainDraft>(emptyDraft())
const selectedCondition = computed(() => STORAGE_CONDITIONS.find((cond) => cond.value === form.存放条件))

function openRegister() {
  Object.assign(form, emptyDraft())
  registerError.value = ''
  registerOpen.value = true
}

function submitRegister() {
  const result = registerRetain({ ...form })
  if (!result.ok) {
    registerError.value = result.message
    return
  }
  registerOpen.value = false
  reload()
  flash(result.message, true)
}

// 状态流转（核准 / 签字）
const flow = reactive<{ open: boolean; action: string; row: EntryRow | null; params: Record<string, string>; error: string }>({
  open: false,
  action: '',
  row: null,
  params: {},
  error: '',
})

function openFlow(action: string, row: EntryRow) {
  flow.open = true
  flow.action = action
  flow.row = row
  flow.error = ''
  flow.params = {}
}

function submitFlow() {
  if (!flow.row) {
    return
  }
  const result = applyAction(meta.key, Number(flow.row.id), flow.action, flow.params)
  if (!result.ok) {
    flow.error = result.message
    return
  }
  flow.open = false
  reload()
  flash(result.message, true)
}

// 分册导出
const exportOpen = ref(false)
const exportMessage = ref('')
const exportOk = ref(false)
const previewVolumes = ref<ReturnType<typeof buildRetainLedger>['volumes']>([])
const exportLog = ref(retainExportLog())

function loadExportLog() {
  exportLog.value = retainExportLog()
}

function openExport() {
  const { volumes } = buildRetainLedger()
  previewVolumes.value = volumes
  loadExportLog()
  exportMessage.value = ''
  exportOpen.value = true
}

function submitExport() {
  const result = exportRetainLedger(store.operator)
  exportOk.value = result.ok
  exportMessage.value = result.message
  if (!result.ok || !result.bytes || !result.filename) {
    return
  }
  downloadBytes(result.filename, result.bytes)
  loadExportLog()
  const { volumes } = buildRetainLedger()
  previewVolumes.value = volumes
}

onMounted(reload)
</script>
