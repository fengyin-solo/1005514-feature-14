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
  /** 开启后状态只能一节一节往下走，跨级动作一律拒收（留样管理用）。 */
  strictFlow?: boolean
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
  /** 驳回/拒收时带上原因归类，页面可据此高亮。 */
  rejected?: boolean
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

/** 留样登记草稿：页面表单提交给本地服务，业务校验（越界、冲突）统一在服务里做。 */
export type RetainDraft = {
  留样编号: string
  对应批号: string
  留样数量: number
  留样期限册: string
  到期日期: string
  存放条件: string
  登记温度: number
  登记湿度: number
  取样日期: string
  登记入口: string
}

export type RetainActionPayload = {
  经手人?: string
  质量部核准人?: string
}

/** 留样状态反映到稳定性考察的待办。 */
export type StabilityTodo = {
  留样编号: string
  对应批号: string
  留样期限册: string
  存放条件: string
  留样状态: string
  待办: string
  到期日期: string
}

/** 分册导出留痕：同一份留样重复导出只算一次。 */
export type RetainExportBook = {
  exportedAt: string
  filename: string
  volumes: number
  sampleCount: number
  newSampleIds: number[]
  knownSampleIds: number[]
}
