/* ============================================================
   college-match-ui.js — 대학매칭 화면 폼 입력 → 결과 렌더링
   -------------------------------------------------------------
   로드 순서 (index.html 기준):
     saju-core.js → universities-data.js → saju-university-map.js
     → saju-grade-filter.js → real-susi-placement-data.js → ilju-jobs.js → (이 파일)
   ============================================================ */

let selectedGender = 'M';
const selectedJasiMode = 'unified'; // 대표님 고유 이론 — 정자시로 고정 (선택 UI 없음)

document.querySelectorAll('#genderGroup .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#genderGroup .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    selectedGender = chip.dataset.val;
  });
});
document.getElementById('timeUnknown').addEventListener('change', (e) => {
  document.getElementById('btime').disabled = e.target.checked;
  if (e.target.checked) document.getElementById('btime').value = '';
});

function elemChipColor(elem) {
  return { '목': 'var(--mok)', '화': 'var(--hwa)', '토': 'var(--to)', '금': 'var(--geum)', '수': 'var(--su)' }[elem] || '#888';
}

function historyHTML(history) {
  if (!history || history.length < 2) return '';
  const parts = history.slice().reverse().map(h => `${h.year} <b>${h.cutoffGrade}</b>`).join(' → ');
  return `<div class="udept" style="margin-top:2px;">최근 추이: ${parts}</div>`;
}

function univCardHTML(u) {
  const g5 = (u.cutoffGrade5 !== null && u.cutoffGrade5 !== undefined) ? u.cutoffGrade5 : '-';
  return `
  <div class="univ-card">
    <div class="left">
      <div class="uname">${u.university}${u._forced ? ' <span style="font-size:10px;color:var(--seal);">(도전 추천)</span>' : ''}</div>
      <div class="udept">${u.department} · ${u.admissionType} · 컷 ${u.cutoffGrade}등급 (5등급 환산 ${g5}) · ${u.year}</div>
      ${historyHTML(u.history)}
      <div class="utags">
        <span class="tag role" style="background:${elemChipColor(u.element)}">${u.role} · ${u.element}</span>
        ${u.midCategory ? `<span class="tag midcat">${u.midCategory}</span>` : ''}
        ${u.recruitCount ? `<span class="tag quota">모집 ${u.recruitCount}명</span>` : ''}
      </div>
    </div>
    <div class="prob-badge prob-${u.probTier}">${u.probTier}</div>
  </div>`;
}

// V2 6단계(인서울권→서울경기권→지방거점국립→지방국립→지방사립→지방대)로 묶어서, 개수 제한 없이 렌더링
function tierGroupedHTMLv2(list, residenceRegion) {
  const order = SajuUnivMap.TIER_ORDER_V2;
  const groups = {};
  list.forEach(u => {
    const t = SajuUnivMap.classifyTierV2(u);
    (groups[t] = groups[t] || []).push(u);
  });
  // 지방거점국립 그룹만 거주지역 근접순으로 재정렬
  if (groups['지방거점국립']) {
    groups['지방거점국립'].sort((a, b) => {
      const ra = SajuUnivMap.geojeomProximityRank(a.university, residenceRegion);
      const rb = SajuUnivMap.geojeomProximityRank(b.university, residenceRegion);
      return (ra - rb) || (a.delta - b.delta);
    });
  }
  return order.filter(t => groups[t] && groups[t].length).map(t => `
    <div class="tier-group">
      <div class="tier-heading">${t} <span class="count">${groups[t].length}개</span></div>
      <div class="univ-list">${groups[t].map(univCardHTML).join('')}</div>
    </div>`).join('');
}

// 같은 대학이 학과·전형·연도별로 여러 번 뜨는 것을 막고, 대학당 가장 근접한(delta 절대값 최소) 1건만 남김
function dedupeByUniversity(candidates) {
  const bestByUniv = new Map();
  candidates.forEach(c => {
    const cur = bestByUniv.get(c.university);
    if (!cur || Math.abs(c.delta) < Math.abs(cur.delta)) bestByUniv.set(c.university, c);
  });
  return Array.from(bestByUniv.values());
}

// 인서울권 그룹에 "극상향" 카드가 2개 미만이면, 인서울권 후보 중 컷이 가장 높은(어려운) 곳을 강제로 2개까지 "극상향"으로 채움
function ensureExtremeReach(candidates) {
  const inseoul = candidates.filter(c => SajuUnivMap.classifyTierV2(c) === '인서울권');
  const already = inseoul.filter(c => c.probTier === '극상향');
  if (already.length >= 2) return candidates;

  const usedKeys = new Set(already.map(c => c.university + c.department + c.admissionType));
  const need = 2 - already.length;
  const forcedPool = inseoul
    .filter(c => c.probTier !== '극상향' && !usedKeys.has(c.university + c.department + c.admissionType))
    .sort((a, b) => a.cutoffGrade - b.cutoffGrade); // 가장 빡센(어려운) 곳부터

  const forced = forcedPool.slice(0, need).map(c => Object.assign({}, c, { probTier: '극상향', _forced: true }));
  const forcedKeys = new Set(forced.map(c => c.university + c.department + c.admissionType));
  const rest = candidates.filter(c => !forcedKeys.has(c.university + c.department + c.admissionType));
  return rest.concat(forced);
}

function renderTierGroupedV2(list, containerId, titlePrefix, residenceRegion, emptyMsg) {
  const el = document.getElementById(containerId);
  const title = `<div class="section-title">${titlePrefix} <span class="count">(총 ${list.length}개)</span></div>`;
  el.innerHTML = title + (list.length ? tierGroupedHTMLv2(list, residenceRegion) : `<div class="empty-note">${emptyMsg}</div>`);
}

function renderJobSection(iljuName) {
  const el = document.getElementById('jobSection');
  const data = window.ILJU_JOBS && window.ILJU_JOBS[iljuName];
  if (!data) {
    el.innerHTML = `<div class="empty-note">일주(${iljuName}) 직업 데이터를 찾지 못했습니다.</div>`;
    return;
  }
  el.innerHTML = `
    <div class="caption" style="text-align:left; font-size:13px; margin-bottom:8px;"><b>${iljuName}(日柱)</b> · 핵심: ${data.core || '-'}</div>
    <div class="utags" style="margin-bottom:10px;">
      ${data.jobs.slice(0, 14).map(j => `<span class="tag midcat">${j.split(',')[0].split('(')[0].trim()}</span>`).join('')}
    </div>
    <div class="note">${data.summary || ''}</div>
  `;
}

document.getElementById('matchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const dateVal = document.getElementById('bdate').value;
  if (!dateVal) { alert('생년월일을 입력해주세요.'); return; }
  const gradeVal = parseFloat(document.getElementById('grade').value);
  if (!gradeVal || gradeVal < 1 || gradeVal > 9) { alert('내신 등급을 1.0~9.0 사이로 입력해주세요.'); return; }
  const residenceRegion = document.getElementById('region').value;

  const [y, m, d] = dateVal.split('-').map(Number);
  const hasTime = !document.getElementById('timeUnknown').checked && document.getElementById('btime').value;
  let hour = 12, minute = 0;
  if (hasTime) {
    const [hh, mm] = document.getElementById('btime').value.split(':').map(Number);
    hour = hh; minute = mm;
  }

  // ① + ② 사주/용신 산출
  const saju = SajuCore.computeSaju(y, m, d, hour, minute, !!hasTime, selectedGender, selectedJasiMode);
  const ys = SajuCore.computeYongsin(saju, !!hasTime);
  const dayElem = SajuCore.STEM_ELEM[saju.day.stem];
  const gwanElem = Object.keys(SajuCore.CONTROLS).find(k => SajuCore.CONTROLS[k] === dayElem);
  const iljuName = SajuCore.STEMS[saju.day.stem] + SajuCore.BRANCHES[saju.day.branch];

  // ③-A 관(官) 그룹 — 일간 기준 관성 오행 대학, 내신 반영, 개수 제한 없음
  const gwanMatch = SajuUnivMap.matchByRoleList(
    window.UNIVERSITIES_DATA,
    [{ element: gwanElem, role: '관성', priority: 1 }],
    { gender: selectedGender }
  );
  let gwanCandidates = SajuGradeFilter.filterByGrade(gwanMatch.recommended, window.realSusiPlacementData, gradeVal);
  gwanCandidates = dedupeByUniversity(gwanCandidates);
  gwanCandidates = ensureExtremeReach(gwanCandidates);

  // ③-B 용신·희신 그룹 — 내신등급에 맞춰, 개수 제한 없음
  const yongHuiRoles = [{ element: ys.yongsin, role: '용신', priority: 1 }];
  if (ys.huisin !== ys.yongsin) yongHuiRoles.push({ element: ys.huisin, role: '희신', priority: 2 });
  const yongHuiMatch = SajuUnivMap.matchByRoleList(window.UNIVERSITIES_DATA, yongHuiRoles, { gender: selectedGender });
  let yongHuiCandidates = SajuGradeFilter.filterByGrade(yongHuiMatch.recommended, window.realSusiPlacementData, gradeVal);
  yongHuiCandidates = dedupeByUniversity(yongHuiCandidates);
  yongHuiCandidates = ensureExtremeReach(yongHuiCandidates);

  // ---- 렌더링 ----
  document.getElementById('result').classList.remove('hidden');

  document.getElementById('sajuSummary').textContent =
    `${document.getElementById('name').value.trim() || '학생'} · ${selectedGender === 'M' ? '남' : '여'} · 거주 ${residenceRegion} · 일간 ${SajuCore.STEMS[saju.day.stem]}(${dayElem}) · 내신 ${gradeVal}등급`;

  document.getElementById('sajuChips').innerHTML = `
    <span class="summary-chip" style="background:${elemChipColor(gwanElem)}">관성 ${gwanElem}</span>
    <span class="summary-chip" style="background:${elemChipColor(ys.yongsin)}">용신 ${ys.yongsin}</span>
    <span class="summary-chip" style="background:${elemChipColor(ys.huisin)}">희신 ${ys.huisin}</span>
    <span class="summary-chip" style="background:${elemChipColor(ys.gisin)}">병신(비선호) ${ys.gisin}</span>
  `;

  renderJobSection(iljuName);

  renderTierGroupedV2(gwanCandidates, 'gwanSection', '① 관(官) 추천 (내신 반영)', residenceRegion,
    '조건에 맞는 학과를 찾지 못했습니다. 내신등급을 확인해보세요.');

  renderTierGroupedV2(yongHuiCandidates, 'susiSection', '② 용신·희신 추천 (내신 반영)', residenceRegion,
    '조건에 맞는 학과를 찾지 못했습니다. 내신등급을 확인해보세요.');

  const resultEl = document.getElementById('result');
  if (typeof resultEl.scrollIntoView === 'function') {
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
