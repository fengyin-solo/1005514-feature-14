import type { RetainExportBook } from './types'

// 分册导出留痕：同一份留样重复导出只算一次。留痕单独存一个 localStorage 键。
const EXPORT_KEY = 'pharma-cleanroom:retain-exports'

function readBooks(): RetainExportBook[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }
  const raw = window.localStorage.getItem(EXPORT_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RetainExportBook[]) : []
  } catch {
    return []
  }
}

export function retainExportBooks(): RetainExportBook[] {
  return readBooks()
}

export function knownExportedSampleIds(): Set<number> {
  const ids = new Set<number>()
  for (const book of readBooks()) {
    for (const id of book.knownSampleIds ?? []) {
      ids.add(Number(id))
    }
    for (const id of book.newSampleIds ?? []) {
      ids.add(Number(id))
    }
  }
  return ids
}

export function recordRetainExport(book: RetainExportBook): void {
  const books = readBooks()
  books.unshift(book)
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(EXPORT_KEY, JSON.stringify(books.slice(0, 100)))
  }
}

export function clearRetainExportBooks(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(EXPORT_KEY)
  }
}
