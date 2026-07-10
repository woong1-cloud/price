import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase, cloudEnabled } from './lib/supabase'
import { parseGonghomOrders, isGonghomCanceled } from './utils/gonghomParser'
import { parseElandOrders, isElandCanceled } from './utils/elandParser'
import { parseNaverOrders, isNaverCanceled } from './utils/naverParser'
import { aggregateChannelDaily } from './utils/aggregateChannelDaily'
import { uploadKidsChannelDaily } from './utils/uploadKidsChannelDaily'

const SHEET_ADAPTERS = [
  { sheetName: '공홈 당일',   channel: '자사몰',  parse: parseGonghomOrders, isCanceled: isGonghomCanceled },
  { sheetName: '이랜드몰 당일', channel: '이랜드몰', parse: parseElandOrders,   isCanceled: isElandCanceled },
  { sheetName: '네이버 당일',  channel: '네이버',   parse: parseNaverOrders,   isCanceled: isNaverCanceled },
]

export default function App() {
  const [preview, setPreview] = useState([])   // aggregateChannelDaily 결과(3채널 합침)
  const [log, setLog] = useState([])           // 시트별 인식 로그
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState(null)
  const [recent, setRecent] = useState([])      // 최근 14일 조회 결과

  const loadRecent = async () => {
    if (!supabase) return
    const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString().slice(0, 10)
    const { data } = await supabase
      .from('kids_channel_daily')
      .select('*')
      .gte('stat_date', since)
      .order('stat_date', { ascending: false })
    setRecent(data || [])
  }

  useEffect(() => { loadRecent() }, [])

  const handleFile = async (file) => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })

    const nextLog = []
    let combined = []
    for (const { sheetName, channel, parse, isCanceled } of SHEET_ADAPTERS) {
      const ws = wb.Sheets[sheetName]
      if (!ws) { nextLog.push({ sheetName, channel, status: 'skip', msg: '워크북에 없음' }); continue }
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const items = parse(rows)
      const daily = aggregateChannelDaily(items, { channel, isCanceled })
      combined = combined.concat(daily)
      nextLog.push({ sheetName, channel, status: 'ok', msg: `${items.length}건 → ${daily.length}일 집계` })
    }
    setLog(nextLog)
    setPreview(combined.sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel)))
    setSaveResult(null)
  }

  const handleSave = async () => {
    if (!supabase) return
    setSaving(true)
    const result = await uploadKidsChannelDaily(supabase, preview)
    setSaveResult(result)
    setSaving(false)
    if (result.ok) await loadRecent()
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1>SPAO 키즈 실적 업로드</h1>
      {!cloudEnabled && <p style={{ color: 'red' }}>⚠ .env.local에 키즈 Supabase 프로젝트 URL/키를 설정하세요.</p>}

      <p>실적판 엑셀(.xlsb/.xlsx) 파일을 선택하세요 — "공홈 당일"/"이랜드몰 당일"/"네이버 당일" 시트를 자동으로 찾아 파싱합니다.</p>
      <input type="file" accept=".xlsb,.xlsx,.xls" onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }} />

      {log.length > 0 && (
        <ul>
          {log.map(l => <li key={l.sheetName}>{l.sheetName} → {l.status === 'ok' ? '✓' : '✕'} {l.msg}</li>)}
        </ul>
      )}

      {preview.length > 0 && (
        <>
          <h2>미리보기 ({preview.length}행)</h2>
          <table border="1" cellPadding="4">
            <thead>
              <tr><th>날짜</th><th>채널</th><th>주문건수</th><th>주문금액</th><th>실주문건수</th><th>실매출</th><th>취소금액</th></tr>
            </thead>
            <tbody>
              {preview.map(r => (
                <tr key={`${r.date}-${r.channel}`}>
                  <td>{r.date}</td><td>{r.channel}</td><td>{r.orderCnt}</td>
                  <td>{r.orderAmt.toLocaleString()}</td><td>{r.realOrderCnt}</td>
                  <td>{r.realAmt.toLocaleString()}</td><td>{r.cancelAmt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleSave} disabled={saving || !cloudEnabled}>
            {saving ? '저장 중...' : 'Supabase에 저장'}
          </button>
          {saveResult && (
            <p style={{ color: saveResult.ok ? 'green' : 'red' }}>
              {saveResult.ok ? `저장 완료 (${saveResult.upserted}행)` : `저장 실패: ${saveResult.error}`}
            </p>
          )}
        </>
      )}

      <h2>최근 14일 실적</h2>
      <table border="1" cellPadding="4">
        <thead>
          <tr><th>날짜</th><th>채널</th><th>실매출</th><th>실주문건수</th><th>출처</th></tr>
        </thead>
        <tbody>
          {recent.map(r => (
            <tr key={`${r.stat_date}-${r.channel}`}>
              <td>{r.stat_date}</td><td>{r.channel}</td>
              <td>{Number(r.real_amt).toLocaleString()}</td><td>{r.real_order_cnt}</td><td>{r._source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
