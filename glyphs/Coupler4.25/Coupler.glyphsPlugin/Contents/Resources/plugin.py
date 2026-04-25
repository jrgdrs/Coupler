# encoding: utf-8
# Coupler.glyphsPlugin  ·  Optical kerning engine for Glyphs 3
# com.typobold.coupler
#
# IPC: JS navigates to coupler://cmd?data → WKNavigationDelegate intercepts & cancels.
# Python→JS: evaluateJavaScript (fire-and-forget).
# IS_GLYPHS detection: WKUserScript injects window.__IS_GLYPHS=true at document start.

from __future__ import print_function
import gc
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

_IDENTITY_TRANSFORM = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def _apply_transform_to_nodes(nd_list, transform):
    m11, m12, m21, m22, tX, tY = transform
    return [(m11 * x + m21 * y + tX, m12 * x + m22 * y + tY, t)
            for (x, y, t) in nd_list]


def _compose_transforms(outer, inner):
    a11, a12, a21, a22, atX, atY = outer
    b11, b12, b21, b22, btX, btY = inner
    return (
        a11 * b11 + a21 * b12,
        a12 * b11 + a22 * b12,
        a11 * b21 + a21 * b22,
        a12 * b21 + a22 * b22,
        a11 * btX + a21 * btY + atX,
        a12 * btX + a22 * btY + atY,
    )


def _collect_layer_paths(layer, font, master_id, transform=None, depth=0):
    """Return list of node-lists for a layer, recursively resolving components."""
    if depth > 8:
        return []
    paths_py = []
    try:
        for path in (layer.paths or []):
            # str(nd.type) forces ObjC NSString → plain Python str so the
            # tuple contains no PyObjC proxies that could confuse the GC.
            nd_list = [(float(nd.x), float(nd.y), str(nd.type)) for nd in path.nodes]
            if nd_list:
                if transform is not None:
                    nd_list = _apply_transform_to_nodes(nd_list, transform)
                paths_py.append(nd_list)
    except Exception:
        pass
    try:
        for comp in (layer.components or []):
            try:
                ref_glyph = font.glyphs[str(comp.name)]  # str() avoids NSString proxy
                if ref_glyph is None:
                    continue
                ref_layer = ref_glyph.layers[master_id]
                if ref_layer is None:
                    continue
                try:
                    ct = tuple(float(v) for v in comp.transform)
                    if len(ct) != 6:
                        ct = _IDENTITY_TRANSFORM
                except Exception:
                    ct = _IDENTITY_TRANSFORM
                composed = _compose_transforms(transform, ct) if transform is not None else ct
                paths_py.extend(
                    _collect_layer_paths(ref_layer, font, master_id, composed, depth + 1))
            except Exception:
                pass
    except Exception:
        pass
    return paths_py


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
    _dialog       = None
    _pending_cmd   = ''
    _pending_query = ''

    def webView_decidePolicyForNavigationAction_decisionHandler_(
            self, webview, action, handler):
        """Called on the main thread by WKWebView for every navigation action.

        We cancel coupler:// navigations immediately and then defer the heavy
        Python work to the next runloop tick via performSelector:afterDelay:0.
        This unblocks the main runloop before _send_glyph_data() starts, which
        prevents the WebKit XPC channel from being flooded while the runloop is
        stalled — the root cause of crashes after several computing runs.
        """
        try:
            url    = action.request().URL()
            scheme = url.scheme() if url else None
            if scheme == 'coupler':
                handler(0)  # cancel immediately — page stays at file:// URL
                self._pending_cmd   = (url.host() or '').lower()
                self._pending_query = url.query() or ''
                print('[Coupler] IPC cmd=%r (deferred)' % self._pending_cmd)
                # Cancel any still-queued dispatch before scheduling a new one.
                # Rapid IPC calls (e.g. double-click Load) must not stack
                # multiple _send_glyph_data calls on the runloop.
                NSObject.cancelPreviousPerformRequestsWithTarget_(self)
                self.performSelector_withObject_afterDelay_(
                    'couplerDispatch:', None, 0.0)
                return
        except Exception:
            traceback.print_exc()
        handler(1)  # allow normal (non-coupler) navigations

    def couplerDispatch_(self, _):
        """Runs in the next runloop cycle — main thread is free, XPC is healthy."""
        cmd    = self._pending_cmd
        query  = self._pending_query
        dialog = self._dialog
        if not dialog:
            return
        # Guard against a stale dispatch firing after _cleanup() has run.
        if not getattr(dialog, '_webview', None):
            return
        try:
            if cmd == 'requestdata':
                dialog._send_glyph_data()
            elif cmd == 'identify':
                dialog._send_identity()
            elif cmd == 'applykerning':
                try:
                    pairs = json.loads(urllib.parse.unquote(query)) if query else []
                except Exception as pe:
                    print('[Coupler] applykerning parse error: %s' % pe)
                    pairs = []
                dialog._apply_kerning(pairs)
            elif cmd == 'applyspacing':
                try:
                    items = json.loads(urllib.parse.unquote(query)) if query else []
                except Exception as pe:
                    print('[Coupler] applyspacing parse error: %s' % pe)
                    items = []
                dialog._apply_spacing(items)
        except Exception:
            traceback.print_exc()


# ── Dialog ────────────────────────────────────────────────────────────────────

class CouplerDialog(object):

    def __init__(self):
        self._font         = Glyphs.font
        if not self._font:
            Message('No font open.', 'Coupler')
            return
        self._webview      = None
        self._window       = None
        self._nav_delegate = None
        self._build_ui()

    def _cleanup(self):
        """Safely tear down WKWebView and window before the dialog is replaced."""
        nd = self._nav_delegate
        if nd is not None:
            try:
                # Cancel any pending couplerDispatch: scheduled via
                # performSelector:afterDelay: so it cannot fire on a
                # torn-down dialog and crash in _send_glyph_data.
                NSObject.cancelPreviousPerformRequestsWithTarget_(nd)
            except Exception:
                pass
            try:
                nd._dialog = None   # break the back-reference / retain cycle
            except Exception:
                pass
        try:
            if self._webview:
                self._webview.setNavigationDelegate_(None)
                self._webview.stopLoading()
        except Exception:
            pass
        try:
            if self._window:
                self._window.close()
        except Exception:
            pass
        self._webview      = None
        self._nav_delegate = None
        self._window       = None

    @property
    def _master(self):
        """Current selected master — re-read from Glyphs API on every access."""
        try:
            # Glyphs.font gives the freshest font reference regardless of which
            # window is in front, avoiding stale proxy issues when masters change.
            font = Glyphs.font or self._font
            return font.selectedFontMaster if font else None
        except Exception:
            return None

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
        master = self._master
        win.setTitle_('Coupler  ·  %s  ·  %s' % (
            self._font.familyName or 'Untitled',
            master.name if master else 'Master'))
        win.setReleasedWhenClosed_(False)   # keep ObjC object alive; we manage lifetime
        win.setMinSize_((760, 520))
        win.setContentView_(self._webview)
        win.makeKeyAndOrderFront_(None)
        self._window = win
        print('[Coupler] window ready')

    def _js(self, code):
        self._webview.evaluateJavaScript_completionHandler_(code, None)

    def _send_identity(self):
        try:
            master = self._master
            fn = self._font.familyName or 'Untitled'
            mn = (master.name if master else 'Master')
            n  = len(list(self._font.glyphs))
            print('[Coupler] identify: %s / %s / %d glyphs' % (fn, mn, n))
            # json.dumps produces a properly escaped JS string literal that
            # handles backslashes, quotes, control chars and non-ASCII safely.
            self._js('setFontInfo(%s,%s,%d)' % (json.dumps(fn), json.dumps(mn), n))
        except Exception:
            traceback.print_exc()

    def _send_glyph_data(self):
        # Python's cyclic GC can crash when it traverses PyObjC proxy objects
        # (GSGlyph, GSLayer, GSNode …) that are live on the stack: ObjC's ARC
        # retains are invisible to gc_refs accounting, so visit_decref can push
        # gc_refs below zero → abort.  Disable the cyclic GC for the duration
        # so it cannot fire mid-traversal while ObjC proxies are alive.
        # Do NOT call gc.collect() here — we are already inside an ObjC callback
        # (method_stub), so an explicit collect would crash for the same reason.
        gc.disable()
        try:
            self._send_glyph_data_inner()
        finally:
            gc.enable()

    def _send_glyph_data_inner(self):
        try:
            # Always resolve font and master together from the live Glyphs API
            # so master_id is guaranteed to belong to this font.  Using self._font
            # with a master from a different font (e.g. two fonts open) would make
            # layer lookups by master_id return None for every glyph → silent skip
            # or, in older Glyphs builds, an ObjC exception → crash.
            font = Glyphs.font or self._font
            if not font:
                return
            master = font.selectedFontMaster
            if not master:
                return
            self._font = font   # refresh so _master property stays consistent
            master_id = master.id
            all_glyphs = list(font.glyphs)
            n_all      = len(all_glyphs)

            # Reflect current master in window title
            try:
                self._window.setTitle_('Coupler  ·  %s  ·  %s' % (
                    font.familyName or 'Untitled', master.name or 'Master'))
            except Exception:
                pass

            print('[Coupler] _send_glyph_data: %s / %s / %d glyphs' % (
                font.familyName, master.name, n_all))

            self._js('dbg("Python: reading %d glyphs…")' % n_all)
            self._js('setLoadProgress(2,"Reading glyph data from Glyphs…")')

            glyphs_data = []
            skipped     = 0

            for idx, glyph in enumerate(all_glyphs):
                try:
                    layer = glyph.layers[master_id]
                    if layer is None:
                        skipped += 1
                        continue
                    paths_py = _collect_layer_paths(layer, font, master_id)
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
                        'name':         str(glyph.name),
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

    def _apply_spacing(self, items):
        try:
            if not items:
                return
            from AppKit import NSAlert, NSAlertFirstButtonReturn
            alert = NSAlert.alloc().init()
            alert.setMessageText_('Apply Spacing — %s' % self._master.name)
            alert.setInformativeText_(
                'Set advance width and left sidebearing for %d glyphs in master "%s"?\n\n'
                'This overwrites the current horizontal metrics.' % (
                    len(items), self._master.name))
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
                for item in items:
                    try:
                        glyph = font.glyphs[item['name']]
                        if glyph is None:
                            continue
                        layer = glyph.layers[master_id]
                        if layer is None:
                            continue
                        layer.width = int(round(layer.width + item['dwidth']))
                        layer.LSB   = int(round(layer.LSB   + item['dlsb']))
                        ok += 1
                    except Exception as e:
                        print('[Coupler] spacing %s: %s' % (item.get('name', '?'), e))
            finally:
                try:   font.enableUpdateInterface()
                except AttributeError: pass

            summary = 'Applied spacing for %d glyphs → master "%s".' % (ok, self._master.name)
            print('[Coupler] ' + summary)
            self._webview.evaluateJavaScript_completionHandler_(
                'showSpacingApplyResult && showSpacingApplyResult(%s)' % json.dumps(
                    {'ok': ok, 'msg': summary}),
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
        # Nil out the nav delegate before the old dialog is GC'd; WKWebView holds
        # a weak navigationDelegate pointer and a dangling ref causes a crash.
        if self._dialog is not None:
            try:
                self._dialog._cleanup()
            except Exception:
                pass
        self._dialog = None
        self._dialog = CouplerDialog()

    def __del__(self):
        pass
