import { useState, useMemo, useRef, useEffect } from 'react'
import { parseSheet, parseCart, parseWishlist, parseSales, parseCustomer, parseVisit, parseStore, parseSalesByDate, parseSearch, parseStoreCorner, detectFileKey } from './utils/parseExcel'
import { computeAllDerived, computeSalesByDateMetrics, computeSearchMetrics } from './utils/metrics'
import { saveState, loadState, exportJSON, importJSON, loadCloudState, saveCloudState, subscribeCloud, cloudEnabled } from './utils/storage'
import L1_HealthCheck from './components/L1_HealthCheck'
import L2_ProductAnalysis from './components/L2_ProductAnalysis'
import L3_ActionPanel from './components/L3_ActionPanel'
import L4_ExhibitionAnalysis from './components/L4_ExhibitionAnalysis'
import './index.css'

// ─── 파일 정의 ───────────────────────────────────────────────────────────────
const CORE_FILES = [
  { key: 'cart',     label: '장바구니 실적', parser: parseCart },
  { key: 'wishlist', label: '관심상품',      parser: parseWishlist },
  { key: 'sales',    label: '주간 판매',     parser: parseSales },
  { key: 'customer', label: '고객 분석',     parser: parseCustomer },
]
const EXTRA_FILES = [
  { key: 'salesByDate',  label: '기간별 매출분석', parser: parseSalesByDate },
  { key: 'search',       label: '검색 실적',       parser: parseSearch },
  { key: 'visit',        label: '방문실적',        parser: parseVisit },
  { key: 'store',        label: '매장 종합 실적',  parser: parseStore },
  { key: 'storeCorner',  label: '매장코너 실적',   parser: parseStoreCorner },
]

const PARSER_MAP = {
  cart:        parseCart,
  wishlist:    parseWishlist,
  sales:       parseSales,
  customer:    parseCustomer,
  salesByDate: parseSalesByDate,
  search:      parseSearch,
  visit:       parseVisit,
  store:       parseStore,
  storeCorner: parseStoreCorner,
}
const ALL_FILES = [...CORE_FILES, ...EXTRA_FILES]

const EMPTY_WEEK = { cart: null, wishlist: null, sales: null, customer: null, salesByDate: null, search: null, visit: null, store: null, storeCorner: null }

// ─── 탭 정의 ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'l1', label: 'L1 헬스체크',  icon: '📊', desc: 'KPI · 채널 · 퍼널 · 고객' },
  { id: 'l2', label: 'L2 상품 분석', icon: '🛍', desc: '판매/관심/장바구니 Top · PV갭 · IP · 카테고리' },
  { id: 'l3', label: 'L3 구역별 효율', icon: '🎪', desc: '기획전·카테고리·검색 구역별 노출/클릭/CTR/매출 효율 — MD별 담당 기획전 드릴다운' },
  { id: 'l4', label: 'L4 액션 패널', icon: '🎯', desc: '분석 기반 자동 감지 인사이트 & 액션 카드' },
]

// ─── UploadButton ─────────────────────────────────────────────────────────────
function UploadButton({ label, done, onFile }) {
  const ref = useRef()
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
      background: done ? '#F0FDF8' : '#F8F8F7',
      border: `1px solid ${done ? '#5DCAA5' : '#E8E8E6'}`,
      color: done ? '#1A8060' : '#6B6B68',
      fontSize: '0.8125rem', fontWeight: 500,
      transition: 'all 0.15s',
    }}>
      <input ref={ref} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]) }} />
      <span>{done ? '✓' : '↑'}</span>
      <span>{label}</span>
    </label>
  )
}

// ─── BulkUploadButton ─────────────────────────────────────────────────────────
function BulkUploadButton({ onFiles }) {
  const ref = useRef()
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
      background: '#EFF6FF',
      border: '1px solid #BFDBFE',
      color: '#1D4ED8',
      fontSize: '0.8125rem', fontWeight: 600,
    }}>
      <input ref={ref} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }}
        onChange={e => { if (e.target.files.length) onFiles(Array.from(e.target.files)) }} />
      <span>📁</span>
      <span>일괄 업로드</span>
    </label>
  )
}

// ─── TabButton ────────────────────────────────────────────────────────────────
function TabButton({ tab, active, insightCount, onClick }) {
  const isActive = active === tab.id
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 20px', borderRadius: '10px 10px 0 0',
      border: 'none', cursor: 'pointer',
      background: isActive ? '#fff' : 'transparent',
      borderBottom: isActive ? '2px solid #378ADD' : '2px solid transparent',
      color: isActive ? '#378ADD' : '#A0A09E',
      fontWeight: isActive ? 700 : 500,
      fontSize: '0.9375rem',
    }}>
      <span>{tab.icon}</span>
      <span>{tab.label}</span>
      {tab.id === 'l4' && insightCount > 0 && (
        <span style={{ background: '#E24B4A', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.6875rem', fontWeight: 700, lineHeight: 1.4 }}>
          {insightCount}
        </span>
      )}
    </button>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const savedState = loadState()
  const [thisWeek, setThisWeek] = useState(savedState?.thisWeek || { ...EMPTY_WEEK })
  const [lastWeek, setLastWeek] = useState(savedState?.lastWeek || { ...EMPTY_WEEK })
  const [uploadTarget, setUploadTarget] = useState('this')  // 'this' | 'last'
  const [bulkLog, setBulkLog] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('l1')
  const [syncStatus, setSyncStatus] = useState(cloudEnabled ? 'loading' : 'offline') // loading|saving|synced|error|offline
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState(null)
  const importRef = useRef()

  // 클라우드와 비교용 시그니처 (불필요한 재저장/되돌림 루프 방지)
  const lastSyncedSig = useRef(null)
  const cloudLoadedRef = useRef(false)
  const sigOf = (tw, lw) => JSON.stringify([tw, lw])

  // 클라우드 데이터를 로컬 상태에 적용 (적용분은 다시 클라우드로 쓰지 않도록 시그니처 기록)
  const applyCloud = (tw, lw, updatedAt) => {
    const nextThis = tw || { ...EMPTY_WEEK }
    const nextLast = lw || { ...EMPTY_WEEK }
    lastSyncedSig.current = sigOf(nextThis, nextLast)
    setThisWeek(nextThis)
    setLastWeek(nextLast)
    if (updatedAt) setCloudUpdatedAt(updatedAt)
  }

  // ① 최초 마운트: 클라우드 공유 데이터 로드
  useEffect(() => {
    if (!cloudEnabled) return
    let cancelled = false
    setSyncStatus('loading')
    loadCloudState().then(cloud => {
      if (cancelled) return
      if (cloud && (cloud.thisWeek || cloud.lastWeek)) {
        applyCloud(cloud.thisWeek, cloud.lastWeek, cloud.updatedAt)
      }
      cloudLoadedRef.current = true
      setSyncStatus('synced')
    }).catch(() => { cloudLoadedRef.current = true; setSyncStatus('error') })
    return () => { cancelled = true }
  }, [])

  // ② 실시간: 다른 사용자가 업로드하면 자동 반영
  useEffect(() => {
    if (!cloudEnabled) return
    const unsub = subscribeCloud(row => {
      applyCloud(row.this_week, row.last_week, row.updated_at)
      setSyncStatus('synced')
    })
    return unsub
  }, [])

  // ③ 데이터 변경 시: 로컬 항상 저장 + 클라우드 동기화(변경분만)
  useEffect(() => {
    saveState(thisWeek, lastWeek) // 로컬은 항상
    if (!cloudEnabled || !cloudLoadedRef.current) return
    const sig = sigOf(thisWeek, lastWeek)
    if (sig === lastSyncedSig.current) return // 클라우드와 동일 → 재저장 불필요
    setSyncStatus('saving')
    saveCloudState(thisWeek, lastWeek).then(r => {
      if (r.ok) { lastSyncedSig.current = sig; setCloudUpdatedAt(new Date().toISOString()) }
      setSyncStatus(r.ok ? 'synced' : 'error')
    })
  }, [thisWeek, lastWeek])

  // 수동 새로고침: 최신 공유 데이터 다시 가져오기
  const handleCloudRefresh = async () => {
    if (!cloudEnabled) return
    setSyncStatus('loading')
    const cloud = await loadCloudState()
    if (cloud) applyCloud(cloud.thisWeek, cloud.lastWeek, cloud.updatedAt)
    setSyncStatus('synced')
  }

  const currentWeek = uploadTarget === 'this' ? thisWeek : lastWeek
  const setCurrentWeek = uploadTarget === 'this' ? setThisWeek : setLastWeek

  const handleFile = async (key, parser, file) => {
    setLoading(true)
    setError(null)
    try {
      const rows = await parseSheet(file)
      const data = parser(rows)
      setCurrentWeek(prev => ({ ...prev, [key]: data }))
    } catch (e) {
      console.error(key, e)
      setError(`${key} 파일 파싱 오류: ${e.message}`)
    }
    setLoading(false)
  }

  const handleBulkFiles = async (files) => {
    setLoading(true)
    setError(null)
    setBulkLog([])
    const log = []
    const updates = {}

    for (const file of files) {
      try {
        const rows = await parseSheet(file)
        const headers = rows[0] || []
        const key = detectFileKey(headers)
        if (!key || !PARSER_MAP[key]) {
          log.push({ file: file.name, status: 'skip', msg: '파일 종류를 자동 인식하지 못했습니다' })
          continue
        }
        const label = ALL_FILES.find(f => f.key === key)?.label || key
        updates[key] = PARSER_MAP[key](rows)
        log.push({ file: file.name, status: 'ok', msg: `${label} 로 인식` })
      } catch (e) {
        log.push({ file: file.name, status: 'error', msg: e.message })
      }
    }

    if (Object.keys(updates).length > 0) {
      setCurrentWeek(prev => ({ ...prev, ...updates }))
    }
    setBulkLog(log)
    setLoading(false)
  }

  const handleSwapWeeks = () => {
    if (window.confirm('이번 주 데이터를 지난 주로 이동하고 이번 주를 초기화할까요?')) {
      setLastWeek(thisWeek)
      setThisWeek({ ...EMPTY_WEEK })
      setUploadTarget('this')
    }
  }

  const handleExport = () => exportJSON(thisWeek, lastWeek)

  const handleImport = async (file) => {
    try {
      const data = await importJSON(file)
      if (data.thisWeek) setThisWeek(data.thisWeek)
      if (data.lastWeek) setLastWeek(data.lastWeek)
    } catch (e) {
      setError('JSON 불러오기 실패: ' + e.message)
    }
  }

  const coreLoaded = CORE_FILES.every(f => thisWeek[f.key] !== null)
  const hasLastWeek = CORE_FILES.some(f => lastWeek[f.key] !== null)
  const hasCornerData = !!thisWeek.storeCorner

  const derived = useMemo(() => {
    if (!coreLoaded) return null
    return computeAllDerived({
      thisWeek,
      lastWeek: hasLastWeek ? lastWeek : null,
      visit: thisWeek.visit,
      store: thisWeek.store,
    })
  }, [coreLoaded, thisWeek, lastWeek, hasLastWeek])

  const salesByDateMetrics = useMemo(() => {
    if (!thisWeek.salesByDate) return null
    return computeSalesByDateMetrics(thisWeek.salesByDate)
  }, [thisWeek.salesByDate])

  const searchMetrics = useMemo(() => {
    if (!thisWeek.search) return null
    return computeSearchMetrics(thisWeek.search)
  }, [thisWeek.search])

  const thisPeriod = thisWeek.salesByDate?.period || thisWeek.sales?.period || thisWeek.cart?.period || ''
  const lastPeriod = lastWeek.sales?.period || lastWeek.cart?.period || ''
  const insightCount = derived?.insights?.length ?? 0

  const SYNC_META = {
    loading: { label: '☁ 동기화 중…', color: '#B45309', bg: '#FFF9F0', border: '#FDE68A' },
    saving:  { label: '☁ 저장 중…',   color: '#B45309', bg: '#FFF9F0', border: '#FDE68A' },
    synced:  { label: '☁ 동기화됨',   color: '#1A8060', bg: '#F0FDF8', border: '#5DCAA5' },
    error:   { label: '⚠ 동기화 오류', color: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5' },
    offline: { label: '○ 로컬 전용',   color: '#A0A09E', bg: '#F8F8F7', border: '#E8E8E6' },
  }
  const syncMeta = SYNC_META[syncStatus] || SYNC_META.offline
  const cloudUpdatedLabel = cloudUpdatedAt
    ? new Date(cloudUpdatedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{ minHeight: '100vh', background: '#F1F3F5' }}>
      {/* ── 헤더 ── */}
      <header style={{ background: '#fff', borderBottom: '1px solid #E8E8E6', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '14px 24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            {/* 타이틀 + 기간 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: '#378ADD', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>v3</span>
                SPAO 자사몰 주간 실적 대시보드
              </h1>
              <div style={{ fontSize: '0.75rem', color: '#6B6B68', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {thisPeriod && <span>이번주: <strong>{thisPeriod}</strong></span>}
                {lastPeriod && <span style={{ color: '#A0A09E' }}>지난주: <strong>{lastPeriod}</strong></span>}
                {derived?.hasWoW && <span style={{ color: '#378ADD', fontWeight: 600 }}>● WoW 활성</span>}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '1px 8px', borderRadius: 12, fontSize: '0.6875rem', fontWeight: 600,
                  color: syncMeta.color, background: syncMeta.bg, border: `1px solid ${syncMeta.border}`,
                }}>
                  {syncMeta.label}
                  {cloudUpdatedLabel && syncStatus === 'synced' && (
                    <span style={{ color: '#A0A09E', fontWeight: 500 }}>· {cloudUpdatedLabel} 갱신</span>
                  )}
                </span>
              </div>
            </div>

            {/* 업로드 대상 토글 */}
            <div style={{ display: 'flex', gap: 4, background: '#F8F8F7', borderRadius: 20, padding: 3 }}>
              {[{ id: 'this', label: '이번 주' }, { id: 'last', label: '지난 주' }].map(t => (
                <button key={t.id} onClick={() => setUploadTarget(t.id)} style={{
                  padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                  background: uploadTarget === t.id ? '#378ADD' : 'transparent',
                  color: uploadTarget === t.id ? '#fff' : '#6B6B68',
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* 버튼 그룹 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <BulkUploadButton onFiles={handleBulkFiles} />

              {cloudEnabled && (
                <button onClick={handleCloudRefresh} title="최신 공유 데이터 다시 불러오기" style={{
                  padding: '6px 14px', borderRadius: 20, border: '1px solid #BFDBFE', background: '#EFF6FF',
                  color: '#1D4ED8', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                }}>
                  ☁ 새로고침
                </button>
              )}

              <button onClick={handleSwapWeeks} style={{
                padding: '6px 14px', borderRadius: 20, border: '1px solid #E8E8E6', background: '#F8F8F7',
                color: '#6B6B68', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
              }}>
                🔄 주 교체
              </button>

              <button onClick={handleExport} style={{
                padding: '6px 14px', borderRadius: 20, border: '1px solid #BBF7D0', background: '#F0FDF8',
                color: '#1A8060', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
              }}>
                💾 저장
              </button>

              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                background: '#FFF9F0', border: '1px solid #FDE68A', color: '#B45309',
                fontSize: '0.8125rem', fontWeight: 600,
              }}>
                <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files[0]) handleImport(e.target.files[0]) }} />
                📂 불러오기
              </label>

              <div style={{ width: 1, height: 24, background: '#E8E8E6' }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CORE_FILES.map(({ key, label, parser }) => (
                  <UploadButton key={key} label={label} done={!!currentWeek[key]}
                    onFile={(file) => handleFile(key, parser, file)} />
                ))}
              </div>
              <div style={{ width: 1, height: 24, background: '#E8E8E6' }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {EXTRA_FILES.map(({ key, label, parser }) => (
                  <UploadButton key={key} label={label} done={!!currentWeek[key]}
                    onFile={(file) => handleFile(key, parser, file)} />
                ))}
              </div>
            </div>
          </div>
        </div>
        {loading && <div style={{ height: 3, background: 'linear-gradient(90deg, #378ADD, #5DCAA5)' }} />}
      </header>

      {/* ── 오류 ── */}
      {error && (
        <div style={{ maxWidth: 1440, margin: '12px auto 0', padding: '0 24px' }}>
          <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '10px 16px', borderRadius: 8, fontSize: '0.875rem' }}>
            {error}
          </div>
        </div>
      )}

      {/* ── 벌크 업로드 결과 로그 ── */}
      {bulkLog.length > 0 && (
        <div style={{ maxWidth: 1440, margin: '8px auto 0', padding: '0 24px' }}>
          <div style={{ background: '#F8F8F7', border: '1px solid #E8E8E6', borderRadius: 8, padding: '10px 16px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B6B68', marginBottom: 6 }}>📁 일괄 업로드 결과</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {bulkLog.map((l, i) => (
                <div key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: '0.75rem', padding: '3px 10px', borderRadius: 12,
                  background: l.status === 'ok' ? '#F0FDF8' : l.status === 'error' ? '#FEE2E2' : '#FFF9F0',
                  border: `1px solid ${l.status === 'ok' ? '#5DCAA544' : l.status === 'error' ? '#FCA5A544' : '#FDE68A'}`,
                  color: l.status === 'ok' ? '#1A8060' : l.status === 'error' ? '#DC2626' : '#B45309',
                }}>
                  <span>{l.status === 'ok' ? '✓' : l.status === 'error' ? '✕' : '?'}</span>
                  <span style={{ fontWeight: 600 }}>{l.file.length > 20 ? l.file.slice(0, 20) + '…' : l.file}</span>
                  <span style={{ opacity: 0.7 }}>→ {l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 업로드 안내 ── */}
      {!coreLoaded && (
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '72px 24px', textAlign: 'center', color: '#A0A09E' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1A1A1A', marginBottom: 8 }}>
            SPAO 자사몰 주간 실적 대시보드 <span style={{ color: '#378ADD' }}>v3</span>
          </div>
          <div style={{ fontSize: '0.9375rem', color: '#6B6B68', marginBottom: 6 }}>
            엑셀 파일 4종을 업로드하면 대시보드가 표시됩니다
          </div>
          <div style={{ fontSize: '0.875rem', marginBottom: 4 }}>
            장바구니 실적 · 관심상품 · 주간 판매 · 고객 분석{' '}
            <span style={{ color: '#E24B4A', fontWeight: 600 }}>필수</span>
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#C8C8C6', marginBottom: 28 }}>
            2주치 데이터 업로드 시 WoW 자동 계산 · 💾 저장 / 📂 불러오기로 세션 유지
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 32 }}>
            {ALL_FILES.map(({ key, label }) => (
              <div key={key} style={{
                padding: '6px 16px', borderRadius: 20,
                background: thisWeek[key] ? '#F0FDF8' : '#F8F8F7',
                border: `1px solid ${thisWeek[key] ? '#5DCAA5' : '#E8E8E6'}`,
                fontSize: '0.8125rem',
                color: thisWeek[key] ? '#1A8060' : '#A0A09E',
              }}>
                {thisWeek[key] ? '✓ ' : ''}{label}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            {[
              { icon: '📈', title: 'WoW 비교',       desc: '2주 데이터 시 전주 대비 자동 계산' },
              { icon: '🏷',  title: '스타일코드 파싱', desc: '품목·성별·연도 자동 분류' },
              { icon: '🎯', title: '액션 패널',       desc: '13개 조건 자동 감지 인사이트' },
            ].map(f => (
              <div key={f.title} style={{ background: '#fff', borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', textAlign: 'center', minWidth: 180 }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, color: '#1A1A1A', fontSize: '0.875rem', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: '0.75rem', color: '#A0A09E' }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 대시보드 ── */}
      {(coreLoaded || hasCornerData) && (
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 24px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', borderBottom: '1px solid #E8E8E6', paddingTop: 16 }}>
            {TABS
              .filter(tab => tab.id === 'l3' ? true : coreLoaded)
              .map(tab => (
                <TabButton key={tab.id} tab={tab} active={activeTab} insightCount={insightCount} onClick={() => setActiveTab(tab.id)} />
              ))
            }
            <div style={{ flex: 1, paddingBottom: 12, paddingRight: 4, textAlign: 'right' }}>
              <span style={{ fontSize: '0.75rem', color: '#A0A09E' }}>{TABS.find(t => t.id === activeTab)?.desc}</span>
            </div>
          </div>

          <div style={{ paddingTop: 20 }}>
            {activeTab === 'l1' && derived && (
              <L1_HealthCheck derived={derived} salesByDateMetrics={salesByDateMetrics} searchMetrics={searchMetrics} />
            )}
            {activeTab === 'l2' && derived && <L2_ProductAnalysis derived={derived} />}
            {activeTab === 'l3' && <L4_ExhibitionAnalysis storeCorner={thisWeek.storeCorner} />}
            {activeTab === 'l4' && derived && <L3_ActionPanel derived={derived} storeCorner={thisWeek.storeCorner} />}
          </div>
        </div>
      )}
    </div>
  )
}
