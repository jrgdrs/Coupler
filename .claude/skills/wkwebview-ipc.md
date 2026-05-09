# Skill: WKWebView IPC — Large Data Transfer (JS → Python)

## Context
The Coupler Glyphs plugin uses WKWebView with a `WKNavigationDelegate` for all JS↔Python
communication. JS navigates to `coupler://cmd?data`, Python intercepts and cancels the
navigation, processes the command, and optionally calls back via `evaluateJavaScript`.

## Problem: URL length limit
`window.location.href = 'coupler://cmd?' + encodeURIComponent(JSON.stringify(largeArray))`
fails silently or crashes WKWebView when the payload exceeds ~8 KB (NSURL parses the URL;
very long strings cause navigation failures or EXC_BAD_ACCESS).

**Affected operation:** Apply to Font with pair limit = 0 (thousands of kerning pairs).

## Solution: Python-driven chunked pull

Never put large data in a URL. Instead:

1. **JS stores data in a window global and signals Python with a tiny URL:**
```js
window._couplerKerning = pairs;            // store
window.location.href = 'coupler://applykerning_start?n=' + pairs.length;  // signal
```

2. **JS exposes a chunk function Python can call:**
```js
function sendKerningChunk(idx) {
  const CHUNK = 200;
  const slice = window._couplerKerning.slice(idx * CHUNK, (idx + 1) * CHUNK);
  if (!slice.length) { window.location.href = 'coupler://applykerning_done'; return; }
  window.location.href = 'coupler://applykerning_chunk?' +
    encodeURIComponent(JSON.stringify({ i: idx, d: slice }));
}
```

3. **Python accumulates chunks via `self._js()` (no completion handler blocks):**
```python
elif cmd == 'applykerning_start':
    dialog._kerning_buf = []
    dialog._js('sendKerningChunk(0)')        # kick off first chunk

elif cmd == 'applykerning_chunk':
    data  = json.loads(urllib.parse.unquote(query))
    idx   = int(data.get('i', 0))
    dialog._kerning_buf.extend(data.get('d', []))
    dialog._js('sendKerningChunk(%d)' % (idx + 1))  # request next

elif cmd == 'applykerning_done':
    pairs = dialog._kerning_buf or []
    dialog._kerning_buf = None
    dialog._apply_kerning(pairs)
```

## Why NOT evaluateJavaScript with a completion handler

```python
# DANGEROUS — do not do this:
def _on_result(result, error):
    ...
dialog._webview.evaluateJavaScript_completionHandler_(code, _on_result)
```

PyObjC wraps `_on_result` as an ObjC block but **does not retain the Python closure**.
After `couplerDispatch_` returns, the closure goes out of scope. Python's GC collects it.
When WebKit later invokes the block, the invoke pointer is null → EXC_BAD_ACCESS (SIGSEGV)
at 0x0000000000000000.

**Safe pattern:** always pass `None` as the completion handler, or use the chunk approach above.

```python
# SAFE — fire-and-forget:
self._webview.evaluateJavaScript_completionHandler_(code, None)

# Shorthand already in use:
def _js(self, code):
    self._webview.evaluateJavaScript_completionHandler_(code, None)
```

## Python → JS (large data)
This direction is safe via `evaluateJavaScript` — no block involved, Python is the caller:
```python
self._js('receiveGlyphData(%s)' % json_str)   # works for MB-sized payloads
```

## Chunk size guideline
200 pairs × ~45 chars/pair ≈ 9 KB per chunk URL → well within limits.
Adjust if individual records are larger.
