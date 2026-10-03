import type { EntryRow } from './types'

// 留样管理的共享口径：存放条件、留样期限分册、登记入口都集中在这里，
// 页面登记、批量导出、状态流转看到的是同一套，不允许各入口各写一份。

export type StorageCondition = {
  key: string
  label: string
  /** 允许温度区间（℃），登记温度越界直接挡回 */
  tempMin: number
  tempMax: number
  /** 允许相对湿度上限（%） */
  humidityMax: number
  note: string
}

export type RetainTier = {
  key: string
  /** 册名上标的留样期限 */
  label: string
  /** 导出分册文件名里的排序 */
  order: number
}

export type EntrySource = {
  key: string
  label: string
  /** 留样数量与留样期限撞车时，优先级高的入口登记版本为准 */
  priority: number
}

export const STORAGE_CONDITIONS: StorageCondition[] = [
  { key: '常温', label: '常温保存', tempMin: 0, tempMax: 30, humidityMax: 75, note: '0～30℃，相对湿度≤75%' },
  { key: '阴凉', label: '阴凉处保存', tempMin: 0, tempMax: 20, humidityMax: 75, note: '≤20℃，相对湿度≤75%' },
  { key: '冷藏', label: '冷藏保存', tempMin: 2, tempMax: 8, humidityMax: 75, note: '2～8℃，相对湿度≤75%' },
  { key: '冷冻', label: '冷冻保存', tempMin: -20, tempMax: -10, humidityMax: 0, note: '-20～-10℃' },
]

export const RETAIN_TIERS: RetainTier[] = [
  { key: 'm6', label: '留样期限：6个月', order: 1 },
  { key: 'y1', label: '留样期限：1年', order: 2 },
  { key: 'y2', label: '留样期限：2年', order: 3 },
  { key: 'y3', label: '留样期限：3年', order: 4 },
  { key: 'expiry1y', label: '留样期限：有效期后1年', order: 5 },
  { key: 'long', label: '留样期限：长期', order: 6 },
]

export const ENTRY_SOURCES: EntrySource[] = [
  { key: 'workshop', label: '车间登记', priority: 1 },
  { key: 'warehouse', label: '库房登记', priority: 2 },
  { key: 'qa', label: '质量部核准登记', priority: 3 },
]

export function storageCondition(key: string): StorageCondition | undefined {
  return STORAGE_CONDITIONS.find((item) => item.key === key)
}

export function retainTier(key: string): RetainTier | undefined {
  return RETAIN_TIERS.find((item) => item.key === key)
}

export function entrySource(key: string): EntrySource | undefined {
  return ENTRY_SOURCES.find((item) => item.key === key)
}

/** 留样数量与留样期限撞车时的比较口径：入口优先级高的版本胜出，平级时后登记的覆盖。 */
export function hasHigherPriority(incoming: EntryRow, existing: EntryRow): boolean {
  const incomingPriority = entrySource(String(incoming['登记入口'] ?? ''))?.priority ?? 0
  const existingPriority = entrySource(String(existing['登记入口'] ?? ''))?.priority ?? 0
  if (incomingPriority !== existingPriority) {
    return incomingPriority > existingPriority
  }
  return Number(incoming.id) > Number(existing.id)
}

export type StorageCheck = { ok: boolean; message: string }

// 存放条件越界或超限的挡回：必须在统一目录里，温度湿度还得落在该条件允许的区间内。
export function checkStorage(conditionKey: string, temperature: number, humidity: number): StorageCheck {
  const condition = storageCondition(conditionKey)
  if (!condition) {
    return { ok: false, message: `存放条件「${conditionKey}」不在统一目录里，请从标准存放条件中选择` }
  }
  if (Number.isNaN(temperature) || temperature < condition.tempMin || temperature > condition.tempMax) {
    return {
      ok: false,
      message: `登记温度 ${temperature}℃ 超出「${condition.label}」允许范围（${condition.note}），已挡回`,
    }
  }
  if (condition.humidityMax > 0 && (Number.isNaN(humidity) || humidity < 0 || humidity > condition.humidityMax)) {
    return {
      ok: false,
      message: `登记相对湿度 ${humidity}% 超出「${condition.label}」允许上限 ${condition.humidityMax}%，已挡回`,
    }
  }
  return { ok: true, message: '' }
}

export function todayText(): string {
  return new Date().toISOString().slice(0, 10)
}
