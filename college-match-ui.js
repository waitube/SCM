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

function univCardHTML(u) {
  return `
  <div class="univ-card">
    <div class="left">
      <div class="uname">${u.university}</div>
      <div class="udept">${u.department} · ${u.admissionType} · 컷 ${u.cutoffGrade}등급 (${u.year})</div>
      <div class="utags">
        <span class="tag tier">${u.tier}</span>
        <span class="tag role" style="background:${elemChipColor(u.element)}">${u.role} · ${u.element}</span>
      </div>
    </div>
    <div class="prob-badge prob-${u.probTier}">${u.probTier}</div>
  </div>`;
}

function renderListOrEmpty(list, containerId, emptyMsg) {
  const el = document.getElementById(containerId);
  if (!list.length) {
    el.innerHTML = `<div class="empty-note">${emptyMsg}</div>`;
    return;
  }
  el.innerHTML = `<div class="univ-list">${list.map(univCardHTML).join('')}</div>`;
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

  // ③ 오행 기반 대학 매핑 (성별 필터 적용)
  const mapped = SajuUnivMap.matchUniversities(window.UNIVERSITIES_DATA, ys, { gender: selectedGender });

  // ④ 내신 등급 필터 (실제 수시 배치데이터 사용 — 대학어디가 공시자료 재가공본)
  const candidates = SajuGradeFilter.filterByGrade(mapped.recommended, window.realSusiPlacementData, gradeVal);

  // ⑤ 최종 수시6 + 정시3 선정
  const final = SajuGradeFilter.pickFinalList(candidates);

  // ---- 렌더링 ----
  document.getElementById('result').classList.remove('hidden');

  const dayElem = SajuCore.STEM_ELEM[saju.day.stem];
  document.getElementById('sajuSummary').textContent =
    `${document.getElementById('name').value.trim() || '학생'} · ${selectedGender === 'M' ? '남' : '여'} · 일간 ${SajuCore.STEMS[saju.day.stem]}(${dayElem}) · 내신 ${gradeVal}등급`;

  document.getElementById('sajuChips').innerHTML = `
    <span class="summary-chip" style="background:${elemChipColor(ys.yongsin)}">용신 ${ys.yongsin}</span>
    <span class="summary-chip" style="background:${elemChipColor(ys.huisin)}">희신 ${ys.huisin}</span>
    <span class="summary-chip" style="background:${elemChipColor(ys.gisin)}">병신(비선호) ${ys.gisin}</span>
    <span class="summary-chip" style="background:${elemChipColor(ys.gusin)}">약신 ${ys.gusin}</span>
  `;

  renderListOrEmpty(final.susi, 'susiSection', '조건에 맞는 학과를 찾지 못했습니다. 내신등급이나 오행 조건을 확인해보세요.');
  document.getElementById('susiSection').innerHTML =
    `<div class="section-title">수시 추천 <span class="count">(${final.susi.length}/6)</span></div>` + document.getElementById('susiSection').innerHTML;

  renderListOrEmpty(final.jeongsi, 'jeongsiSection', '정시(수능) 배치표 데이터가 아직 없습니다. 데이터가 확보되면 이 자리에 추천이 표시됩니다.');
  document.getElementById('jeongsiSection').innerHTML =
    `<div class="section-title">정시 추천 <span class="count">(${final.jeongsi.length}/3)</span></div>` + document.getElementById('jeongsiSection').innerHTML;

  const resultEl = document.getElementById('result');
  if (typeof resultEl.scrollIntoView === 'function') {
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
