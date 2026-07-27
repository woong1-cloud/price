import * as XLSX from 'xlsx'

// 이랜드몰(문자열 "YYYY-MM-DD HH:mm:ss")과 공홈·네이버(Excel 날짜 직렬번호)를
// 모두 받아 'YYYY-MM-DD'로 정규화한다.
export function excelSerialToDateStr(value) {
  if (value === '' || value === null || value === undefined) return ''

  const asStr = String(value)
  const strMatch = asStr.match(/^(\d{4}-\d{2}-\d{2})/)
  if (strMatch) return strMatch[1]

  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  const d = XLSX.SSF.parse_date_code(n)
  if (!d) return ''
  const pad = (v) => String(v).padStart(2, '0')
  return `${d.y}-${pad(d.m)}-${pad(d.d)}`
}
