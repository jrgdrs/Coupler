# encoding: utf-8
# nav_delegate.py — WKNavigationDelegate IPC bridge (JS → Python)
#
# JS navigates to coupler://cmd?urlencoded_data.
# Python cancels the navigation and processes the command via performSelector:afterDelay:0
# so the WKWebView XPC channel is never flooded while the main runloop is stalled.
#
# SAFETY: Never use evaluateJavaScript_completionHandler_ with a Python closure as
# the completion block — PyObjC does not retain the closure as an ObjC block, so
# WebKit calling the freed block causes SIGSEGV at 0x0.
# Only call _js(code) which passes None as handler (proven safe).

import json
import traceback
import urllib.parse

from AppKit import NSObject


class _NavDelegate(NSObject):
    _dialog       = None
    _pending_cmd   = ''
    _pending_query = ''

    def webView_decidePolicyForNavigationAction_decisionHandler_(
            self, webview, action, handler):
        """Intercept coupler:// navigations on the main thread.

        Cancel immediately, then defer heavy Python work to the next runloop tick
        via performSelector:afterDelay:0 so the WebKit XPC channel stays healthy.
        """
        try:
            url    = action.request().URL()
            scheme = url.scheme() if url else None
            if scheme == 'coupler':
                handler(0)  # cancel — page stays at file:// URL
                self._pending_cmd   = (url.host() or '').lower()
                self._pending_query = url.query() or ''
                print('[Coupler] IPC cmd=%r (deferred)' % self._pending_cmd)
                NSObject.cancelPreviousPerformRequestsWithTarget_(self)
                self.performSelector_withObject_afterDelay_(
                    'couplerDispatch:', None, 0.0)
                return
        except Exception:
            traceback.print_exc()
        handler(1)  # allow normal navigations

    def couplerDispatch_(self, _):
        """Runs in the next runloop cycle — main thread free, XPC healthy."""
        cmd    = self._pending_cmd
        query  = self._pending_query
        dialog = self._dialog
        if not dialog:
            return
        if not getattr(dialog, '_webview', None):
            return
        try:
            if cmd == 'requestdata':
                dialog._send_glyph_data()
            elif cmd == 'identify':
                dialog._send_identity()
            elif cmd == 'applykerning_start':
                try:
                    params = dict(s.split('=') for s in query.split('&') if '=' in s)
                    n = int(params.get('n', 0))
                except Exception:
                    n = 0
                dialog._kerning_buf = []
                if n == 0:
                    dialog._apply_kerning([])
                else:
                    dialog._js('sendKerningChunk(0)')
            elif cmd == 'applykerning_chunk':
                idx = 0
                try:
                    data = json.loads(urllib.parse.unquote(query)) if query else {}
                    chunk = data.get('d', [])
                    idx   = int(data.get('i', 0))
                    if not isinstance(getattr(dialog, '_kerning_buf', None), list):
                        dialog._kerning_buf = []
                    dialog._kerning_buf.extend(chunk)
                except Exception as pe:
                    print('[Coupler] applykerning_chunk error: %s' % pe)
                dialog._js('sendKerningChunk(%d)' % (idx + 1))
            elif cmd == 'applykerning_done':
                pairs = getattr(dialog, '_kerning_buf', []) or []
                dialog._kerning_buf = None
                dialog._apply_kerning(pairs)
            elif cmd == 'applyspacing':
                try:
                    items = json.loads(urllib.parse.unquote(query)) if query else []
                except Exception as pe:
                    print('[Coupler] applyspacing parse error: %s' % pe)
                    items = []
                dialog._apply_spacing(items)
            elif cmd == 'resize':
                try:
                    params = dict(p.split('=') for p in query.split('&') if '=' in p)
                    w = int(params.get('w', 240))
                    h = int(params.get('h', 675))
                    dialog._resize_window(w, h)
                except Exception as re:
                    print('[Coupler] resize error: %s' % re)
        except Exception:
            traceback.print_exc()
