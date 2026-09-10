/* ============================================================
   saju-university-map.js — 오행(용신·희신·병신·약신) ↔ 대학 매핑 엔진
   -------------------------------------------------------------
   saju-core.js의 computeYongsin() 결과를 받아서
   universities.json(전국 415개교 오행 분류 DB) 중
   추천 대학 / 비선호 대학을 골라주는 모듈입니다.

   ⚠ 이 모듈 단독으로는 "합격 가능성"을 판단하지 않습니다.
      (그건 다음 단계인 내신 등급 필터의 역할입니다)
      여기서는 "오행상 어떤 대학군이 이 학생에게 힘이 되는가"만 정리합니다.

   사용법 (브라우저):
     <script src="saju-core.js"></script>
     <script src="saju-university-map.js"></script>
     <script>
       fetch('universities.json').then(r=>r.json()).then(universities=>{
         const saju = SajuCore.computeSaju(1974,4,10,23,40,true,'M','split');
         const ys   = SajuCore.computeYongsin(saju, true);
         const result = SajuUnivMap.matchUniversities(universities, ys);
         console.log(result);
       });
     </script>
   ============================================================ */

(function (root) {

  // 지역 티어 우선순위 (① 인서울 → ② 경기·인천권 → ③ 지방거점국립 → ④ 지방국립(비거점) → ⑤ 지방사립)
  const TIER_ORDER = [
    '인서울',
    '경기·인천권',
    '지방거점국립',
    '지방국립(비거점)',
    '지방사립',
    '지방공립',
    '기타유형(전문대/특성화/기타)',
  ];
  const TIER_RANK = Object.fromEntries(TIER_ORDER.map((t, i) => [t, i]));

  /**
   * 용신/희신/병신/약신 오행별로 대학을 분류.
   * @param {Array} universities - universities.json 배열
   * @param {Object} ys - SajuCore.computeYongsin()의 반환값 (yongsin/huisin/gisin/gusin 포함)
   * @param {Object} [options]
   * @param {boolean} [options.fourYearOnly=true] - 4년제 대학만 포함할지 여부
   * @param {boolean} [options.includeGisin=false] - 병신(기신) 오행 대학을 "비선호" 목록에 포함할지
   * @returns {{ recommended: Array, avoid: Array, meta: Object }}
   */
  function matchUniversities(universities, ys, options) {
    const opt = Object.assign({ fourYearOnly: true, includeGisin: true }, options || {});

    const pool = opt.fourYearOnly
      ? universities.filter(u => u.type === '4년제 대학')
      : universities.slice();

    // 오행별 role 라벨 부여 (용신 > 희신 > 약신 순 우선순위)
    const roleOfElement = {};
    roleOfElement[ys.yongsin] = { role: '용신', priority: 1 };
    if (!(ys.huisin in roleOfElement)) roleOfElement[ys.huisin] = { role: '희신', priority: 2 };
    if (!(ys.gusin in roleOfElement)) roleOfElement[ys.gusin] = { role: '약신', priority: 3 };
    // 병신은 추천군이 아니라 별도 "비선호" 목록으로 분리 (roleOfElement에는 넣지 않음)

    const recommended = [];
    const avoid = [];

    pool.forEach(u => {
      if (u.element === ys.gisin) {
        if (opt.includeGisin) {
          avoid.push(Object.assign({}, u, { role: '병신(비선호)' }));
        }
        return;
      }
      const roleInfo = roleOfElement[u.element];
      if (roleInfo) {
        recommended.push(Object.assign({}, u, { role: roleInfo.role, priority: roleInfo.priority }));
      }
      // 어느 신(神)에도 해당하지 않는 오행(한신)은 결과에 넣지 않음 — 필요하면 이 부분에서 opt로 추가 가능
    });

    // 정렬: 오행 우선순위(용신→희신→약신) → 지역 티어(인서울→...→지방사립) → 가나다순
    const sortFn = (a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const ta = TIER_RANK[a.tier] ?? 999;
      const tb = TIER_RANK[b.tier] ?? 999;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name, 'ko');
    };
    recommended.sort(sortFn);
    avoid.sort((a, b) => {
      const ta = TIER_RANK[a.tier] ?? 999, tb = TIER_RANK[b.tier] ?? 999;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name, 'ko');
    });

    return {
      recommended,
      avoid,
      meta: {
        yongsin: ys.yongsin, huisin: ys.huisin, gisin: ys.gisin, gusin: ys.gusin,
        totalPoolSize: pool.length,
        recommendedCount: recommended.length,
        avoidCount: avoid.length,
      },
    };
  }

  /** 추천 목록을 지역 티어별로 그룹핑 (화면 렌더링용 헬퍼) */
  function groupByTier(recommended) {
    const grouped = {};
    TIER_ORDER.forEach(t => { grouped[t] = []; });
    recommended.forEach(u => {
      if (!grouped[u.tier]) grouped[u.tier] = [];
      grouped[u.tier].push(u);
    });
    return grouped;
  }

  /** 추천 목록을 오행 역할(용신/희신/약신)별로 그룹핑 (화면 렌더링용 헬퍼) */
  function groupByRole(recommended) {
    const grouped = { '용신': [], '희신': [], '약신': [] };
    recommended.forEach(u => {
      if (!grouped[u.role]) grouped[u.role] = [];
      grouped[u.role].push(u);
    });
    return grouped;
  }

  const SajuUnivMap = { matchUniversities, groupByTier, groupByRole, TIER_ORDER };
  root.SajuUnivMap = SajuUnivMap;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SajuUnivMap;
  }
})(typeof window !== 'undefined' ? window : globalThis);
