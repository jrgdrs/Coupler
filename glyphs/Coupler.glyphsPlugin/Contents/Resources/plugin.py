# encoding: utf-8
# Coupler.glyphsPlugin  ·  Optical kerning engine for Glyphs 3
# com.typobold.coupler

from __future__ import print_function
import math
import traceback
import threading
import objc

from GlyphsApp import Glyphs, Message
try:
    from GlyphsApp.plugins import GeneralPlugin
except ImportError:
    from GlyphsApp import GeneralPlugin
try:
    from GlyphsApp.plugins import SCRIPT_MENU
except (ImportError, AttributeError):
    SCRIPT_MENU = 7  # Script menu index fallback
import vanilla
from AppKit import (
    NSView, NSColor, NSBezierPath, NSAffineTransform, NSMakeRect,
    NSGraphicsContext, NSViewWidthSizable, NSViewHeightSizable,
    NSFont, NSFontAttributeName, NSForegroundColorAttributeName,
    NSString, NSMenuItem, NSObject,
)

# ── Node type constants ───────────────────────────────────────────────────────
GSLINE     = 'line'
GSCURVE    = 'curve'
GSOFFCURVE = 'offcurve'

# ── Parameter presets ─────────────────────────────────────────────────────────
PARAM_PRESETS = {
    'Default':           dict(zones=9,  smooth=60, bowl=0,   mingap=8,  blur=10, round_mod=1, threshold=0),
    'Serif Regular':     dict(zones=81, smooth=14, bowl=10,  mingap=12, blur=3,  round_mod=1, threshold=0),
    'Serif Italic':      dict(zones=81, smooth=14, bowl=-10, mingap=4,  blur=3,  round_mod=1, threshold=0),
    'Serif Bold':        dict(zones=81, smooth=14, bowl=5,   mingap=4,  blur=3,  round_mod=1, threshold=0),
    'Serif Bold Italic': dict(zones=81, smooth=14, bowl=-5,  mingap=12, blur=3,  round_mod=1, threshold=0),
    'Sans Light':        dict(zones=9,  smooth=40, bowl=0,   mingap=6,  blur=8,  round_mod=1, threshold=0),
    'Sans Regular':      dict(zones=9,  smooth=55, bowl=0,   mingap=8,  blur=8,  round_mod=1, threshold=0),
    'Sans Bold':         dict(zones=9,  smooth=65, bowl=0,   mingap=10, blur=6,  round_mod=1, threshold=0),
    'Slab Light':        dict(zones=40, smooth=30, bowl=8,   mingap=7,  blur=5,  round_mod=1, threshold=0),
    'Slab Regular':      dict(zones=40, smooth=35, bowl=12,  mingap=10, blur=5,  round_mod=1, threshold=0),
    'Slab Bold':         dict(zones=40, smooth=40, bowl=8,   mingap=12, blur=4,  round_mod=1, threshold=0),
}

_PREVIEW_TEXTS = {
    'Default':           'WAVE Coupling AVA Raft',
    'Serif Regular':     'Taj WAVE Setting Ready',
    'Serif Italic':      'flowing wave vital Taj',
    'Serif Bold':        'BOLD WAVE AVA Setting',
    'Serif Bold Italic': 'AVID flowing Bold vital',
    'Sans Light':        'Light WAVE Coupling AVA',
    'Sans Regular':      'WAVE Sans Regular Raft',
    'Sans Bold':         'BOLD WAVE AVA Type Sans',
    'Slab Light':        'Slab WAVE Coupling AVA',
    'Slab Regular':      'WAVE Slab Setting Raft',
    'Slab Bold':         'BOLD Slab WAVE AVA Type',
}

_PREVIEW_SAMPLES = [
    'WAVE Coupling AVA Raft',
    'Taj WAVE Setting Ready',
    'Type flowing vital wave',
    'AVID BOLD WAV AWAY TOP',
    'Waterfall Tapping Vault',
    'raft ofa wave coupling',
    'flowing through the valley',
    'AV WA VA YA TA TO TV TY',
    'PA Po Ve Vo We Wo Ye Yo',
    'f. fi fl ff r. rv ry rn',
    '1234567890',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
]

KERN_PAIRS_FREQ = [
    'E ','e ','Ë ','ë ','O ','o ','A ',' T',' t',' d',' A','D ','ea','të',
    'T ','t ','R ','r ',' e',' C','ST','st','TA','te','LA','ta','re','AS',
    ' V',' c',' W','SZ','et',' v','sz','nt',', ','. ','RA',' w','ra','ge',
    ' O','OV','ov','L ','Ă ',' o','DA','CO','TT','tt','Í ','í ','AT','at',
    'AA',' Z','KO',' J','co',' f','OW','ow','K ','SA','ko','TO',' G','to',
    'ų ','JA','KA',' z','Ā ',' j','ij','ka','VA','RO','Y ','y ',' g',' Î',
    'W ','AU','ro','CZ','va',' Y','cz','ze','RZ','GY','rz','YA','gy','Ä ',
    ' î','PA','ya','EG','w ',' y','WA','ke','în','wa','ce','V ','CA','of',
    'F ','ve','f ','za','KU','GA','LO','ca','ga','v ','ku','LU','rd','nj',
    'Z ','ZY','z ','zy','TÄ','É ','é ','KS','ks','OJ','tä','TĀ','AŠ',' é',
    'FO','Å ','tā','AV','FÖ','ÃO','av','fo','YC','yc','EJ','fö','af','rë',
    'AY','LT','ny','WY','LJ','VO','lj','vv','vo','AG','we','ay','AC','UA',
    'OA','RT','rt','go','gj','DZ','ÁS','RU',' Q','BA','TÁ','AJ','aj','tá',
    'OT','ĀS',' q','ot','r.','TS','ts','JĀ','EC','ÓW','ów','ez','TĂ','TY',
    'tă','ře','ty','KĀ','Ł ','ł ','EV',' 1','kā','DÁ','À ','ev',"L'",'CĂ',
    'LY','RS','rs','ly','că','ŁA','A.','té','ła','WO',' À','Ę ','ę ','ZT',
    'Ě ','ě ','ný','S,','s,','Ą ','ye','wo','ké','RĀ','rā','YM','Ý ','ý ',
    'KT','kt','AŞ','KÖ','e,','ré','ÝC','ýc',' (','Ė ','ė ','kö','SÄ','SÁ',
    'LÄ','BY','zá','by','Á ','RY','ÉG','A,','ŁO','LÁ',' Č','vd','ry','RÁ',
    ' Á','fi','ÁT','ÇÃ','çã','át','ët','AW','ZO','rá','aw','CT','T,','t,',
    'ct','VY','zo',' Ç','kë','ŠA','fe',' Į','S.','DJ','dj','PÅ',' Å','s.',
    'Ó ','ó ','VÁ',' į','O,','o,','LS',' Ä','SĂ','VÝ','RG','rg','vē','ŞT',
    'şt',' ç','vá','KÝ','ký','RĂ','vě','LĀ','GÁ','P ','ía','p ','VÄ','Ť ',
    'ť ','ră','CJ','cj','EY','vä','SV','JĄ','DT','ét','AÇ','ím','AO','ÁV',
    ' č','ey',' Ž','T.','ĄC','KÄ','t.','ÁG','DŽ','OZ','áv','oz','GT','kä',
    'ĀT','āt','sv','Ő ','ő ',' Ö','UX','CY','YS','ys','ēt','SJ','YT','VÕ',
    'cy','KY','CC','sj',' 2','LG','ky','če','cc','JÄ','võ','X ','ŁY','x ',
    'Ī ','ī ','VĀ',' ž','DĀ','ĀJ','āj','B ','b ','YO','TZ','JÁ','ĐA','đa',
    'ŠT','že','ÝM','št','RÅ','Ž ','ž ','rå','St','yo',' ö','WS','r,','że',
    'e.','RÓ','TV','TÓ','tó','ÖZ','öz','FT','ft','YÖ','yö','ŠÍ','tv','vé',
    'ró','ÄT','ät','ws','AČ','ČA','ŞA','CÍ','PĀ','ča','gö','EČ','TÖ','RV',
    'rv',') ','RÄ','zé','rä','DY','FA','KÁ','vā','tö','k,','FØ','ká','RJ',
    'YW','ÉC','fø','EĆ','TŐ','tő','U,',' ë','TW','fa','Le','tw','UJ','uj',
    'AĞ','ět','tě','TJ','PÄ','Da','LŐ','MY','ĂT','ăt','çe','čč','ČČ','LÓ',
    'VS','ef','ÁC','LĂ','YV','O.','o.','BÁ','ew','PĂ','ex','zw','ÉV','U.',
    'vs','rė','VÆ','év','TÀ','tà','væ','RC',' Ż','rc','my','RÆ','ÄS','ò ',
    'Ò ','ræ','OŽ','ož','Au','SŤ','sť','Ve','D,','LÜ','zd','vt','VT','È ',
    'ĀC','ÖT',' ż','SÅ','PT','öt','pt','ÄY','äy','ff','è ','Po','tē','SY',
    'RW','CÂ','rw','će','La','gé','SĀ','CĪ','VJ','OY','ÅG','RÝ','RÜ','ŁU',
    'Re','zv','Az','rý','EĞ','rē','ÁŠ','ÍS','ís','sy','Ja','câ','oy','tė',
    'Ē ','cī','ē ','Ta','ZS','ZC','zc','ĽA','rf','ľa','zs','ÖV','SÃ','kė',
    "Y,",'Ż ','ż ','ZÖ','zö','öv','ať','AŤ','mj','KJ','YY','KÕ','YJ','ĆA',
    'ća','ža','kj','We','eż','BĀ','ĒC','ÅT','yd','åt','ež','Co','KÓ','kó',
    'DV','ęt','ÄV','äv','ļa',"A'",
]


# ══════════════════════════════════════════════════════════════════════════════
# GEOMETRY
# ══════════════════════════════════════════════════════════════════════════════

def _cubic_xy(p0, p1, p2, p3, t):
    mt = 1.0 - t;  mt2 = mt * mt;  t2 = t * t
    return (mt2*mt*p0[0] + 3*mt2*t*p1[0] + 3*mt*t2*p2[0] + t2*t*p3[0],
            mt2*mt*p0[1] + 3*mt2*t*p1[1] + 3*mt*t2*p2[1] + t2*t*p3[1])


def _path_x_zones(paths_py, zones, y_bot, y_top):
    """paths_py: list of paths, each path = list of (x, y, type) tuples — pure Python, no ObjC."""
    SAMPLES = 64
    if zones < 1 or y_top <= y_bot:
        return [None] * zones

    z_h = (y_top - y_bot) / float(zones)
    mn  = [float('inf')]  * zones
    mx  = [float('-inf')] * zones
    sf  = 1.0 / float(SAMPLES)

    for nodes in paths_py:
        n = len(nodes)
        if n < 2:
            continue
        oc_idx = [i for i, nd in enumerate(nodes) if nd[2] != GSOFFCURVE]
        if not oc_idx:
            continue
        num_oc = len(oc_idx)

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

            start_nd = nodes[oc_s]
            end_nd   = seg[-1]
            offs     = seg[:-1]

            if end_nd[2] == GSLINE:
                x0 = start_nd[0];  y0 = start_nd[1]
                dx = end_nd[0] - x0;  dy = end_nd[1] - y0
                for k in range(SAMPLES + 1):
                    t  = k * sf
                    xp = x0 + t * dx
                    yp = y0 + t * dy
                    if y_bot <= yp <= y_top:
                        z = min(zones - 1, int((yp - y_bot) / z_h))
                        if xp < mn[z]: mn[z] = xp
                        if xp > mx[z]: mx[z] = xp

            elif end_nd[2] == GSCURVE and len(offs) == 2:
                x0 = start_nd[0];   y0 = start_nd[1]
                x1 = offs[0][0];    y1 = offs[0][1]
                x2 = offs[1][0];    y2 = offs[1][1]
                x3 = end_nd[0];     y3 = end_nd[1]
                for k in range(SAMPLES + 1):
                    t  = k * sf
                    mt = 1.0 - t;  mt2 = mt * mt;  t2 = t * t
                    c0 = mt2 * mt;  c1 = 3.0 * mt2 * t
                    c2 = 3.0 * mt * t2;  c3 = t2 * t
                    xp = c0*x0 + c1*x1 + c2*x2 + c3*x3
                    yp = c0*y0 + c1*y1 + c2*y2 + c3*y3
                    if y_bot <= yp <= y_top:
                        z = min(zones - 1, int((yp - y_bot) / z_h))
                        if xp < mn[z]: mn[z] = xp
                        if xp > mx[z]: mx[z] = xp

    return [None if math.isinf(mn[z]) else (mn[z], mx[z]) for z in range(zones)]


# ══════════════════════════════════════════════════════════════════════════════
# SMOOTHING & BOWL
# ══════════════════════════════════════════════════════════════════════════════

def _r1(v):
    return round(v * 10.0) / 10.0


def _smooth_margins(arr, z_h, pct):
    if pct <= 0:
        return arr[:]
    limit = pct * z_h
    out   = arr[:]
    n     = len(arr)
    a_z, a_v = -1, float('inf')
    for z in range(n):
        if arr[z] != -1 and arr[z] < a_v:
            a_v = arr[z];  a_z = z
    if a_z == -1:
        return out
    for direction in (range(a_z - 1, -1, -1), range(a_z + 1, n)):
        prev = a_z
        for z in direction:
            if out[z] == -1:
                continue
            cap = _r1(out[prev] + limit)
            if out[z] > cap: out[z] = cap
            if out[z] < a_v: out[z] = _r1(a_v)
            prev = z
    return out


def _apply_bowl(arr, bowl, zones):
    if bowl == 0 or not arr or zones < 3:
        return arr[:]
    out = arr[:]
    a_z, a_v = -1, float('inf')
    for z in range(zones):
        if arr[z] != -1 and arr[z] < a_v:
            a_v = arr[z];  a_z = z
    if a_z == -1:
        return out
    max_dist = max(a_z, zones - 1 - a_z) or 1
    strength = bowl / 100.0
    for z in range(zones):
        if out[z] == -1:
            continue
        t      = abs(z - a_z) / float(max_dist)
        out[z] = _r1(max(a_v, out[z] + strength * t * t * zones))
    return out


# ══════════════════════════════════════════════════════════════════════════════
# GLYPH MARGINS
# ══════════════════════════════════════════════════════════════════════════════

def _prefetch_layer_paths(layer):
    """Main-thread only. Returns direct paths as (x,y,type) tuples. No decompose."""
    paths_py = []
    try:
        for path in layer.paths:
            nd_list = [(float(nd.x), float(nd.y), nd.type) for nd in path.nodes]
            if nd_list:
                paths_py.append(nd_list)
    except Exception:
        pass
    return paths_py


def _compute_margins(paths_py, aw, p, y_bot, y_top):
    """Pure Python — no ObjC. paths_py comes from _prefetch_layer_paths."""
    z_h  = (y_top - y_bot) / float(p['zones'])
    subs = p['zones'] * p['blur']
    sub_raw = _path_x_zones(paths_py, subs, y_bot, y_top)

    l_raw, r_raw = [], []
    for z in range(p['zones']):
        s0 = z * p['blur']
        sl = sr = cnt = 0.0
        for s in range(p['blur']):
            sub = sub_raw[s0 + s]
            if sub is None:
                continue
            sl += sub[0];  sr += aw - sub[1];  cnt += 1
        if cnt == 0:
            l_raw.append(-1);  r_raw.append(-1)
        else:
            l_raw.append(_r1(sl / cnt));  r_raw.append(_r1(sr / cnt))
    del sub_raw

    sm_pct = 0.0 if p['smooth'] == 0 else (1.0 - p['smooth'] / 100.0)
    left  = _apply_bowl(_smooth_margins(l_raw, z_h, sm_pct), p['bowl'], p['zones'])
    right = _apply_bowl(_smooth_margins(r_raw, z_h, sm_pct), p['bowl'], p['zones'])
    return left, right, l_raw, r_raw, aw


# ══════════════════════════════════════════════════════════════════════════════
# CLASSIFICATION & PAIR MATH
# ══════════════════════════════════════════════════════════════════════════════

def _classify(glyph):
    sc = glyph.subCategory or ''
    if sc in ('Uppercase', 'Smallcaps'):
        return 'UC'
    if sc == 'Lowercase':
        return 'LC'
    uni = None
    if glyph.unicode:
        try:
            uni = int(glyph.unicode, 16)
        except (ValueError, TypeError):
            pass
    if uni is not None:
        if 48 <= uni <= 57: return 'UC'
        if 65 <= uni <= 90: return 'UC'
        if (192 <= uni <= 214) or (216 <= uni <= 222): return 'UC'
        if 256 <= uni <= 382 and uni % 2 == 0:          return 'UC'
        if 0x0391 <= uni <= 0x03A9:                      return 'UC'
        if 0x0410 <= uni <= 0x042F:                      return 'UC'
    if glyph.name and glyph.name[0].isupper():
        return 'UC'
    return 'LC'


def _pair_mean(r_a, l_b):
    zv, total, cnt, min_s = [], 0.0, 0, float('inf')
    for z in range(len(r_a)):
        a, b = r_a[z], l_b[z]
        if a == -1 or b == -1:
            continue
        s = a + b;  total += s;  cnt += 1
        if s < min_s:  min_s = s
        if cnt <= 8:   zv.append((z, _r1(s)))
    if cnt == 0:
        return None
    return {'mean': total / cnt, 'valid': cnt, 'zones': zv, 'min_sum': min_s}


def _rtm(v, mod):
    if mod <= 1:
        return int(round(v))
    return int(round(v / float(mod))) * int(mod)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN-THREAD DISPATCH
# ══════════════════════════════════════════════════════════════════════════════

_active_cbs = []  # strong refs prevent ObjC from GC-ing callbacks mid-flight

class _Callback(NSObject):
    _fn = None

    def fire_(self, _):
        fn = self._fn
        if fn:
            try:
                fn()
            except Exception:
                traceback.print_exc()
        try:
            _active_cbs.remove(self)
        except ValueError:
            pass


def _on_main(fn):
    """Schedule fn to run on the AppKit main thread (non-blocking)."""
    cb = _Callback.alloc().init()
    cb._fn = fn
    _active_cbs.append(cb)
    cb.performSelectorOnMainThread_withObject_waitUntilDone_('fire:', None, False)


# ══════════════════════════════════════════════════════════════════════════════
# PREVIEW
# ══════════════════════════════════════════════════════════════════════════════

_PV_H = 160


def _nsc(r, g, b, a=1.0):
    return NSColor.colorWithCalibratedRed_green_blue_alpha_(r, g, b, a)


def _layer_bezierpath(layer):
    paths_py = _prefetch_layer_paths(layer)
    if not paths_py:
        return None
    bp = NSBezierPath.bezierPath()
    for nodes in paths_py:
        n = len(nodes)
        if n < 2:
            continue
        oc_idx = [i for i, nd in enumerate(nodes) if nd[2] != GSOFFCURVE]
        if not oc_idx:
            continue
        num_oc = len(oc_idx)
        moved = False
        for seg_i in range(num_oc):
            oc_s = oc_idx[seg_i]
            oc_e = oc_idx[(seg_i + 1) % num_oc]
            start_nd = nodes[oc_s]
            seg = []
            i = (oc_s + 1) % n
            while True:
                seg.append(nodes[i])
                if i == oc_e:
                    break
                i = (i + 1) % n
            end_nd = seg[-1]
            offs   = seg[:-1]
            if not moved:
                bp.moveToPoint_((start_nd[0], start_nd[1]))
                moved = True
            if end_nd[2] == GSLINE:
                bp.lineToPoint_((end_nd[0], end_nd[1]))
            elif end_nd[2] == GSCURVE and len(offs) == 2:
                bp.curveToPoint_controlPoint1_controlPoint2_(
                    (end_nd[0],   end_nd[1]),
                    (offs[0][0], offs[0][1]),
                    (offs[1][0], offs[1][1]),
                )
        bp.closePath()
    return bp



class _PreviewView(NSView):
    _dialog = None

    def drawRect_(self, rect):
        dlg    = self._dialog
        bounds = self.bounds()
        W      = bounds.size.width
        H      = bounds.size.height

        _nsc(0.08, 0.09, 0.10).set()
        NSBezierPath.fillRect_(bounds)

        if not dlg or not dlg._glyph_cache or not dlg._font:
            try:
                attrs = {
                    NSFontAttributeName: NSFont.monospacedSystemFontOfSize_weight_(11.0, 0.0),
                    NSForegroundColorAttributeName: _nsc(0.30, 0.33, 0.37),
                }
                msg = NSString.stringWithString_('▶  Compute to enable preview')
                sz  = msg.sizeWithAttributes_(attrs)
                msg.drawAtPoint_withAttributes_(
                    ((W - sz.width) / 2.0, (H - sz.height) / 2.0), attrs)
            except Exception:
                pass
            return

        font      = dlg._font
        master    = dlg._master
        master_id = master.id
        upm       = float(font.upm)
        y_bot     = float(master.descender)
        y_top     = float(master.ascender)
        fsize     = float(dlg._preview_font_size)
        scale     = fsize / upm

        pad    = 10.0
        des_px = abs(y_bot) * scale
        if des_px + y_top * scale + 2.0 * pad > H:
            scale  = (H - 2.0 * pad) / (y_top - y_bot)
            des_px = abs(y_bot) * scale
        baseline_y = pad + des_px

        if dlg._preview_show_baseline:
            _nsc(0.42, 0.22, 0.0, 0.85).set()
            NSBezierPath.fillRect_(NSMakeRect(0, baseline_y, W, 1))
            xh = float(getattr(master, 'xHeight', None) or 0)
            if xh > 0:
                _nsc(0.10, 0.22, 0.44, 0.85).set()
                NSBezierPath.fillRect_(NSMakeRect(0, baseline_y + xh * scale, W, 1))

        seq    = dlg._preview_sequence()
        params = dlg._last_params or {}
        zones  = params.get('zones', 9)
        z_h    = (y_top - y_bot) / float(zones)
        x      = 14.0

        i_gc     = dlg._glyph_cache.get('i')
        space_px = (i_gc['aw'] * scale) if i_gc else fsize * 0.30

        for i, gname in enumerate(seq):
            if gname is None:
                x += space_px
                continue

            gc = dlg._glyph_cache.get(gname)
            if gc is None:
                continue
            aw_px = gc['aw'] * scale

            if dlg._preview_show_zones:
                for z in range(min(zones, len(gc['left']))):
                    lv = gc['left'][z]
                    rv = gc['right'][z] if z < len(gc['right']) else -1
                    zb = baseline_y + (y_bot + z * z_h) * scale
                    zh = z_h * scale
                    if lv != -1 and lv > 0:
                        lw = lv * scale
                        _nsc(0.91, 0.55, 0.0, 0.20).set()
                        NSBezierPath.fillRect_(NSMakeRect(x, zb, lw, zh))
                        _nsc(0.91, 0.55, 0.0, 0.60).set()
                        _b = NSBezierPath.bezierPathWithRect_(
                            NSMakeRect(x + 0.3, zb + 0.3, lw - 0.6, zh - 0.6))
                        _b.setLineWidth_(0.5); _b.stroke()
                    if rv != -1 and rv > 0:
                        rw  = rv * scale
                        rx2 = x + aw_px - rw
                        _nsc(0.20, 0.70, 0.39, 0.18).set()
                        NSBezierPath.fillRect_(NSMakeRect(rx2, zb, rw, zh))
                        _nsc(0.20, 0.70, 0.39, 0.58).set()
                        _b = NSBezierPath.bezierPathWithRect_(
                            NSMakeRect(rx2 + 0.3, zb + 0.3, rw - 0.6, zh - 0.6))
                        _b.setLineWidth_(0.5); _b.stroke()

            bp = dlg._get_bezierpath(gname)
            if bp is not None:
                ctx = NSGraphicsContext.currentContext()
                ctx.saveGraphicsState()
                t = NSAffineTransform.transform()
                t.translateXBy_yBy_(x, baseline_y)
                t.scaleXBy_yBy_(scale, scale)
                t.concat()
                _nsc(0.86, 0.88, 0.92).set()
                bp.fill()
                ctx.restoreGraphicsState()

            kern_px = 0.0
            if dlg._preview_show_kern and i + 1 < len(seq) and seq[i + 1]:
                kern_px = dlg._kern_dict.get((gname, seq[i + 1]), 0) * scale

            x += aw_px + kern_px
            if x > W + 200:
                break


# ══════════════════════════════════════════════════════════════════════════════
# DIALOG
# ══════════════════════════════════════════════════════════════════════════════

_PARAM_DEFS = [
    ('zones',     'Zones',      'Horizontal slices across the em height. More = finer detail, slower.',        9),
    ('smooth',    'Smooth',     'Reciprocal smoothing (0=off, 99=max). Limits step between adjacent zones.',   60),
    ('bowl',      'Bowl',       'Quadratic profile curvature. Positive=bow out, negative=bow in.',             0),
    ('mingap',    'Min Gap %',  'Minimum allowed gap as % of UPM. Prevents glyph collision.',                  8),
    ('blur',      'Blur',       'Sub-zones per zone. Higher = smoother, slower.',                              10),
    ('round_mod', 'Round mod',  'Snap corrections to multiples of N (1 = plain integer rounding).',            1),
    ('threshold', 'Threshold',  'Discard corrections whose absolute value is below this.',                     0),
    ('tracking',  'Tracking',   'Global offset added to the base value before computing corrections.',         0),
    ('pairlimit', 'Pair limit', 'Max pairs to compute, ranked by frequency. 0 = all pairs.',               500),
    ('baselc',    'Base LC',    'Reference glyph for lowercase baseline (default: o).',                       'o'),
    ('baseuc',    'Base UC',    'Reference glyph for uppercase baseline (default: O).',                       'O'),
]

_ROW_H = 22
_ROW_GAP = 5
_LW = 268
_M  = 10


class CouplerDialog(object):

    def __init__(self):
        self._font = Glyphs.font
        if not self._font:
            Message('No font open.', 'Coupler')
            return
        self._master      = self._font.selectedFontMaster
        self._kerning     = []
        self._filtered    = []
        self._glyph_cache = {}
        self._base_lc     = 0.0
        self._base_uc     = 0.0
        self._fields      = {}
        # threading state
        self._computing   = False
        self._log_buf     = ''
        self._log_lock    = threading.Lock()
        # preview state
        self._preview_font_size     = 72
        self._preview_show_zones    = True
        self._preview_show_baseline = True
        self._preview_show_kern     = True
        self._preview_pair_mode     = False
        self._preview_sc_osf        = False
        self._preview_text          = 'WAVE Coupling AVA'
        self._last_params           = None
        self._kern_dict             = {}
        self._bezier_cache          = {}
        self._preview_ns            = None
        self._selected_pair         = None
        self._build_ui()

    # ── build ────────────────────────────────────────────────────────────────

    def _build_ui(self):
        m  = _M
        lw = _LW
        rh = _ROW_H
        rg = _ROW_GAP

        n_rows = len(_PARAM_DEFS)
        rows_h = n_rows * (rh + rg)
        left_h = m + 18 + 6 + 24 + 8 + rows_h + 8 + 32 + 8 + 28 + 8 + 24 + 8 + 28 + m
        win_h  = max(600, left_h + 20)
        win_w  = 980

        self.w = vanilla.Window(
            (win_w, win_h),
            'Coupler  ·  %s  ·  %s' % (
                self._font.familyName or 'Untitled',
                self._master.name     or 'Master'),
            minSize=(760, 520),
        )

        y = m
        self.w.lbl_master = vanilla.TextBox(
            (m, y, lw, 18),
            'Master: %s   UPM: %d' % (self._master.name, self._font.upm),
            sizeStyle='small',
        )
        y += 24

        self.w.lbl_preset = vanilla.TextBox(
            (m, y + 3, 52, 18), 'Preset:', sizeStyle='small')
        self.w.pop_preset = vanilla.PopUpButton(
            (m + 54, y, lw - 54, 22),
            ['↺ Presets'] + list(PARAM_PRESETS.keys()),
            sizeStyle='small', callback=self._on_preset,
        )
        y += 30

        self.w.line_top = vanilla.HorizontalLine((m, y, lw, 1))
        y += 8

        for attr, label, tip, default in _PARAM_DEFS:
            lbl = vanilla.TextBox((m, y + 3, 120, rh), label, sizeStyle='small')
            lbl._nsObject.setToolTip_(tip)
            setattr(self.w, 'lbl_' + attr, lbl)
            fld = vanilla.EditText((m + 124, y, lw - 124, rh), str(default), sizeStyle='small')
            fld._nsObject.setToolTip_(tip)
            setattr(self.w, 'fld_' + attr, fld)
            self._fields[attr] = fld
            y += rh + rg

        y += 4
        self.w.line_mid = vanilla.HorizontalLine((m, y, lw, 1))
        y += 8

        hw = lw // 2
        self.w.stat_glyphs  = vanilla.TextBox((m,      y, hw, 16), 'Glyphs: —',  sizeStyle='mini')
        self.w.stat_pairs   = vanilla.TextBox((m + hw, y, hw, 16), 'Pairs: —',   sizeStyle='mini')
        y += 18
        self.w.stat_base_lc = vanilla.TextBox((m,      y, hw, 16), 'Base LC: —', sizeStyle='mini')
        self.w.stat_base_uc = vanilla.TextBox((m + hw, y, hw, 16), 'Base UC: —', sizeStyle='mini')
        y += 24

        self.w.progress = vanilla.ProgressBar(
            (m, y, lw, 8), minValue=0, maxValue=100, isIndeterminate=False)
        y += 12
        self.w.lbl_progress = vanilla.TextBox((m, y, lw, 14), '', sizeStyle='mini')
        y += 18

        self.w.btn_compute = vanilla.Button(
            (m, y, lw, 28), '▶  Compute Kerning', callback=self._on_compute)
        y += 36

        self.w.log = vanilla.TextEditor((m, y, lw, -m), '', readOnly=True)

        # right column
        rx = lw + m * 3
        pv_ctrl_y = m
        pv_view_y = pv_ctrl_y + 26
        filt_y    = pv_view_y + _PV_H + 6
        list_y    = filt_y + 28

        self.w.pv_text = vanilla.EditText(
            (rx, pv_ctrl_y, 178, 22), self._preview_text,
            placeholder='preview text',
            callback=self._on_pv_text, sizeStyle='small',
        )
        self.w.pop_pv_sample = vanilla.PopUpButton(
            (rx + 182, pv_ctrl_y, 80, 22),
            ['Samples ▾'] + _PREVIEW_SAMPLES,
            sizeStyle='small', callback=self._on_pv_preset,
        )
        self.w.pv_size_lbl = vanilla.TextBox(
            (rx + 266, pv_ctrl_y + 4, 22, 14), 'pt:', sizeStyle='mini')
        self.w.pv_size = vanilla.EditText(
            (rx + 290, pv_ctrl_y, 40, 22), str(self._preview_font_size),
            callback=self._on_pv_size, sizeStyle='small',
        )
        self.w.chk_kern = vanilla.CheckBox(
            (rx + 334, pv_ctrl_y + 1, 58, 20), 'Kern',
            value=self._preview_show_kern,
            callback=self._on_chk_kern, sizeStyle='small',
        )
        self.w.chk_zones = vanilla.CheckBox(
            (rx + 394, pv_ctrl_y + 1, 66, 20), 'Zones',
            value=self._preview_show_zones,
            callback=self._on_chk_zones, sizeStyle='small',
        )
        self.w.chk_sc_osf = vanilla.CheckBox(
            (rx + 464, pv_ctrl_y + 1, 68, 20), 'Sc+Osf',
            value=self._preview_sc_osf,
            callback=self._on_sc_osf, sizeStyle='small',
        )
        self.w.pop_mode = vanilla.PopUpButton(
            (-m - 110, pv_ctrl_y, 110, 22),
            ['Text Preview', 'Pair Preview'],
            sizeStyle='small', callback=self._on_preview_mode,
        )

        self.w.pv_container = vanilla.Group((rx, pv_view_y, -m, _PV_H))

        self.w.lbl_filter = vanilla.TextBox(
            (rx, filt_y + 3, 44, 18), 'Filter:', sizeStyle='small')
        self.w.fld_filter = vanilla.EditText(
            (rx + 46, filt_y, -m - 218, 22), '',
            placeholder='glyph name  ·  "A V" = exact pair',
            callback=self._on_filter, sizeStyle='small',
        )
        self.w.btn_apply = vanilla.Button(
            (-m - 208, filt_y, 208, 22),
            '⊙  Apply to Font Kerning',
            callback=self._on_apply,
        )

        cols = [
            dict(title='Left',       key='left',       width=66),
            dict(title='Right',      key='right',      width=66),
            dict(title='Correction', key='correction', width=78),
            dict(title='Pair Mean',  key='mean',       width=74),
            dict(title='Base',       key='base',       width=58),
            dict(title='Class',      key='tag',        width=48),
            dict(title='⚑',          key='capped',     width=22),
            dict(title='Zone detail',key='zones_str'),
        ]
        self.w.result_list = vanilla.List(
            (rx, list_y, -m, -m), [],
            columnDescriptions=cols,
            showColumnTitles=True,
            allowsMultipleSelection=False,
            allowsSorting=True,
            selectionCallback=self._on_list_selection,
        )

        self.w.open()

        try:
            container = self.w.pv_container.getNSView()
            cw = container.frame().size.width
            ch = container.frame().size.height
            pv = _PreviewView.alloc().initWithFrame_(((0, 0), (cw, ch)))
            pv._dialog = self
            pv.setAutoresizingMask_(NSViewWidthSizable | NSViewHeightSizable)
            container.addSubview_(pv)
            self._preview_ns = pv
        except Exception as e:
            print('[Coupler] preview init error: %s' % e)

        self._log('Font: %s   Master: %s   %d glyphs' % (
            self._font.familyName, self._master.name, len(self._font.glyphs)))

    # ── params ───────────────────────────────────────────────────────────────

    def _params(self):
        def iv(k, d):
            try:    return int(self._fields[k].get())
            except: return d
        def fv(k, d):
            try:    return float(self._fields[k].get())
            except: return d
        def sv(k, d):
            v = self._fields[k].get().strip()
            return v if v else d
        return dict(
            zones     = max(1,  iv('zones',     9)),
            smooth    = max(0,  min(99, fv('smooth', 60))),
            bowl      =         fv('bowl',      0),
            mingap    = max(0,  fv('mingap',    8)),
            blur      = max(1,  iv('blur',      10)),
            round_mod = max(1,  iv('round_mod', 1)),
            threshold = max(0,  fv('threshold', 0)),
            tracking  =         fv('tracking',  0),
            baselc    =         sv('baselc',    'o'),
            baseuc    =         sv('baseuc',    'O'),
            pairlimit = max(0,  iv('pairlimit', 5000)),
        )

    def _on_preset(self, sender):
        idx = sender.get()
        names = list(PARAM_PRESETS.keys())
        if idx == 0 or idx > len(names):
            return
        name = names[idx - 1]
        pr = PARAM_PRESETS[name]
        for k in ('zones','smooth','bowl','mingap','blur','round_mod','threshold'):
            if k in pr:
                self._fields[k].set(str(pr[k]))
        txt = _PREVIEW_TEXTS.get(name)
        if txt:
            self._preview_text = txt
            self.w.pv_text.set(txt)
            self._refresh_preview()
        sender.set(0)

    # ── log (thread-safe) ────────────────────────────────────────────────────

    def _log(self, msg):
        print('[Coupler] ' + msg)
        with self._log_lock:
            self._log_buf += msg + '\n'
        # _flush_log is called by _compute_done; no deferred dispatch needed

    def _flush_log(self):
        with self._log_lock:
            buf = self._log_buf
            self._log_buf = ''
        try:
            if buf:
                self.w.log.set(self.w.log.get() + buf)
        except Exception:
            pass

    # ── progress (stores state; actual UI written by _apply_prog on main thread) ──

    def _prog(self, pct, msg=''):
        from Foundation import NSThread
        self._last_pct = pct
        self._last_msg = msg
        if NSThread.isMainThread():
            # direct update when called from main thread (e.g. _on_apply)
            try:
                self.w.progress.set(pct)
                if msg:
                    self.w.lbl_progress.set(msg)
            except Exception:
                pass

    # ── filter ───────────────────────────────────────────────────────────────

    def _on_filter(self, sender):
        q = sender.get().strip()
        if not q:
            self._filtered = self._kerning[:]
        else:
            parts = q.split()
            if len(parts) == 1:
                self._filtered = [d for d in self._kerning
                                  if d['left'] == parts[0] or d['right'] == parts[0]]
            else:
                self._filtered = [d for d in self._kerning
                                  if d['left'] == parts[0] and d['right'] == parts[1]]
        self._render_table()

    def _render_table(self):
        rows = []
        for d in self._filtered[:3000]:
            rows.append({
                'left':       d['left'],
                'right':      d['right'],
                'correction': str(d['correction']),
                'mean':       str(d['mean']),
                'base':       str(d['base']),
                'tag':        d['tag'],
                'capped':     '⚑' if d['capped'] else '',
                'zones_str':  '  '.join('z%d:%s' % (v[0], v[1]) for v in d['zones']),
            })
        self.w.result_list.set(rows)

    # ── preview controls ─────────────────────────────────────────────────────

    def _on_pv_text(self, sender):
        self._preview_text = sender.get()
        self._refresh_preview()

    def _on_pv_preset(self, sender):
        idx = sender.get()
        if idx == 0:
            return
        sample = _PREVIEW_SAMPLES[idx - 1]
        self.w.pv_text.set(sample)
        self._preview_text = sample
        sender.set(0)
        self._refresh_preview()

    def _on_pv_size(self, sender):
        try:
            v = int(sender.get())
            if v > 0:
                self._preview_font_size = v
        except (ValueError, TypeError):
            pass
        self._refresh_preview()

    def _on_chk_kern(self, sender):
        self._preview_show_kern = bool(sender.get())
        self._refresh_preview()

    def _on_chk_zones(self, sender):
        self._preview_show_zones = bool(sender.get())
        self._refresh_preview()

    def _on_sc_osf(self, sender):
        self._preview_sc_osf = bool(sender.get())
        self._refresh_preview()

    def _on_preview_mode(self, sender):
        self._preview_pair_mode = (sender.get() == 1)
        self._refresh_preview()

    def _on_list_selection(self, sender):
        sel = sender.getSelection()
        if sel and sel[0] < len(self._filtered):
            d = self._filtered[sel[0]]
            self._selected_pair = (d['left'], d['right'])
        else:
            self._selected_pair = None
        if self._preview_pair_mode:
            self._refresh_preview()

    def _refresh_preview(self):
        if self._preview_ns is not None:
            self._preview_ns.setNeedsDisplay_(True)

    def _preview_sequence(self):
        if self._preview_pair_mode and self._selected_pair:
            L, R = self._selected_pair
            return ['o', L, R, 'o', None, 'n', L, R, 'n', None,
                    'O', L, R, 'O', None, 'H', L, R, 'H']
        parts = []
        for ch in self._preview_text:
            if ch == ' ':
                parts.append(None)
            else:
                parts.append(self._char_to_glyph(ch))
        return parts

    def _char_to_glyph(self, ch):
        base_name = None
        for gname, gc in self._glyph_cache.items():
            if gc.get('label') == ch:
                base_name = gname
                break
        if base_name is None:
            cp = ord(ch)
            for glyph in self._font.glyphs:
                if glyph.unicode:
                    try:
                        if int(glyph.unicode, 16) == cp:
                            base_name = glyph.name
                            break
                    except (ValueError, TypeError):
                        pass
        if base_name is None:
            return None
        if self._preview_sc_osf:
            if ch.isupper():
                for candidate in (base_name + '.sc', base_name.lower() + '.sc'):
                    if self._font.glyphs[candidate]:
                        return candidate
            elif ch.isdigit():
                for candidate in (base_name + '.onum', base_name + '.osf'):
                    if self._font.glyphs[candidate]:
                        return candidate
        return base_name

    def _get_bezierpath(self, gname):
        if gname in self._bezier_cache:
            return self._bezier_cache[gname]
        bp = None
        try:
            glyph_obj = self._font.glyphs[gname]
            if glyph_obj:
                layer = glyph_obj.layers[self._master.id]
                if layer:
                    bp = _layer_bezierpath(layer)
        except Exception:
            pass
        self._bezier_cache[gname] = bp
        return bp

    # ── compute — batched, main thread ───────────────────────────────────────
    # Each batch processes _BATCH_SIZE glyphs then yields to the run loop via
    # _on_main so Glyphs can breathe, update the progress bar, and handle events.
    _BATCH_SIZE = 25

    def _on_compute(self, sender):
        if self._computing:
            return
        self._computing = True
        try: self.w.btn_compute.enable(False)
        except Exception: pass
        try: self.w.btn_apply.enable(False)
        except Exception: pass
        try:
            self.w.progress._nsObject.setIndeterminate_(False)
            self.w.progress.set(0)
            self.w.lbl_progress.set('Reading glyphs…')
        except Exception: pass

        try:
            p         = self._params()
            master_id = self._master.id
            all_gl    = list(self._font.glyphs)   # snapshot once
            self._batch_state = {
                'p':         p,
                'master_id': master_id,
                'all_gl':    all_gl,
                'n_all':     max(len(all_gl), 1),
                'idx':       0,
                'fetched':   {},
                'upm':       float(self._font.upm),
                'y_top':     float(self._master.ascender),
                'y_bot':     float(self._master.descender),
            }
        except Exception:
            self._computing = False
            return
        _on_main(self._batch_fetch)

    def _batch_fetch(self):
        """Process one batch of glyphs then re-schedule until done."""
        if not self._computing:
            return
        st = self._batch_state
        all_gl    = st['all_gl']
        master_id = st['master_id']
        idx       = st['idx']
        end       = min(idx + self._BATCH_SIZE, st['n_all'])

        for i in range(idx, end):
            try:
                glyph = all_gl[i]
                layer = glyph.layers[master_id]
                if layer is None or not layer.paths or len(layer.paths) == 0:
                    continue
                paths_py = _prefetch_layer_paths(layer)
                if not paths_py:
                    continue
                label = glyph.name
                if glyph.unicode:
                    try:    label = chr(int(glyph.unicode, 16))
                    except  Exception: pass
                st['fetched'][glyph.name] = {
                    'paths': paths_py,
                    'aw':    float(layer.width or 0),
                    'cls':   _classify(glyph),
                    'label': label,
                }
            except Exception:
                pass

        st['idx'] = end
        pct = end * 60 // st['n_all']   # 0–60 % for glyph fetch phase
        try:
            self.w.progress.set(pct)
            self.w.lbl_progress.set('Reading glyphs %d / %d…' % (end, st['n_all']))
        except Exception: pass

        if end < st['n_all']:
            _on_main(self._batch_fetch)    # schedule next batch
        else:
            del st['all_gl']               # release glyph list
            _on_main(self._batch_compute)  # all fetched → compute

    def _batch_compute(self):
        """Phase 2: margins + baselines, then schedule pair computation."""
        if not self._computing:
            return
        st = self._batch_state
        try:
            self.w.lbl_progress.set('Computing margins…')
            self.w.progress.set(65)
        except Exception: pass
        try:
            p     = st['p']
            y_top = st['y_top']
            y_bot = st['y_bot']
            upm   = st['upm']
            self._last_params = p
            self._log('\n─── Computing ───')
            self._log('zones=%d  smooth=%g  bowl=%g  blur=%d  mingap=%g%%  '
                      'round=%d  threshold=%g  tracking=%g  baseLc=%s  baseUc=%s  pairlimit=%s' % (
                p['zones'], p['smooth'], p['bowl'], p['blur'], p['mingap'],
                p['round_mod'], p['threshold'], p['tracking'],
                p['baselc'], p['baseuc'],
                str(p['pairlimit']) if p['pairlimit'] > 0 else 'all'))

            # margins
            self._glyph_cache = {}
            for gname, gd in st['fetched'].items():
                left, right, l_raw, r_raw, aw = _compute_margins(
                    gd['paths'], gd['aw'], p, y_bot, y_top)
                self._glyph_cache[gname] = {
                    'left': left, 'right': right,
                    'cls': gd['cls'], 'label': gd['label'], 'aw': aw,
                }
            del st['fetched']

            n_glyphs = len(self._glyph_cache)
            self._stat_glyphs = 'Glyphs: %d' % n_glyphs
            self._log('Margins: %d glyphs.' % n_glyphs)

            # baselines
            def _ref(gn):
                gc = self._glyph_cache.get(gn)
                return _pair_mean(gc['right'], gc['left']) if gc else None
            lc_ref = _ref(p['baselc'])
            uc_ref = _ref(p['baseuc'])
            tr = p['tracking']
            self._base_lc = (_r1(lc_ref['mean']) if lc_ref else 0.0) + tr
            self._base_uc = ((_r1(uc_ref['mean']) if uc_ref else self._base_lc - tr) + tr)
            self._stat_base_lc = 'Base LC: %s' % _r1(self._base_lc)
            self._stat_base_uc = 'Base UC: %s' % _r1(self._base_uc)

            # pair queue
            gks  = list(self._glyph_cache.keys())
            n_gks = len(gks)
            if p['pairlimit'] > 0:
                pair_queue = self._freq_queue(gks, p['pairlimit'])
            else:
                pair_queue = [(a, b) for a in gks for b in gks]
            self._log('Pairs queued: %d   min gap: %s fu' % (
                len(pair_queue), _r1(upm * p['mingap'] / 100.0)))

            self._kerning = []
            st['pair_queue']  = pair_queue
            st['pair_idx']    = 0
            st['min_gap_fu']  = upm * p['mingap'] / 100.0
            st['n_total']     = 0

        except BaseException:
            tb = traceback.format_exc()
            print('[Coupler] ERROR:\n' + tb)
            with self._log_lock:
                self._log_buf += 'ERROR:\n' + tb[:4000] + '\n'
            self._batch_state = None
            self._computing   = False
            self._compute_done()
            return

        _on_main(self._batch_pairs)   # yield to run loop before pair loop

    _PAIR_CHUNK = 2000

    def _batch_pairs(self):
        """Phase 3: process pairs in chunks of _PAIR_CHUNK."""
        if not self._computing:
            return
        st         = self._batch_state
        p          = st['p']
        pq         = st['pair_queue']
        idx        = st['pair_idx']
        end        = min(idx + self._PAIR_CHUNK, len(pq))
        min_gap_fu = st['min_gap_fu']

        for i in range(idx, end):
            k_a, k_b = pq[i]
            gc_a = self._glyph_cache.get(k_a)
            gc_b = self._glyph_cache.get(k_b)
            if gc_a is None or gc_b is None:
                continue
            calc = _pair_mean(gc_a['right'], gc_b['left'])
            if calc is None:
                continue
            st['n_total'] += 1
            both_uc = gc_a['cls'] == 'UC' and gc_b['cls'] == 'UC'
            base = self._base_uc if both_uc else self._base_lc
            tag  = 'UC' if both_uc else ('mixed' if gc_a['cls'] != gc_b['cls'] else 'LC')
            corr = _rtm(base - calc['mean'], p['round_mod'])
            capped = False
            if min_gap_fu > 0 and corr < 0:
                room    = calc['min_sum'] - min_gap_fu
                max_neg = -_rtm(room, p['round_mod']) if room > 0 else 0
                if corr < max_neg:
                    corr = max_neg; capped = True
            if p['threshold'] > 0 and abs(corr) < p['threshold']:
                corr = 0
            if corr != 0:
                self._kerning.append({
                    'left': k_a, 'right': k_b, 'correction': corr,
                    'mean': _r1(calc['mean']), 'base': _r1(base),
                    'tag': tag, 'capped': capped, 'zones': calc['zones'],
                })

        st['pair_idx'] = end
        n_q = len(pq)
        pct = 65 + end * 30 // max(n_q, 1)
        try:
            self.w.progress.set(pct)
            self.w.lbl_progress.set('Pairs %d / %d…' % (end, n_q))
        except Exception: pass

        if end < n_q:
            _on_main(self._batch_pairs)
        else:
            del st['pair_queue']
            _on_main(self._finish_compute)

    def _finish_compute(self):
        """Phase 4: space pairs, finalize."""
        if not self._computing:
            return
        st         = self._batch_state
        p          = st['p']
        min_gap_fu = st['min_gap_fu']

        i_gc    = self._glyph_cache.get('i')
        n_space = 0
        if i_gc:
            for gn, gc in self._glyph_cache.items():
                for r_zones, l_zones, ln, rn in (
                    (gc['right'],   i_gc['left'],  gn,      'space'),
                    (i_gc['right'], gc['left'],    'space',  gn),
                ):
                    calc = _pair_mean(r_zones, l_zones)
                    if calc is None:
                        continue
                    base = self._base_uc if gc['cls'] == 'UC' else self._base_lc
                    corr = _rtm(base - calc['mean'], p['round_mod'])
                    capped = False
                    if min_gap_fu > 0 and corr < 0:
                        room    = calc['min_sum'] - min_gap_fu
                        max_neg = -_rtm(room, p['round_mod']) if room > 0 else 0
                        if corr < max_neg:
                            corr = max_neg; capped = True
                    if p['threshold'] > 0 and abs(corr) < p['threshold']:
                        corr = 0
                    if corr != 0:
                        self._kerning.append({
                            'left': ln, 'right': rn, 'correction': corr,
                            'mean': _r1(calc['mean']), 'base': _r1(base),
                            'tag': gc['cls'], 'capped': capped, 'zones': calc['zones'],
                        })
                        n_space += 1

        n_nz = len(self._kerning)
        self._stat_pairs = 'Pairs: %d' % st['n_total']
        self._filtered   = self._kerning
        self._kern_dict  = {(d['left'], d['right']): d['correction'] for d in self._kerning}
        self._log('Result: %d valid / %d non-zero / %d space pairs.' % (
            st['n_total'], n_nz, n_space))

        self._batch_state = None
        self._computing   = False
        self._compute_done()

    def _compute_done(self):
        try:
            self.w.progress._nsObject.stopAnimation_(None)
            self.w.progress._nsObject.setIndeterminate_(False)
            self.w.progress.set(100)
        except Exception: pass
        try: self.w.lbl_progress.set('Done — %d pairs.' % len(self._kerning))
        except Exception: pass
        try: self.w.btn_compute.enable(True)
        except Exception: pass
        try: self.w.btn_apply.enable(True)
        except Exception: pass
        try: self.w.btn_compute._nsObject.setTitle_('▶  Recompute')
        except Exception: pass
        # flush buffered log
        self._flush_log()
        # update stats labels
        try: self.w.stat_glyphs.set(getattr(self, '_stat_glyphs', 'Glyphs: —'))
        except Exception: pass
        try: self.w.stat_pairs.set(getattr(self, '_stat_pairs', 'Pairs: —'))
        except Exception: pass
        try: self.w.stat_base_lc.set(getattr(self, '_stat_base_lc', 'Base LC: —'))
        except Exception: pass
        try: self.w.stat_base_uc.set(getattr(self, '_stat_base_uc', 'Base UC: —'))
        except Exception: pass
        # populate table and preview
        try: self._render_table()
        except Exception: pass
        try: self._refresh_preview()
        except Exception: pass


    def _freq_queue(self, gks, limit):
        label_to_key = {}
        for gn in gks:
            gc = self._glyph_cache[gn]
            label_to_key[gc['label']] = gn
            label_to_key[gn]          = gn
        queue, seen = [], set()
        for pair_str in KERN_PAIRS_FREQ:
            if len(queue) >= limit:
                break
            chars = list(pair_str)
            if len(chars) < 2:
                continue
            k_a = label_to_key.get(chars[0])
            k_b = label_to_key.get(chars[1])
            if not k_a or not k_b:
                continue
            pid = k_a + '|' + k_b
            if pid not in seen:
                seen.add(pid);  queue.append((k_a, k_b))
        if len(queue) < limit:
            seen_set = set('%s|%s' % (a, b) for a, b in queue)
            stop = False
            for a in gks:
                if stop: break
                for b in gks:
                    if len(queue) >= limit: stop = True; break
                    pid = a + '|' + b
                    if pid not in seen_set:
                        seen_set.add(pid);  queue.append((a, b))
        return queue

    # ── apply ────────────────────────────────────────────────────────────────

    def _on_apply(self, sender):
        if not self._kerning:
            Message('No kerning data — run Compute first.', 'Coupler')
            return
        non_zero = [d for d in self._kerning if d['correction'] != 0]
        if not non_zero:
            Message('All corrections are zero — nothing to apply.', 'Coupler')
            return

        from AppKit import NSAlert, NSAlertFirstButtonReturn
        alert = NSAlert.alloc().init()
        alert.setMessageText_('Apply Kerning — %s' % self._master.name)
        alert.setInformativeText_(
            'Write %d non-zero pairs into master\n"%s"?\n\n'
            'Existing kerning for this master will be replaced.' % (
                len(non_zero), self._master.name))
        alert.addButtonWithTitle_('Apply')
        alert.addButtonWithTitle_('Cancel')
        if alert.runModal() != NSAlertFirstButtonReturn:
            return

        master_id = self._master.id
        font      = self._font
        n         = len(non_zero)

        self._prog(0, 'Applying %d pairs…' % n)
        ok = 0
        ui_frozen = False
        try:
            font.disableUpdateInterface()
            ui_frozen = True
        except AttributeError:
            pass
        try:
            try:
                del font.kerning[master_id]
            except (KeyError, Exception):
                pass
            for i, d in enumerate(non_zero):
                if i % 200 == 0:
                    self._prog(int(100 * i / n), 'Applying %d%%…' % int(100 * i / n))
                try:
                    font.setKerningForPair(master_id, d['left'], d['right'], int(d['correction']))
                    ok += 1
                except Exception as e:
                    self._log('  ! %s %s: %s' % (d['left'], d['right'], e))
        finally:
            if ui_frozen:
                try:
                    font.enableUpdateInterface()
                except AttributeError:
                    pass
            self._prog(100)

        summary = 'Applied %d pairs → master "%s".' % (ok, self._master.name)
        self._log('\n' + summary)
        Message(summary, 'Coupler — Done')


# ══════════════════════════════════════════════════════════════════════════════
# PLUGIN
# ══════════════════════════════════════════════════════════════════════════════

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
                    and hasattr(self._dialog, 'w')
                    and self._dialog.w._window is not None
                    and self._dialog.w._window.isVisible()):
                self._dialog.w._window.makeKeyAndOrderFront_(None)
                return
        except Exception:
            pass
        self._dialog = CouplerDialog()

    def __del__(self):
        pass
