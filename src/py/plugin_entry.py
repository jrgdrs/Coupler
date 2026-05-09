# encoding: utf-8
# plugin_entry.py — Glyphs GeneralPlugin entry point

import objc
from GlyphsApp import Glyphs
try:
    from GlyphsApp.plugins import GeneralPlugin, SCRIPT_MENU
except (ImportError, AttributeError):
    from GlyphsApp import GeneralPlugin
    SCRIPT_MENU = 7

from AppKit import NSMenuItem

from .dialog import CouplerDialog


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
        if self._dialog is not None:
            try:
                self._dialog._cleanup()
            except Exception:
                pass
        self._dialog = None
        self._dialog = CouplerDialog()

    def __del__(self):
        pass
