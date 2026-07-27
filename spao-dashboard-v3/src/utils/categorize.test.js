import { describe, it, expect } from 'vitest'
import { getIP, extractCollabIP } from './categorize'

describe('getIP — 엄격 모드 (알려진 IP만 콜라보로 인정)', () => {
  it('알려진 IP 브래킷은 표준 표시명을 반환한다', () => {
    expect(getIP('[포켓몬] 반팔티')).toBe('피카츄/포켓몬')
    expect(getIP('[산리오] 파자마')).toBe('산리오캐릭터즈')
    expect(getIP('[스누피]쿨링 나시')).toBe('스누피')
  })

  it('미매핑 브래킷(소재/기능 표기)은 콜라보로 보지 않는다 (null)', () => {
    // 링클프리 = 일반 소재 라인 → 콜라보 아님
    expect(getIP('[링클프리] 셔츠')).toBeNull()
    // 임의의 미매핑 브래킷도 자동 콜라보로 인식하지 않음
    expect(getIP('[프리미엄] 팬츠')).toBeNull()
    expect(getIP('[신상라인] 원피스')).toBeNull()
  })

  it('브래킷이 없으면 null', () => {
    expect(getIP('베이직 반팔티')).toBeNull()
    expect(getIP('')).toBeNull()
    expect(getIP(null)).toBeNull()
  })

  it('미매핑 브래킷과 알려진 IP가 함께 있으면 알려진 IP를 찾아 반환한다', () => {
    expect(getIP('[쿨링][디즈니] 티셔츠')).toBe('디즈니')
  })

  it('영문 IP(LUCY)는 기능성 태그로 오인되지 않고 인식된다', () => {
    // 짧은 영문 토큰은 원래 기능성 태그(COOL 등)로 제외되지만, 등록된 IP 는 우선 매칭
    expect(getIP('[LUCY] 가방_SPAKG37U01')).toBe('LUCY')
    expect(getIP('[lucy] 파자마')).toBe('LUCY')
    expect(extractCollabIP('[LUCY] 반팔티_SPRLG37U10')).toBe('LUCY')
    // 진짜 기능성 영문 태그는 여전히 콜라보로 보지 않음
    expect(getIP('[COOL] 와이드 팬츠')).toBeNull()
  })
})
