# encoding: utf-8
# dialog.py — CouplerDialog: WKWebView window + Glyphs data bridge

from __future__ import print_function
import gc
import json
import os
import traceback

from GlyphsApp import Glyphs, Message
from AppKit import NSMakeRect, NSObject, NSWindow, NSURL
from AppKit import (NSWindowStyleMaskTitled, NSWindowStyleMaskClosable,
                    NSWindowStyleMaskResizable, NSWindowStyleMaskMiniaturizable,
                    NSBackingStoreBuffered)
from WebKit import WKWebView, WKWebViewConfiguration, WKUserScript

from .nav_delegate import _NavDelegate
from .path_utils import _collect_layer_paths, _paths_to_js_commands


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
        """Safely tear down WKWebView and window."""
        nd = self._nav_delegate
        if nd is not None:
            try:
                NSObject.cancelPreviousPerformRequestsWithTarget_(nd)
            except Exception:
                pass
            try:
                nd._dialog = None
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
        try:
            font = Glyphs.font or self._font
            return font.selectedFontMaster if font else None
        except Exception:
            return None

    def _build_ui(self):
        html_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 '..', '..', 'glyphs',
                                 'Coupler.glyphsPlugin', 'Contents', 'Resources', 'ui.html')
        html_path = os.path.normpath(html_path)
        url       = NSURL.fileURLWithPath_(html_path)
        base_url  = NSURL.fileURLWithPath_(os.path.dirname(html_path) + os.sep)

        config = WKWebViewConfiguration.alloc().init()
        uc     = config.userContentController()

        flag_script = WKUserScript.alloc().initWithSource_injectionTime_forMainFrameOnly_(
            'window.__IS_GLYPHS = true;', 0, True)
        uc.addUserScript_(flag_script)

        rect          = NSMakeRect(0, 0, 240, 675)
        self._webview = WKWebView.alloc().initWithFrame_configuration_(rect, config)

        nav_delegate         = _NavDelegate.alloc().init()
        nav_delegate._dialog = self
        self._nav_delegate   = nav_delegate
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
        win.setReleasedWhenClosed_(False)
        win.setMinSize_((220, 300))
        win.setContentView_(self._webview)
        win.makeKeyAndOrderFront_(None)
        self._window = win
        print('[Coupler] window ready')

    def _js(self, code):
        self._webview.evaluateJavaScript_completionHandler_(code, None)

    def _resize_window(self, w, h):
        try:
            if not self._window:
                return
            f = self._window.frame()
            new_h = h + 22
            new_origin_y = f.origin.y + f.size.height - new_h
            self._window.setMinSize_((w, h))
            self._window.setFrame_display_animate_(
                NSMakeRect(f.origin.x, new_origin_y, w, new_h), True, True)
        except Exception:
            traceback.print_exc()

    def _send_identity(self):
        try:
            master = self._master
            fn = self._font.familyName or 'Untitled'
            mn = (master.name if master else 'Master')
            n  = len(list(self._font.glyphs))
            print('[Coupler] identify: %s / %s / %d glyphs' % (fn, mn, n))
            self._js('setFontInfo(%s,%s,%d)' % (json.dumps(fn), json.dumps(mn), n))
        except Exception:
            traceback.print_exc()

    def _send_glyph_data(self):
        # Disable cyclic GC during ObjC proxy traversal to prevent SIGABRT.
        gc.disable()
        try:
            self._send_glyph_data_inner()
        finally:
            gc.enable()

    def _send_glyph_data_inner(self):
        try:
            font = Glyphs.font or self._font
            if not font:
                return
            master = font.selectedFontMaster
            if not master:
                return
            self._font = font
            master_id = master.id
            all_glyphs = list(font.glyphs)
            n_all      = len(all_glyphs)

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
        # Disable cyclic GC during ObjC proxy access to prevent gc_collect_main crash.
        gc.disable()
        try:
            self._apply_kerning_inner(pairs)
        finally:
            gc.enable()

    def _apply_kerning_inner(self, pairs):
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
        # Disable cyclic GC during ObjC proxy access to prevent gc_collect_main crash.
        gc.disable()
        try:
            self._apply_spacing_inner(items)
        finally:
            gc.enable()

    def _apply_spacing_inner(self, items):
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
