/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
  /**
   * 动作的允许来源状态：一节一节流转用。
   * 只登记允许的来源，没登记的状态发起该动作一律按跨级拒收。
   * 不声明 flowFrom 的老模块沿用原来的目标态校验。
   */
  flowFrom?: Record<string, string[]>
  /**
   * 动作除了点按钮还要补的参数（核准人、签字人等），页面据此弹录入框，服务层据此挡回空值。
   */
  actionInputs?: Record<string, ActionInput[]>
}

export type ActionInput = {
  field: string
  label: string
  required?: boolean
  /** date 类型留空时由服务层自动补当天日期，不算缺填 */
  defaultToday?: boolean
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
