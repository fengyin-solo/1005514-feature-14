/**
 * 留样基础档案：存放条件与留样期限的唯一一套口径。
 * 登记入口、台账分册、稳定性考察各入口都从这里取，不允许页面自己另写一份。
 */

export type StorageCondition = {
  /** 落库与各入口统一使用的取值 */
  value: string
  /** 展示用说明 */
  label: string
  /** 允许温度区间（℃），登记实测温度越界即挡回 */
  tempMin: number
  tempMax: number
  /** 单份留样数量上限，超限即挡回 */
  quantityMax: number
}

// 同一套存放条件：库房、车间、留样登记、稳定性考察看到的都是这一份。
export const STORAGE_CONDITIONS: StorageCondition[] = [
  { value: '常温', label: '常温（10～30℃）', tempMin: 10, tempMax: 30, quantityMax: 500 },
  { value: '阴凉', label: '阴凉（≤20℃）', tempMin: 0, tempMax: 20, quantityMax: 500 },
  { value: '冷藏', label: '冷藏（2～8℃）', tempMin: 2, tempMax: 8, quantityMax: 300 },
  { value: '冷冻', label: '冷冻（-20～-10℃）', tempMin: -20, tempMax: -10, quantityMax: 200 },
]

export const STORAGE_CONDITION_BY_VALUE: Map<string, StorageCondition> = new Map(
  STORAGE_CONDITIONS.map((item) => [item.value, item]),
)

/** 留样期限分册的固定册序：每期限一册，空册补说明页，不靠数据里出现过哪些期限来定。 */
export const RETAIN_PERIODS: string[] = ['6个月', '1年', '2年', '3年', '5年']

/** 登记来源（发往库房 / 车间两处） */
export const RETAIN_SOURCES: string[] = ['库房', '车间']

export function storageConditionLabel(value: string): string {
  return STORAGE_CONDITION_BY_VALUE.get(value)?.label ?? value
}
