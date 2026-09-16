/* ============================================================
   saju-core.js — 사주코어 계산 엔진 (순수 로직, DOM 의존 없음)
   -------------------------------------------------------------
   와이튜브 "평생 사주 기반 인생 설계" 플랫폼의 공통 엔진.
   이 파일 하나만 불러오면 아래 함수/데이터를 어느 화면에서든
   재사용할 수 있습니다 (예: 대학매칭 페이지, 진로리포트 페이지 등).

   사용법 (브라우저):
     <script src="saju-core.js"></script>
     <script>
       const saju = SajuCore.computeSaju(1974,4,10,23,40,true,'M','split');
       const ys   = SajuCore.computeYongsin(saju, true);
       console.log(ys.yongsin, ys.huisin, ys.gisin, ys.gusin);
     </script>

   * 원본 saju-core.html에서 계산 로직만 그대로 옮긴 것으로,
     산출 공식/숫자는 전혀 변경하지 않았습니다.
   ============================================================ */

/* ===================== 기초 데이터 ===================== */
const STEMS = ["갑","을","병","정","무","기","경","신","임","계"];
const STEMS_HAN = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const BRANCHES = ["자","축","인","묘","진","사","오","미","신","유","술","해"];
const BRANCHES_HAN = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const STEM_ELEM = ["목","목","화","화","토","토","금","금","수","수"];
const BRANCH_ELEM = ["수","토","목","목","토","화","화","토","금","금","토","수"];
const ELEM_COLOR = {"목":"var(--mok)","화":"var(--hwa)","토":"var(--to)","금":"var(--geum)","수":"var(--su)"};

function gzFromIndex(idx){
  idx = ((idx % 60) + 60) % 60;
  return { stem: idx % 10, branch: idx % 12 };
}
function findGZIndex(stem, branch){
  for(let n=0;n<60;n++){ if(n%10===stem && n%12===branch) return n; }
  return -1;
}

/* ===================== 천문 계산 ===================== */
function toJD(y, m, d, h){ // h = UT decimal hours
  if(m<=2){ y-=1; m+=12; }
  const A = Math.floor(y/100);
  const B = 2 - A + Math.floor(A/4);
  return Math.floor(365.25*(y+4716)) + Math.floor(30.6001*(m+1)) + d + h/24 + B - 1524.5;
}
function solarLongitude(jd){
  const T = (jd - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983*T + 0.0003032*T*T;
  const M  = 357.52911 + 35999.05029*T - 0.0001537*T*T;
  const Mr = M*Math.PI/180;
  const C = (1.914602 - 0.004817*T - 0.000014*T*T)*Math.sin(Mr)
          + (0.019993 - 0.000101*T)*Math.sin(2*Mr)
          + 0.000289*Math.sin(3*Mr);
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136*T;
  let apparent = trueLong - 0.00569 - 0.00478*Math.sin(omega*Math.PI/180);
  apparent = ((apparent % 360)+360)%360;
  return apparent;
}
function findTermJD(guessJD, targetDeg){
  let lo = guessJD-10, hi = guessJD+10;
  function f(jd){
    let diff = solarLongitude(jd) - targetDeg;
    if(diff>180) diff-=360;
    if(diff<-180) diff+=360;
    return diff;
  }
  let flo = f(lo);
  for(let i=0;i<60;i++){
    const mid=(lo+hi)/2, fm=f(mid);
    if((flo<0 && fm<0) || (flo>0 && fm>0)){ lo=mid; flo=fm; } else { hi=mid; }
  }
  return (lo+hi)/2;
}
// 12 절(節) 정의: [황경, 근사월, 근사일, 시작월지]
const JEOL_DEFS = [
  {deg:315, m:2,  d:4,  branch:2},  // 입춘 -> 인월
  {deg:345, m:3,  d:6,  branch:3},  // 경칩 -> 묘월
  {deg:15,  m:4,  d:5,  branch:4},  // 청명 -> 진월
  {deg:45,  m:5,  d:6,  branch:5},  // 입하 -> 사월
  {deg:75,  m:6,  d:6,  branch:6},  // 망종 -> 오월
  {deg:105, m:7,  d:7,  branch:7},  // 소서 -> 미월
  {deg:135, m:8,  d:8,  branch:8},  // 입추 -> 신월
  {deg:165, m:9,  d:8,  branch:9},  // 백로 -> 유월
  {deg:195, m:10, d:8,  branch:10}, // 한로 -> 술월
  {deg:225, m:11, d:7,  branch:11}, // 입동 -> 해월
  {deg:255, m:12, d:7,  branch:0},  // 대설 -> 자월
  {deg:285, m:1,  d:6,  branch:1},  // 소한 -> 축월
];
function computeJeolTerms(centerYear){
  const terms = [];
  for(const yr of [centerYear-1, centerYear, centerYear+1]){
    for(const def of JEOL_DEFS){
      const guess = toJD(yr, def.m, def.d, -9); // KST->UT 근사 보정한 자정 근처
      const jd = findTermJD(guess, def.deg);
      terms.push({jd, branch:def.branch});
    }
  }
  terms.sort((a,b)=>a.jd-b.jd);
  return terms;
}

/* ===================== 사주 계산 ===================== */
function addOneDay(y,m,d){
  const dt = new Date(Date.UTC(y, m-1, d));
  dt.setUTCDate(dt.getUTCDate()+1);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth()+1, d: dt.getUTCDate() };
}
function computeSaju(y,m,d,hour,minute,hasTime,gender,jasiMode){
  const utHour = hour + minute/60 - 9; // KST -> UT
  const birthJD = toJD(y,m,d, utHour);

  // 일주 계산용 날짜 (자시 처리방식에 따라 분기)
  // - split(야자시/조자시 분리, 기본): 일주는 자정(00:00) 기준으로만 바뀜 → 입력된 달력일 그대로 사용
  // - unified(정자시): 23:30부터 이미 다음날로 취급 → 하루를 당겨서 계산
  let dayCalcDate = {y,m,d};
  if(hasTime && jasiMode==='unified' && (hour===23 && minute>=30)){
    dayCalcDate = addOneDay(y,m,d);
  }

  const terms = computeJeolTerms(y);
  // 현재 절(월주 결정) : birthJD 이하 중 가장 늦은 term
  let curIdx = -1;
  for(let i=0;i<terms.length;i++){ if(terms[i].jd<=birthJD) curIdx=i; }
  const monthBranch = terms[curIdx].branch;
  const monthStartJD = terms[curIdx].jd;
  const nextTermJD = terms[curIdx+1].jd;
  const prevTermJD = curIdx>0 ? terms[curIdx-1].jd : terms[curIdx].jd;

  // 입춘 기준 연주(year pillar)
  const ipchunGuess = toJD(y,2,4,-9);
  const ipchunJD = findTermJD(ipchunGuess, 315);
  const sajuYear = birthJD < ipchunJD ? y-1 : y;
  const yearIdx = ((sajuYear-4)%60+60)%60;
  const yearStem = yearIdx%10, yearBranch = yearIdx%12;

  // 월주
  const baseStemArr = [2,4,6,8,0];
  const monthsSinceYin = (monthBranch-2+12)%12;
  const monthStem = (baseStemArr[yearStem%5] + monthsSinceYin)%10;

  // 일주 (일주는 해당 지역 달력일 자체에 대응하므로 시간대 보정 없이 계산)
  const JDN = Math.floor(toJD(dayCalcDate.y,dayCalcDate.m,dayCalcDate.d,12));
  const dayIdx = ((JDN+49)%60+60)%60;
  const dayStem = dayIdx%10, dayBranch = dayIdx%12;

  // 시주
  let hourStem=null, hourBranch=null;
  if(hasTime){
    hourBranch = Math.floor(((hour+1)%24)/2);
    const hbaseArr=[0,2,4,6,8];
    hourStem = (hbaseArr[dayStem%5] + hourBranch)%10;
  }

  // 대운
  const isYangYear = (yearStem%2===0);
  const forward = (isYangYear && gender==='M') || (!isYangYear && gender==='F');
  const daysDiff = forward ? (nextTermJD - birthJD) : (birthJD - monthStartJD);
  const dwStartAgeExact = daysDiff/3;
  const dwStartAge = Math.max(1, Math.round(dwStartAgeExact));
  const monthGZIndex = findGZIndex(monthStem, monthBranch);
  const daewoon = [];
  for(let k=1;k<=9;k++){
    const idx = ((monthGZIndex + (forward?1:-1)*k)%60+60)%60;
    daewoon.push({ idx, startAge: dwStartAge + 10*(k-1) });
  }

  return {
    year:{stem:yearStem,branch:yearBranch},
    month:{stem:monthStem,branch:monthBranch},
    day:{stem:dayStem,branch:dayBranch},
    hour: hasTime ? {stem:hourStem,branch:hourBranch} : null,
    sajuYear, forward, dwStartAge, dwStartAgeExact, daewoon,
    birthYear: y, jasiMode
  };
}

/* ===================== 용신 분석 (억부·조후·통관·병약 고전이론) ===================== */
// 오행 상생: A가 B를 낳음 / 상극: A가 B를 제어함 (전통 명리학 공개 이론)
const GENERATES = {"목":"화","화":"토","토":"금","금":"수","수":"목"};
const CONTROLS  = {"목":"토","화":"금","토":"수","금":"목","수":"화"};
function whoGenerates(target){ return Object.keys(GENERATES).find(k=>GENERATES[k]===target); } // target을 낳아주는 오행 (인성)
function whoControls(target){ return Object.keys(CONTROLS).find(k=>CONTROLS[k]===target); }   // target을 극하는 오행

function seasonOf(monthBranch){
  // 인묘진=봄(목), 사오미=여름(화), 신유술=가을(금), 해자축=겨울(수)
  if([2,3,4].includes(monthBranch)) return "봄";
  if([5,6,7].includes(monthBranch)) return "여름";
  if([8,9,10].includes(monthBranch)) return "가을";
  return "겨울";
}

// 삼합(三合): 지지 세 글자가 모이면 하나의 오행 기운으로 응축됨 (왕지 포함 2개만 모이면 반합)
const SAMHAP = [
  { branches:[11,3,7], elem:"목", king:3,  label:"해묘미(亥卯未)" },
  { branches:[2,6,10], elem:"화", king:6,  label:"인오술(寅午戌)" },
  { branches:[5,9,1],  elem:"금", king:9,  label:"사유축(巳酉丑)" },
  { branches:[8,0,4],  elem:"수", king:0,  label:"신자진(申子辰)" },
];
// 충(沖): 마주보는 지지끼리 부딪혀 합의 효력을 약화시킴
const CHUNG_PAIRS = [[0,6],[1,7],[2,8],[3,9],[4,10],[5,11]];
function chungPartner(branch){
  const pair = CHUNG_PAIRS.find(p=>p.includes(branch));
  return pair ? pair.find(b=>b!==branch) : null;
}

function detectSamhap(branchPositions){
  // branchPositions: [{branch, label}] (년/월/일/시)
  const presentBranches = branchPositions.map(p=>p.branch);
  const bonus = {"목":0,"화":0,"토":0,"금":0,"수":0};
  const notes = [];
  for(const def of SAMHAP){
    const matched = def.branches.filter(b=>presentBranches.includes(b));
    if(matched.length===3){
      let strength = 1.0, weakenNote = "";
      // 충으로 약화되는지 확인
      const broken = matched.some(b=>presentBranches.includes(chungPartner(b)));
      if(broken){ strength = 0.5; weakenNote = " (단, 충 관계가 함께 있어 결합력이 절반으로 약화됨)"; }
      matched.forEach(()=>{ bonus[def.elem]+=strength; });
      notes.push(`삼합 성립: ${def.label} → ${def.elem} 기운 응축${weakenNote}`);
    } else if(matched.length===2 && matched.includes(def.king)){
      let strength = 0.5, weakenNote = "";
      const broken = matched.some(b=>presentBranches.includes(chungPartner(b)));
      if(broken){ strength = 0.25; weakenNote = " (충으로 결합력 약화)"; }
      matched.forEach(()=>{ bonus[def.elem]+=strength; });
      notes.push(`반합 성립: ${def.label} 중 ${matched.length}자 → ${def.elem} 기운 일부 가세${weakenNote}`);
    }
  }
  return { bonus, notes };
}

// 육합(六合): 지지 두 글자가 짝을 이루면 삼합보다 약한 결합력으로 오행이 발생 (오미합은 오행 생성 불명확한 특수합)
const YUKHAP = [
  { pair:[0,1], elem:"토", label:"자축합(子丑合)" },
  { pair:[2,11], elem:"목", label:"인해합(寅亥合)" },
  { pair:[3,10], elem:"화", label:"묘술합(卯戌合)" },
  { pair:[4,9], elem:"금", label:"진유합(辰酉合)" },
  { pair:[5,8], elem:"수", label:"사신합(巳申合)" },
  { pair:[6,7], elem:null, label:"오미합(午未合, 오행 생성 불명확한 특수합)" },
];
function detectYukhap(branchPositions){
  const presentBranches = branchPositions.map(p=>p.branch);
  const bonus = {"목":0,"화":0,"토":0,"금":0,"수":0};
  const notes = [];
  for(const def of YUKHAP){
    const [a,b] = def.pair;
    if(presentBranches.includes(a) && presentBranches.includes(b)){
      let strength = 0.3, weakenNote = "";
      const broken = presentBranches.includes(chungPartner(a)) || presentBranches.includes(chungPartner(b));
      if(broken){ strength = 0.15; weakenNote = " (충으로 결합력 약화)"; }
      if(def.elem){ bonus[def.elem]+=strength; notes.push(`육합 성립: ${def.label} → ${def.elem} 기운 소폭 가세${weakenNote}`); }
      else { notes.push(`육합 성립: ${def.label}${weakenNote}`); }
    }
  }
  return { bonus, notes };
}

function computeYongsin(saju, hasTime){
  const counts = {"목":0,"화":0,"토":0,"금":0,"수":0};
  counts[STEM_ELEM[saju.year.stem]]++;
  counts[STEM_ELEM[saju.month.stem]]++;
  counts[STEM_ELEM[saju.day.stem]]++;
  if(hasTime) counts[STEM_ELEM[saju.hour.stem]]++;
  counts[BRANCH_ELEM[saju.year.branch]]++;
  counts[BRANCH_ELEM[saju.month.branch]] += 2; // 월지는 계절의 사령이므로 가중치 2 (득령 개념)
  counts[BRANCH_ELEM[saju.day.branch]]++;
  if(hasTime) counts[BRANCH_ELEM[saju.hour.branch]]++;

  // 삼합/반합 보정
  const branchPositions = [
    {branch:saju.year.branch}, {branch:saju.month.branch}, {branch:saju.day.branch}
  ];
  if(hasTime) branchPositions.push({branch:saju.hour.branch});
  const samhap = detectSamhap(branchPositions);
  for(const el of Object.keys(counts)){ counts[el] += samhap.bonus[el]; }
  const yukhap = detectYukhap(branchPositions);
  for(const el of Object.keys(counts)){ counts[el] += yukhap.bonus[el]; }

  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  const dayElem = STEM_ELEM[saju.day.stem];       // 일간 오행 = 비겁
  const inseongElem = whoGenerates(dayElem);       // 일간을 생하는 오행 = 인성

  const group1 = counts[dayElem] + counts[inseongElem]; // 비겁+인성 (신강 세력)
  const group2 = total - group1;                        // 식상+재성+관성 (신약 세력 유발)
  const isStrong = group1 > group2;

  const sortedElems = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  const strongest = sortedElems[0];
  const secondStrongest = sortedElems[1];
  const weakest = sortedElems[sortedElems.length-1];

  // ---- 통관(通關) 판단: 1·2위 오행이 상극 관계이면서 세력 차이가 크지 않을 때 ----
  let tonggwan = null;
  const gap = counts[strongest] - counts[secondStrongest];
  const isConflict = (CONTROLS[strongest]===secondStrongest) || (CONTROLS[secondStrongest]===strongest);
  if(isConflict && gap <= 1.5 && counts[secondStrongest] > 0){
    const [A,B] = CONTROLS[strongest]===secondStrongest ? [strongest, secondStrongest] : [secondStrongest, strongest];
    const mediator = GENERATES[A]; // A생B의 다리 역할 (A생M, M생B)
    tonggwan = { A, B, mediator, note: `${A}(${counts[A]})과 ${B}(${counts[B]})가 팽팽히 상극하고 있어, ${mediator} 기운이 둘을 중재하는 통관용신 후보가 됩니다.` };
  }

  // ---- 억부용신 산출 (통관 상황이면 통관 오행을 우선 후보로) ----
  let yongsin, reason;
  if(tonggwan && counts[tonggwan.mediator] > 0){
    yongsin = tonggwan.mediator;
    reason = `통관 우선 — ${tonggwan.note}`;
  } else if(isStrong){
    const controller = whoControls(strongest);
    if(counts[controller] > 0){
      yongsin = controller;
      reason = `신강 사주 — 가장 강한 ${strongest} 기운을 직접 제어하는 ${controller} 기운을 억부용신으로 삼습니다.`;
    } else {
      yongsin = GENERATES[strongest];
      reason = `신강 사주이나 ${strongest}을 극하는 오행이 원국에 없어, 대신 ${strongest}의 기운을 자연스럽게 빼주는(설기) ${GENERATES[strongest]} 기운을 용신으로 삼습니다.`;
    }
  } else {
    if(counts[inseongElem] > 0){
      yongsin = inseongElem;
      reason = `신약 사주 — 일간을 생조하는 인성(${inseongElem}) 기운으로 힘을 보강합니다.`;
    } else {
      yongsin = dayElem;
      reason = `신약 사주이나 인성(${inseongElem})이 원국에 없어, 비겁(${dayElem})으로 직접 힘을 보강합니다.`;
    }
  }

  // ---- 희신/병신/약신: 용신 중심 4신 체계 (희신=용신을 생함, 병신=용신을 극함, 약신=병신을 극함) ----
  const huisin = GENERATES[yongsin];        // 용신을 생하는 오행 = 희신
  const gisin = whoControls(yongsin);       // 용신을 극하는 오행 = 병신
  const gusin = whoControls(gisin);         // 병신을 극하는 오행 = 약신

  // ---- 병약(病藥) 판단: 용신이 실제로 원국 내에서 공격받고 있는가 ----
  let byeongyak = null;
  if(counts[gisin] >= counts[yongsin] && counts[gisin] > 0){
    byeongyak = {
      byeong: gisin, yak: gusin,
      note: `용신(${yongsin})보다 이를 공격하는 병신(${gisin})의 세력이 더 강해 '병(病)'이 든 상태입니다. 병신을 제어하는 ${gusin} 기운이 '약(藥)'의 역할을 해야 합니다.`
    };
  }

  // ---- 조후 참고 ----
  const season = seasonOf(saju.month.branch);
  let johuNote = "";
  if((season==="여름") && (dayElem==="화" || counts["화"]>=3)){
    johuNote = "여름 출생에 화 기운까지 강해 사주가 뜨겁습니다. 수(水) 기운으로 식혀주는 조후가 함께 필요합니다.";
  } else if((season==="겨울") && (dayElem==="수" || counts["수"]>=3)){
    johuNote = "겨울 출생에 수 기운까지 강해 사주가 차갑습니다. 화(火) 기운으로 데워주는 조후가 함께 필요합니다.";
  } else if(season==="여름"){
    johuNote = "여름 출생이라 사주가 전반적으로 건조·고온한 경향이 있어, 수 기운의 존재 여부를 함께 살펴보면 좋습니다.";
  } else if(season==="겨울"){
    johuNote = "겨울 출생이라 사주가 전반적으로 한랭한 경향이 있어, 화 기운의 존재 여부를 함께 살펴보면 좋습니다.";
  }

  return {
    counts, total, isStrong, group1, group2, strongest, weakest,
    yongsin, reason, huisin, gisin, gusin, tonggwan, byeongyak,
    samhapNotes: samhap.notes.concat(yukhap.notes), season, johuNote
  };
}

/* ===================== 대운 진로 흐름 분석 (십신 × 12운성, 고전이론 응용) ===================== */
// 12운성: 양간은 장생 지지부터 순행, 음간은 장생 지지부터 역행 (전통 명리학 공개 산출식)
const STAGE_ORDER = ["장생","목욕","관대","건록","제왕","쇠","병","사","묘","절","태","양"];
const JANGSAENG_ARR = [11,6,2,9,2,9,5,0,8,3]; // 갑을병정무기경신임계 순서의 장생 지지 인덱스
function twelveStage(dayStemIdx, branchIdx){
  const isYang = (dayStemIdx%2===0);
  const js = JANGSAENG_ARR[dayStemIdx];
  const diff = isYang ? ((branchIdx-js+12)%12) : ((js-branchIdx+12)%12);
  return STAGE_ORDER[diff];
}
const STAGE_TIER = {
  "장생":"강","관대":"강","건록":"강","제왕":"강",
  "목욕":"보통","쇠":"보통","병":"보통",
  "사":"약","묘":"약","절":"약","태":"약","양":"약",
};

// 십신(十神) 세분화: 음양까지 비교하여 10가지로 분류 (전통 명리학 공개 이론)
function tenGod10(dayStemIdx, targetElem, targetEven){
  const dayElem = STEM_ELEM[dayStemIdx];
  const dayEven = (dayStemIdx%2===0); // 짝수 인덱스=양간/양지
  const same = (dayEven===targetEven);
  if(targetElem===dayElem) return same?"비견":"겁재";
  if(GENERATES[dayElem]===targetElem) return same?"식신":"상관";
  if(CONTROLS[dayElem]===targetElem) return same?"편재":"정재";
  if(CONTROLS[targetElem]===dayElem) return same?"편관":"정관";
  if(GENERATES[targetElem]===dayElem) return same?"편인":"정인";
}
const GROUP5 = {"비견":"비겁","겁재":"비겁","식신":"식상","상관":"식상","편재":"재성","정재":"재성","편관":"관성","정관":"관성","편인":"인성","정인":"인성"};
const TEN_GOD_DESC = {
  "비견":"동등한 위치에서의 협력, 자립심", "겁재":"경쟁심과 추진력, 리스크를 감수하는 승부욕",
  "식신":"여유롭고 안정적인 표현력, 꾸준한 창작·생산", "상관":"재기발랄하고 비판적인 창의력, 틀을 깨는 발상",
  "편재":"통 큰 자금 운용, 사업 확장과 유동적 자원관리", "정재":"계획적이고 성실한 자산관리, 안정적 수입",
  "편관":"강한 추진력과 위기대응력, 승부사 기질(칠살)", "정관":"원칙과 책임감, 조직에 대한 신뢰도 높은 적응력",
  "편인":"독창적 사고와 직관, 정형화되지 않은 학습법", "정인":"학구적이고 안정지향적인 학습, 보호받는 성장",
};
// 십신별 진로 성향 (사용자 정의 이론, 5대 분류 기준)
const CAREER_HINT = {
  "식상": "개인사업 (소규모 자영업·기술직 자영업)",
  "재성": "사업가 (재물을 직접 운용하는 사업 확장형)",
  "관성": "공무원·회사원 (조직·소속에 속한 안정형)",
  "인성": "교육 관련 분야 (연구·강의·자기계발 지원형)",
  "비겁": "독립·동업형 (본인 주도로 판을 짜는 유형)",
};
// 십신별 전공계열 힌트 (사용자 정의 이론, CAREER_HINT를 대학매칭 화면용으로 확장)
// ⚠ 절대적 기준이 아닌 참고용 성향입니다. 실제 전공 선택은 학생의 흥미·성적을 함께 고려해야 합니다.
const MAJOR_FIELD_HINT = {
  "식상": "손기술·표현력을 살리는 전공 (공학/기술계열, 예체능계열, 콘텐츠·미디어 관련 전공) — 무언가를 직접 만들고 표현하는 실전형 전공에서 강점이 드러나는 편입니다.",
  "재성": "돈과 자원의 흐름을 다루는 전공 (경영/경제/무역/회계 계열) — 자원을 굴리고 확장하는 감각이 필요한 전공에서 유리합니다.",
  "관성": "체계와 신뢰를 쌓는 전공 (행정/법정/사회과학 계열) — 조직의 규칙 안에서 꾸준히 인정받는 구조, 공무원·공기업 준비에도 유리한 전공입니다.",
  "인성": "배우고 가르치는 전공 (교육/인문/어문 계열, 연구직 지향 전공) — 지식을 쌓고 전달하는 학구적인 환경에서 편안함을 느끼는 편입니다.",
  "비겁": "자기주도형 전공 (경영학, 디자인, IT/창업 연계 전공) — 남 밑에서 정해진 틀을 따르기보다 스스로 판을 짜는 구조에 잘 맞는 전공입니다.",
};
// 오행 상생상극 관계만으로 일간 기준 십신 대분류(GROUP5)를 판정 (음양/정편 구분 없이 오행 단위로 판정할 때 사용)
function elementRelationGroup(dayElem, targetElem){
  if(targetElem === dayElem) return "비겁";
  if(GENERATES[targetElem] === dayElem) return "인성";   // target이 일간을 생함
  if(GENERATES[dayElem] === targetElem) return "식상";   // 일간이 target을 생함
  if(CONTROLS[dayElem] === targetElem) return "재성";    // 일간이 target을 극함
  if(CONTROLS[targetElem] === dayElem) return "관성";    // target이 일간을 극함
  return null;
}
/* 용신 오행을 기준으로 진로·전공 적성 해설문을 생성.
   대학매칭 화면(college-match-ui.js)에서 사용 — 대학 리스트만 나열하지 않고
   "왜 이 오행 대학군이 이 학생에게 힘이 되는가"를 사주코어의 기존 서술 로직(CAREER_HINT/
   buildOverviewNarrative와 동일한 패턴)으로 함께 보여주기 위한 함수. */
function buildCareerFieldNarrative(saju, ys){
  const dayElem = STEM_ELEM[saju.day.stem];
  const group5 = elementRelationGroup(dayElem, ys.yongsin);
  if(!group5) return null;
  const careerHint = CAREER_HINT[group5];
  const majorHint = MAJOR_FIELD_HINT[group5];
  const text = `일간 ${dayElem} 기준으로 용신인 ${ys.yongsin} 기운은 십신상 '${group5}'에 해당합니다. 진로 성향으로는 ${careerHint} 쪽에 힘이 실리며, 전공 계열로는 ${majorHint}`;
  return { group5, careerHint, majorHint, text };
}

function analyzeDaewoonCareer(saju, ys){
  const dayElem = STEM_ELEM[saju.day.stem];
  const rows = saju.daewoon.map(dw=>{
    const gz = gzFromIndex(dw.idx);
    const stemElem = STEM_ELEM[gz.stem];
    const god10 = tenGod10(saju.day.stem, stemElem, gz.stem%2===0);
    const group5 = GROUP5[god10];
    const stage = twelveStage(saju.day.stem, gz.branch); // 일간 기준 대운 지지의 12운성
    const tier = STAGE_TIER[stage];
    let alignment = "중립";
    if(stemElem===ys.yongsin || stemElem===ys.huisin) alignment = "길함(용신·희신 해당)";
    else if(stemElem===ys.gisin) alignment = "주의(병신 해당)";
    return { startAge:dw.startAge, gzText:`${STEMS[gz.stem]}${BRANCHES[gz.branch]}`, stemElem, god10, group5, stage, tier, alignment, careerHint: CAREER_HINT[group5] };
  });

  // 기운이 가장 강한(=강 tier) 시기들 중 십신 비중이 가장 높은 것을 '타고난 큰 길'로 요약
  const strongRows = rows.filter(r=>r.tier==="강");
  const tally = {};
  strongRows.forEach(r=>{ tally[r.group5] = (tally[r.group5]||0)+1; });
  let mainPath = null;
  if(strongRows.length){
    const topGod = Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];
    const periods = strongRows.filter(r=>r.group5===topGod).map(r=>`${r.startAge}세(${r.gzText})`);
    mainPath = { group5: topGod, careerHint: CAREER_HINT[topGod], periods };
  }
  return { rows, mainPath };
}

/* ===================== 세운 흐름 분석 (십신 × 12운성) ===================== */
function analyzeSewoonFlow(saju, ys, startYear, count){
  const rows = [];
  for(let i=0;i<count;i++){
    const yr = startYear + i;
    const age = yr - saju.birthYear + 1;
    const sy = ((yr-4)%60+60)%60;
    const stem = sy%10, branch = sy%12;
    const stemElem = STEM_ELEM[stem];
    const god10 = tenGod10(saju.day.stem, stemElem, stem%2===0);
    const group5 = GROUP5[god10];
    const stage = twelveStage(saju.day.stem, branch);
    const tier = STAGE_TIER[stage];
    let alignment = "중립";
    if(stemElem===ys.yongsin || stemElem===ys.huisin) alignment = "길함(용신·희신)";
    else if(stemElem===ys.gisin) alignment = "주의(병신)";
    rows.push({ yr, age, stem, branch, gzText:`${STEMS[stem]}${BRANCHES[branch]}`, stemElem, god10, group5, stage, tier, alignment });
  }
  return rows;
}

function buildYearNarrative(row, prevRow, ys){
  const tierText = { "강":"기운이 왕성한", "보통":"완만하게 흐르는", "약":"기운이 잦아드는" };
  let trend = "";
  if(prevRow){
    const order = ["약","보통","강"];
    const diff = order.indexOf(row.tier) - order.indexOf(prevRow.tier);
    if(diff>0) trend = `작년(${prevRow.gzText})보다 기운이 상승하는 흐름이며, `;
    else if(diff<0) trend = `작년(${prevRow.gzText})보다 기운이 가라앉는 흐름이며, `;
    else trend = `작년(${prevRow.gzText})과 비슷한 세력이 이어지며, `;
  }
  return `${row.yr}년(만 ${row.age}세)은 세운 ${row.gzText}년으로, 일간 기준 12운성은 '${row.stage}' — ${tierText[row.tier]} 시기입니다. ${trend}십신으로는 ${row.god10}(${row.group5})에 해당해 ${TEN_GOD_DESC[row.god10]} 성향이 두드러질 수 있습니다. 진로 관점에서는 ${CAREER_HINT[row.group5]} 쪽 기운이 함께 흐르며, 용신 구조상 ${row.alignment}에 해당합니다.`;
}

/* ===================== 사주 총평 해설 ===================== */
const ELEM_TRAIT = {
  "목":"성장과 확장을 지향하며 진취적이고 유연한",
  "화":"표현력과 열정이 강하고 밝고 적극적인",
  "토":"신뢰와 포용력이 있고 중심을 잡아주는 안정적인",
  "금":"원칙과 결단력이 뚜렷하고 맺고 끊음이 분명한",
  "수":"지혜와 유연성을 갖추고 상황에 잘 적응하는",
};
function buildOverviewNarrative(saju, ys){
  const dayElem = STEM_ELEM[saju.day.stem];
  const strongDesc = ys.isStrong
    ? "본인 스스로의 힘(비겁·인성)이 강한 신강 사주로, 주체적이고 자기 주도적인 경향이 두드러집니다."
    : "본인을 돕는 힘보다 소모되는 힘(식상·재성·관성)이 강한 신약 사주로, 주변 환경·관계 속에서 힘을 얻는 유형입니다.";
  return `일간은 ${STEMS[saju.day.stem]}(${dayElem}) — ${ELEM_TRAIT[dayElem]} 기운을 타고났습니다. ${strongDesc} 오행 중 ${ys.strongest} 기운이 가장 강하고 ${ys.weakest} 기운이 가장 약해, 억부이론상 ${ys.yongsin} 기운을 용신으로 삼아 균형을 맞추는 것이 핵심 과제입니다.${ys.johuNote? ' '+ys.johuNote:''}`;
}

/* ===================== 신살(神殺) 판정 (전통 명리학 공개 이론) ===================== */
// 천을귀인: 일간 기준 특정 지지가 있으면 성립 (갑무경-축미, 을기-자신, 병정-해유, 임계-묘사, 신-오인)
function cheoneulBranches(dayStemIdx){
  if([0,4,6].includes(dayStemIdx)) return [1,7];
  if([1,5].includes(dayStemIdx)) return [0,8];
  if([2,3].includes(dayStemIdx)) return [11,9];
  if([8,9].includes(dayStemIdx)) return [3,5];
  if(dayStemIdx===7) return [6,2];
}
// 삼합 그룹별 도화·역마·화개 (왕지=도화 기준 공개 산출식)
const SINSAL_BY_ELEM = {
  "목": {dohwa:0, yeokma:5, hwagae:7},
  "화": {dohwa:3, yeokma:8, hwagae:10},
  "금": {dohwa:6, yeokma:11, hwagae:1},
  "수": {dohwa:9, yeokma:2, hwagae:4},
};
function samhapGroupOfBranch(branchIdx){
  for(const def of SAMHAP){ if(def.branches.includes(branchIdx)) return def.elem; }
}
const GOEGANG_IDX = [16,28,34,46]; // 경진 임진 무술 경술
const YANGIN_MAP = {0:3, 2:6, 4:6, 6:9, 8:0}; // 갑->묘, 병/무->오, 경->유, 임->자 (양간만 해당)

function analyzeSinsal(saju, hasTime){
  const branches = [saju.year.branch, saju.month.branch, saju.day.branch];
  if(hasTime) branches.push(saju.hour.branch);
  const found = [];

  // 천을귀인
  const cheoneul = cheoneulBranches(saju.day.stem);
  if(cheoneul && cheoneul.some(b=>branches.includes(b))){
    found.push({ name:"천을귀인(天乙貴人)", desc:"어려운 상황에서 귀인의 도움을 받기 쉬운 대표적 길신입니다." });
  }
  // 도화/역마/화개 (일지 기준)
  const group = samhapGroupOfBranch(saju.day.branch);
  if(group){
    const t = SINSAL_BY_ELEM[group];
    if(branches.includes(t.dohwa)) found.push({ name:"도화살(桃花殺)", desc:"매력과 인기, 대인관계에서 주목받는 기운입니다. 이성 관련 구설로 이어지기도 합니다." });
    if(branches.includes(t.yeokma)) found.push({ name:"역마살(驛馬殺)", desc:"이동·변화가 잦고 타지·해외와 인연이 깊은 기운입니다." });
    if(branches.includes(t.hwagae)) found.push({ name:"화개살(華蓋殺)", desc:"예술·종교·학문 등 정신적 영역에 몰입하는 기운으로, 고독을 동반하기도 합니다." });
  }
  // 괴강살 (일주 기준)
  const dayIdx = findGZIndex(saju.day.stem, saju.day.branch);
  if(GOEGANG_IDX.includes(dayIdx)){
    found.push({ name:"괴강살(魁罡殺)", desc:"극단적인 총명함과 강한 카리스마를 지니지만 인생의 기복이 큰 편입니다." });
  }
  // 양인살 (일간 기준, 양간만 해당)
  if(YANGIN_MAP[saju.day.stem]!==undefined && branches.includes(YANGIN_MAP[saju.day.stem])){
    found.push({ name:"양인살(羊刃殺)", desc:"강한 추진력과 결단력, 날카로운 승부근성을 상징합니다. 과격함을 절제하는 것이 관건입니다." });
  }
  // 공망 (일주 순중공망)
  const groupStart = Math.floor(dayIdx/10)*10;
  const branchAtStart = groupStart%12;
  const gongmangBranches = [(branchAtStart+10)%12, (branchAtStart+11)%12];
  const gongmangHit = [saju.year.branch, saju.month.branch, hasTime?saju.hour.branch:null].filter(b=>b!==null && gongmangBranches.includes(b));
  if(gongmangHit.length){
    found.push({ name:"공망(空亡)", desc:`해당 지지(${gongmangHit.map(b=>BRANCHES[b]).join('·')})가 상징하는 자리의 기운이 공허해지기 쉬워, 집착보다 초연함이 필요한 영역입니다.` });
  }
  return found;
}

/* ===================== 십신 × 12운성 강도 결합 (통근 강도 분석) ===================== */
// 각 기둥의 천간이 '자기 자신의 기준'으로 자기 지지에서 몇 단계 12운성인지 계산 → 통근(뿌리) 강도
function analyzePillarStrength(saju, hasTime){
  const pillars = [
    { name:"년주", stem:saju.year.stem, branch:saju.year.branch, isDay:false },
    { name:"월주", stem:saju.month.stem, branch:saju.month.branch, isDay:false },
    { name:"일주", stem:saju.day.stem, branch:saju.day.branch, isDay:true },
  ];
  if(hasTime) pillars.push({ name:"시주", stem:saju.hour.stem, branch:saju.hour.branch, isDay:false });

  const rows = pillars.map(p=>{
    const stemElem = STEM_ELEM[p.stem];
    const god10 = p.isDay ? "일간(본인)" : tenGod10(saju.day.stem, stemElem, p.stem%2===0);
    const group5 = p.isDay ? "비겁" : GROUP5[god10];
    const stage = twelveStage(p.stem, p.branch); // 통근: 천간 자체 기준 12운성
    const tier = STAGE_TIER[stage];
    return { name:p.name, gzText:`${STEMS[p.stem]}${BRANCHES[p.branch]}`, god10, group5, stage, tier };
  });

  const scoreMap = {"강":2,"보통":1,"약":0};
  const groupScore = {"비겁":0,"식상":0,"재성":0,"관성":0,"인성":0};
  rows.forEach(r=>{ groupScore[r.group5]+=scoreMap[r.tier]; });
  const dominant = Object.keys(groupScore).sort((a,b)=>groupScore[b]-groupScore[a])[0];
  return { rows, groupScore, dominant };
}

/* ===================== 외부 공개 (모듈 export) ===================== */
(function(root){
  const SajuCore = {
    // 기초 데이터
    STEMS, STEMS_HAN, BRANCHES, BRANCHES_HAN,
    STEM_ELEM, BRANCH_ELEM, ELEM_COLOR,
    GENERATES, CONTROLS, GROUP5, TEN_GOD_DESC, CAREER_HINT, MAJOR_FIELD_HINT,
    elementRelationGroup, buildCareerFieldNarrative,
    // 간지 유틸
    gzFromIndex, findGZIndex,
    // 사주 산출
    computeSaju,
    // 용신(억부·조후·통관·병약) 분석
    computeYongsin,
    // 십신 / 12운성
    tenGod10, twelveStage,
    // 신살
    analyzeSinsal,
    // 통근 강도 / 대운 진로 / 세운 흐름
    analyzePillarStrength, analyzeDaewoonCareer, analyzeSewoonFlow,
    // 해설문 생성
    buildOverviewNarrative, buildYearNarrative,
  };
  root.SajuCore = SajuCore;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SajuCore; // Node/서버 환경(추후 백엔드 검증용)에서도 재사용 가능
  }
})(typeof window !== 'undefined' ? window : globalThis);
