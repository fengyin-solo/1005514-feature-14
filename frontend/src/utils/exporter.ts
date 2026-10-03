/** 纯前端导出工具：CSV 转义、Blob 下载、以及不依赖第三方库的 ZIP（STORE）打包。 */

export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','))
  }
  // BOM 让 Excel 直接识别 UTF-8 中文
  return `﻿${lines.join('\r\n')}`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  downloadBlob(new Blob([content], { type: mime }), filename)
}

// ---- 最小 ZIP 实现（STORE，不压缩）：够把多册台账打成一个包立即下载 ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosTime(date: Date): number {
  return ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f)
}

function dosDate(date: Date): number {
  return (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f)
}

export type ZipEntry = { filename: string; content: string }

export function buildZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder()
  const now = new Date()
  const time = dosTime(now)
  const date = dosDate(now)

  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.filename)
    const dataBytes = encoder.encode(entry.content)
    const crc = crc32(dataBytes)
    const size = dataBytes.length

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true) // 本地文件头
    local.setUint16(4, 20, true) // 解压所需版本
    local.setUint16(6, 0x0800, true) // UTF-8 文件名
    local.setUint16(8, 0, true) // STORE 不压缩
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true)
    local.setUint32(22, size, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)
    localParts.push(new Uint8Array(local.buffer), nameBytes, dataBytes)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true) // 中央目录
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, time, true)
    central.setUint16(14, date, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, size, true)
    central.setUint32(24, size, true)
    central.setUint16(28, nameBytes.length, true)
    central.setUint16(30, 0, true)
    central.setUint16(32, 0, true)
    central.setUint16(34, 0, true)
    central.setUint16(36, 0, true)
    central.setUint32(38, 0, true)
    central.setUint32(42, offset, true)
    centralParts.push(new Uint8Array(central.buffer), nameBytes)

    offset += 30 + nameBytes.length + size
  }

  const centralBytes = concat(centralParts)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, entries.length, true)
  eocd.setUint16(10, entries.length, true)
  eocd.setUint32(12, centralBytes.length, true)
  eocd.setUint32(16, offset, true)
  eocd.setUint16(20, 0, true)

  return new Blob([...localParts, centralBytes, new Uint8Array(eocd.buffer)] as BlobPart[], {
    type: 'application/zip',
  })
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const merged = new Uint8Array(total)
  let pos = 0
  for (const part of parts) {
    merged.set(part, pos)
    pos += part.length
  }
  return merged
}
