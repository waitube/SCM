/* ============================================================
   college-match-ui.js — 대학매칭 화면 폼 입력 → 결과 렌더링
   -------------------------------------------------------------
   로드 순서 (college-match-app.html 기준):
     saju-core.js → universities-data.js → saju-university-map.js
     → saju-grade-filter.js → sample-placement-data.js → (이 파일)
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

// ① 관(官) 그룹 — 학과/등급 없이 대학 단위로만 보여주는 간단 카드
function univSimpleCardHTML(u) {
  return `
  <div class="univ-card">
    <div class="left">
      <div class="uname">${u.name}</div>
      <div class="udept">${u.region || ''}</div>
      <div class="utags">
        <span class="tag tier">${u.tier}</span>
        <span class="tag role" style="background:${elemChipColor(u.element)}">${u.role} · ${u.element}</span>
      </div>
    </div>
  </div>`;
}

function univCardHTML(u) {
  const g5 = (u.cutoffGrade5 !== null && u.cutoffGrade5 !== undefined) ? u.cutoffGrade5 : '-';
  return `
  <div class="univ-card">
    <div class="left">
      <div class="uname">${u.university}</div>
      <div class="udept">${u.department} · ${u.admissionType} · 컷 ${u.cutoffGrade}등급 (5등급 환산 ${g5}) · ${u.year}</div>
      ${historyHTML(u.history)}
      <div class="utags">
        <span class="tag tier">${u.tier}</span>
        <span class="tag role" style="background:${elemChipColor(u.element)}">${u.role} · ${u.element}</span>
        ${u.midCategory ? `<span class="tag midcat">${u.midCategory}</span>` : ''}
        ${u.recruitCount ? `<span class="tag quota">모집 ${u.recruitCount}명</span>` : ''}
      </div>
    </div>
    <div class="prob-badge prob-${u.probTier}">${u.probTier}</div>
  </div>`;
}

function renderListOrEmpty(list, containerId, emptyMsg, cardFn) {
  const el = document.getElementById(containerId);
  if (!list.length) {
    el.innerHTML = `<div class="empty-note">${emptyMsg}</div>`;
    return;
  }
  el.innerHTML = `<div class="univ-list">${list.map(cardFn || univCardHTML).join('')}</div>`;
}

document.getElementById('matchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const dateVal = document.getElementById('bdate').value;
  if (!dateVal) { alert('생년월일을 입력해주세요.'); return; }
  const gradeVal = parseFloat(document.getElementById('grade').value);
  if (!gradeVal || gradeVal < 1 || gradeVal > 9) { alert('내신 등급을 1.0~9.0 사이로 입력해주세요.'); return; }

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

  // ③-A 관(官) 그룹 — 일간 기준 관성 오행 대학, 등급 필터 없이 지역티어 순 상위 6개
  const gwanMatch = SajuUnivMap.matchByRoleList(
    window.UNIVERSITIES_DATA,
    [{ element: gwanElem, role: '관성', priority: 1 }],
    { gender: selectedGender }
  );
  const gwanTop6 = gwanMatch.recommended.slice(0, 6);

  // ③-B 용신·희신 그룹 — 내신등급에 맞춰 상향~하향 6개
  const yongHuiRoles = [{ element: ys.yongsin, role: '용신', priority: 1 }];
  if (ys.huisin !== ys.yongsin) yongHuiRoles.push({ element: ys.huisin, role: '희신', priority: 2 });
  const yongHuiMatch = SajuUnivMap.matchByRoleList(window.UNIVERSITIES_DATA, yongHuiRoles, { gender: selectedGender });

  // ④ 내신 등급 필터 (실제 수시 배치데이터 사용 — 대학어디가 공시자료 재가공본)
  const candidates = SajuGradeFilter.filterByGrade(yongHuiMatch.recommended, window.realSusiPlacementData, gradeVal);

  // ⑤ 용신·희신 그룹 최종 6개 선정 (정시는 데이터 확보 전까지 비움)
  const final = SajuGradeFilter.pickFinalList(candidates, { jeongsiCount: 0 });

  // ---- 렌더링 ----
  document.getElementById('result').classList.remove('hidden');

  document.getElementById('sajuSummary').textContent =
    `${document.getElementById('name').value.trim() || '학생'} · ${selectedGender === 'M' ? '남' : '여'} · 일간 ${SajuCore.STEMS[saju.day.stem]}(${dayElem}) · 내신 ${gradeVal}등급`;

  document.getElementById('sajuChips').innerHTML = `
    <span class="summary-chip" style="background:${elemChipColor(gwanElem)}">관성 ${gwanElem}</span>
    <span class="summary-chip" style="background:${elemChipColor(ys.yongsin)}">용신 ${ys.yongsin}</span>
    <span class="summary-chip" style="background:${elemChipColor(ys.huisin)}">희신 ${ys.huisin}</span>
    <span class="summary-chip" style="background:${elemChipColor(ys.gisin)}">병신(비선호) ${ys.gisin}</span>
  `;

  renderListOrEmpty(gwanTop6, 'gwanSection', '조건에 맞는 대학을 찾지 못했습니다.', univSimpleCardHTML);
  document.getElementById('gwanSection').innerHTML =
    `<div class="section-title">① 관(官) 추천 <span class="count">(${gwanTop6.length}/6)</span></div>` + document.getElementById('gwanSection').innerHTML;

  renderListOrEmpty(final.susi, 'susiSection', '조건에 맞는 학과를 찾지 못했습니다. 내신등급을 확인해보세요.');
  document.getElementById('susiSection').innerHTML =
    `<div class="section-title">② 용신·희신 추천 (내신 반영) <span class="count">(${final.susi.length}/6)</span></div>` + document.getElementById('susiSection').innerHTML;

  const resultEl = document.getElementById('result');
  if (typeof resultEl.scrollIntoView === 'function') {
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
