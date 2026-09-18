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

  /* ---------- V2 대학 그룹 체계 (대표님 지정 순서) ----------
     인서울권(명단 지정) → 서울경기권 → 지방거점국립(거주지 근접순) → 지방국립 → 지방사립 → 지방대
  */
  const INSEOUL_NAMED = new Set([
    // SKY
    '서울대학교', '고려대학교', '연세대학교',
    // 서성한
    '서강대학교', '성균관대학교', '한양대학교',
    // 중경외시
    '중앙대학교', '경희대학교', '한국외국어대학교', '서울시립대학교',
    // 건동홍숙
    '건국대학교', '동국대학교', '홍익대학교', '숙명여자대학교',
    // 국숭세단
    '국민대학교', '숭실대학교', '세종대학교', '단국대학교',
    // 광명상가
    '광운대학교', '명지대학교', '상명대학교', '가톨릭대학교',
  ]);

  const GEOJEOM_NATIONAL = ['강원대학교', '경북대학교', '경상국립대학교', '전남대학교', '전북대학교', '충남대학교', '충북대학교', '부산대학교', '제주대학교'];

  // 거주지역 → 거점국립대 근접순 (사용자가 준 예시: 대전→충남·충북·전북 / 천안→충남·충북·강원)
  const REGION_PROXIMITY = {
    '서울': ['강원대학교','충북대학교','충남대학교'],
    '인천': ['강원대학교','충남대학교','충북대학교'],
    '경기북부': ['강원대학교','충북대학교','충남대학교'],
    '경기남부': ['충북대학교','강원대학교','충남대학교'],
    '강원': ['강원대학교','충북대학교','경북대학교'],
    '대전': ['충남대학교','충북대학교','전북대학교'],
    '세종': ['충남대학교','충북대학교','전북대학교'],
    '충남': ['충남대학교','충북대학교','강원대학교'],
    '충북': ['충북대학교','충남대학교','강원대학교'],
    '광주': ['전남대학교','전북대학교','경상국립대학교'],
    '전남': ['전남대학교','전북대학교','경상국립대학교'],
    '전북': ['전북대학교','전남대학교','충남대학교'],
    '대구': ['경북대학교','경상국립대학교','부산대학교'],
    '경북': ['경북대학교','부산대학교','경상국립대학교'],
    '부산': ['부산대학교','경상국립대학교','경북대학교'],
    '울산': ['부산대학교','경상국립대학교','경북대학교'],
    '경남': ['경상국립대학교','부산대학교','경북대학교'],
    '제주': ['제주대학교','부산대학교','경상국립대학교'],
  };
  const TIER_ORDER_V2 = ['인서울권', '서울경기권', '지방거점국립', '지방국립', '지방사립', '지방대'];

  /** universities.json의 기존 tier(V1)를 대표님이 지정한 V2 6단계로 재분류 */
  function classifyTierV2(u) {
    if (INSEOUL_NAMED.has(u.name)) return '인서울권';
    if (u.tier === '인서울' || u.tier === '경기·인천권') return '서울경기권';
    if (u.tier === '지방거점국립') return '지방거점국립';
    if (u.tier === '지방국립(비거점)') return '지방국립';
    if (u.tier === '지방사립') return '지방사립';
    return '지방대'; // 지방공립, 기타유형(전문대/특성화 등)
  }

  /** 거주지역 기준으로 거점국립대 근접순 랭크(0=가장 가까움). 목록에 없으면 큰 값 반환. */
  function geojeomProximityRank(universityName, residenceRegion) {
    const order = REGION_PROXIMITY[residenceRegion];
    if (!order) return 99;
    const idx = order.indexOf(universityName);
    return idx === -1 ? 99 : idx;
  }

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
   * 임의의 오행 역할 목록(예: 관성만, 또는 용신+희신만)으로 대학을 분류하는 범용 함수.
   * @param {Array} universities - universities.json 배열
   * @param {Array} roleList - [{element:'토', role:'관성', priority:1}, ...] 형태. priority 낮을수록 우선.
   * @param {Object} [options]
   * @param {boolean} [options.fourYearOnly=true]
   * @param {string} [options.gisinElement] - 이 오행이면 avoid로 분류 (선택)
   * @param {'M'|'F'} [options.gender]
   * @returns {{ recommended: Array, avoid: Array }}
   */
  function matchByRoleList(universities, roleList, options) {
    const opt = Object.assign({ fourYearOnly: true, gisinElement: null, gender: null }, options || {});

    let pool = opt.fourYearOnly
      ? universities.filter(u => u.type === '4년제 대학')
      : universities.slice();

    if (opt.gender === 'M') {
      pool = pool.filter(u => !u.womensOnly);
    }

    const roleOfElement = {};
    roleList.forEach(r => { if (!(r.element in roleOfElement)) roleOfElement[r.element] = r; });

    const recommended = [];
    const avoid = [];

    pool.forEach(u => {
      if (opt.gisinElement && u.element === opt.gisinElement) {
        avoid.push(Object.assign({}, u, { role: '병신(비선호)' }));
        return;
      }
      const roleInfo = roleOfElement[u.element];
      if (roleInfo) {
        recommended.push(Object.assign({}, u, { role: roleInfo.role, priority: roleInfo.priority }));
      }
    });

    const sortFn = (a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const ta = TIER_RANK[a.tier] ?? 999, tb = TIER_RANK[b.tier] ?? 999;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name, 'ko');
    };
    recommended.sort(sortFn);
    avoid.sort((a, b) => {
      const ta = TIER_RANK[a.tier] ?? 999, tb = TIER_RANK[b.tier] ?? 999;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name, 'ko');
    });

    return { recommended, avoid };
  }

  /**
   * 용신/희신/병신/약신 오행별로 대학을 분류. (matchByRoleList의 래퍼 — 하위호환용)
   * @param {Array} universities - universities.json 배열
   * @param {Object} ys - SajuCore.computeYongsin()의 반환값 (yongsin/huisin/gisin/gusin 포함)
   * @param {Object} [options]
   * @param {boolean} [options.fourYearOnly=true] - 4년제 대학만 포함할지 여부
   * @param {boolean} [options.includeGisin=false] - 병신(기신) 오행 대학을 "비선호" 목록에 포함할지
   * @param {'M'|'F'} [options.gender] - 학생 성별. 'M'이면 여자대학(womensOnly=true)을 결과에서 자동 제외
   * @returns {{ recommended: Array, avoid: Array, meta: Object }}
   */
  function matchUniversities(universities, ys, options) {
    const opt = Object.assign({ fourYearOnly: true, includeGisin: true, gender: null }, options || {});

    const roleList = [{ element: ys.yongsin, role: '용신', priority: 1 }];
    if (ys.huisin !== ys.yongsin) roleList.push({ element: ys.huisin, role: '희신', priority: 2 });
    if (ys.gusin !== ys.yongsin && ys.gusin !== ys.huisin) roleList.push({ element: ys.gusin, role: '약신', priority: 3 });

    const { recommended, avoid } = matchByRoleList(universities, roleList, {
      fourYearOnly: opt.fourYearOnly,
      gisinElement: opt.includeGisin ? ys.gisin : null,
      gender: opt.gender,
    });

    return {
      recommended,
      avoid,
      meta: {
        yongsin: ys.yongsin, huisin: ys.huisin, gisin: ys.gisin, gusin: ys.gusin,
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

  const SajuUnivMap = {
    matchUniversities, matchByRoleList, groupByTier, groupByRole, TIER_ORDER,
    // V2
    classifyTierV2, geojeomProximityRank, TIER_ORDER_V2, INSEOUL_NAMED, GEOJEOM_NATIONAL, REGION_PROXIMITY,
  };
  root.SajuUnivMap = SajuUnivMap;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SajuUnivMap;
  }
})(typeof window !== 'undefined' ? window : globalThis);
