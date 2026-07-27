// 문자열을 3-gram 집합으로 만들고 자카드 유사도를 계산한다(pg_trgm 근사).
function trigrams(text) {
  const s = `  ${(text ?? '').toLowerCase().trim()} `;
  const set = new Set();
  for (let i = 0; i < s.length - 2; i += 1) set.add(s.slice(i, i + 3));
  return set;
}

export function trigramSimilarity(a, b) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return inter / (A.size + B.size - inter);
}
