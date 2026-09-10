/* ============================================================
   saju-ui.js — 사주코어 화면(폼 입력 → 결과 렌더링) 로직
   -------------------------------------------------------------
   saju-core.js를 먼저 불러온 뒤 이 파일을 불러와야 합니다.
   (saju-core.js가 제공하는 computeSaju/computeYongsin 등
    전역 함수와 STEMS/BRANCHES 등 전역 데이터를 그대로 사용합니다)

   로드 순서:
     <script src="saju-core.js"></script>
     <script src="saju-ui.js"></script>
   ============================================================ */

/* ===================== 렌더링 ===================== */
function pillarHTML(labelKo, stem, branch, isDay){
  const stemChar = STEMS[stem], branchChar = BRANCHES[branch];
  const stemHan = STEMS_HAN[stem], branchHan = BRANCHES_HAN[branch];
  const elem = STEM_ELEM[stem];
  return `
  <div class="pillar ${isDay?'day':''}">

    ${isDay?'<div class="seal-mark">我</div>':''}
    <div class="label">${labelKo}</div>
    <span class="gz-char">${stemChar}${branchChar}</span>
    <span class="gz-han">${stemHan}${branchHan}</span>
    <span class="elem-tag" style="background:${ELEM_COLOR[elem]}">${elem}</span>
  </div>`;
}

function render(saju, name, gender, hasTime){
  document.getElementById('result').classList.remove('hidden');

  // 사주원국
  let html = '';
  html += pillarHTML('년주 年柱', saju.year.stem, saju.year.branch, false);
  html += pillarHTML('월주 月柱', saju.month.stem, saju.month.branch, false);
  html += pillarHTML('일주 日柱', saju.day.stem, saju.day.branch, true);
  if(hasTime){
    html += pillarHTML('시주 時柱', saju.hour.stem, saju.hour.branch, false);
  } else {
    html += `<div class="pillar"><div class="label">시주 時柱</div><span class="gz-char" style="color:var(--ink-soft)">?</span><div class="caption">시간 미상</div></div>`;
  }
  document.getElementById('pillarsWrap').innerHTML = html;
  document.getElementById('pillarCaption').textContent =
    `${name?name+' · ':''}${gender==='M'?'남':'여'} · 사주년(입춘기준) ${saju.sajuYear}년 · 일간(日干) "${STEMS[saju.day.stem]}(${STEM_ELEM[saju.day.stem]})"이 본인을 상징합니다`;

  document.getElementById('jasiNote').textContent = saju.jasiMode==='unified'
    ? '정자시법 적용: 23시30분부터는 이미 다음날로 간주하여 일주·시주를 계산했습니다.'
    : '야자시/조자시 분리법 적용: 일주는 자정(00:00) 기준으로 바뀌며, 23~01시는 자시로 표시하되 일주는 해당 시각의 실제 달력일을 따릅니다.';

  // 오행 분포
  const counts = {"목":0,"화":0,"토":0,"금":0,"수":0};
  const addP = (s,b)=>{ counts[STEM_ELEM[s]]++; counts[BRANCH_ELEM[b]]++; };
  addP(saju.year.stem, saju.year.branch);
  addP(saju.month.stem, saju.month.branch);
  addP(saju.day.stem, saju.day.branch);
  if(hasTime) addP(saju.hour.stem, saju.hour.branch);
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  let barHtml='', legendHtml='';
  for(const el of ["목","화","토","금","수"]){
    const pct = total? (counts[el]/total*100):0;
    if(pct>0) barHtml += `<div style="width:${pct}%;background:${ELEM_COLOR[el]}"></div>`;
    legendHtml += `<span><span class="dot" style="background:${ELEM_COLOR[el]}"></span>${el} ${counts[el]}</span>`;
  }
  document.getElementById('elemBar').innerHTML = barHtml;
  document.getElementById('elemLegend').innerHTML = legendHtml;

  // 용신 분석
  const ys = computeYongsin(saju, hasTime);
  const godRow = (labelKo, hanja, elem) => `
    <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px dashed rgba(138,112,72,.25);">
      <span style="width:70px; font-size:12px; color:var(--ink-soft);">${labelKo} ${hanja}</span>
      <span class="elem-tag" style="background:${ELEM_COLOR[elem]}">${elem}</span>
    </div>`;
  const ysHtml = `
    <div class="elem-bar" style="margin-top:0;">
      ${Object.keys(ys.counts).map(el=>{
        const pct = ys.total? (ys.counts[el]/ys.total*100):0;
        return pct>0 ? `<div style="width:${pct}%;background:${ELEM_COLOR[el]}"></div>` : '';
      }).join('')}
    </div>
    <div class="elem-legend">
      ${Object.keys(ys.counts).map(el=>`<span><span class="dot" style="background:${ELEM_COLOR[el]}"></span>${el} ${ys.counts[el]}</span>`).join('')}
    </div>
    <div class="caption" style="margin-top:10px; text-align:left;">
      <b>${ys.isStrong?'신강(身强)':'신약(身弱)'}</b> 사주 (아군 세력 ${ys.group1} : 상대 세력 ${ys.group2}) ·
      최강 오행 <b>${ys.strongest}</b>, 최약 오행 <b>${ys.weakest}</b>
    </div>
    ${ys.samhapNotes.length ? `<div class="caption" style="margin-top:8px; text-align:left; font-size:12px; color:var(--ink-soft);">🔗 ${ys.samhapNotes.join(' · ')}</div>` : ''}
    ${ys.tonggwan ? `<div class="caption" style="margin-top:8px; text-align:left; font-size:12px; color:var(--seal);">⚖ 통관 감지: ${ys.tonggwan.note}</div>` : ''}
    <div style="margin-top:14px;">
      ${godRow('용신','用神', ys.yongsin)}
      ${godRow('희신','喜神', ys.huisin)}
      ${godRow('병신','病神', ys.gisin)}
      ${godRow('약신','藥神', ys.gusin)}
    </div>
    <div class="caption" style="margin-top:10px; text-align:left; font-size:12px; color:var(--ink);">${ys.reason}</div>
    ${ys.byeongyak ? `<div class="caption" style="margin-top:8px; text-align:left; font-size:12px; color:var(--hwa);">🩹 병약 주의: ${ys.byeongyak.note}</div>` : ''}
    ${ys.johuNote ? `<div class="caption" style="margin-top:8px; text-align:left; font-size:12px; color:var(--ink-soft);">🌡 [조후 참고] ${ys.johuNote}</div>` : ''}
    <div style="margin-top:14px; padding:12px; background:var(--paper); border:1px solid var(--wood); border-radius:2px; text-align:left;">
      <b style="font-size:13px;">결론</b><br>
      <span style="font-size:13px;">용신은 <b style="color:${ELEM_COLOR[ys.yongsin]}">${ys.yongsin}</b>,
      희신은 <b style="color:${ELEM_COLOR[ys.huisin]}">${ys.huisin}</b>,
      병신은 <b style="color:${ELEM_COLOR[ys.gisin]}">${ys.gisin}</b>,
      약신은 <b style="color:${ELEM_COLOR[ys.gusin]}">${ys.gusin}</b> 입니다.</span>
    </div>
  `;
  document.getElementById('yongsinBody').innerHTML = ysHtml;

  // 사주 총평 해설
  document.getElementById('overviewBody').innerHTML = buildOverviewNarrative(saju, ys);

  // 신살
  const sinsalList = analyzeSinsal(saju, hasTime);
  document.getElementById('sinsalBody').innerHTML = sinsalList.length
    ? sinsalList.map(s=>`<div style="margin-bottom:8px;"><b>${s.name}</b> — ${s.desc}</div>`).join('')
    : `<div>뚜렷하게 성립하는 대표 신살은 확인되지 않았습니다.</div>`;

  // 십신 × 12운성 강도 결합
  const strength = analyzePillarStrength(saju, hasTime);
  const tierColor2 = { "강":"var(--seal)", "보통":"var(--to)", "약":"var(--ink-soft)" };
  let strengthHtml = `<table class="seun"><thead><tr><th>기둥</th><th>간지</th><th>십신</th><th>통근(12운성)</th></tr></thead><tbody>`;
  strength.rows.forEach(r=>{
    strengthHtml += `<tr>
      <td>${r.name}</td>
      <td class="seun-gz">${r.gzText}</td>
      <td>${r.god10}</td>
      <td style="color:${tierColor2[r.tier]}">${r.stage}(${r.tier})</td>
    </tr>`;
  });
  strengthHtml += `</tbody></table>`;
  strengthHtml += `<div class="elem-legend" style="margin-top:12px;">
    ${Object.keys(strength.groupScore).map(g=>`<span><span class="dot" style="background:var(--wood)"></span>${g} ${strength.groupScore[g]}점</span>`).join('')}
  </div>`;
  strengthHtml += `<div class="caption" style="margin-top:10px; text-align:left; font-size:12px;">통근 강도 기준으로 가장 세력이 큰 십신은 <b>${strength.dominant}</b>입니다.</div>`;
  document.getElementById('strengthBody').innerHTML = strengthHtml;

  // 대운
  document.getElementById('dwMeta').textContent =
    `${saju.forward?'순행(順行)':'역행(逆行)'} · 대운수 ${saju.dwStartAge} (약 ${saju.dwStartAgeExact.toFixed(1)}세부터 10년 단위로 전환)`;
  const nowYear = new Date().getFullYear();
  const currentAge = nowYear - saju.birthYear + 1; // 세는나이 근사
  let dwHtml = '';
  saju.daewoon.forEach(dw=>{
    const gz = gzFromIndex(dw.idx);
    const isCurrent = currentAge>=dw.startAge && currentAge < dw.startAge+10;
    dwHtml += `<div class="dw-block ${isCurrent?'current':''}">
      <div class="age">${dw.startAge}세</div>
      <div class="gz">${STEMS[gz.stem]}${BRANCHES[gz.branch]}</div>
    </div>`;
  });
  document.getElementById('dwStrip').innerHTML = dwHtml;

  // 대운 진로 흐름 분석
  const career = analyzeDaewoonCareer(saju, ys);
  const tierColor = { "강":"var(--seal)", "보통":"var(--to)", "약":"var(--ink-soft)" };
  let careerHtml = `<table class="seun"><thead><tr><th>나이</th><th>간지</th><th>십신</th><th>12운성</th><th>진로 성향</th></tr></thead><tbody>`;
  career.rows.forEach(r=>{
    careerHtml += `<tr>
      <td>${r.startAge}세</td>
      <td class="seun-gz">${r.gzText}</td>
      <td>${r.god10}<br><span style="font-size:10px; color:var(--ink-soft);">(${r.group5})</span></td>
      <td style="color:${tierColor[r.tier]}">${r.stage}(${r.tier})</td>
      <td style="font-size:11px;">${r.careerHint}${r.alignment!=='중립' ? ` · ${r.alignment}`:''}</td>
    </tr>`;
  });
  careerHtml += `</tbody></table>`;
  if(career.mainPath){
    careerHtml += `<div style="margin-top:14px; padding:12px; background:var(--paper); border:1px solid var(--wood); border-radius:2px;">
      <b style="font-size:13px;">타고난 큰 길 (그릇 판단 참고)</b><br>
      <span style="font-size:13px;">기운이 가장 강하게 실리는 시기(${career.mainPath.periods.join(', ')})의 십신은 <b>${career.mainPath.group5}</b> — <b>${career.mainPath.careerHint}</b> 방향이 타고난 그릇에 가깝습니다.</span>
    </div>`;
  }
  document.getElementById('careerBody').innerHTML = careerHtml;

  // 세운 (십신 세분화 + 12운성 반영)
  const seunFlow = analyzeSewoonFlow(saju, ys, saju.birthYear, 90);
  let seunHtml = '';
  seunFlow.forEach(row=>{
    const dwFor = saju.daewoon.find(d=>row.age>=d.startAge && row.age<d.startAge+10);
    const dwLabel = dwFor ? `${STEMS[gzFromIndex(dwFor.idx).stem]}${BRANCHES[gzFromIndex(dwFor.idx).branch]}` : '-';
    const isNow = (row.yr===nowYear);
    seunHtml += `<tr class="${isNow?'now':''}">
      <td>${row.age}</td><td>${row.yr}</td>
      <td class="seun-gz">${row.gzText}</td>
      <td style="font-size:11px;">${row.god10}</td>
      <td style="font-size:11px; color:${tierColor[row.tier]}">${row.stage}</td>
      <td>${dwLabel}</td>
    </tr>`;
  });
  document.getElementById('seunBody').innerHTML = seunHtml;

  // 올해의 세운 상세분석 (스트립 시각화 + 해설)
  const nowIdx = seunFlow.findIndex(r=>r.yr===nowYear);
  const stripStart = nowIdx>=0 ? nowIdx : 0;
  const stripRows = seunFlow.slice(stripStart, stripStart+9);
  let swHtml = '';
  stripRows.forEach((row,i)=>{
    if(i===0){
      swHtml += `<div class="sw-cell hero"><div class="stage-word">${BRANCHES[row.branch]}</div><div class="sub">${row.yr} · ${row.age}세</div></div>`;
    } else {
      swHtml += `<div class="sw-cell"><div class="stage-word">${row.stage}</div><div class="sub">${row.yr} · ${row.age}세</div></div>`;
    }
  });
  document.getElementById('swStrip').innerHTML = swHtml;
  if(stripRows.length){
    const cur = stripRows[0];
    const prev = nowIdx>0 ? seunFlow[nowIdx-1] : null;
    const stageSeq = stripRows.slice(1).map(r=>r.stage).join('-');
    document.getElementById('swNarrative').innerHTML =
      `예를 들어 올해(${cur.yr}년, ${BRANCHES[cur.branch]}년)에는 12운성의 변화가 위 스트립처럼 <b>${stageSeq}</b> 순서로 흘러갑니다.<br><br>` +
      buildYearNarrative(cur, prev, ys);
  }

  document.getElementById('result').scrollIntoView({behavior:'smooth', block:'start'});
}

/* ===================== 이벤트 ===================== */
let selectedGender = 'M';
const selectedJasiMode = 'unified'; // 대표님 고유 이론 — 정자시로 고정 (선택 UI 없음)
document.querySelectorAll('#genderGroup .chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('#genderGroup .chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    selectedGender = chip.dataset.val;
  });
});
document.getElementById('timeUnknown').addEventListener('change', (e)=>{
  document.getElementById('btime').disabled = e.target.checked;
  if(e.target.checked) document.getElementById('btime').value='';
});

document.getElementById('birthForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const dateVal = document.getElementById('bdate').value;
  if(!dateVal){ alert('생년월일을 입력해주세요.'); return; }
  const [y,m,d] = dateVal.split('-').map(Number);
  const hasTime = !document.getElementById('timeUnknown').checked && document.getElementById('btime').value;
  let hour=12, minute=0;
  if(hasTime){
    const [hh,mm] = document.getElementById('btime').value.split(':').map(Number);
    hour=hh; minute=mm;
  }
  const name = document.getElementById('name').value.trim();
  const saju = computeSaju(y,m,d,hour,minute,!!hasTime,selectedGender,selectedJasiMode);
  render(saju, name, selectedGender, !!hasTime);
});
