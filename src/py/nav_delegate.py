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

import gc
import json
import time
import traceback
import urllib.parse

from AppKit import NSObject

_DBG_PATH = '/tmp/coupler_debug.txt'

def _dbg(label):
    try:
        enabled = gc.isenabled()
        count   = gc.get_count()
        thresh  = gc.get_threshold()
        msg = '[Coupler-DBG %s] gc=%s count=%s thresh=%s :: %s\n' % (
            time.strftime('%H:%M:%S'), enabled, count, thresh, label)
        print(msg, end='')
        with open(_DBG_PATH, 'a') as f:
            f.write(msg)
    except Exception:
        pass


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
                if self._pending_cmd == 'applykerning':
                    _dbg('IPC:applykerning received in webView_handler — about to schedule couplerDispatch_')
                NSObject.cancelPreviousPerformRequestsWithTarget_(self)
                self.performSelector_withObject_afterDelay_(
                    'couplerDispatch:', None, 0.0)
                return
        except Exception:
            traceback.print_exc()
        handler(1)  # allow normal navigations

    def couplerDispatch_(self, _):
        """Runs in the next runloop cycle — main thread free, XPC healthy.

        gc.disable() guards the entire method: json.loads on large payloads creates
        tens of thousands of Python objects and reliably crosses the GC threshold.
        When GC fires inside an ObjC callback, visit_decref traverses CouplerDialog.__dict__
        (which holds live ObjC proxies) and crashes. Single-URL dispatch means
        gc.enable() in finally fires exactly once, after all ObjC work is complete.
        """
        gc.disable()
        try:
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
                elif cmd == 'applykerning':
                    _dbg('couplerDispatch_:applykerning entry — query_len=%d' % len(query))
                    try:
                        pairs = json.loads(urllib.parse.unquote(query)) if query else []
                    except Exception as pe:
                        print('[Coupler] applykerning parse error: %s' % pe)
                        pairs = []
                    _dbg('couplerDispatch_:applykerning json.loads done — pairs=%d' % len(pairs))
                    dialog._apply_kerning(pairs)
                    _dbg('couplerDispatch_:applykerning _apply_kerning returned')
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
        finally:
            gc.enable()
