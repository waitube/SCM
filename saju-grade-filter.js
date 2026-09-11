/* ============================================================
   saju-grade-filter.js — ④ 내신등급 필터 + ⑤ 확률(상향~하향) 판정 엔진
   -------------------------------------------------------------
   ③단계(saju-university-map.js)가 골라준 "오행상 맞는 대학 목록"에
   실제 배치표(대학×학과×전형별 내신 커트라인) 데이터를 적용해서
   - 학생 내신으로 지원 가능한 대학만 필터링하고
   - 상향/소신/적정/안정/하향 확률을 매기고
   - 수시 6개 + 정시 3개로 최종 추천을 뽑아냅니다.

   ⚠ 이 파일은 로직만 제공합니다. 실제 서비스에 쓰려면
      placementData 배열에 "진짜" 배치표 데이터를 넣어야 합니다.
      (샘플/테스트용 가상 데이터는 sample-placement-data.js 참고 —
       그 파일의 숫자는 전부 가짜이며 실제 커트라인이 아닙니다)

   -------------------------------------------------------------
   [배치표 데이터 스키마] placementData: Array<PlacementRow>
   PlacementRow = {
     university:   string,   // 대학명 (universities.json의 name과 정확히 일치해야 매칭됨)
     department:   string,   // 학과/모집단위명
     track:        '수시' | '정시',
     admissionType:string,   // 예: '학생부교과','학생부종합','논술','수능위주' 등
     cutoffGrade:  number,   // 내신 등급 커트라인 (숫자가 작을수록 상위권, 1.0~9.0)
     year:         number,   // 기준 연도 (배치표는 매년 갱신 필요)
   }
   ============================================================ */

(function (root) {

  /**
   * 학생 내신등급과 대학 커트라인의 차이(Δ)로 5단계 확률 판정.
   * Δ = 학생등급 - 커트라인등급 (등급 숫자는 작을수록 우수)
   *   Δ가 크게 음수  → 학생이 커트라인보다 훨씬 좋음 → 하향(안전)
   *   Δ가 크게 양수  → 학생이 커트라인보다 많이 부족  → 상향(도전)
   */
  const TIER_THRESHOLDS = [
    { max: -0.5, tier: '하향' },
    { max: 0,    tier: '안정' },
    { max: 0.3,  tier: '적정' },
    { max: 0.7,  tier: '소신' },
    { max: Infinity, tier: '상향' },
  ];

  function classifyDelta(studentGrade, cutoffGrade) {
    const delta = +(studentGrade - cutoffGrade).toFixed(2);
    const found = TIER_THRESHOLDS.find(t => delta <= t.max);
    return { delta, probTier: found.tier };
  }

  /**
   * ③단계 추천 목록(university-map 결과)에 배치표를 적용해서
   * 지원 가능 학과 단위로 펼치고, 각 항목에 delta/probTier를 붙여 반환.
   *
   * @param {Array} recommendedUniversities - SajuUnivMap.matchUniversities(...).recommended
   * @param {Array} placementData - 실제(또는 샘플) 배치표 배열
   * @param {number} studentGrade - 학생 내신 등급 (예: 1.8)
   * @param {Object} [options]
   * @param {number} [options.rangeBuffer=1.2] - 이 범위(등급) 밖의 커트라인은 애초에 후보에서 제외 (너무 터무니없는 상향/하향 제거용)
   */
  function filterByGrade(recommendedUniversities, placementData, studentGrade, options) {
    const opt = Object.assign({ rangeBuffer: 1.2 }, options || {});
    const univByName = new Map(recommendedUniversities.map(u => [u.name, u]));

    const candidates = [];
    placementData.forEach(row => {
      const uniInfo = univByName.get(row.university);
      if (!uniInfo) return; // ③단계 오행 추천 목록에 없는 대학이면 스킵 (오행상 안 맞는 대학)
      const { delta, probTier } = classifyDelta(studentGrade, row.cutoffGrade);
      if (Math.abs(delta) > opt.rangeBuffer) return; // 너무 비현실적인 상향/하향은 제외

      candidates.push(Object.assign({}, uniInfo, {
        university: uniInfo.name, // dedup/표시용으로 명시적 필드 추가 (uniInfo.name과 동일)
        department: row.department,
        track: row.track,
        admissionType: row.admissionType,
        cutoffGrade: row.cutoffGrade,
        cutoffGrade5: row.cutoffGrade5 !== undefined ? row.cutoffGrade5 : null,
        cutoffGrade50: row.cutoffGrade50 !== undefined ? row.cutoffGrade50 : null,
        midCategory: row.midCategory || null,       // 중계열(인문사회/자연과학/공학/의학/예체능/광역/기타)
        recruitCount: row.recruitCount || 0,         // 모집인원 — 가중치용
        history: row.history || null,                // 최근 최대 3개년 추이
        year: row.year,
        delta,
        probTier,
      }));
    });
    return candidates;
  }

  /**
   * 최종 수시 N개 + 정시 M개 선정.
   * 기본 전략: 수시는 상향2·소신1·적정1·안정1·하향1, 정시는 상향1·적정1·안정1
   * (흔히 쓰이는 배분이며, 실제 컨설팅에서는 학생 성향에 따라 대표님이 직접 조정하는 부분)
   */
  const DEFAULT_SUSI_MIX  = ['상향', '상향', '소신', '적정', '안정', '하향']; // 6개
  const DEFAULT_JEONGSI_MIX = ['상향', '적정', '안정']; // 3개

  function pickFinalList(candidates, options) {
    const opt = Object.assign({
      susiCount: 6, jeongsiCount: 3,
      susiMix: DEFAULT_SUSI_MIX, jeongsiMix: DEFAULT_JEONGSI_MIX,
    }, options || {});

    // delta(등급차)가 비슷한 범위(0.1 단위)면 모집인원이 많은(더 안정적인) 전형을 우선 배치
    const weightedSort = (a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const bucketA = Math.round(a.delta * 10), bucketB = Math.round(b.delta * 10);
      if (bucketA !== bucketB) return bucketA - bucketB;
      return (b.recruitCount || 0) - (a.recruitCount || 0);
    };
    const susiPool = candidates.filter(c => c.track === '수시').sort(weightedSort);
    const jeongsiPool = candidates.filter(c => c.track === '정시').sort(weightedSort);

    function pickByMix(pool, mix) {
      const used = new Set();
      const picked = [];
      mix.forEach(tier => {
        const found = pool.find(c => c.probTier === tier && !used.has(c.university + c.department + c.admissionType));
        if (found) { picked.push(found); used.add(found.university + found.department + found.admissionType); }
      });
      return picked;
    }

    return {
      susi: pickByMix(susiPool, opt.susiMix).slice(0, opt.susiCount),
      jeongsi: pickByMix(jeongsiPool, opt.jeongsiMix).slice(0, opt.jeongsiCount),
    };
  }

  const SajuGradeFilter = { classifyDelta, filterByGrade, pickFinalList, TIER_THRESHOLDS };
  root.SajuGradeFilter = SajuGradeFilter;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SajuGradeFilter;
  }
})(typeof window !== 'undefined' ? window : globalThis);
