const KEY_THIS = 'spao_v3_thisWeek'
const KEY_LAST = 'spao_v3_lastWeek'

export function saveState(thisWeek, lastWeek) {
  try {
    localStorage.setItem(KEY_THIS, JSON.stringify(thisWeek))
    localStorage.setItem(KEY_LAST, JSON.stringify(lastWeek))
  } catch (e) {
    console.warn('localStorage 저장 실패:', e)
  }
}

export function loadState() {
  try {
    const t = localStorage.getItem(KEY_THIS)
    const l = localStorage.getItem(KEY_LAST)
    if (!t) return null
    return {
      thisWeek: JSON.parse(t),
      lastWeek: l ? JSON.parse(l) : null,
    }
  } catch (e) {
    console.warn('localStorage 로드 실패:', e)
    return null
  }
}

export function clearState() {
  localStorage.removeItem(KEY_THIS)
  localStorage.removeItem(KEY_LAST)
}

export function exportJSON(thisWeek, lastWeek) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const blob = new Blob([JSON.stringify({ thisWeek, lastWeek }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `spao_dashboard_${date}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        resolve({ thisWeek: data.thisWeek || null, lastWeek: data.lastWeek || null })
      } catch (err) {
        reject(new Error('JSON 파싱 실패: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsText(file)
  })
}
