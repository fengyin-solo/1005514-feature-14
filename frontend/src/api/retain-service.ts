import {
  checkStorage,
  entrySource,
  hasHigherPriority,
  retainTier,
  RETAIN_TIERS,
  todayText,
} from '@/data/retain-catalog'
import { listRows, saveRows } from '@/data/local-store'
import {
  knownExportedSampleIds,
  recordRetainExport,
  retainExportBooks,
} from '@/data/retain-store'
import type {
  ActionResult,
  EntryRow,
  RetainActionPayload,
  RetainDraft,
  RetainExportBook,
  StabilityTodo,
} from '@/data/types'
import { buildZip, toCsv, type ZipEntry } from '@/utils/exporter'

const MODULE_KEY = 'retainsample'

export function retainRows(): EntryRow[] {
  return listRows(MODULE_KEY)
}

function nextRetainId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
}

export type RetainStats = {
  pending: number
  retained: number
  awaitingDestroy: number
  destroyedThisMonth: number
  distributed: number
}

export function retainStats(): RetainStats {
  const rows = retainRows()
  const monthPrefix = todayText().slice(0, 7)
  const known = knownExportedSampleIds()
  return {
    pending: rows.filter((row) => row.status === '待留样').length,
    retained: rows.filter((row) => row.status === '已留样' || row.status === '已到期').length,
    awaitingDestroy: rows.filter((row) => row.status === '待销毁').length,
    destroyedThisMonth: rows.filter(
      (row) => row.status === '已销毁' && String(row['销毁日期'] ?? '').startsWith(monthPrefix),
    ).length,
    distributed: rows.filter((row) => known.has(Number(row.id))).length,
  }
}

/** 登记留样：统一校验存放条件与温湿度边界；编号撞车按入口优先级定胜负。 */
export function registerRetain(draft: RetainDraft): ActionResult {
  const code = draft.留样编号.trim()
  const batchNo = draft.对应批号.trim()
  if (!code || !batchNo) {
    return { ok: false, rejected: true, message: '留样编号与对应批号必须填写' }
  }
  const quantity = Number(draft.留样数量)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, rejected: true, message: '留样数量必须是大于 0 的数字' }
  }
  if (!retainTier(draft.留样期限册)) {
    return { ok: false, rejected: true, message: '留样期限必须从标准分册期限中选择' }
  }
  const tier = retainTier(draft.留样期限册)!
  // 长期留样无固定到期日，其余期限必须写明到期日期
  if (tier.key !== 'long' && !draft.到期日期) {
    return { ok: false, rejected: true, message: `「${tier.label}」必须填写到期日期` }
  }
  if (!entrySource(draft.登记入口)) {
    return { ok: false, rejected: true, message: '登记入口不在允许范围' }
  }
  const storage = checkStorage(draft.存放条件, Number(draft.登记温度), Number(draft.登记湿度))
  if (!storage.ok) {
    return { ok: false, rejected: true, message: storage.message }
  }

  const rows = retainRows()
  const incoming: EntryRow = {
    id: nextRetainId(rows),
    status: '已留样',
    pending: true,
    abnormal: false,
    留样编号: code,
    对应批号: batchNo,
    留样数量: quantity,
    留样期限册: draft.留样期限册,
    到期日期: tier.key === 'long' ? '' : draft.到期日期,
    存放条件: draft.存放条件,
    登记温度: Number(draft.登记温度),
    登记湿度: Number(draft.登记湿度),
    取样日期: draft.取样日期 || todayText(),
    登记入口: draft.登记入口,
    销毁申请日期: '',
    经手人: '',
    质量部核准人: '',
    销毁日期: '',
  }

  const duplicateIndex = rows.findIndex((row) => String(row['留样编号']) === code)
  if (duplicateIndex >= 0) {
    const existing = rows[duplicateIndex]
    const quantityChanged = Number(existing['留样数量']) !== quantity
    const tierChanged = String(existing['留样期限册']) !== draft.留样期限册
    if (quantityChanged || tierChanged) {
      // 留样数量与留样期限撞上时按优先级高的那一版为准
      if (!hasHigherPriority({ ...incoming, id: Number(existing.id) + 0.5 }, existing)) {
        const owner = entrySource(String(existing['登记入口'] ?? ''))?.label ?? '其他入口'
        return {
          ok: false,
          rejected: true,
          message: `留样编号 ${code} 已由${owner}登记且版本优先级更高，本次数量/期限冲突，按高优先级版本为准，登记挡回`,
        }
      }
      const next = [...rows]
      next[duplicateIndex] = {
        ...existing,
        留样数量: quantity,
        留样期限册: draft.留样期限册,
        到期日期: incoming.到期日期,
        存放条件: draft.存放条件,
        登记温度: incoming.登记温度,
        登记湿度: incoming.登记湿度,
        登记入口: draft.登记入口,
        对应批号: batchNo,
        取样日期: incoming.取样日期,
      }
      saveRows(MODULE_KEY, next)
      return {
        ok: true,
        message: `留样编号 ${code} 与既有登记在数量/期限上撞车，本入口优先级更高，已按本版为准覆盖`,
      }
    }
    return { ok: false, rejected: true, message: `留样编号 ${code} 已登记，内容一致，无需重复登记` }
  }

  saveRows(MODULE_KEY, [...rows, incoming])
  return { ok: true, message: `留样 ${code} 已登记，归入「${tier.label}」分册` }
}

const PREDECESSOR: Record<string, string> = {
  登记留样: '待留样',
  标记到期: '已留样',
  申请销毁: '已到期',
  质量部核准销毁: '待销毁',
}

/** 留样动作：状态一节一节流转，跨级拒收；销毁需经手人签字，核准需质量部签字。 */
export function runRetainAction(
  id: number,
  action: string,
  payload: RetainActionPayload = {},
): ActionResult {
  const rows = retainRows()
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, rejected: true, message: `没有找到编号为 ${id} 的留样记录` }
  }
  const required = PREDECESSOR[action]
  if (!required) {
    return { ok: false, rejected: true, message: `留样记录没有登记「${action}」这个动作` }
  }
  const row = rows[index]
  const current = String(row.status)
  if (current !== required) {
    return {
      ok: false,
      rejected: true,
      message: `留样 ${row['留样编号']} 当前为「${current}」，须先到「${required}」才能${action}；状态只能一节一节流转，跨级拒收`,
    }
  }

  const updated: EntryRow = { ...row }
  if (action === '登记留样') {
    updated.status = '已留样'
    updated.pending = true
  } else if (action === '标记到期') {
    updated.status = '已到期'
    updated.pending = true
  } else if (action === '申请销毁') {
    const handler = (payload.经手人 ?? '').trim()
    if (!handler) {
      return { ok: false, rejected: true, message: '申请销毁必须由经手人签字后才能提交' }
    }
    updated.status = '待销毁'
    updated.pending = true
    updated.销毁申请日期 = todayText()
    updated.经手人 = handler
  } else {
    const approver = (payload.质量部核准人 ?? '').trim()
    if (!approver) {
      return { ok: false, rejected: true, message: '销毁前必须经质量部核准并签字，未签字不予销毁' }
    }
    updated.status = '已销毁'
    updated.pending = false
    updated.质量部核准人 = approver
    updated.销毁日期 = todayText()
  }

  const next = [...rows]
  next[index] = updated
  saveRows(MODULE_KEY, next)
  return { ok: true, message: `留样 ${updated['留样编号']} 已${action}，当前状态「${updated.status}」` }
}

const VOLUME_HEADERS = ['留样编号', '留样数量', '存放条件', '对应批号']

function tierLabelToFilename(label: string): string {
  return label.replace(/[：:]/g, '')
}

export type RetainVolume = {
  tierKey: string
  tierLabel: string
  rows: EntryRow[]
}

export function retainVolumes(): RetainVolume[] {
  const rows = retainRows()
  return RETAIN_TIERS.map((tier) => ({
    tierKey: tier.key,
    tierLabel: tier.label,
    rows: rows.filter((row) => String(row['留样期限册']) === tier.key),
  }))
}

function conditionNote(row: EntryRow): string {
  return `${row['存放条件']}（${row['登记温度']}℃ / 湿度${row['登记湿度']}%）`
}

export type RetainExportResult = {
  filename: string
  blob: Blob
  book: RetainExportBook
  repeatedCount: number
}

/**
 * 按留样期限分册打包：每册只写留样编号、留样数量、存放条件、对应批号；
 * 某期限一册为空时补一页说明，不交空壳包；同一份留样重复导出只算一次。
 */
export function exportRetainVolumes(): RetainExportResult {
  const volumes = retainVolumes()
  const stamp = todayText()
  const entries: ZipEntry[] = []
  const exportedIds: number[] = []

  volumes.forEach((volume, index) => {
    const seq = String(index + 1).padStart(2, '0')
    const name = `${seq}-${tierLabelToFilename(volume.tierLabel)}.csv`
    if (volume.rows.length === 0) {
      const content = toCsv(
        ['分册说明'],
        [
          [`本册名称：${volume.tierLabel}`],
          ['本册情况：本留样期限下当前没有在册留样，故无台账行（此页为说明页，非空册）。'],
          [`生成日期：${stamp}`],
          ['下发对象：库房、车间'],
        ],
      )
      entries.push({ filename: name, content })
      return
    }
    const content = toCsv(
      VOLUME_HEADERS,
      volume.rows.map((row) => {
        exportedIds.push(Number(row.id))
        return [row['留样编号'], row['留样数量'], conditionNote(row), row['对应批号']]
      }),
    )
    entries.push({ filename: name, content })
  })

  // 下发说明：库房与车间各取所需期限分册，不用再从总表里挑
  const cover = toCsv(
    ['留样台账分册下发说明'],
    [
      ['下发对象', '库房、车间（两处各收同一套分册包，按册名留样期限取用）'],
      ['分册规则', '每册写明留样编号、留样数量、存放条件与对应批号，册名即留样期限'],
      ['空册处理', '某期限当前无留样时，该册为说明页，不留空册'],
      ['销毁要求', '销毁前须经质量部核准，经手人签字齐备后方可销毁'],
      ['生成日期', stamp],
    ],
  )
  entries.push({ filename: '00-下发说明.csv', content: cover })

  const known = knownExportedSampleIds()
  const newSampleIds = exportedIds.filter((id) => !known.has(id))
  const repeatedCount = exportedIds.length - newSampleIds.length
  const filename = `留样台账（按期限分册）-${stamp}.zip`
  const blob = buildZip(entries)

  const book: RetainExportBook = {
    exportedAt: new Date().toISOString(),
    filename,
    volumes: volumes.length,
    sampleCount: newSampleIds.length,
    newSampleIds,
    knownSampleIds: exportedIds.filter((id) => known.has(id)),
  }
  recordRetainExport(book)

  return { filename, blob, book, repeatedCount }
}

export function listRetainExportBooks(): RetainExportBook[] {
  return retainExportBooks()
}

/** 留样状态反映到稳定性考察的待办：已到期/待销毁的留样要提醒安排或结束考察。 */
export function stabilityTodos(): StabilityTodo[] {
  return retainRows()
    .filter((row) => row.status === '已到期' || row.status === '待销毁')
    .map((row) => ({
      留样编号: String(row['留样编号'] ?? ''),
      对应批号: String(row['对应批号'] ?? ''),
      留样期限册: retainTier(String(row['留样期限册'] ?? ''))?.label ?? String(row['留样期限册'] ?? ''),
      存放条件: conditionNote(row),
      留样状态: String(row.status),
      待办:
        row.status === '待销毁'
          ? '留样待质量部核准销毁，稳定性考察应完成末次汇总并归档'
          : '留样已到期，请安排到期考察时间点检验并办理销毁申请',
      到期日期: String(row['到期日期'] ?? ''),
    }))
}
