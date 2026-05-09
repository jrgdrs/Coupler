# Skill: PyObjC Safety in Glyphs Plugin Context

## Context
The Coupler plugin runs Python inside Glyphs 3 via PyObjC. Two categories of crashes
can occur during heavy operations:

---

## 1. Cyclic GC crash during ObjC callbacks (SIGABRT)

**Symptom:** `Py_FatalError: visit_decref: refcount <= 0` or unexplained abort during
`_send_glyph_data` or any function that iterates over GSGlyph/GSLayer/GSNode proxies.

**Cause:** Python's cyclic GC fires while PyObjC proxy objects (GSGlyph, GSLayer, GSNode)
are live on the stack. ObjC ARC retains are invisible to gc_refs accounting — visit_decref
pushes gc_refs below zero → abort.

**Fix:** Disable GC for the duration of any function that holds live ObjC proxies:
```python
def _send_glyph_data(self):
    gc.disable()
    try:
        self._send_glyph_data_inner()
    finally:
        gc.enable()
```

Apply the same pattern to `_apply_kerning` and `_apply_spacing` if they iterate font
proxy objects inside a long loop (`font.setKerningForPair` called thousands of times).

---

## 2. PyObjC block / closure crashes (SIGSEGV at 0x0)

**Symptom:** EXC_BAD_ACCESS (SIGSEGV), exception codes `0xD` / `0x0000000000000000`
when WebKit calls a completion handler that was passed a Python closure.

**Cause:** PyObjC wraps the Python callable as an ObjC block but does **not** increment
the Python refcount. Once the enclosing scope returns, the closure is eligible for GC.
When WebKit calls the block later, the invoke pointer is null → null dereference.

**Fix:** Never pass Python closures as ObjC block arguments in this runtime.
- Always pass `None` as completion handler for `evaluateJavaScript_completionHandler_`
- If you must retain a handler, store it on a long-lived Python object **and** verify
  PyObjC actually bridges the block correctly before relying on it.

---

## 3. Navigation delegate — do NOT declare protocol conformance

```python
# WRONG — PyObjC protocol conformance is broken in Glyphs runtime:
class _NavDelegate(NSObject, protocols=['WKNavigationDelegate']):
    ...

# CORRECT — WKWebView calls respondsToSelector: internally; just implement the method:
class _NavDelegate(NSObject):
    def webView_decidePolicyForNavigationAction_decisionHandler_(self, wv, action, handler):
        ...
```

---

## 4. Stale font/master proxy after master switch

`self._font` and `self._master` can become stale after the user switches masters or fonts.
Always re-resolve from the live Glyphs API at the start of any operation:

```python
font   = Glyphs.font or self._font
master = font.selectedFontMaster
```

---

## 5. performSelector stacking

`cancelPreviousPerformRequestsWithTarget_(self)` before each deferred dispatch prevents
multiple in-flight `couplerDispatch_` calls from stacking when JS triggers rapid
navigations. This is already in place — do not remove it.
