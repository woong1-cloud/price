import { useState, useMemo, useRef, useEffect } from 'react'
import { parseSheet, parseCart, parseWishlist, parseSales, parseCustomer, parseVisit, parseStore, parseSalesByDate, parseSearch, parseStoreCorner, parseRestock, parseCoupon, detectFileKey } from './utils/parseExcel'
import { computeAllDerived, computeSalesByDateMetrics, computeSearchMetrics } from './utils/metrics'
import { saveState, loadState, exportJSON, importJSON, loadCloudState, saveCloudState, subscribeCloud, cloudEnabled, loadSnapshotIndex, loadSnapshotPayload, subscribeSnapshots, upsertSnapshot } from './utils/storage'
import { deriveWeekKey } from './utils/weekKey'
import { filterPayloadByGender } from './utils/kidsFilter'
import L1_HealthCheck from './components/L1_HealthCheck'
import L2_ProductAnalysis from './components/L2_ProductAnalysis'
import L3_ActionPanel from './components/L3_ActionPanel'
import L4_ExhibitionAnalysis from './components/L4_ExhibitionAnalysis'
import SnapshotSaveModal from './components/SnapshotSaveModal'
import SnapshotManageModal from './components/SnapshotManageModal'
import WeekControl from './components/WeekControl'
import ScrollToTopButton from './components/ScrollToTopButton'
import IngestStatusBadge from './components/IngestStatusBadge'
import DataQualityBanner from './components/DataQualityBanner'
import { previousWeekKey, mostRecentWeekKey } from './utils/weekNav'
import { mergePayloads, listPeriods, weekKeysInPeriod, previousPeriodKey, periodLabel } from './utils/aggregatePeriod'
import { checkDataQuality } from './utils/dataQuality'
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
  { key: 'restock',      label: '재입고 알림내역', parser: parseRestock },
  { key: 'coupon',       label: '쿠폰 실적',       parser: parseCoupon },
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
  restock:     parseRestock,
  coupon:      parseCoupon,
}
const ALL_FILES = [...CORE_FILES, ...EXTRA_FILES]

const EMPTY_WEEK = { cart: null, wishlist: null, sales: null, customer: null, salesByDate: null, search: null, visit: null, store: null, storeCorner: null, restock: null, coupon: null }

const menuItemStyle = {
  textAlign: 'left', padding: '8px 10px', borderRadius: 6, border: 'none',
  background: 'transparent', color: '#3A3A38', fontSize: '0.8125rem', fontWeight: 500,
  cursor: 'pointer', width: '100%',
}

// ─── 탭 정의 ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'l1', label: 'L1 종합 진단',  icon: '📊', desc: '유입→사이트 전환 · KPI · 채널 · 고객' },
  { id: 'l2', label: 'L2 상품 분석', icon: '🛍', desc: '판매/관심/장바구니 Top · PV갭 · IP · 카테고리' },
  { id: 'l3', label: 'L3 구역별 효율', icon: '🎪', desc: '기획전·카테고리·검색 구역별 노출/클릭/CTR/매출 효율 — MD별 담당 기획전 드릴다운' },
  { id: 'l4', label: 'L4 액션 패널', icon: '🎯', desc: '분석 기반 자동 감지 인사이트 & 액션 카드' },
  { id: 'kids', label: '키즈', icon: '🧒', desc: '스타일코드 성별코드=키즈 상품만 필터링한 실적(자사몰 데이터 기준)' },
]

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
  const [bulkLog, setBulkLog] = useState([])
  const [showUpload, setShowUpload] = useState(true)  // 헤더 업로드 영역 아코디언 펼침 여부
  const autoCollapsedRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('l1')
  const [syncStatus, setSyncStatus] = useState(cloudEnabled ? 'loading' : 'offline') // loading|saving|synced|error|offline
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState(null)
  const [showSnapshotModal, setShowSnapshotModal] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  // 주차 스냅샷 (유일한 화면 원천)
  const [snapshotIndex, setSnapshotIndex] = useState([])
  const [selectedWeekKey, setSelectedWeekKey] = useState(null) // 화면에 표시 중인 주
  const [compareWeekKey, setCompareWeekKey] = useState(null)   // null = 자동(직전 주)
  const [periodMode, setPeriodMode] = useState('week')         // week | month | quarter (기간 합산 보기)
  const [periodKey, setPeriodKey] = useState(null)             // 선택된 월/분기 키
  const [pendingNewWeek, setPendingNewWeek] = useState(null)   // {payload, period, filesPresent} | null — 기간 인식 실패 시 모달 버퍼
  const viewingSnapshotRef = useRef(true)    // 주차 모델: 항상 스냅샷 열람 → 라이브 저장/덮어쓰기 차단
  const payloadCacheRef = useRef(new Map())  // 간단 LRU (최대 6개)
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
    loadCloudState().then(async cloud => {
      if (cancelled) return
      if (cloud && (cloud.thisWeek || cloud.lastWeek)) {
        applyCloud(cloud.thisWeek, cloud.lastWeek, cloud.updatedAt)
        // 마이그레이션: 레거시 dashboard_state.last_week 를 스냅샷에 1회 흡수(멱등)
        const lw = cloud.lastWeek
        if (lw) {
          const period = lw.salesByDate?.period || lw.sales?.period || lw.cart?.period || ''
          const dk = deriveWeekKey(period)
          if (dk.ok) {
            const cur = await loadSnapshotIndex()
            if (!cur.find(r => r.week_key === dk.weekKey)) {
              const fp = ALL_FILES.filter(f => lw[f.key]).map(f => f.key)
              await upsertSnapshot({
                weekKey: dk.weekKey, weekLabel: dk.weekLabel,
                weekStart: dk.weekStart, weekEnd: dk.weekEnd,
                payload: lw, filesPresent: fp,
              })
            }
          }
        }
      }
      cloudLoadedRef.current = true
      setSyncStatus('synced')
    }).catch(() => { cloudLoadedRef.current = true; setSyncStatus('error') })
    return () => { cancelled = true }
  }, [])

  // ② 실시간: 다른 사용자가 업로드하면 자동 반영
  // 주의: Supabase Realtime 은 브로드캐스트 페이로드 크기 상한(약 1MB)이 있어
  // 큰 this_week(jsonb)가 잘려 null 로 도착할 수 있다. payload.new 를 그대로 적용하면
  // 정상 데이터를 빈 값으로 덮어쓸 위험이 있으므로, 실시간 이벤트는 "알림"으로만 쓰고
  // 전체 행을 다시 가져와서(loadCloudState) 적용한다.
  useEffect(() => {
    if (!cloudEnabled) return
    const unsub = subscribeCloud(async () => {
      if (viewingSnapshotRef.current) return // 스냅샷 열람 중엔 라이브로 덮어쓰지 않음
      const cloud = await loadCloudState()
      if (cloud && (cloud.thisWeek || cloud.lastWeek)) {
        applyCloud(cloud.thisWeek, cloud.lastWeek, cloud.updatedAt)
        setSyncStatus('synced')
      }
    })
    return unsub
  }, [])

  // ③ 데이터 변경 시: 로컬 항상 저장 + 클라우드 동기화(변경분만)
  useEffect(() => {
    if (viewingSnapshotRef.current) return // 과거 스냅샷 열람 중엔 로컬/클라우드 저장 안 함
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

  // ④ 주차 스냅샷 인덱스 로드 헬퍼 (실제 마운트 효과는 applySelectedWeek 정의 이후에 등록)
  const refreshIndex = () => loadSnapshotIndex().then(idx => { setSnapshotIndex(idx); return idx })
  const didInitWeekRef = useRef(false)

  // payload 캐시 (간단 LRU, 최대 6개)
  const getPayload = async (weekKey) => {
    const cache = payloadCacheRef.current
    if (cache.has(weekKey)) {
      const v = cache.get(weekKey); cache.delete(weekKey); cache.set(weekKey, v) // LRU bump
      return v
    }
    const p = await loadSnapshotPayload(weekKey)
    cache.set(weekKey, p)
    if (cache.size > 6) cache.delete(cache.keys().next().value)
    return p
  }

  // 선택 주 + 비교 기준을 thisWeek/lastWeek 에 적용 (주차 스냅샷 = 화면 원천)
  const applySelectedWeek = async (weekKey, compareKey, indexOverride) => {
    setError(null)
    if (!weekKey) {
      setThisWeek({ ...EMPTY_WEEK }); setLastWeek({ ...EMPTY_WEEK }); setSelectedWeekKey(null); return
    }
    const payload = await getPayload(weekKey)
    if (!payload) { setError('스냅샷을 불러오지 못했습니다.'); return }
    // 직후 호출(로드/업로드/삭제) 시 setState 반영 전이라 snapshotIndex 상태가 낡았을 수 있어
    // 갓 받아온 인덱스를 명시적으로 넘겨 자동 비교(직전 주) 계산이 빈 인덱스로 빗나가지 않게 한다.
    const idx = indexOverride || snapshotIndex
    const prevKey = compareKey || previousWeekKey(idx, weekKey)
    const prevPayload = prevKey ? await getPayload(prevKey) : null
    const nextLast = prevPayload || { ...EMPTY_WEEK }
    viewingSnapshotRef.current = true          // 라이브(dashboard_state) 저장 효과 차단
    lastSyncedSig.current = sigOf(payload, nextLast)
    setSelectedWeekKey(weekKey)
    setThisWeek(payload)
    setLastWeek(nextLast)
  }

  // 주 클릭: 수동 비교 설정을 풀고 자동(직전 주)로 리셋
  const handleSelectWeek = (weekKey) => { setCompareWeekKey(null); applySelectedWeek(weekKey, null) }
  const handleCompareChange = (compareKey) => {
    setCompareWeekKey(compareKey)
    if (selectedWeekKey) applySelectedWeek(selectedWeekKey, compareKey)
  }

  // 기간 합산(월/분기) 보기 — 해당 기간 주차들을 합쳐 thisWeek, 직전 기간을 lastWeek 로.
  const applySelectedPeriod = async (mode, pKey, indexOverride) => {
    setError(null)
    const idx = indexOverride || snapshotIndex
    if (!pKey) { setThisWeek({ ...EMPTY_WEEK }); setLastWeek({ ...EMPTY_WEEK }); return }
    const weeks = weekKeysInPeriod(idx, mode, pKey)
    const merged = mergePayloads(await Promise.all(weeks.map(getPayload))) || { ...EMPTY_WEEK }
    const prevKey = previousPeriodKey(idx, mode, pKey)
    const prevWeeks = prevKey ? weekKeysInPeriod(idx, mode, prevKey) : []
    const prevMerged = prevWeeks.length
      ? (mergePayloads(await Promise.all(prevWeeks.map(getPayload))) || { ...EMPTY_WEEK })
      : { ...EMPTY_WEEK }
    viewingSnapshotRef.current = true
    lastSyncedSig.current = sigOf(merged, prevMerged)
    setThisWeek(merged)
    setLastWeek(prevMerged)
  }

  // 기간 단위 토글 (주/월/분기)
  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode)
    if (mode === 'week') {
      const wk = selectedWeekKey || mostRecentWeekKey(snapshotIndex)
      if (wk) applySelectedWeek(wk, compareWeekKey)
      return
    }
    const periods = listPeriods(snapshotIndex, mode)
    const pk = periods[0]?.key || null
    setPeriodKey(pk)
    applySelectedPeriod(mode, pk)
  }
  const handlePeriodKeyChange = (pKey) => { setPeriodKey(pKey); applySelectedPeriod(periodMode, pKey) }

  // ④ 스냅샷 인덱스 로드 → 가장 최근 주 자동 표시 + 추가/수정/삭제 실시간 반영
  useEffect(() => {
    if (!cloudEnabled) return
    refreshIndex().then(idx => {
      if (didInitWeekRef.current) return
      didInitWeekRef.current = true
      const recent = mostRecentWeekKey(idx)
      if (recent) applySelectedWeek(recent, null, idx)
    })
    const unsub = subscribeSnapshots(() => refreshIndex())
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 여러 엑셀 파일 → { updates, log } (종류 자동 인식)
  const parseFilesToUpdates = async (files) => {
    const log = []
    const updates = {}
    for (const file of files) {
      try {
        const rows = await parseSheet(file)
        const key = detectFileKey(rows[0] || [])
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
    return { updates, log }
  }

  // 선택한 주에 파일 추가/교체 → 같은 week_key 로 upsert
  const handleUploadToSelected = async (files) => {
    if (!selectedWeekKey) return handleNewWeekFiles(files)
    setLoading(true); setError(null); setBulkLog([])
    const { updates, log } = await parseFilesToUpdates(files)
    setBulkLog(log)
    if (Object.keys(updates).length > 0) {
      const merged = { ...thisWeek, ...updates }
      setThisWeek(merged)
      const meta = snapshotIndex.find(r => r.week_key === selectedWeekKey)
      const filesPresent = ALL_FILES.filter(f => merged[f.key]).map(f => f.key)
      const res = await upsertSnapshot({
        weekKey: selectedWeekKey,
        weekLabel: meta?.week_label || selectedWeekKey,
        weekStart: meta?.week_start || null,
        weekEnd: meta?.week_end || null,
        payload: merged, filesPresent,
      })
      if (!res?.ok) {
        setError(`클라우드 저장에 실패했습니다: ${res?.reason || '알 수 없는 오류'}`)
        setLoading(false)
        return
      }
      if (res.shrunk) setBulkLog([...log, { file: '⚠ 용량 안내', status: 'skip', msg: '데이터가 커서 매장코너 상품 디테일은 코너 단위로 축약 저장했습니다.' }])
      // 방금 저장한 payload 로 캐시 갱신 — 안 하면 다른 주로 갔다 돌아올 때 옛 데이터가 다시 표시된다.
      payloadCacheRef.current.set(selectedWeekKey, merged)
      await refreshIndex()
    }
    setLoading(false)
  }

  // 새 주차: 파일 기간으로 week_key 산출 → 새 스냅샷 생성 후 그 주를 표시.
  // 기간 자동 인식 실패 시 스냅샷 저장 모달로 직접 지정하게 한다.
  const handleNewWeekFiles = async (files) => {
    setLoading(true); setError(null); setBulkLog([])
    const { updates, log } = await parseFilesToUpdates(files)
    setBulkLog(log)
    if (Object.keys(updates).length === 0) { setLoading(false); return }
    const merged = { ...EMPTY_WEEK, ...updates }
    const period = merged.salesByDate?.period || merged.sales?.period || merged.cart?.period || ''
    const dk = deriveWeekKey(period)
    const filesPresent = ALL_FILES.filter(f => merged[f.key]).map(f => f.key)
    if (dk.ok) {
      const res = await upsertSnapshot({
        weekKey: dk.weekKey, weekLabel: dk.weekLabel,
        weekStart: dk.weekStart, weekEnd: dk.weekEnd,
        payload: merged, filesPresent,
      })
      if (!res?.ok) {
        setError(`클라우드 저장에 실패했습니다: ${res?.reason || '알 수 없는 오류'}`)
        setLoading(false)
        return
      }
      if (res.shrunk) setBulkLog([...log, { file: '⚠ 용량 안내', status: 'skip', msg: '데이터가 커서 매장코너 상품 디테일은 코너 단위로 축약 저장했습니다.' }])
      // 방금 저장한 payload 로 캐시 시드 — applySelectedWeek 가 옛 캐시 대신 새 데이터를 쓰도록.
      payloadCacheRef.current.set(dk.weekKey, merged)
      const idx = await refreshIndex()
      setCompareWeekKey(null)
      await applySelectedWeek(dk.weekKey, null, idx)
    } else {
      // 기간 인식 실패 → 버퍼에 담고 모달로 주차 지정
      setThisWeek(merged)
      setPendingNewWeek({ payload: merged, period, filesPresent })
      setShowSnapshotModal(true)
    }
    setLoading(false)
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

  // 데이터가 처음 채워지면 업로드 영역을 자동으로 접어 헤더를 깔끔하게 유지 (1회만)
  useEffect(() => {
    if ((coreLoaded || hasCornerData) && !autoCollapsedRef.current) {
      autoCollapsedRef.current = true
      setShowUpload(false)
    }
  }, [coreLoaded, hasCornerData])

  const derived = useMemo(() => {
    if (!coreLoaded) return null
    return computeAllDerived({
      thisWeek,
      lastWeek: hasLastWeek ? lastWeek : null,
      visit: thisWeek.visit,
      store: thisWeek.store,
    })
  }, [coreLoaded, thisWeek, lastWeek, hasLastWeek])

  // 키즈 탭: styleCode 성별코드=K인 상품만 걸러 같은 computeAllDerived 파이프라인을 재사용.
  // salesByDate/visit/store/customer 등 상품 단위가 없는 데이터셋은 필터 유틸이 null 처리하므로
  // L1~L4는 해당 섹션을 "데이터 없음"으로 자연스럽게 비워 보여준다(오표시 방지).
  const kidsDerived = useMemo(() => {
    if (!coreLoaded) return null
    const kThisWeek = filterPayloadByGender(thisWeek, 'K')
    const kLastWeek = hasLastWeek ? filterPayloadByGender(lastWeek, 'K') : null
    return computeAllDerived({ thisWeek: kThisWeek, lastWeek: kLastWeek, visit: null, store: null })
  }, [coreLoaded, thisWeek, lastWeek, hasLastWeek])

  const salesByDateMetrics = useMemo(() => {
    if (!thisWeek.salesByDate) return null
    return computeSalesByDateMetrics(thisWeek.salesByDate, lastWeek.salesByDate || null)
  }, [thisWeek.salesByDate, lastWeek.salesByDate])

  const searchMetrics = useMemo(() => {
    if (!thisWeek.search) return null
    return computeSearchMetrics(thisWeek.search, lastWeek.search || null)
  }, [thisWeek.search, lastWeek.search])

  // 스냅샷 메타(week_start~week_end)로 정확한 기간 범위를 만든다. (비교 필드와 동일한 형식)
  const rangeFromMeta = (weekKey) => {
    const m = snapshotIndex.find((r) => r.week_key === weekKey)
    if (m?.week_start && m?.week_end) return `${m.week_start.slice(5)} ~ ${m.week_end.slice(5)}`
    return ''
  }
  // 데이터 품질 교차검증 — raw 데이터 이상 자동 감지
  const dataWarnings = useMemo(
    () => checkDataQuality({ derived, salesByDate: salesByDateMetrics, search: searchMetrics }),
    [derived, salesByDateMetrics, searchMetrics],
  )

  const thisPeriod = rangeFromMeta(selectedWeekKey)
    || thisWeek.salesByDate?.period || thisWeek.sales?.period || thisWeek.cart?.period || ''
  const lastPeriod = rangeFromMeta(compareWeekKey)
    || lastWeek.sales?.period || lastWeek.cart?.period || ''
  const insightCount = derived?.insights?.length ?? 0

  const SYNC_META = {
    loading: { label: '☁ 동기화 중…', color: '#B45309', bg: '#FFF9F0', border: '#FDE68A' },
    saving:  { label: '☁ 저장 중…',   color: '#B45309', bg: '#FFF9F0', border: '#FDE68A' },
    synced:  { label: '☁ 동기화됨',   color: '#1A8060', bg: '#F0FDF8', border: '#5DCAA5' },
    error:   { label: '⚠ 동기화 오류', color: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5' },
    offline: { label: '○ 로컬 전용',   color: '#A0A09E', bg: '#F8F8F7', border: '#E8E8E6' },
  }
  const syncMeta = SYNC_META[syncStatus] || SYNC_META.offline
  // 주차 중심 모델에선 데이터가 weekly_snapshots 에 저장되므로, 선택된 주 스냅샷의 updated_at 을
  // 우선 사용한다. (dashboard_state.updated_at 은 구 모델 잔재라 갱신되지 않아 시점이 멈춰 보임)
  const selectedSnapshotUpdatedAt = snapshotIndex.find((r) => r.week_key === selectedWeekKey)?.updated_at
  const effectiveUpdatedAt = selectedSnapshotUpdatedAt || cloudUpdatedAt
  const cloudUpdatedLabel = effectiveUpdatedAt
    ? new Date(effectiveUpdatedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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
              <div style={{ fontSize: '0.75rem', color: '#6B6B68', marginTop: 5, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {cloudEnabled && (
                  <span style={{ display: 'inline-flex', border: '1px solid #BFDBFE', borderRadius: 14, overflow: 'hidden' }}>
                    {[['week', '주'], ['month', '월'], ['quarter', '분기']].map(([m, lbl]) => {
                      const on = periodMode === m
                      return (
                        <button key={m} onClick={() => handlePeriodModeChange(m)} style={{
                          border: 'none', cursor: 'pointer', padding: '4px 11px', fontSize: '0.75rem', fontWeight: 700,
                          background: on ? '#378ADD' : '#EFF6FF', color: on ? '#fff' : '#1D4ED8',
                        }}>{lbl}</button>
                      )
                    })}
                  </span>
                )}
                {cloudEnabled && periodMode === 'week' && (
                  <WeekControl
                    index={snapshotIndex}
                    selectedWeekKey={selectedWeekKey}
                    compareWeekKey={compareWeekKey}
                    totalFiles={ALL_FILES.length}
                    onSelectWeek={handleSelectWeek}
                    onNewWeekFiles={handleNewWeekFiles}
                    onUploadToSelected={handleUploadToSelected}
                    onCompareChange={handleCompareChange}
                    onManage={() => setShowManageModal(true)}
                    onEditCurrent={() => setShowSnapshotModal(true)}
                  />
                )}
                {cloudEnabled && <IngestStatusBadge />}
                {cloudEnabled && periodMode !== 'week' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <select value={periodKey || ''} onChange={e => handlePeriodKeyChange(e.target.value)} style={{
                      fontSize: '0.78125rem', fontWeight: 700, padding: '4px 10px', borderRadius: 14,
                      border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer',
                    }}>
                      {listPeriods(snapshotIndex, periodMode).map(p => (
                        <option key={p.key} value={p.key}>{p.label} ({p.weeks.length}주)</option>
                      ))}
                    </select>
                    <span style={{ fontSize: '0.625rem', color: '#A0A09E' }}>합산 · UV·고객수는 중복포함</span>
                  </span>
                )}
                {thisPeriod && <span>기간: <strong>{thisPeriod}</strong></span>}
                {lastPeriod && <span style={{ color: '#A0A09E' }}>비교: <strong>{lastPeriod}</strong></span>}
                {derived?.hasWoW && <span style={{ color: '#378ADD', fontWeight: 600 }}>● WoW 활성</span>}
                {cloudEnabled && coreLoaded && !selectedWeekKey && snapshotIndex.length === 0 && (
                  <button onClick={() => setShowSnapshotModal(true)} title="주차를 직접 지정" style={{
                    padding: '1px 8px', borderRadius: 12, fontSize: '0.6875rem', fontWeight: 700, cursor: 'pointer',
                    color: '#B45309', background: '#FFF9F0', border: '1px solid #FDE68A',
                  }}>⚠ 주차 지정 필요</button>
                )}
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

            {/* 데이터 업로드 — 버튼 본체로 파일 선택(일괄), ▼ 로 세부 도구 펼침 */}
            <div style={{
              display: 'inline-flex', alignItems: 'stretch', borderRadius: 20, overflow: 'hidden',
              border: `1px solid ${showUpload ? '#378ADD' : '#BFDBFE'}`,
            }}>
              <label title="엑셀 파일 선택 → 기간 자동 인식으로 새 주차 생성 (여러 개 한 번에 가능)" style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '7px 16px', cursor: 'pointer',
                background: showUpload ? '#378ADD' : '#EFF6FF',
                color: showUpload ? '#fff' : '#1D4ED8',
                fontSize: '0.8125rem', fontWeight: 600,
              }}>
                <input type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }}
                  onChange={e => { if (e.target.files.length) handleNewWeekFiles(Array.from(e.target.files)) }} />
                <span>📁 새 주차 업로드</span>
                {(() => {
                  const loadedCount = ALL_FILES.filter(f => thisWeek[f.key]).length
                  return (
                    <span style={{
                      fontSize: '0.6875rem', fontWeight: 700,
                      background: showUpload ? 'rgba(255,255,255,0.25)' : '#DBEAFE',
                      color: showUpload ? '#fff' : '#1D4ED8',
                      borderRadius: 10, padding: '1px 7px',
                    }}>
                      {loadedCount}/{ALL_FILES.length}
                    </span>
                  )
                })()}
              </label>
              <button onClick={() => setShowUpload(s => !s)} title="세부 업로드 도구 펼치기/접기" style={{
                display: 'inline-flex', alignItems: 'center', padding: '0 11px', cursor: 'pointer', border: 'none',
                borderLeft: `1px solid ${showUpload ? 'rgba(255,255,255,0.32)' : '#BFDBFE'}`,
                background: showUpload ? '#378ADD' : '#EFF6FF',
                color: showUpload ? '#fff' : '#1D4ED8', fontSize: '0.625rem',
              }}>{showUpload ? '▲' : '▼'}</button>
            </div>

            {/* ── 아코디언: 업로드 도구 모음 ── */}
            {showUpload && <>

            {/* 부가 도구 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.6875rem', color: '#A0A09E' }}>
                <strong style={{ color: '#1D4ED8' }}>📅 주차</strong> 드롭다운에서 주차 선택·파일 추가/교체·비교 기준을 한 번에 관리하세요
              </span>

              {/* ⋯ 더보기: 부가 기능 (새로고침 · JSON 백업/불러오기) */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowMoreMenu(s => !s)} title="부가 기능" style={{
                  padding: '6px 14px', borderRadius: 20,
                  border: `1px solid ${showMoreMenu ? '#378ADD' : '#E8E8E6'}`,
                  background: showMoreMenu ? '#EFF6FF' : '#F8F8F7',
                  color: showMoreMenu ? '#1D4ED8' : '#6B6B68',
                  fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
                }}>⋯ 더보기</button>
                {showMoreMenu && (
                  <>
                    <div onClick={() => setShowMoreMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 91,
                      background: '#fff', border: '1px solid #E8E8E6', borderRadius: 10,
                      boxShadow: '0 6px 24px rgba(0,0,0,0.12)', padding: 6, minWidth: 170,
                      display: 'flex', flexDirection: 'column', gap: 2,
                    }}>
                      {cloudEnabled && (
                        <button onClick={() => { handleCloudRefresh(); setShowMoreMenu(false) }} style={menuItemStyle}>
                          ☁ 공유 데이터 새로고침
                        </button>
                      )}
                      <button onClick={() => { handleExport(); setShowMoreMenu(false) }} style={menuItemStyle}>
                        💾 JSON 백업 내려받기
                      </button>
                      <label style={{ ...menuItemStyle, display: 'block' }}>
                        <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }}
                          onChange={e => { if (e.target.files[0]) { handleImport(e.target.files[0]); setShowMoreMenu(false) } }} />
                        📂 JSON 불러오기
                      </label>
                    </div>
                  </>
                )}
              </div>
            </div>

            </>}
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

      {/* ── 벌크 업로드 결과 로그 (아코디언 펼침 시) ── */}
      {showUpload && bulkLog.length > 0 && (
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
            주차가 2개 이상 쌓이면 전주 대비(WoW)가 자동 계산됩니다
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

      {/* ── 데이터 품질 경고 스트립 ── */}
      {(coreLoaded || hasCornerData) && <DataQualityBanner warnings={dataWarnings} />}

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
            {activeTab === 'l3' && <L4_ExhibitionAnalysis storeCorner={thisWeek.storeCorner} prevStoreCorner={lastWeek.storeCorner} />}
            {activeTab === 'l4' && derived && <L3_ActionPanel derived={derived} storeCorner={thisWeek.storeCorner} />}
            {activeTab === 'kids' && kidsDerived && (
              <>
                <div style={{
                  background: '#FFF9F0', border: '1px solid #FDE68A', borderRadius: 8,
                  padding: '10px 16px', marginBottom: 16, fontSize: '0.8125rem', color: '#B45309',
                }}>
                  🧒 스타일코드 성별코드가 <strong>키즈</strong>인 상품만 걸러 재계산한 값입니다(자사몰 데이터 기준).
                  채널·방문·검색·쿠폰·고객 성별처럼 상품 단위로 쪼갤 수 없는 지표는 이 화면에서 비어 있습니다.
                </div>
                <L1_HealthCheck derived={kidsDerived} salesByDateMetrics={null} searchMetrics={null} />
                <div style={{ marginTop: 32 }}>
                  <L2_ProductAnalysis derived={kidsDerived} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showSnapshotModal && (
        <SnapshotSaveModal
          period={pendingNewWeek?.period ?? thisPeriod}
          payload={pendingNewWeek?.payload ?? thisWeek}
          filesPresent={pendingNewWeek?.filesPresent ?? ALL_FILES.filter(f => thisWeek[f.key]).map(f => f.key)}
          onClose={() => { setShowSnapshotModal(false); setPendingNewWeek(null) }}
          onSaved={async (savedKey) => {
            payloadCacheRef.current.delete(savedKey)  // 기존 주에 저장됐을 수 있으니 캐시 무효화 → DB 최신본 재로드
            const idx = await refreshIndex()
            setCompareWeekKey(null)
            await applySelectedWeek(savedKey, null, idx)
          }}
        />
      )}

      {showManageModal && (
        <SnapshotManageModal
          index={snapshotIndex}
          onClose={() => setShowManageModal(false)}
          onChanged={async () => {
            payloadCacheRef.current.clear()
            const idx = await refreshIndex()
            if (!selectedWeekKey || !idx.find(r => r.week_key === selectedWeekKey)) {
              // 보던 주가 삭제됐으면 가장 최근 주로 폴백
              setCompareWeekKey(null)
              await applySelectedWeek(mostRecentWeekKey(idx), null, idx)
            } else {
              // 보던 주는 유지하되, 비교 기준 주가 삭제됐을 수 있으니 재계산.
              // 수동 비교 주가 사라졌으면 자동(직전 주)로 폴백한다.
              const keepCompare = compareWeekKey && idx.find(r => r.week_key === compareWeekKey)
              if (!keepCompare) setCompareWeekKey(null)
              await applySelectedWeek(selectedWeekKey, keepCompare ? compareWeekKey : null, idx)
            }
          }}
        />
      )}

      <ScrollToTopButton />
    </div>
  )
}
