---
name: verify
description: Drive the 환생 시뮬레이터 in a real browser and capture the analytics events it emits. Use when verifying changes to index.html — rolling, sharing, feedback, the suggestion box, or any track() instrumentation.
---

# Verify 환생 시뮬레이터

Single static `index.html`, no build step, no server code. Everything
observable happens in the browser, so verification = drive Chromium and
read the events `track()` emits.

## Serve

```bash
python -m http.server 8791 --bind 127.0.0.1     # from repo root
```

## Driver

No node/npx in this environment. Use Playwright for Python:

```bash
pip install playwright && python -m playwright install chromium
```

## Capture events

`track()` (index.html) fans out to `window.gtag` / `window.posthog` /
`window.plausible` if present, and no snippet is installed by default.
So stub one **before page scripts run** — `add_init_script`, not
`evaluate`, or you miss `visit`:

```python
STUB = "window.__ev=[];window.gtag=function(k,n,p){window.__ev.push({name:n,props:p});};"
pg.add_init_script(STUB)
pg.goto("http://127.0.0.1:8791/index.html")
pg.evaluate("window.__ev")   # -> [{name, props}, ...]
```

Every event is auto-stamped with `ref`, `v`, `vin` by `track()`.

### Events that outlive the page

`exit` fires on `pagehide`, so `window.__ev` is gone before you can read
it. Route through console instead — it survives teardown:

```python
STUB = 'window.gtag=function(k,n,p){console.log("EV "+JSON.stringify({name:n,props:p}));};'
pg.on("console", lambda m: msgs.append(m.text))
pg.goto("about:blank")   # triggers real pagehide
```

## Gotchas

- **Synthetic `visibilitychange` needs `bubbles:true`.** The listener is on
  `window`; the real event bubbles up from `document`, but
  `new Event('visibilitychange')` defaults to `bubbles:false` and silently
  never arrives. A missing `exit` event is usually this, not a bug.
- **Headless tab-backgrounding doesn't fire `visibilitychange`.** Opening a
  second tab won't background the first. Test the `exit` path via real
  navigation (`pagehide`) instead.
- **Fresh `browser.new_context()` per scenario.** State lives in
  localStorage (`rebirth_state`); a reused context carries `ST.ab`,
  `ST.vIn`, and the 도감 across runs and will taint A/B checks.
- **Roll animation is ~910ms.** Wait ≥1300ms after `#rollBtn` before
  asserting on the result.
- **PowerShell console mangles UTF-8.** Korean event text prints as
  mojibake even when correct. Set `PYTHONIOENCODING=utf-8` and wrap
  stdout, or verify via `json.dumps(..., ensure_ascii=False)` to a file.

## Regression worth re-checking

`[hidden]{display:none !important}` (near the top of the CSS) is load-bearing.
Author rules like `.feedback{display:flex}` beat the UA `[hidden]` rule, so
without it the 도감 modal renders over the page on load and the roll button
is unclickable. Audit after touching CSS:

```python
pg.evaluate("""[...document.querySelectorAll('[hidden]')]
  .filter(e => getComputedStyle(e).display !== 'none').map(e => e.id)""")
# must be []
```
