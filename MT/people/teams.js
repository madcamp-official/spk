/* /MT 리롤이 뽑는 후보 전부 — 몰입캠프 26s 4주간의 팀 구성.
 *
 * 주차 라벨의 근거: 이 레포가 "26s-w3-c1-03"(README)이고 세 번째 묶음에 환생 시뮬레이터가
 * 들어 있다. 즉 받은 순서가 곧 주차 순서다. 라벨만 바꾸려면 ROUNDS 한 줄만 고치면 된다.
 *
 * id 는 공유 링크(?t=)에 실린다 — 한 번 정하면 바꾸지 않는다. 바꾸는 순간 이미 뿌린
 * 링크가 전부 "없는 팀"이 된다(이름·이모지는 언제든 고쳐도 링크가 안 죽는다).
 *
 * icon 은 MT/icon/ 의 팀 아이콘이다(원본 환생 시뮬레이터의 국기 자리). 파일명에 한글이
 * 섞여 있어 URL은 그리는 쪽에서 encodeURI 로 만든다 — 여기엔 파일명을 그대로 적는다.
 * emoji 는 아이콘이 없는 팀의 표시이자, 아이콘 파일이 없을 때의 폴백이다(render.js).
 * 그래서 아이콘이 있는 팀도 emoji 를 지우지 않는다. 팀끼리 겹치지 않게 골랐다 —
 * 겹치면 결과 화면 맨 위가 같아져 다른 팀이 나온 걸 못 알아챈다.
 *
 * pick: true = 금주의 픽. 이 페이지의 유일한 희귀도 축이다 — 뽑히면 히어로 테두리가
 * 금색이 되고 컨페티가 터진다. **확률은 건드리지 않는다**: 25팀 전부 그대로 4%이고,
 * 픽은 "떴을 때 특별한 것"이지 "덜 나오는 것"이 아니다(화면·푸터도 그렇게 적혀 있다).
 * 주마다 바꾸려면 아래 pick 표시만 옮기면 된다 — 다른 파일은 손댈 곳이 없다.
 */
export const ROUNDS = ["1주차", "2주차", "3주차", "4주차"];

export const TEAMS = [
  /* ── 1주차 ── */
  {id:"minigame",    round:1, icon:"미니게임천국.png",     emoji:"🎮", name:"미니게임천국",               members:["이서진","이예원"]},
  {id:"e35",         round:1,                             emoji:"💣", name:"심야의 전산학부: E3-5 탈출", members:["김태현","이유담"]},
  {id:"nomadlist",   round:1, icon:"NomadList.png",       emoji:"🧭", name:"NomadList",                 members:["유나연","유영석"], pick:true},
  {id:"madnova",     round:1, icon:"MADNOVA.png",         emoji:"✨", name:"MADNOVA",                   members:["권순호","이지민","정서영"]},
  {id:"latestock",   round:1,                             emoji:"⏰", name:"Latestock",                 members:["주성민","허서준"]},
  {id:"scrum",       round:1, icon:"ScrumHelper.png",     emoji:"📋", name:"Scrum Helper",              members:["김희서","안종화"], pick:true},
  {id:"madcade",     round:1, icon:"MADCADE.png",         emoji:"🕹️", name:"MADCADE",                   members:["박준서","이종혁"]},

  /* ── 2주차 ── */
  {id:"dodream",     round:2, icon:"두드림.png",           emoji:"🥁", name:"두드림",                    members:["안종화","이종혁"]},
  {id:"malkkori",    round:2, icon:"말꼬리.png",           emoji:"💬", name:"말꼬리",                    members:["박준서","이서진","정서영"], pick:true},
  {id:"iryeokfit",   round:2, icon:"이력핏.png",           emoji:"📄", name:"이력핏",                    members:["김태현","유나연"]},
  {id:"tripandend",  round:2, icon:"TripAndEnd.png",      emoji:"✈️", name:"TripAndEnd",                members:["이예원","이지민"]},
  {id:"factcoding",  round:2, icon:"factcoding.png",      emoji:"💻", name:"factcoding",                members:["유영석","허서준"]},
  {id:"eolttungtap", round:2,                             emoji:"🧗", name:"얼렁뚱탑",                  members:["권순호","이유담"]},
  {id:"yeoboseyo",   round:2, icon:"여보세요.png",         emoji:"☎️", name:"여보세요",                  members:["김희서","주성민"], pick:true},

  /* ── 3주차 ── */
  {id:"vibecutter",  round:3, icon:"VibeCutter.png",      emoji:"✂️", name:"Vibe Cutter",               members:["박준서","안종화","유나연","이지민"], pick:true},
  {id:"handsfree",   round:3, icon:"핸즈프리컨트롤러.png", emoji:"🖐️", name:"핸즈프리 컨트롤러",         members:["권순호","김태현","이예원","허서준"]},
  {id:"lifereroll",  round:3, icon:"환생시뮬레이터.png",   emoji:"🌏", name:"환생 시뮬레이터",           members:["김희서","이서진","이유담"], pick:true},
  {id:"desksurfer",  round:3,                             emoji:"🏄", name:"DeskSurfer",                members:["유영석","정서영","주성민"]},

  /* ── 4주차 ── */
  {id:"endpointer",  round:4, icon:"Endpointer.png",      emoji:"🎯", name:"Endpointer",                members:["김희서","박준서"]},
  {id:"narudo",      round:4, icon:"NARUDO.png",          emoji:"🌀", name:"NARUDO",                    members:["유나연","정서영"]},
  {id:"saengsaeng",  round:4, icon:"생생탐험대.png",       emoji:"🗺️", name:"생생탐험대",                members:["주성민","허서준"], pick:true},
  {id:"bangkku",     round:4, icon:"방꾸요정.png",         emoji:"🧚", name:"방꾸요정",                  members:["이유담","이예원"], pick:true},
  {id:"gamdo",       round:4, icon:"감도.png",             emoji:"🎚️", name:"감도 (GAMDO)",              members:["안종화","이지민"]},
  {id:"pokebrawl",   round:4, icon:"PokemonBrawl.png",    emoji:"⚡", name:"PokéBrawl",                 members:["권순호","유영석"]},
  {id:"ashburn",     round:4,                             emoji:"🔥", name:"Ashburn",                   members:["김태현","이서진"]},

  /* ── 히든 ──
     secret: true = 이스터에그. 뽑기 확률은 다른 팀과 똑같이 1/26 이지만, 한 번이라도
     뽑기 전까지는 아래 집계(도감)·통계·확률 문구에서 통째로 감춘다. 감추는 건 표시뿐이고
     확률에는 처음부터 들어가 있다 — 감춤 판정은 state.js 의 revealed() 한 곳이다.
     round 는 1~4주차 어디에도 안 붙어서 0이고, roundLabel 이 "히든"으로 읽는다. */
  {id:"synsory",     round:0, icon:"Synsory.png",         emoji:"🫧", name:"Synsory",                   members:["라태형"], secret:true,
   bgm:"저는그저좋은피사체를.mp3"},
];

/* 아이콘 URL. 파일명에 한글·공백이 있어도 안전한 주소로 만든다.
   아이콘이 없는 팀(위 5팀)은 null 이고, 부르는 쪽이 emoji 로 대신 그린다. */
export const iconURL = t => (t.icon ? "icon/" + encodeURIComponent(t.icon) : null);

/* 그 팀이 뜰 때 깔리는 BGM(MT/bgm/). 지금은 히든 팀 하나뿐이고, 없으면 null 이라
   렌더 쪽이 "소리 없음"으로 읽고 틀어져 있던 것을 끈다. */
export const bgmURL = t => (t.bgm ? "bgm/" + encodeURIComponent(t.bgm) : null);

export const PICKS = TEAMS.filter(t => t.pick);

export const byId = id => TEAMS.find(t => t.id === id) || null;
export const roundLabel = t => (t.secret ? "히든" : ROUNDS[t.round - 1] || ("R" + t.round));

/* 명단은 팀에서 파생시킨다 — 따로 적어 두면 팀을 고칠 때 한쪽만 고쳐 언젠가 어긋난다.
   ⚠ 여기엔 히든 팀의 사람(라태형)도 들어 있다. 화면에 뿌릴 명단은 이걸 그대로 쓰면 안 되고,
   드러난 팀에서 다시 뽑아야 한다(tally.js) — 안 그러면 뽑기도 전에 이름이 노출된다. */
export const peopleOf = teams => [...new Set(teams.flatMap(t => t.members))].sort((a, b) => a.localeCompare(b, "ko"));
export const PEOPLE = peopleOf(TEAMS);

/* 그 사람이 속했던 팀들. "이 사람 몇 팀?"에 쓴다. */
export const teamsOf = name => TEAMS.filter(t => t.members.includes(name));
