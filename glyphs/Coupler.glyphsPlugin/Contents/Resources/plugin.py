# encoding: utf-8
# Coupler.glyphsPlugin  ·  Optical kerning engine for Glyphs 3
# com.typobold.coupler
#
# IPC: JS navigates to coupler://cmd?data → WKNavigationDelegate intercepts & cancels.
# Python→JS: evaluateJavaScript (fire-and-forget).
# IS_GLYPHS detection: WKUserScript injects window.__IS_GLYPHS=true at document start.

from __future__ import print_function
import json
import objc
import os
import traceback
import urllib.parse

from GlyphsApp import Glyphs, Message
try:
    from GlyphsApp.plugins import GeneralPlugin
except ImportError:
    from GlyphsApp import GeneralPlugin
try:
    from GlyphsApp.plugins import SCRIPT_MENU
except (ImportError, AttributeError):
    SCRIPT_MENU = 7

from AppKit import NSMenuItem, NSObject, NSMakeRect

try:
    from AppKit import (NSWindowStyleMaskTitled, NSWindowStyleMaskClosable,
                        NSWindowStyleMaskResizable, NSWindowStyleMaskMiniaturizable,
                        NSBackingStoreBuffered)
except ImportError:
    NSWindowStyleMaskTitled         = 1
    NSWindowStyleMaskClosable       = 2
    NSWindowStyleMaskMiniaturizable = 4
    NSWindowStyleMaskResizable      = 8
    NSBackingStoreBuffered          = 2

from WebKit import WKWebView, WKWebViewConfiguration

GSOFFCURVE = 'offcurve'
GSLINE     = 'line'
GSCURVE    = 'curve'


# ── Path conversion ───────────────────────────────────────────────────────────

def _prefetch_layer_paths(layer):
    paths_py = []
    try:
        for path in layer.paths:
            nd_list = [(float(nd.x), float(nd.y), nd.type) for nd in path.nodes]
            if nd_list:
                paths_py.append(nd_list)
    except Exception:
        pass
    return paths_py


def _paths_to_js_commands(paths_py):
    commands = []
    for nodes in paths_py:
        n = len(nodes)
        if n < 2:
            continue
        oc_idx = [i for i, nd in enumerate(nodes) if nd[2] != GSOFFCURVE]
        if not oc_idx:
            continue
        num_oc = len(oc_idx)
        start = nodes[oc_idx[0]]
        commands.append({'type': 'M', 'x': start[0], 'y': -start[1]})
        for seg_i in range(num_oc):
            oc_s = oc_idx[seg_i]
            oc_e = oc_idx[(seg_i + 1) % num_oc]
            seg = []
            i = (oc_s + 1) % n
            while True:
                seg.append(nodes[i])
                if i == oc_e:
                    break
                i = (i + 1) % n
            end_nd = seg[-1]
            offs   = seg[:-1]
            if end_nd[2] == GSLINE:
                commands.append({'type': 'L', 'x': end_nd[0], 'y': -end_nd[1]})
            elif end_nd[2] == GSCURVE and len(offs) == 2:
                commands.append({
                    'type': 'C',
                    'x1': offs[0][0], 'y1': -offs[0][1],
                    'x2': offs[1][0], 'y2': -offs[1][1],
                    'x':  end_nd[0],  'y':  -end_nd[1],
                })
        commands.append({'type': 'Z'})
    return commands


# ── Navigation delegate (JS→Python IPC) ──────────────────────────────────────
# JS navigates to coupler://cmd?urlencoded_json.  Python intercepts, cancels the
# navigation, processes the command, then calls back via evaluateJavaScript.
# WKNavigationDelegate uses respondsToSelector: internally — no protocol
# conformance declaration needed; PyObjC exposes the method automatically.

class _NavDelegate(NSObject):
    _dialog = None

    def webView_decidePolicyForNavigationAction_decisionHandler_(
            self, webview, action, handler):
        try:
            url    = action.request().URL()
            scheme = url.scheme() if url else None
            if scheme == 'coupler':
                # Cancel the navigation immediately so the page stays intact.
                handler(0)  # WKNavigationActionPolicyCancel
                cmd   = (url.host() or '').lower()
                query = url.query() or ''
                print('[Coupler] IPC cmd=%r query_len=%d' % (cmd, len(query)))
                if cmd == 'requestdata':
                    self._dialog._send_glyph_data()
                elif cmd == 'identify':
                    self._dialog._send_identity()
                elif cmd == 'applykerning':
                    try:
                        pairs = json.loads(urllib.parse.unquote(query)) if query else []
                    except Exception as pe:
                        print('[Coupler] applykerning parse error: %s' % pe)
                        pairs = []
                    self._dialog._apply_kerning(pairs)
                return
        except Exception:
            traceback.print_exc()
        handler(1)  # WKNavigationActionPolicyAllow (non-coupler navigations)


# ── Dialog ────────────────────────────────────────────────────────────────────

class CouplerDialog(object):

    def __init__(self):
        self._font   = Glyphs.font
        if not self._font:
            Message('No font open.', 'Coupler')
            return
        self._master       = self._font.selectedFontMaster
        self._webview      = None
        self._window       = None
        self._nav_delegate = None
        self._build_ui()

    def _build_ui(self):
        from AppKit import NSWindow, NSURL
        from WebKit import WKUserScript

        html_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui.html')
        url       = NSURL.fileURLWithPath_(html_path)
        base_url  = NSURL.fileURLWithPath_(os.path.dirname(html_path) + os.sep)

        config = WKWebViewConfiguration.alloc().init()
        uc     = config.userContentController()

        # Inject IS_GLYPHS flag before page scripts run.
        flag_script = WKUserScript.alloc().initWithSource_injectionTime_forMainFrameOnly_(
            'window.__IS_GLYPHS = true;', 0, True)
        uc.addUserScript_(flag_script)

        rect          = NSMakeRect(0, 0, 980, 720)
        self._webview = WKWebView.alloc().initWithFrame_configuration_(rect, config)

        nav_delegate         = _NavDelegate.alloc().init()
        nav_delegate._dialog = self
        self._nav_delegate   = nav_delegate          # strong ref
        self._webview.setNavigationDelegate_(nav_delegate)

        self._webview.loadFileURL_allowingReadAccessToURL_(url, base_url)

        style = (NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                 NSWindowStyleMaskResizable | NSWindowStyleMaskMiniaturizable)
        win = NSWindow.alloc().initWithContentRect_styleMask_backing_defer_(
            rect, style, NSBackingStoreBuffered, False)
        win.setTitle_('Coupler  ·  %s  ·  %s' % (
            self._font.familyName or 'Untitled',
            self._master.name     or 'Master'))
        win.setMinSize_((760, 520))
        win.setContentView_(self._webview)
        win.makeKeyAndOrderFront_(None)
        self._window = win
        print('[Coupler] window ready')

    def _js(self, code):
        self._webview.evaluateJavaScript_completionHandler_(code, None)

    def _send_identity(self):
        try:
            fn = (self._font.familyName or 'Untitled').replace("'", "\\'")
            mn = (self._master.name or 'Master').replace("'", "\\'")
            n  = len(list(self._font.glyphs))
            print('[Coupler] identify: %s / %s / %d glyphs' % (fn, mn, n))
            self._js("setFontInfo('%s','%s',%d)" % (fn, mn, n))
        except Exception:
            traceback.print_exc()

    def _send_glyph_data(self):
        try:
            font       = self._font
            master     = self._master
            master_id  = master.id
            all_glyphs = list(font.glyphs)
            n_all      = len(all_glyphs)

            print('[Coupler] _send_glyph_data: %s / %s / %d glyphs' % (
                font.familyName, master.name, n_all))

            self._js('dbg("Python: reading %d glyphs…")' % n_all)
            self._js('setLoadProgress(2,"Reading glyph data from Glyphs…")')

            glyphs_data = []
            skipped     = 0

            for idx, glyph in enumerate(all_glyphs):
                try:
                    layer = glyph.layers[master_id]
                    if layer is None or not layer.paths or len(layer.paths) == 0:
                        skipped += 1
                        continue
                    paths_py = _prefetch_layer_paths(layer)
                    if not paths_py:
                        skipped += 1
                        continue
                    commands = _paths_to_js_commands(paths_py)
                    if not commands:
                        skipped += 1
                        continue
                    uni = None
                    if glyph.unicode:
                        try:    uni = int(glyph.unicode, 16)
                        except (ValueError, TypeError): pass
                    glyphs_data.append({
                        'name':         glyph.name,
                        'advanceWidth': float(layer.width or 0),
                        'unicode':      uni,
                        'commands':     commands,
                    })
                except Exception:
                    skipped += 1

                if (idx + 1) % 50 == 0 or (idx + 1) == n_all:
                    pct = int((idx + 1) / n_all * 28) + 2
                    msg = 'Reading %d / %d glyphs…' % (idx + 1, n_all)
                    print('[Coupler] ' + msg)
                    self._js('setLoadProgress(%d,"%s")' % (pct, msg))

            print('[Coupler] serialized %d glyphs (%d skipped)' % (len(glyphs_data), skipped))
            self._js('setLoadProgress(32,"Serializing JSON…")')

            xh = getattr(master, 'xHeight', None)
            data = {
                'upm':        float(font.upm),
                'yBot':       float(master.descender),
                'yTop':       float(master.ascender),
                'xHeight':    float(xh) if xh else None,
                'fontName':   font.familyName or '',
                'masterName': master.name     or '',
                'glyphs':     glyphs_data,
            }
            json_str = json.dumps(data)
            kb = len(json_str) // 1024
            print('[Coupler] JSON: %d KB, sending to WebView…' % kb)
            self._js('setLoadProgress(35,"Sending %d KB to WebView…")' % kb)

            self._webview.evaluateJavaScript_completionHandler_(
                'receiveGlyphData(%s)' % json_str, None)
            print('[Coupler] receiveGlyphData dispatched')
        except Exception:
            traceback.print_exc()
            self._js('dbg("Python ERROR in _send_glyph_data — check Glyphs console")')

    def _apply_kerning(self, pairs):
        try:
            if not pairs:
                return
            from AppKit import NSAlert, NSAlertFirstButtonReturn
            alert = NSAlert.alloc().init()
            alert.setMessageText_('Apply Kerning — %s' % self._master.name)
            alert.setInformativeText_(
                'Write %d non-zero pairs into master "%s"?\n\n'
                'Existing kerning for this master will be replaced.' % (
                    len(pairs), self._master.name))
            alert.addButtonWithTitle_('Apply')
            alert.addButtonWithTitle_('Cancel')
            if alert.runModal() != NSAlertFirstButtonReturn:
                return

            master_id = self._master.id
            font      = self._font
            ok        = 0
            try:   font.disableUpdateInterface()
            except AttributeError: pass
            try:
                try:    del font.kerning[master_id]
                except (KeyError, Exception): pass
                for pair in pairs:
                    try:
                        font.setKerningForPair(
                            master_id, pair['left'], pair['right'], int(pair['correction']))
                        ok += 1
                    except Exception as e:
                        print('[Coupler] pair %s %s: %s' % (
                            pair.get('left', '?'), pair.get('right', '?'), e))
            finally:
                try:   font.enableUpdateInterface()
                except AttributeError: pass

            summary = 'Applied %d pairs → master "%s".' % (ok, self._master.name)
            print('[Coupler] ' + summary)
            self._webview.evaluateJavaScript_completionHandler_(
                'showApplyResult && showApplyResult(%s)' % json.dumps({'ok': ok, 'msg': summary}),
                None)
            Message(summary, 'Coupler — Done')
        except Exception:
            traceback.print_exc()


# ── Plugin entry point ────────────────────────────────────────────────────────

class CouplerPlugin(GeneralPlugin):

    @objc.python_method
    def settings(self):
        self.name = 'Coupler'

    @objc.python_method
    def start(self):
        item = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(
            'Coupler…', 'openCoupler:', '')
        item.setTarget_(self)
        Glyphs.menu[SCRIPT_MENU].append(item)
        self._dialog = None

    def openCoupler_(self, sender):
        try:
            if (self._dialog is not None
                    and hasattr(self._dialog, '_window')
                    and self._dialog._window is not None
                    and self._dialog._window.isVisible()):
                self._dialog._window.makeKeyAndOrderFront_(None)
                return
        except Exception:
            pass
        self._dialog = CouplerDialog()

    def __del__(self):
        pass
