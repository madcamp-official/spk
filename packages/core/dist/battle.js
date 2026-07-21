/* ===== 배틀 판정 (DiscordBot.md §E) =====
   랜덤 3축 3판 2선승. 순수 로직이라 Discord도 DB도 모른다 — 봇은 값만 넘기고 결과를 받는다.

   ⚠ §E의 축 5종 중 **형제 수는 뺐다**. 국가 출산율 데이터가 없어 siblings가 전부 NULL이라
   비교 자체가 성립하지 않는다(무승부만 나온다). 데이터가 생기면 AXES에 한 줄 추가하면 된다.
   나머지 4축 중 3개를 뽑으므로 조합은 4가지다. */
import { BATTLE } from "./config.js";
import { rand } from "./util.js";
export const AXES = ["lifeExp", "income", "pop", "rarity"];
/** 축의 비교값. **항상 클수록 이긴다**로 통일한다 —
 *  희귀도만 "낮은 확률 쪽 승"(§E)이라 역수를 취해 방향을 맞춘다. */
export function axisValue(s, axis) {
    switch (axis) {
        case "lifeExp": return s.lifeExp;
        case "income": return s.income;
        case "pop": return s.pop;
        case "rarity": return 1 / Math.max(s.rarityScore, 1e-12);
    }
}
/** 이 생이 그 축에서 얼마나 센가(정렬·자동 선발용). axisValue와 같은 방향. */
export function axisRankValue(s, axis) {
    return axisValue(s, axis);
}
/** 축 n개를 중복 없이 뽑는다 (§E "랜덤 3축") */
export function drawAxes(n = BATTLE.axesPerBattle) {
    const pool = [...AXES];
    const out = [];
    const k = Math.min(n, pool.length);
    for (let i = 0; i < k; i++) {
        out.push(...pool.splice(Math.floor(rand() * pool.length), 1));
    }
    return out;
}
/** 한 축의 사전 승률 — P(A의 보정값 > B의 보정값).
 *
 *  보정은 균등분포 U(1-j, 1+j)를 값에 곱한다. 두 균등분포 비율의 확률을
 *  수치적분으로 구한다(난수를 쓰지 않는다 — 사전 승률이 매번 달라지면 보상 판정이 흔들린다). */
export function axisWinProb(vA, vB, jitter = BATTLE.axisJitter ?? 0) {
    if (!(vA > 0) || !(vB > 0))
        return vA === vB ? 0.5 : vA > vB ? 1 : 0;
    if (jitter <= 0)
        return vA === vB ? 0.5 : vA > vB ? 1 : 0;
    const lo = 1 - jitter, hi = 1 + jitter, span = hi - lo;
    const k = vB / vA; /* uA > k*uB 이면 A 승 */
    const N = 2000;
    let acc = 0;
    for (let i = 0; i < N; i++) {
        const uB = lo + span * (i + 0.5) / N;
        const t = k * uB;
        acc += t <= lo ? 1 : t >= hi ? 0 : (hi - t) / span;
    }
    return acc / N;
}
/** 3판 2선승의 종합 기대 승률 (§E "축별 사전 승률로 종합 기대 승률 계산") */
export function matchWinProb(axisProbs) {
    const n = axisProbs.length;
    const need = Math.floor(n / 2) + 1;
    let total = 0;
    /* 모든 승패 조합을 훑는다 — 축이 3개라 8가지뿐이다 */
    for (let mask = 0; mask < (1 << n); mask++) {
        let wins = 0, p = 1;
        for (let i = 0; i < n; i++) {
            const won = (mask >> i) & 1;
            wins += won;
            p *= won ? axisProbs[i] : 1 - axisProbs[i];
        }
        if (wins >= need)
            total += p;
    }
    return total;
}
/** 배틀 한 판. 축은 넘기지 않으면 여기서 뽑는다. */
export function resolveBattle(a, b, axes = drawAxes()) {
    const j = BATTLE.axisJitter ?? 0;
    const jit = () => 1 - j + rand() * 2 * j;
    const rounds = axes.map(axis => {
        const rawA = axisValue(a, axis), rawB = axisValue(b, axis);
        const adjA = rawA * jit(), adjB = rawB * jit();
        const winner = adjA >= adjB ? "a" : "b";
        /* 보정이 결과를 뒤집었는지 — "운이 갈랐다"는 서사의 근거가 된다 */
        const plain = rawA >= rawB ? "a" : "b";
        return { axis, rawA, rawB, adjA, adjB, winner, flipped: winner !== plain };
    });
    const scoreA = rounds.filter(r => r.winner === "a").length;
    const scoreB = rounds.length - scoreA;
    const winner = scoreA > scoreB ? "a" : "b";
    const priorA = matchWinProb(axes.map(ax => axisWinProb(axisValue(a, ax), axisValue(b, ax))));
    const priorWinner = winner === "a" ? priorA : 1 - priorA;
    return {
        axes, rounds, scoreA, scoreB, winner, priorA, priorWinner,
        upset: priorWinner < BATTLE.underdogThreshold,
        close: Math.abs(scoreA - scoreB) === 1,
    };
}
/** 뽑힌 축들에 가장 잘 맞는 생을 덱에서 고른다 (§E "축별 최적 자동 선발").
 *
 *  상대 덱을 모르는 상태에서 고르므로, **내 덱 안에서의 축별 순위**를 합산해 뽑는다.
 *  (상대를 보고 고르면 후공이 항상 유리해져 비동기 대결이 성립하지 않는다.)
 *  동점이면 출생 번호가 빠른 쪽 — 오래된 생이 우선이라 결과가 재현된다. */
export function pickBestLife(deck, axes) {
    if (!deck.length)
        return null;
    const score = new Map();
    for (const axis of axes) {
        const sorted = [...deck].sort((x, y) => axisRankValue(x, axis) - axisRankValue(y, axis));
        sorted.forEach((life, i) => {
            /* 백분위(0~1). 덱이 1장이면 0.5로 둔다(나눗셈 0 방지) */
            const pct = sorted.length > 1 ? i / (sorted.length - 1) : 0.5;
            score.set(life.id, (score.get(life.id) ?? 0) + pct);
        });
    }
    let best = deck[0];
    for (const life of deck) {
        const s = score.get(life.id) ?? 0, bs = score.get(best.id) ?? 0;
        if (s > bs || (s === bs && life.id < best.id))
            best = life;
    }
    return best;
}
//# sourceMappingURL=battle.js.map