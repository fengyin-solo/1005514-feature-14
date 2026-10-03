/**
 * 留样台账业务域：分册、销毁核准、优先级版本、存放条件校验、稳定性待办都在这里落规则。
 * 页面只渲染不判断；通用动作仍走 local-service 的 runAction，本文件只管留样专有逻辑。
 */
import { listRows, readAux, saveRows, writeAux } from '@/data/local-store'
import {
  RETAIN_PERIODS,
  STORAGE_CONDITION_BY_VALUE,
  storageConditionLabel,
} from '@/data/retain-catalog'
import type { EntryRow } from '@/data/types'
import { buildZip } from '@/api/zip'

const KEY = 'retainsample'
const STABILITY_KEY = 'stability'
const EXPORT_LOG_KEY = 'retain-export-log'

/** 进台账的在流状态：待留样还没入存、已销毁已经出库，都不再进下发册。 */
const LEDGER_ACTIVE_STATUS = new Set(['在存', '已到期', '待销毁核准', '待销毁'])

export type RetainDraft = {
  留样编号: string
  对应批号: string
  留样数量: number
  留样期限: string
  存放条件: string
  实测温度: number
  数据优先级: number
  登记来源: string
  取样日期: string
}

export type RetainVersion = {
  row: EntryRow
  /** 同编号多版里是否为生效版（优先级高者生效，平手取后登记的 id 大者） */
  winner: boolean
  /** 被谁压下（编号相同、优先级更高或平手但更新） */
  reasonSuppressed: string
}

export type LedgerVolume = {
  period: string
  filename: string
  content: string
  count: number
  empty: boolean
  rows: EntryRow[]
}

export type RetainExportResult = {
  ok: boolean
  message: string
  filename?: string
  bytes?: Uint8Array
  volumes?: LedgerVolume[]
  newCount?: number
  repeatCount?: number
  batch?: ExportBatch
}

export type ExportBatch = {
  batchNo: number
  exportedAt: string
  newCount: number
  repeatCount: number
  volumeCount: number
  sampleIds: number[]
  codes: string[]
  operator: string
}

export function listRetainRows(): EntryRow[] {
  return listRows(KEY)
}

/** 生效版判定：留样数量与留样期限撞上时，按数据优先级高的一版为准；平手取后登记（id 大）。 */
export function retainVersions(rows: EntryRow[] = listRows(KEY)): RetainVersion[] {
  const winnerId = new Map<string, number>()
  for (const row of rows) {
    const code = String(row['留样编号'] ?? '')
    const currentId = winnerId.get(code)
    if (currentId === undefined) {
      winnerId.set(code, Number(row.id))
      continue
    }
    const current = rows.find((item) => Number(item.id) === currentId) as EntryRow
    const incomingPriority = Number(row['数据优先级'] ?? 0)
    const currentPriority = Number(current['数据优先级'] ?? 0)
    if (incomingPriority > currentPriority || (incomingPriority === currentPriority && Number(row.id) > currentId)) {
      winnerId.set(code, Number(row.id))
    }
  }
  return rows.map((row) => {
    const code = String(row['留样编号'] ?? '')
    const winner = winnerId.get(code) === Number(row.id)
    let reasonSuppressed = ''
    if (!winner) {
      const winnerRow = rows.find((item) => Number(item.id) === winnerId.get(code))
      reasonSuppressed = `留样编号 ${code} 存在多版，已按数据优先级取 ${winnerRow?.['数据优先级']} 级版本为准`
    }
    return { row, winner, reasonSuppressed }
  })
}

/** 台账用行：只取生效版、且处于在流状态。 */
export function ledgerRows(rows: EntryRow[] = listRows(KEY)): EntryRow[] {
  return retainVersions(rows)
    .filter((item) => item.winner && LEDGER_ACTIVE_STATUS.has(String(item.row.status)))
    .map((item) => item.row)
}

function periodRank(period: string): number {
  const index = RETAIN_PERIODS.indexOf(period)
  return index < 0 ? RETAIN_PERIODS.length : index
}

/** 登记校验：存放条件必须在统一档案内，实测温度越界、留样数量超限一律挡回。 */
export function validateRetainDraft(draft: RetainDraft): { ok: boolean; message: string } {
  if (!draft.留样编号.trim()) {
    return { ok: false, message: '留样编号不能为空' }
  }
  if (!draft.对应批号.trim()) {
    return { ok: false, message: '对应批号不能为空' }
  }
  if (!Number.isFinite(draft.留样数量) || draft.留样数量 <= 0) {
    return { ok: false, message: '留样数量必须为大于 0 的数字' }
  }
  if (!RETAIN_PERIODS.includes(draft.留样期限)) {
    return { ok: false, message: `留样期限必须取统一册序之一：${RETAIN_PERIODS.join('、')}` }
  }
  const condition = STORAGE_CONDITION_BY_VALUE.get(draft.存放条件)
  if (!condition) {
    // 存放条件各入口同一套：不认识的条件直接挡回。
    return { ok: false, message: '存放条件不在统一档案内，已挡回' }
  }
  if (!Number.isFinite(draft.实测温度) || draft.实测温度 < condition.tempMin || draft.实测温度 > condition.tempMax) {
    return {
      ok: false,
      message: `实测温度 ${draft.实测温度}℃ 超出「${condition.label}」允许区间（${condition.tempMin}～${condition.tempMax}℃），已挡回`,
    }
  }
  if (draft.留样数量 > condition.quantityMax) {
    return {
      ok: false,
      message: `留样数量 ${draft.留样数量} 超过「${condition.label}」单份上限 ${condition.quantityMax}，已挡回`,
    }
  }
  if (!draft.取样日期.trim()) {
    return { ok: false, message: '取样日期不能为空' }
  }
  return { ok: true, message: '' }
}

function addMonths(dateText: string, months: number): string {
  const date = new Date(`${dateText}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  date.setMonth(date.getMonth() + months)
  date.setDate(date.getDate() - 1)
  return formatDate(date)
}

function periodMonths(period: string): number {
  if (period.endsWith('个月')) {
    return Number(period.replace('个月', ''))
  }
  if (period.endsWith('年')) {
    return Number(period.replace('年', '')) * 12
  }
  return 0
}

export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayText(): string {
  return formatDate(new Date())
}

/** 登记留样：校验通过后落库，期限按统一册序，到期日期由取样日期+期限自动推算。 */
export function registerRetain(draft: RetainDraft): { ok: boolean; message: string } {
  const check = validateRetainDraft(draft)
  if (!check.ok) {
    return check
  }
  const rows = listRows(KEY)
  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const row: EntryRow = {
    id: nextId,
    status: '在存',
    pending: true,
    abnormal: false,
    留样编号: draft.留样编号.trim(),
    对应批号: draft.对应批号.trim(),
    留样数量: draft.留样数量,
    留样期限: draft.留样期限,
    存放条件: draft.存放条件,
    实测温度: draft.实测温度,
    数据优先级: draft.数据优先级,
    登记来源: draft.登记来源,
    取样日期: draft.取样日期,
    到期日期: addMonths(draft.取样日期, periodMonths(draft.留样期限)),
  }
  saveRows(KEY, [...rows, row])
  return { ok: true, message: `留样 ${row.留样编号} 已登记入存，到期日期 ${row.到期日期}` }
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const VOLUME_COLUMNS = ['留样编号', '留样数量', '存放条件', '对应批号']

function buildVolume(period: string, rows: EntryRow[], exportedAt: string): LedgerVolume {
  const lines: string[] = []
  lines.push(`留样台账分册（${period}）`)
  lines.push(`留样期限：${period}`)
  lines.push(`发：库房、车间`)
  lines.push(`导出时间：${exportedAt}`)
  lines.push(`本册份数：${rows.length}`)
  lines.push('')
  const empty = rows.length === 0
  if (empty) {
    // 某期限为空：补一页说明，不交空壳包。
    lines.push(`说明：本期（留样期限 ${period}）当前无在存留样，本册无台账记录；本页为该期限的说明页。`)
  } else {
    lines.push(
      ['序号', ...VOLUME_COLUMNS, '存放条件温区', '留样期限', '当前状态'].map(csvCell).join(','),
    )
    const sorted = [...rows].sort((a, b) => String(a['留样编号']).localeCompare(String(b['留样编号'])))
    sorted.forEach((row, index) => {
      lines.push(
        [
          index + 1,
          ...VOLUME_COLUMNS.map((field) => row[field] ?? ''),
          storageConditionLabel(String(row['存放条件'] ?? '')),
          period,
          row.status,
        ]
          .map(csvCell)
          .join(','),
      )
    })
  }
  return {
    period,
    filename: `留样台账分册-${period}${empty ? '（说明页-本册为空）' : ''}.csv`,
    content: `﻿${lines.join('\n')}`,
    count: rows.length,
    empty,
    rows,
  }
}

/** 按留样期限分册：册序固定，每个期限一册，空期限补说明页；全部为空则整体拒绝。 */
export function buildRetainLedger(exportedAt: string = todayText()): { volumes: LedgerVolume[]; rows: EntryRow[] } {
  const rows = ledgerRows()
  if (rows.length === 0) {
    return { volumes: [], rows }
  }
  const volumes = RETAIN_PERIODS.map((period) =>
    buildVolume(
      period,
      rows.filter((row) => String(row['留样期限']) === period),
      exportedAt,
    ),
  ).sort((a, b) => periodRank(a.period) - periodRank(b.period))
  return { volumes, rows }
}

function readExportLog(): ExportBatch[] {
  return readAux<ExportBatch[]>(EXPORT_LOG_KEY, [])
}

/** 同一份留样重复导出只算一次：只有本批次首次出现的留样编号计入「已下发」。 */
export function exportRetainLedger(operator = '值班管理员'): RetainExportResult {
  const exportedAt = todayText()
  const { volumes, rows } = buildRetainLedger(exportedAt)
  if (volumes.length === 0) {
    // 不交空壳包：一份在存留样都没有，不允许导出。
    return { ok: false, message: '当前没有任何在存留样，导出会是空壳包，已拒绝下发' }
  }

  // 动态数据直接进打包器，生成一个含各期限分册的 ZIP，浏览器端可立刻下载下发。
  const entries = volumes.map((volume) => ({ filename: volume.filename, content: volume.content }))
  let bytes: Uint8Array
  try {
    bytes = buildZip(entries)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '分册打包失败' }
  }

  const history = readExportLog()
  const issuedCodes = new Set(history.flatMap((batch) => batch.codes))
  const currentCodes = rows.map((row) => String(row['留样编号']))
  const newCodes = new Set(currentCodes.filter((code) => !issuedCodes.has(code)))
  const repeatCodes = currentCodes.filter((code) => issuedCodes.has(code))
  const batch: ExportBatch = {
    batchNo: history.length + 1,
    exportedAt,
    newCount: newCodes.size,
    repeatCount: repeatCodes.length,
    volumeCount: volumes.length,
    sampleIds: rows.map((row) => Number(row.id)),
    codes: currentCodes,
    operator,
  }
  writeAux(EXPORT_LOG_KEY, [...history.slice(-19), batch])

  return {
    ok: true,
    message:
      repeatCodes.length > 0
        ? `分册已打包：${volumes.length} 册，新发 ${newCodes.size} 份；${repeatCodes.length} 份重复导出，不计入已下发`
        : `分册已打包：${volumes.length} 册，新发 ${newCodes.size} 份`,
    filename: `留样台账分册（发库房车间）-${exportedAt}.zip`,
    bytes,
    volumes,
    newCount: newCodes.size,
    repeatCount: repeatCodes.length,
    batch,
  }
}

export function retainExportLog(): ExportBatch[] {
  return readExportLog()
}

export type StabilityTodo = {
  batchNo: string
  condition: string
  retainCode: string
  period: string
  expiry: string
  linked: boolean
}

/** 状态反映到稳定性考察的待办：生效版在流留样按批号开待办；考察记录里已建批号视为已反映。 */
export function stabilityTodos(): StabilityTodo[] {
  const rows = ledgerRows()
  const linkedBatches = new Set(
    listRows(STABILITY_KEY).map((row) => String(row['考察批号'] ?? '')),
  )
  const byBatch = new Map<string, EntryRow>()
  for (const row of rows) {
    const batchNo = String(row['对应批号'] ?? '')
    if (!byBatch.has(batchNo)) {
      byBatch.set(batchNo, row)
    }
  }
  return [...byBatch.values()].map((row) => {
    const batchNo = String(row['对应批号'])
    return {
      batchNo,
      condition: storageConditionLabel(String(row['存放条件'] ?? '')),
      retainCode: String(row['留样编号']),
      period: String(row['留样期限']),
      expiry: String(row['到期日期'] ?? ''),
      linked: linkedBatches.has(batchNo),
    }
  })
}

/** 把一条留样待办正式建成稳定性考察记录（0 月起始），建过的批号不重复建。 */
export function createStabilityFromRetain(batchNo: string, operator = '值班管理员'): { ok: boolean; message: string } {
  const todo = stabilityTodos().find((item) => item.batchNo === batchNo)
  if (!todo) {
    return { ok: false, message: `批号 ${batchNo} 没有可反映的留样待办` }
  }
  const rows = listRows(STABILITY_KEY)
  if (rows.some((row) => String(row['考察批号']) === batchNo)) {
    return { ok: false, message: `批号 ${batchNo} 的稳定性考察已建立，无需重复反映` }
  }
  const conditionValue = [...STORAGE_CONDITION_BY_VALUE.values()].find(
    (item) => item.label === todo.condition,
  )?.value
  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const number = String(nextId).padStart(4, '0')
  const row: EntryRow = {
    id: nextId,
    status: '待考察',
    pending: true,
    abnormal: false,
    考察编号: `STAB-${number}`,
    考察批号: batchNo,
    考察条件: conditionValue ?? todo.condition,
    考察时间点: '0月',
    检验项目: '性状、含量、有关物质',
    考察结果: '',
    考察人: operator,
    考察状态: '待考察',
  }
  saveRows(STABILITY_KEY, [...rows, row])
  return { ok: true, message: `留样状态已反映：已为批号 ${batchNo} 建立稳定性考察 ${row.考察编号}` }
}
