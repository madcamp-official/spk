/* ===== 순수 헬퍼: 난수원 · 분포 · 클램프 =====
   apps/web/app/core/util.js 에서 **플랫폼 무관한 것만** 옮겨 왔다. 구현은 그대로다.
   DOM($)·브라우저 감지(reduceMotion·isAutomated)·표시 포맷(fmtPct 등)은 i18n과 얽혀
   있어 웹에 남았고, 웹 util.js가 이 파일을 다시 내보내 기존 import를 유지한다.

   ⚠ RNG는 모듈 단위 싱글턴이다. 웹의 "오늘의 운세"가 setRNG로 날짜 시드를 꽂았다가
   되돌리는데, 그 사이 rollLife()가 같은 RNG를 봐야 하루 고정 결과가 나온다.
   웹 util.js가 이 파일을 **재수출**하므로 브라우저에서 같은 URL = 같은 인스턴스가 되고,
   서버(node)도 이 파일 하나만 물게 된다. 복사본을 만들면 그 보장이 깨진다. */
/** 확률 롤 전용 난수원. 기본은 Math.random. */
let RNG = Math.random;
export const rand = () => RNG();
/** 오늘의 운세만 날짜 시드 난수로 갈아끼웠다가 되돌린다 */
export function setRNG(f) { RNG = f; }
export function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
export function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
/** 표준정규 난수 (Box–Muller) */
export function gauss() {
    let u = 0, v = 0;
    while (!u)
        u = rand();
    while (!v)
        v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function erf(x) {
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
}
/** 표준정규 누적분포 */
export const phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
/** [값, 가중치] 쌍에서 가중 추첨 */
export function pickWeighted(pairs) {
    let sum = 0;
    for (const p of pairs)
        sum += p[1];
    let r = rand() * sum;
    for (const p of pairs) {
        r -= p[1];
        if (r <= 0)
            return p;
    }
    return pairs[0];
}
export function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
}
/** 국기 이모지 → ISO 3166-1 alpha-2 (§G country_code).
 *  데이터셋에 코드 컬럼을 따로 두지 않고 국기에서 파생한다 — 두 값이 어긋날 수 없다. */
export function isoCode(flag) {
    return [...flag].map(ch => String.fromCodePoint(ch.codePointAt(0) - 0x1F1E6 + 65)).join("");
}
//# sourceMappingURL=util.js.map