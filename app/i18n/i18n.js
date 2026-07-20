/* ===== 다국어(i18n) =====
   한국어가 원문이다. 사전 키는 화면에 쓰던 한국어 문장 그대로라서, 코드를 읽으면
   어떤 문구인지 바로 보이고 ko 모드에서는 사전을 거치지 않아도 된다(키가 곧 값).
   {x} 자리표시자는 언어별 어순에 맞게 번역문 안에서 위치를 바꿀 수 있다.

   ⚠ 규칙(README 참고): 화면에 보이는 문구를 새로 만들면 반드시 STR(또는 데이터 값이면
   i18n-terms.js)에 지원되는 모든 언어의 번역을 함께 추가한다. 빠지면 한국어로 노출된다.

   언어 전환은 저장 후 새로고침이다 — 렌더링이 여러 모듈에 흩어진 명령형이라
   제자리 갱신은 누락(운세 문구·공유 배너·캔버스 카드)이 생기기 쉽다. 상태는 ST에
   남아 있으므로 잃는 것은 화면에 떠 있던 생 하나뿐이고, 리롤은 클릭 한 번이다. */
import {CONT_NAME} from "../core/data.js";
import {isoCode,koNum,L} from "../core/util.js";
import {TERMS} from "./i18n-terms.js";

export const LANGS=["ko","en","ja","zh","es","pt"];
const KEY="rebirth_lang";
/* 접속 국가 → 언어. nginx가 CF-IPCountry를 geo 쿠키로 내려주므로 첫 렌더 전에 동기적으로 읽는다.
   여기 없는 나라는 전부 기본값(영어)로 떨어진다.
   중국어 사전은 간체(zh)다. TW·HK·MO는 정자(번체)를 쓰지만 이 앱엔 간체만 있어 그쪽으로 보낸다 —
   번체 사용자에게도 영어보다는 간체 중국어가 낫다는 판단(완벽하진 않음). 필요하면 조정할 것. */
const GEO_LANG={KR:"ko",JP:"ja",CN:"zh",TW:"zh",HK:"zh",MO:"zh",SG:"zh",
 ES:"es",MX:"es",AR:"es",CO:"es",PE:"es",VE:"es",CL:"es",EC:"es",GT:"es",CU:"es",BO:"es",DO:"es",HN:"es",PY:"es",SV:"es",NI:"es",CR:"es",PA:"es",UY:"es",GQ:"es",
 BR:"pt",PT:"pt",AO:"pt",MZ:"pt",GW:"pt",CV:"pt",ST:"pt"};
function geoCountry(){
 const m=(typeof document!=="undefined"?document.cookie:"").match(/(?:^|;\s*)geo=([A-Z]{2})/);
 return m?m[1]:"";
}
/* 언어 결정 순서: ① 사용자가 직접 고른 저장값(항상 최우선) → ② 접속 국가 → ③ 기본 영어.
   저장값이 있으면 국가를 보지 않는다 — 한 번 고른 언어를 IP가 덮으면 안 되기 때문. */
function pickLang(){
 let saved=null;
 try{saved=localStorage.getItem(KEY);}catch(e){}
 if(LANGS.includes(saved))return saved;
 return GEO_LANG[geoCountry()]||"en";
}
export const cur=pickLang();
/* en→0, ja→1, zh→2. LANGS에 언어를 더하면 이 줄과 STR/TERMS 칸을 반드시 함께 늘려야 한다 —
   여기가 어긋나면 zh가 ja 칸(1)을 읽어 중국어 화면에 일본어가 나온다(조용히 틀린다). */
const IX=cur==="en"?0:cur==="ja"?1:cur==="zh"?2:cur==="es"?3:4; /* TERMS/STR 배열에서 뽑을 칸 (ko는 사전을 안 탄다) */

/* ── UI 문구 사전: "한국어 원문":[영어, 일본어, 중국어(간체)] ── */
const STR={
"환생 시뮬레이터":["Rebirth Simulator","輪廻転生シミュレーター","转世模拟器","Simulador de Reencarnación","Simulador de Reencarnação"],
"인도에서 태어날 확률 17.8%, 모나코는 20만 분의 1. 당신은?":["17.8% chance of being born in India, 1 in 200,000 for Monaco. And you?","インドに生まれる確率17.8%、モナコは20万分の1。あなたは?","生在印度的概率17.8%,摩纳哥则是二十万分之一。你呢?","17,8% de nacer en India, 1 entre 200.000 en Mónaco. ¿Y tú?","17,8% de nascer na Índia, 1 em 200.000 em Mônaco. E você?"],
"🔗 친구가 공유한 생 — 아래 버튼으로 내 생을 뽑아 보세요":["🔗 A life shared by a friend — roll your own with the button below","🔗 友達がシェアした人生 — 下のボタンで自分の人生を引いてみよう","🔗 朋友分享的人生 — 点下方按钮抽取你自己的人生","🔗 Una vida compartida por un amigo — saca la tuya con el botón de abajo","🔗 Uma vida compartilhada por um amigo — sorteie a sua no botão abaixo"],
"아직 태어나기 전입니다":["You haven't been born yet","まだ生まれる前です","你还没有出生","Aún no has nacido","Você ainda não nasceu"],
"아래 버튼을 누르면 새로운 생을 받습니다":["Press the button below to receive a new life","下のボタンを押すと新しい人生を授かります","按下方按钮,获得新的人生","Pulsa el botón de abajo para recibir una nueva vida","Aperte o botão abaixo para receber uma nova vida"],
"🌏 환생 시작하기":["🌏 Start Reincarnation","🌏 転生を始める","🌏 开始转世","🌏 Empezar la Reencarnación","🌏 Começar a Reencarnação"],
"🔮 오늘의 환생 운세":["🔮 Today's Rebirth Fortune","🔮 今日の転生占い","🔮 今日转世运势","🔮 Fortuna de Reencarnación de Hoy","🔮 Sorte de Reencarnação de Hoje"],
"🖼️ 결과 카드 저장":["🖼️ Save Result Card","🖼️ 結果カードを保存","🖼️ 保存结果卡片","🖼️ Guardar Tarjeta de Resultado","🖼️ Salvar Cartão de Resultado"],
"📤 공유하기":["📤 Share","📤 シェア","📤 分享","📤 Compartir","📤 Compartilhar"],
"나의 환생 횟수":["My rebirths","私の転生回数","我的转世次数","Mis reencarnaciones","Minhas reencarnações"],
"모두의 환생 횟수 🌏":["Everyone's rebirths 🌏","みんなの転生回数 🌏","大家的转世次数 🌏","Reencarnaciones de todos 🌏","Reencarnações de todos 🌏"],
"태어나 본 나라 · 도감 📖":["Countries lived · Dex 📖","生まれた国 · 図鑑 📖","出生过的国家 · 图鉴 📖","Países vividos · Dex 📖","Países vividos · Dex 📖"],
"최고 희귀 기록":["Rarest record","最高レア記録","最稀有记录","Récord más raro","Recorde mais raro"],
"환생 도감 열기":["Open the rebirth dex","転生図鑑を開く","打开转世图鉴","Abrir el dex de reencarnación","Abrir o dex de reencarnação"],
"어느 나라로 태어날 확률이 가장 높을까?":["Which country are you most likely to be born in?","どの国に生まれる確率がいちばん高い?","出生在哪个国家的概率最高?","¿En qué país es más probable que nazcas?","Em qual país é mais provável você nascer?"],
"💡 이런 항목도 환생 결과에 넣어 주세요":["💡 Tell us what to add to the rebirth results","💡 こんな項目も転生結果に入れてほしい","💡 希望转世结果里也加入这些项目","💡 Dinos qué añadir a los resultados","💡 Diga o que adicionar aos resultados"],
"한 줄이면 충분해요. 다음 개선 후보로 담아 둡니다.":["One line is enough — it goes on the improvement list.","一行で十分です。次の改善候補としてメモしておきます。","一句话就够了,我们会列入下一步改进候选。","Con una línea basta — irá a la lista de mejoras.","Uma linha basta — vai para a lista de melhorias."],
"예: 형제 수, 태어난 계절, 평균 키…":["e.g. number of siblings, birth season, average height…","例:兄弟の数、生まれた季節、平均身長…","例:兄弟姐妹数、出生季节、平均身高…","p. ej. número de hermanos, estación de nacimiento, altura media…","ex.: número de irmãos, estação de nascimento, altura média…"],
"보내기":["Send","送信","发送","Enviar","Enviar"],
"개인정보는 적지 말아 주세요.":["Please don't include personal information.","個人情報は書かないでください。","请不要填写个人信息。","Por favor, no incluyas datos personales.","Por favor, não inclua dados pessoais."],
"📖 환생 도감":["📖 Rebirth Dex","📖 転生図鑑","📖 转世图鉴","📖 Dex de Reencarnación","📖 Dex de Reencarnação"],
"환생 도감":["Rebirth dex","転生図鑑","转世图鉴","Dex de reencarnación","Dex de reencarnação"],
"닫기":["Close","閉じる","关闭","Cerrar","Fechar"],
"공유하기":["Share","シェア","分享","Compartir","Compartilhar"],
"클립보드 복사":["Copy to clipboard","クリップボードにコピー","复制到剪贴板","Copiar al portapapeles","Copiar para a área de transferência"],
"카카오톡":["KakaoTalk","カカオトーク","KakaoTalk","KakaoTalk","KakaoTalk"],
"인스타 스토리":["Instagram Story","インスタストーリー","Instagram 快拍","Historia de Instagram","Story do Instagram"],
"X (트위터)":["X (Twitter)","X (Twitter)","X (推特)","X (Twitter)","X (Twitter)"],
"다른 앱으로…":["More apps…","他のアプリで…","更多应用…","Más apps…","Mais apps…"],
/* ── 결과 렌더링(render.js) ── */
"성별":["Gender","性別","性别","Sexo","Sexo"],
"태어난 곳":["Birthplace","生まれた場所","出生地","Lugar de nacimiento","Local de nascimento"],
"모국어":["Native language","母語","母语","Lengua materna","Língua materna"],
"민족":["Ethnicity","民族","民族","Etnia","Etnia"],
"종교":["Religion","宗教","宗教","Religión","Religião"],
"키":["Height","身長","身高","Altura","Altura"],
"몸무게":["Weight","体重","体重","Peso","Peso"],
"주로 쓰는 손":["Dominant hand","利き手","惯用手","Mano dominante","Mão dominante"],
"탈모":["Hair loss","薄毛","脱发","Pérdida de cabello","Queda de cabelo"],
"기대수명":["Life expectancy","平均寿命","预期寿命","Esperanza de vida","Expectativa de vida"],
"연 소득":["Annual income","年収","年收入","Ingreso anual","Renda anual"],
"남자 ♂":["Male ♂","男性 ♂","男 ♂","Hombre ♂","Homem ♂"],
"여자 ♀":["Female ♀","女性 ♀","女 ♀","Mujer ♀","Mulher ♀"],
"출생 성비 기준 {p}":["Birth sex ratio: {p}","出生性比 {p}","按出生性别比 {p}","Según la proporción de sexos al nacer: {p}","Pela razão de sexo ao nascer: {p}"],
"도시 🏙️":["City 🏙️","都市 🏙️","城市 🏙️","Ciudad 🏙️","Cidade 🏙️"],
"농촌 🌾":["Countryside 🌾","農村 🌾","农村 🌾","Campo 🌾","Zona rural 🌾"],
"이 나라 도시화율 {p}%":["Urbanization rate here: {p}%","この国の都市化率 {p}%","该国城市化率 {p}%","Tasa de urbanización aquí: {p}%","Taxa de urbanização deste país: {p}%"],
"국가 대표 언어":["Main national language","国の代表的な言語","国家代表语言","Idioma principal del país","Idioma principal do país"],
"국가 내 약 {p}%":["≈{p}% of this country","国内の約{p}%","约占该国 {p}%","≈{p}% de este país","≈{p}% deste país"],
"이 나라 {g} 평균 {v}cm":["Average for {g}s here: {v}cm","この国の{g}平均 {v}cm","该国{g}平均 {v}cm","Media de {g} aquí: {v} cm","Média de {g} neste país: {v} cm"],
"남성":["male","男性","男性","hombres","homens"],
"여성":["female","女性","女性","mujeres","mulheres"],
"BMI {b} · 국가 평균 {a}":["BMI {b} · national avg {a}","BMI {b} · 国平均 {a}","BMI {b} · 全国平均 {a}","IMC {b} · media nacional {a}","IMC {b} · média nacional {a}"],
"평균 100인 세계 공통 분포 · 상위 {t}":["Global bell curve (mean 100) · top {t}","世界共通分布(平均100) · 上位 {t}","全球统一分布(平均100) · 前 {t}","Curva mundial (media 100) · top {t}","Curva mundial (média 100) · top {t}"],
"왼손잡이 🫲":["Left-handed 🫲","左利き 🫲","左撇子 🫲","Zurdo 🫲","Canhoto 🫲"],
"오른손잡이 🫱":["Right-handed 🫱","右利き 🫱","右撇子 🫱","Diestro 🫱","Destro 🫱"],
"탈모 예정 🧑‍🦲":["Will go bald 🧑‍🦲","薄毛予定 🧑‍🦲","将会脱发 🧑‍🦲","Se quedará calvo 🧑‍🦲","Vai ficar careca 🧑‍🦲"],
"숱 유지 💇":["Keeps hair 💇","髪キープ 💇","发量保持 💇","Conserva el pelo 💇","Mantém o cabelo 💇"],
"50세까지 {g} 약 {p}":["≈{p} of {g}s by age 50","50歳までに{g}の約{p}","50岁前约 {p} 的{g}","≈{p} de {g} para los 50","≈{p} dos {g} até os 50"],
"{n}세":["{n} yrs","{n}歳","{n}岁","{n} años","{n} anos"],
"국가 평균 {n}세":["National average: {n}","国平均 {n}歳","全国平均 {n}岁","Media nacional: {n}","Média nacional: {n}"],
"세계 상위 {t} · 1인당 GDP 기반 추정":["World top {t} · estimated from GDP per capita","世界上位 {t} · 一人当たりGDP基準の推定","全球前 {t} · 按人均GDP估算","Top mundial {t} · estimado por el PIB per cápita","Top mundial {t} · estimado pelo PIB per capita"],
"인구 {p}":["Population {p}","人口 {p}","人口 {p}","Población {p}","População {p}"],
"{n}명":["{n} people","{n}人","{n}人","{n} personas","{n} pessoas"],
"걸릴 확률 {p}":["odds of landing here {p}","この国を引く確率 {p}","抽中概率 {p}","probabilidad de caer aquí {p}","chance de cair aqui {p}"],
"{cont} · {urban}에서 {gender}로 태어났습니다":["{cont} · born {gender} in the {urban}","{cont} · {urban}で{gender}として生まれました","{cont} · 出生在{urban},是个{gender}","{cont} · nacido {gender} en {urban}","{cont} · nascido {gender} em {urban}"],
"도시":["city","都市","城市","la ciudad","a cidade"],
"농촌":["countryside","農村","农村","el campo","a zona rural"],
"남자":["male","男性","男孩","hombre","homem"],
"여자":["female","女性","女孩","mujer","mulher"],
"🌟 인구 50만 미만의 나라":["🌟 Country under 500K people","🌟 人口50万人未満の国","🌟 人口不足50万的国家","🌟 País con menos de 500K habitantes","🌟 País com menos de 500 mil habitantes"],
"✨ 인구 500만 미만의 나라":["✨ Country under 5M people","✨ 人口500万人未満の国","✨ 人口不足500万的国家","✨ País con menos de 5M habitantes","✨ País com menos de 5 milhões de habitantes"],
"🫲 왼손잡이":["🫲 Left-handed","🫲 左利き","🫲 左撇子","🫲 Zurdo","🫲 Canhoto"],
"🫱 오른손잡이":["🫱 Right-handed","🫱 右利き","🫱 右撇子","🫱 Diestro","🫱 Destro"],
"💯 100세 장수 예정":["💯 Will live to 100","💯 100歳長寿予定","💯 将活到100岁","💯 Vivirá hasta los 100","💯 Vai viver até os 100"],
"💎 소득 상위 1%":["💎 Top 1% income","💎 所得上位1%","💎 收入前1%","💎 Top 1% de ingresos","💎 Top 1% de renda"],
"당신의 {n}번째 생":["Your life #{n}","あなたの{n}回目の人生","你的第{n}世","Tu vida n.º {n}","Sua vida nº {n}"],
"🔄 다시 환생하기":["🔄 Reincarnate Again","🔄 もう一度転生する","🔄 再次转世","🔄 Reencarnar de nuevo","🔄 Reencarnar de novo"],
/* ── main.js ── */
"⚠️ 확인할 수 없는 링크예요 — 위조되었거나 오래된 링크일 수 있습니다":["⚠️ This link can't be verified — it may be forged or outdated","⚠️ 確認できないリンクです — 偽造または古いリンクの可能性があります","⚠️ 无法验证的链接 — 可能是伪造或过期的链接","⚠️ Este enlace no se puede verificar — puede estar falsificado o caducado","⚠️ Este link não pode ser verificado — pode ser falso ou antigo"],
"친구가 받은 생입니다":["A life your friend received","友達が授かった人生です","朋友抽到的人生","Una vida que recibió tu amigo","Uma vida que seu amigo recebeu"],
"🌏 나도 환생해 보기":["🌏 Try My Own Rebirth","🌏 私も転生してみる","🌏 我也要转世","🌏 Probar mi propia reencarnación","🌏 Fazer minha própria reencarnação"],
"지금까지 {n}번 환생했습니다":["You've reincarnated {n} times so far","これまでに{n}回転生しました","至今已转世{n}次","Te has reencarnado {n} veces hasta ahora","Você já se reencarnou {n} vezes"],
/* ── 오늘의 운세(fortune.js) ── */
"낯선 나라의 음식을 먹으면 행운이 따라옵니다":["Eating food from an unfamiliar country brings luck","見知らぬ国の料理を食べると幸運が訪れます","吃一次陌生国家的美食,好运随之而来","Comer comida de un país desconocido te trae suerte","Comer comida de um país desconhecido traz sorte"],
"오늘의 인연은 생각보다 가까운 곳에 있습니다. 인사를 먼저 건네 보세요":["Today's connection is closer than you think — say hello first","今日のご縁は思ったより近くにあります。先に挨拶してみましょう","今天的缘分比想象中更近,先打个招呼吧","La conexión de hoy está más cerca de lo que crees — saluda primero","A conexão de hoje está mais perto do que você imagina — cumprimente primeiro"],
"리롤이 곧 복권입니다. 오늘은 손이 따뜻한 날이네요":["Every reroll is a lottery ticket — your hands are warm today","リロールはすなわち宝くじ。今日は手が温かい日ですね","每次重抽都是一张彩票,今天你的手很暖","Cada tirada es un billete de lotería — hoy tienes las manos calientes","Cada sorteio é um bilhete de loteria — hoje suas mãos estão quentes"],
"지도를 펼쳐 보세요. 다음 여행지가 오늘의 나라일지도 모릅니다":["Open a map — today's country might be your next trip","地図を広げてみて。次の旅行先は今日の国かもしれません","打开地图看看,下一个旅行地也许就是今天的国家","Abre un mapa — el país de hoy podría ser tu próximo viaje","Abra um mapa — o país de hoje pode ser sua próxima viagem"],
"오늘 배운 외국어 한 마디가 언젠가 당신을 구합니다":["A foreign phrase learned today will save you someday","今日覚えた外国語のひと言が、いつかあなたを救います","今天学会的一句外语,总有一天会救你","Una frase extranjera aprendida hoy te salvará algún día","Uma frase estrangeira aprendida hoje vai te salvar um dia"],
"이번 생은 연습이 아닙니다. 오늘 하루도 본편입니다":["This life is not a rehearsal — today is the main story","今回の人生は練習ではありません。今日も本編です","这一世不是彩排,今天也是正片","Esta vida no es un ensayo — hoy también es la función principal","Esta vida não é um ensaio — hoje também é o espetáculo principal"],
"오늘의 우연이 당신의 결정을 조용히 응원하고 있습니다":["Today's coincidences quietly cheer for your decisions","今日の偶然が、あなたの決断をそっと応援しています","今天的偶然正悄悄为你的决定加油","La casualidad de hoy anima en silencio tu decisión","O acaso de hoje torce em silêncio pela sua decisão"],
"잃어버린 물건이 서랍 두 번째 칸에서 기다립니다":["Your lost item is waiting in the second drawer","なくした物は引き出しの二段目で待っています","丢失的东西正在抽屉第二层等你","Lo que perdiste te espera en el segundo cajón","O que você perdeu espera na segunda gaveta"],
"누군가에게 이 결과를 공유하면 웃음이 두 배가 됩니다":["Share this result with someone and the laughter doubles","誰かにこの結果をシェアすると、笑いが2倍になります","把这个结果分享给别人,快乐加倍","Compartir este resultado con alguien duplica la risa","Compartilhar este resultado com alguém dobra a risada"],
"오늘은 평소보다 한 정거장 일찍 내려 걸어 보세요":["Get off one stop early today and walk","今日はいつもよりひと駅早く降りて歩いてみましょう","今天提前一站下车,走一走吧","Hoy bájate una parada antes y camina","Hoje desça uma parada antes e caminhe"],
"당신이 태어났을 확률을 생각하면, 오늘의 실수쯤은 아무것도 아닙니다":["Given the odds of your birth, today's mistakes are nothing","あなたが生まれた確率を思えば、今日のミスなんて何でもありません","想想你出生的概率,今天的小失误不算什么","Piensa en la probabilidad de que nacieras: el error de hoy no es nada","Pense na probabilidade de você ter nascido: o erro de hoje não é nada"],
"가장 귀한 생은 언제나 지금 이번 생입니다":["The most precious life is always this one, right now","いちばん尊い人生は、いつだってこの今の人生です","最珍贵的人生,永远是现在这一世","La vida más preciosa es siempre esta, la de ahora","A vida mais preciosa é sempre esta, a de agora"],
"오늘의 운세: ":["Today's fortune: ","今日の運勢: ","今日运势:","Fortuna de hoy: ","Sorte de hoje: "],
"오늘({d})의 운세 환생":["Today's ({d}) fortune rebirth","今日({d})の運勢転生","今日({d})运势转世","Reencarnación de la fortuna de hoy ({d})","Reencarnação da sorte de hoje ({d})"],
"오늘의 운세는 하루 동안 같아요. 내일 또 만나요 🌙":["Today's fortune stays the same all day — see you tomorrow 🌙","今日の運勢は一日中同じです。また明日 🌙","今天的运势一整天都相同,明天再见 🌙","La fortuna de hoy es la misma todo el día. ¡Hasta mañana! 🌙","A sorte de hoje é a mesma o dia todo. Até amanhã! 🌙"],
/* ── 공유(share.js) ── */
"📏 키 {v}cm":["📏 Height {v}cm","📏 身長 {v}cm","📏 身高 {v}cm","📏 Altura {v} cm","📏 Altura {v} cm"],
"⚖ 몸무게 {v}kg":["⚖ Weight {v}kg","⚖ 体重 {v}kg","⚖ 体重 {v}kg","⚖ Peso {v} kg","⚖ Peso {v} kg"],
"🧑‍🦲 탈모 예정":["🧑‍🦲 Will go bald","🧑‍🦲 薄毛予定","🧑‍🦲 将会脱发","🧑‍🦲 Se quedará calvo","🧑‍🦲 Vai ficar careca"],
"💇 숱 유지":["💇 Keeps hair","💇 髪キープ","💇 发量保持","💇 Conserva el pelo","💇 Mantém o cabelo"],
"⏳ 기대수명 {n}세":["⏳ Life expectancy {n}","⏳ 平均寿命 {n}歳","⏳ 预期寿命 {n}岁","⏳ Esperanza de vida {n} años","⏳ Expectativa de vida {n} anos"],
"💰 연 {v}":["💰 {v}/yr","💰 年収 {v}","💰 年收入 {v}","💰 {v}/año","💰 {v}/ano"],
"🌏 나는 {flag}{country} {urban}에서 {gender}로 태어났다":["🌏 I was born {gender}, in the {urban} of {flag}{country}","🌏 私は{flag}{country}の{urban}で{gender}として生まれた","🌏 我出生在{flag}{country}的{urban},是个{gender}","🌏 Nací {gender} en {urban} de {flag}{country}","🌏 Nasci {gender} em {urban} de {flag}{country}"],
"🎰 확률 {p}의 환생 뽑기 성공! {flag}{country}":["🎰 Hit a {p} rebirth roll! {flag}{country}","🎰 確率{p}の転生ガチャ成功! {flag}{country}","🎰 抽中了概率{p}的转世!{flag}{country}","🎰 ¡Reencarnación conseguida con probabilidad {p}! {flag}{country}","🎰 Reencarnação de probabilidade {p} conquistada! {flag}{country}"],
"이 생을 받을 확률 {p} · ":["Odds of this life: {p} · ","この人生を引く確率 {p} · ","抽中这一世的概率 {p} · ","Probabilidad de esta vida {p} · ","Probabilidade desta vida {p} · "],
"나의 {n}번째 생":["My life #{n}","私の{n}回目の人生","我的第{n}世","Mi vida n.º {n}","Minha vida nº {n}"],
"나도 환생해 보기 👉 {url}":["Try your own rebirth 👉 {url}","あなたも転生してみて 👉 {url}","你也来转世看看 👉 {url}","Prueba tu reencarnación 👉 {url}","Faça sua reencarnação 👉 {url}"],
"{flag}{country}에서 태어났습니다":["Born in {flag}{country}","{flag}{country}で生まれました","出生在{flag}{country}","Nací en {flag}{country}","Nasci em {flag}{country}"],
"확률 {p} · 나의 {n}번째 생":["Odds {p} · my life #{n}","確率 {p} · 私の{n}回目の人生","概率 {p} · 我的第{n}世","Probabilidad {p} · mi vida n.º {n}","Probabilidade {p} · minha vida nº {n}"],
"나도 환생해 보기":["Try your rebirth","私も転生する","我也要转世","Probar mi reencarnación","Fazer minha reencarnação"],
"공유 문구를 복사했어요 ✅":["Share text copied ✅","シェア文をコピーしました ✅","分享文案已复制 ✅","Texto de compartir copiado ✅","Texto de compartilhamento copiado ✅"],
"복사에 실패했어요 😢":["Copy failed 😢","コピーに失敗しました 😢","复制失败了 😢","No se pudo copiar 😢","Não foi possível copiar 😢"],
"목록에서 카카오톡을 선택해 주세요 💬":["Choose KakaoTalk from the list 💬","リストからカカオトークを選んでください 💬","请在列表中选择 KakaoTalk 💬","Elige KakaoTalk en la lista 💬","Escolha o KakaoTalk na lista 💬"],
"문구를 복사했어요. 카카오톡 채팅방에 붙여넣어 주세요 💬":["Text copied — paste it into a KakaoTalk chat 💬","文をコピーしました。カカオトークのチャットに貼り付けてください 💬","文案已复制,请粘贴到 KakaoTalk 聊天中 💬","Texto copiado. Pégalo en el chat de KakaoTalk 💬","Texto copiado. Cole no chat do KakaoTalk 💬"],
"카드를 저장하고 문구도 복사했어요. 스토리에 붙여넣어 보세요 📸":["Card saved and text copied — paste it into your Story 📸","カードを保存して文もコピーしました。ストーリーに貼り付けてみて 📸","卡片已保存,文案也已复制,贴到快拍里吧 📸","Tarjeta guardada y texto copiado. Pégalo en tu historia 📸","Cartão salvo e texto copiado. Cole no seu story 📸"],
"결과 카드를 저장했어요. 스토리에 올려 보세요 📸":["Result card saved — post it to your Story 📸","結果カードを保存しました。ストーリーに載せてみて 📸","结果卡片已保存,发到快拍试试 📸","Tarjeta de resultado guardada. Súbela a tu historia 📸","Cartão de resultado salvo. Poste no seu story 📸"],
"환 생 시 뮬 레 이 터":["R E B I R T H   S I M U L A T O R","輪 廻 転 生 シ ミ ュ レ ー タ ー","转 世 模 拟 器","S A M S A R A","S A M S A R A"],
"확률 {p}":["Odds {p}","確率 {p}","概率 {p}","Probabilidad {p}","Probabilidade {p}"],
"약 {n}번 중 1번":["≈ 1 in {n}","約{n}回に1回","约{n}次中的1次","≈1 entre {n}","≈1 em {n}"],
"당신의 다음 생은 어디에서 시작될까요?":["Where will your next life begin?","あなたの来世はどこから始まるでしょう?","你的下一世会从哪里开始?","¿Dónde empezará tu próxima vida?","Onde vai começar sua próxima vida?"],
/* ── 도감(dex.js) · 확률 표(odds.js) · 제안(suggest.js) ── */
"수집한 나라 {a} / {b} ({p}%) · 밝은 칸이 태어나 본 나라입니다":["Collected {a} / {b} countries ({p}%) · bright tiles are countries you've been born in","収集した国 {a} / {b} ({p}%) · 明るいマスは生まれたことのある国です","已收集国家 {a} / {b} ({p}%) · 亮色格子是你出生过的国家","Países coleccionados {a} / {b} ({p}%) · las casillas iluminadas son donde has nacido","Países coletados {a} / {b} ({p}%) · as casas iluminadas são onde você nasceu"],
"중국과 인도만 합쳐도 약 {p}%. 환생 3번 중 1번은 두 나라 중 하나에서 시작됩니다. 반대로 투발루(인구 1.1만 명)가 나올 확률은 약 {n}번 중 1번입니다.":["China and India alone add up to about {p}%. One rebirth in three starts in one of those two countries. Tuvalu (pop. 11,000), on the other hand, is roughly a 1-in-{n} roll.","中国とインドだけで約{p}%。転生3回に1回はこの2か国のどちらかで始まります。逆にツバル(人口1.1万人)が出る確率は約{n}回に1回です。","仅中国和印度加起来就约占{p}%,每3次转世就有1次从这两国之一开始。相反,抽中图瓦卢(人口1.1万)的概率约为{n}分之一。","China e India juntos suman ≈{p}%. Una de cada tres reencarnaciones empieza en uno de esos dos países. En cambio, Tuvalu (pob. 11.000) es aproximadamente 1 entre {n}.","China e Índia juntos somam ≈{p}%. Uma em cada três reencarnações começa em um desses dois países. Já Tuvalu (pop. 11.000) é cerca de 1 em {n}."],
"제안 고마워요! 다음 개선 후보로 담아 둘게요 📝":["Thanks for the idea! It's on the improvement list 📝","提案ありがとう!次の改善候補に入れておきます 📝","谢谢你的建议!我们会列入下一步改进候选 📝","¡Gracias por la sugerencia! La guardamos como próxima mejora 📝","Obrigado pela sugestão! Vamos guardá-la como próxima melhoria 📝"],
/* ── 첫 화면(intro-card): 예시 카드·CTA·사회적 증거·도감 ── */
"예시 결과":["Sample result","結果の例","结果示例","Resultado de ejemplo","Resultado de exemplo"],
"상위 {p}":["Top {p}","上位 {p}","前 {p}","Top {p}","Top {p}"],
"가구 소득":["Household income","世帯収入","家庭收入","Ingreso del hogar","Renda familiar"],
"내 다음 생 뽑기":["Roll my next life","次の人生を引く","抽取我的下一世","Sacar mi próxima vida","Sortear minha próxima vida"],
"3초면 끝나요 · 가입 없음":["Takes 3 seconds · no sign-up","3秒で完了 · 登録不要","3秒搞定 · 无需注册","Tarda 3 segundos · sin registro","Leva 3 segundos · sem cadastro"],
"지금까지 {n}번의 환생":["{n} rebirths so far","これまで{n}回の転生","至今已转世{n}次","{n} reencarnaciones hasta ahora","{n} reencarnações até agora"],
"나의 도감":["My Dex","私の図鑑","我的图鉴","Mi Dex","Meu Dex"],
"칭호 잠김":["Title locked","称号ロック中","称号未解锁","Título bloqueado","Título bloqueado"],
};

/* 대륙: data.js의 CONT_NAME(한국어)을 언어별로 대체 */
const CONT={AS:["Asia","アジア","亚洲","Asia","Ásia"],EU:["Europe","ヨーロッパ","欧洲","Europa","Europa"],AF:["Africa","アフリカ","非洲","África","África"],NA:["North America","北アメリカ","北美洲","América del Norte","América do Norte"],SA:["South America","南アメリカ","南美洲","América del Sur","América do Sul"],OC:["Oceania","オセアニア","大洋洲","Oceanía","Oceania"]};

/* footer는 <br>·링크가 섞인 innerHTML이라 문장 사전 대신 통짜로 바꾼다 */
const FOOTER={
en:'Country, population, urbanization, life expectancy and GDP per capita are approximations based on public statistics such as UN World Population Prospects 2024 and the World Bank.<br>Religion and income are estimates from representative national distributions — for fun only. 🌏<br>💬 Ideas & bug reports: <a href="https://github.com/madcamp-official/spk/issues" target="_blank" rel="noopener">GitHub Issues</a>',
ja:'国・人口・都市化率・平均寿命・一人当たりGDPは、UN World Population Prospects 2024や世界銀行などの公開統計に基づく近似値です。<br>宗教・所得は国別の代表的な分布に基づく推定であり、あくまでお楽しみとしてご覧ください。🌏<br>💬 アイデア・バグ報告: <a href="https://github.com/madcamp-official/spk/issues" target="_blank" rel="noopener">GitHub Issues</a>',
zh:'国家、人口、城市化率、预期寿命和人均GDP为基于 UN World Population Prospects 2024、世界银行等公开统计的近似值。<br>宗教与收入为基于各国代表性分布的估算,仅供娱乐。🌏<br>💬 意见与错误反馈: <a href="https://github.com/madcamp-official/spk/issues" target="_blank" rel="noopener">GitHub Issues</a>',
es:'País, población, tasa de urbanización, esperanza de vida y PIB per cápita son aproximaciones basadas en estadísticas públicas como UN World Population Prospects 2024 y el Banco Mundial.<br>Religión e ingresos son estimaciones a partir de distribuciones nacionales representativas — solo por diversión. 🌏<br>💬 Ideas y reportes de errores: <a href="https://github.com/madcamp-official/spk/issues" target="_blank" rel="noopener">GitHub Issues</a>',
pt:'País, população, taxa de urbanização, expectativa de vida e PIB per capita são aproximações baseadas em estatísticas públicas como UN World Population Prospects 2024 e o Banco Mundial.<br>Religião e renda são estimativas a partir de distribuições nacionais representativas — apenas por diversão. 🌏<br>💬 Ideias e relatos de bugs: <a href="https://github.com/madcamp-official/spk/issues" target="_blank" rel="noopener">GitHub Issues</a>',
};

/* ── 조회 함수 ── */
export function t(key,args){
 let v=key;
 if(cur!=="ko"){const e=STR[key];if(e&&e[IX])v=e[IX];}
 if(args)for(const k in args)v=v.split("{"+k+"}").join(args[k]);
 return v;
}
/* data.js의 한국어 값(언어·종교·민족). 사전에 없으면 원문(한국어) 그대로 —
   조용한 영어 오역보다 눈에 띄는 한국어가 낫다(누락을 바로 발견하게). */
export function term(ko){
 if(cur==="ko")return ko;
 const e=TERMS[ko];return e&&e[IX]?e[IX]:ko;
}
export function contName(code){return cur==="ko"?CONT_NAME[code]:CONT[code][IX];}

/* 나라 이름: 국기 이모지→ISO 코드→Intl.DisplayNames. 210개국 사전을 손으로 만들지 않는다.
   CLDR 기본형이 어색한 나라만 덮어쓴다. */
const NAME_OVERRIDE={XK:["Kosovo","コソボ","科索沃","Kosovo","Kosovo"],CD:["DR Congo","コンゴ民主共和国","刚果(金)","RD del Congo","RD do Congo"],CG:["Republic of the Congo","コンゴ共和国","刚果(布)","República del Congo","República do Congo"]};
let dn=null;
if(cur!=="ko"&&typeof Intl!=="undefined"&&Intl.DisplayNames){
 try{dn=new Intl.DisplayNames([cur],{type:"region"});}catch(e){dn=null;}
}
export function countryName(c){
 if(cur==="ko")return c.name;
 const code=isoCode(c.flag);
 const ov=NAME_OVERRIDE[code];if(ov)return ov[IX];
 const n=dn&&dn.of(code);
 return n&&n!==code?n:c.name;
}
/* 큰 수: ko 억/만 · ja 億/万 · zh 亿/万 · en billion/million */
export function bigNum(n){
 if(cur==="en"){
  if(n>=1e9)return (n/1e9).toFixed(n>=3e9?0:1).replace(/\.0$/,"")+" billion";
  if(n>=1e6)return Math.round(n/1e6).toLocaleString()+" million";
  return Math.round(n).toLocaleString();
 }
 if(cur==="es"||cur==="pt"){
  const MI=cur==="es"?" millones":" milhões",BI=cur==="es"?" mil millones":(" bilhões");
  if(n>=1e9)return (n/1e9).toFixed(n>=3e9?0:1).replace(/\.0$/,"")+BI;
  if(n>=1e6)return Math.round(n/1e6).toLocaleString()+MI;
  return Math.round(n).toLocaleString();
 }
 if(cur==="ja"||cur==="zh"){
  const OKU=cur==="ja"?"億":"亿",MAN=cur==="ja"?"万":"万";
  if(n>=1e8)return (n/1e8).toFixed(n>=3e8?0:1).replace(/\.0$/,"")+OKU;
  if(n>=1e4)return Math.round(n/1e4).toLocaleString()+MAN;
  return Math.round(n).toLocaleString();
 }
 return koNum(n);
}

/* util.js의 포맷 문자열(한국어 기본값)을 현재 언어로 갈아끼운다.
   util은 서버도 import하므로 i18n을 역참조할 수 없다 — 이 방향의 주입만 가능하다. */
if(cur==="en"){L.pctLess="under 0.0001%";L.topWithin="<0.1%";}
else if(cur==="ja"){L.pctLess="0.0001%未満";L.topWithin="0.1%以内";}
else if(cur==="zh"){L.pctLess="低于0.0001%";L.topWithin="0.1%以内";}
else if(cur==="es"){L.pctLess="menos de 0.0001%";L.topWithin="<0.1%";}
else if(cur==="pt"){L.pctLess="menos de 0.0001%";L.topWithin="<0.1%";}

/* ── 정적 화면 번역 + 전환 위젯 (클라이언트에서만) ── */
function applyStatic(){
 const q=s=>document.querySelector(s);
 const id=s=>document.getElementById(s);
 document.documentElement.lang=cur;
 document.title=t("환생 시뮬레이터");
 q("header h1").textContent=t("환생 시뮬레이터");
 {const el=id("introHook");if(el)el.textContent=t("인도에서 태어날 확률 17.8%, 모나코는 20만 분의 1. 당신은?");}
 id("sharedNote").textContent=t("🔗 친구가 공유한 생 — 아래 버튼으로 내 생을 뽑아 보세요");
 id("country").textContent=t("아직 태어나기 전입니다");
 id("subline").textContent=t("아래 버튼을 누르면 새로운 생을 받습니다");
 id("rollBtn").textContent=t("🌏 환생 시작하기");
 id("fortuneBtn").textContent=t("🔮 오늘의 환생 운세");
 id("shareImg").textContent=t("🖼️ 결과 카드 저장");
 id("shareBtn").textContent=t("📤 공유하기");
 id("stTotal").nextElementSibling.textContent=t("나의 환생 횟수");
 id("stGlobal").nextElementSibling.textContent=t("모두의 환생 횟수 🌏");
 id("stSeen").nextElementSibling.textContent=t("태어나 본 나라 · 도감 📖");
 {const el=id("introRoll");if(el)el.textContent=t("내 다음 생 뽑기");}
 {const el=id("introFriction");if(el)el.textContent=t("3초면 끝나요 · 가입 없음");}
 {const el=id("dexTeaseLabel");if(el)el.textContent=t("나의 도감");}
 {const el=id("titleLock");if(el)el.innerHTML='<span aria-hidden="true">🔒</span> '+t("칭호 잠김");}
 id("stBest").nextElementSibling.textContent=t("최고 희귀 기록");
 id("dexBtn").title=t("환생 도감 열기");
 q("#suggest h3").textContent=t("💡 이런 항목도 환생 결과에 넣어 주세요");
 q("#suggest .hint").textContent=t("한 줄이면 충분해요. 다음 개선 후보로 담아 둡니다.");
 id("sgInput").placeholder=t("예: 형제 수, 태어난 계절, 평균 키…");
 id("sgSend").textContent=t("보내기");
 q("#suggest .sg-note").textContent=t("개인정보는 적지 말아 주세요.");
 if(cur!=="ko")q(".wrap footer").innerHTML=FOOTER[cur];
 q("#dexModal h3").textContent=t("📖 환생 도감");
 q("#dexModal .modal").setAttribute("aria-label",t("환생 도감"));
 id("dexClose").setAttribute("aria-label",t("닫기"));
 q("#shareModal h3").textContent=t("📤 공유하기");
 q("#shareModal .modal").setAttribute("aria-label",t("공유하기"));
 id("shareClose").setAttribute("aria-label",t("닫기"));
 const OPTS={clip:["📋","클립보드 복사"],kakao:["💬","카카오톡"],insta:["📸","인스타 스토리"],x:["🐦","X (트위터)"],native:["📱","다른 앱으로…"]};
 for(const ch in OPTS){
  const b=q('#shareModal .share-opt[data-ch="'+ch+'"]');
  if(b)b.innerHTML='<span class="so-ico">'+OPTS[ch][0]+"</span>"+t(OPTS[ch][1]);
 }
}
function mountSwitch(){
 const sw=document.getElementById("langSwitch");
 if(!sw)return;
 sw.querySelectorAll("button").forEach(b=>{
  if(b.dataset.lang===cur)b.classList.add("active");
  b.addEventListener("click",()=>{
   if(b.dataset.lang===cur)return;
   try{localStorage.setItem(KEY,b.dataset.lang);}catch(e){}
   location.reload();
  });
 });
}
if(typeof document!=="undefined"){applyStatic();mountSwitch();}
