/**
 * 零依赖 ZIP 打包：用 STORE（不压缩）方式把多分册合成一个可立刻下载的包。
 * 纯前端环境没有归档库，这里按 ZIP 规范手写 local header / central directory / EOCD，
 * 中文文件名用 UTF-8 标志位（bit 11）声明。
 */

export type ZipEntry = {
  filename: string
  content: string
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let crc = i
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
    table[i] = crc >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const encoder = new TextEncoder()

class ByteWriter {
  private chunks: Uint8Array[] = []
  private length = 0

  push(bytes: Uint8Array): void {
    this.chunks.push(bytes)
    this.length += bytes.length
  }

  u16(value: number): void {
    const bytes = new Uint8Array(2)
    new DataView(bytes.buffer).setUint16(0, value, true)
    this.push(bytes)
  }

  u32(value: number): void {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true)
    this.push(bytes)
  }

  bytes(value: Uint8Array): void {
    this.push(value)
  }

  size(): number {
    return this.length
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.length)
    let offset = 0
    for (const chunk of this.chunks) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  }
}

type PreparedEntry = {
  nameBytes: Uint8Array
  dataBytes: Uint8Array
  crc: number
  localOffset: number
}

export function buildZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length === 0) {
    throw new Error('打包内容为空，拒绝生成空壳包')
  }

  const prepared: PreparedEntry[] = []
  const local = new ByteWriter()

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.filename)
    const dataBytes = encoder.encode(entry.content)
    const crc = crc32(dataBytes)
    const localOffset = local.size()
    prepared.push({ nameBytes, dataBytes, crc, localOffset })

    // Local file header
    local.u32(0x04034b50) // 签名
    local.u16(20) // 解压所需版本
    local.u16(0x0800) // bit 11：文件名/注释按 UTF-8 解析
    local.u16(0) // 压缩方式 0 = STORE
    local.u16(0) // 修改时间
    local.u16(0x21) // 修改日期（1980-01-01）
    local.u32(crc)
    local.u32(dataBytes.length) // 压缩后大小（STORE 下等于原始大小）
    local.u32(dataBytes.length) // 原始大小
    local.u16(nameBytes.length)
    local.u16(0) // 扩展字段长度
    local.bytes(nameBytes)
    local.bytes(dataBytes)
  }

  const central = new ByteWriter()
  for (const entry of prepared) {
    // Central directory file header
    central.u32(0x02014b50)
    central.u16(20) // 制作版本
    central.u16(20) // 解压所需版本
    central.u16(0x0800)
    central.u16(0)
    central.u16(0)
    central.u16(0x21)
    central.u32(entry.crc)
    central.u32(entry.dataBytes.length)
    central.u32(entry.dataBytes.length)
    central.u16(entry.nameBytes.length)
    central.u16(0)
    central.u16(0)
    central.u16(0)
    central.u16(0)
    central.u32(0)
    central.u32(entry.localOffset)
    central.bytes(entry.nameBytes)
  }

  const eocd = new ByteWriter()
  eocd.u32(0x06054b50)
  eocd.u16(0)
  eocd.u16(0)
  eocd.u16(prepared.length)
  eocd.u16(prepared.length)
  eocd.u32(central.size())
  eocd.u32(local.size())
  eocd.u16(0)

  const out = new ByteWriter()
  out.bytes(local.toUint8Array())
  out.bytes(central.toUint8Array())
  out.bytes(eocd.toUint8Array())
  return out.toUint8Array()
}
