# MenuTitle: Coupler
# ─────────────────────────────────────────────────────────────────────────────
# Coupler.py  ·  Optical kerning engine for Glyphs.app
#
# Installation:  copy to
#   ~/Library/Application Support/Glyphs 3/Scripts/
# Then hold ⌥ and click the Script menu in Glyphs to refresh the list.
#
# Usage from the Macro panel:
#   execfile("/path/to/Coupler.py")  — or paste & run directly.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import print_function
import math
import traceback

from GlyphsApp import Glyphs, Message
import vanilla
from AppKit import (
    NSView, NSColor, NSBezierPath, NSAffineTransform, NSMakeRect,
    NSGraphicsContext, NSViewWidthSizable, NSViewHeightSizable,
    NSFont, NSFontAttributeName, NSForegroundColorAttributeName,
    NSString,
)

# ── Node type constants ───────────────────────────────────────────────────────
# Glyphs 3 returns lowercase strings from GSNode.type ('line', 'curve', 'offcurve').
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

# ── Preview text per preset ───────────────────────────────────────────────────
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

# ── Preview text sample list (for the preview text popup) ────────────────────
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

# ── Frequency-ranked kerning pairs (Andre Fuchs corpus) ──────────────────────
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


def _path_x_zones(layer, zones, y_bot, y_top):
    """Per-zone x-extent (x_min, x_max) or None from a GSLayer.

    Glyphs paths live in font coordinates (y up) — no axis flip needed.
    Each segment is sampled at SAMPLES uniform t values; each sample point
    is assigned to its zone by y position.
    All coordinate arithmetic is inlined to avoid tuple/object allocation
    in the hot loop.
    """
    SAMPLES = 64
    if zones < 1 or y_top <= y_bot:
        return [None] * zones

    z_h     = (y_top - y_bot) / float(zones)
    mn      = [float('inf')]  * zones
    mx      = [float('-inf')] * zones
    sf      = 1.0 / float(SAMPLES)

    for path in layer.paths:
        nodes = list(path.nodes)
        n = len(nodes)
        if n < 2:
            continue
        oc_idx = [i for i, nd in enumerate(nodes) if nd.type != GSOFFCURVE]
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

            if end_nd.type == GSLINE:
                x0 = start_nd.x;  y0 = start_nd.y
                dx = end_nd.x - x0;  dy = end_nd.y - y0
                for k in range(SAMPLES + 1):
                    t  = k * sf
                    xp = x0 + t * dx
                    yp = y0 + t * dy
                    if y_bot <= yp <= y_top:
                        z = min(zones - 1, int((yp - y_bot) / z_h))
                        if xp < mn[z]: mn[z] = xp
                        if xp > mx[z]: mx[z] = xp

            elif end_nd.type == GSCURVE and len(offs) == 2:
                x0 = start_nd.x;   y0 = start_nd.y
                x1 = offs[0].x;    y1 = offs[0].y
                x2 = offs[1].x;    y2 = offs[1].y
                x3 = end_nd.x;     y3 = end_nd.y
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
    """Reciprocal step-limit smoothing anchored at the tightest zone."""
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
    """Quadratic curvature: positive bows out, negative bows in."""
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

def _effective_layer(layer):
    if layer.components and len(layer.components) > 0:
        try:
            decomposed = layer.copyDecomposedLayer()
            if decomposed is not None:
                return decomposed
        except Exception:
            pass
    return layer


def _compute_margins(layer, p, y_bot, y_top):
    """(left, right, l_raw, r_raw, advance_width) for a single GSLayer."""
    work = _effective_layer(layer)
    aw   = layer.width or 0
    z_h  = (y_top - y_bot) / float(p['zones'])
    subs = p['zones'] * p['blur']
    sub_raw = _path_x_zones(work, subs, y_bot, y_top)

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
    # zones stored as (z_index, sum) tuples — much lighter than dicts
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
# PREVIEW
# ══════════════════════════════════════════════════════════════════════════════

_PV_H = 160   # preview panel height in points


def _nsc(r, g, b, a=1.0):
    return NSColor.colorWithCalibratedRed_green_blue_alpha_(r, g, b, a)


def _layer_bezierpath(layer):
    """NSBezierPath for a GSLayer's outlines (decomposes composites)."""
    work = _effective_layer(layer)
    if not work.paths or len(work.paths) == 0:
        return None
    bp = NSBezierPath.bezierPath()
    for path in work.paths:
        nodes = list(path.nodes)
        n = len(nodes)
        if n < 2:
            continue
        oc_idx = [i for i, nd in enumerate(nodes) if nd.type != GSOFFCURVE]
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
                bp.moveToPoint_((start_nd.x, start_nd.y))
                moved = True
            if end_nd.type == GSLINE:
                bp.lineToPoint_((end_nd.x, end_nd.y))
            elif end_nd.type == GSCURVE and len(offs) == 2:
                bp.curveToPoint_controlPoint1_controlPoint2_(
                    (end_nd.x,   end_nd.y),
                    (offs[0].x, offs[0].y),
                    (offs[1].x, offs[1].y),
                )
        bp.closePath()
    return bp


class _PreviewView(NSView):
    """Custom NSView that renders the optical kerning preview."""

    _dialog = None  # set on the instance after alloc/init

    def drawRect_(self, rect):
        dlg    = self._dialog
        bounds = self.bounds()
        W      = bounds.size.width
        H      = bounds.size.height

        # background
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
        asc_px = y_top * scale
        if des_px + asc_px + 2.0 * pad > H:
            scale  = (H - 2.0 * pad) / (y_top - y_bot)
            des_px = abs(y_bot) * scale
        baseline_y = pad + des_px   # y from BOTTOM (NSView is y-up)

        # guide lines
        if dlg._preview_show_baseline:
            _nsc(0.42, 0.22, 0.0, 0.85).set()
            NSBezierPath.fillRect_(NSMakeRect(0, baseline_y, W, 1))
            xh = float(getattr(master, 'xHeight', None) or 0)
            if xh > 0:
                _nsc(0.10, 0.22, 0.44, 0.85).set()
                NSBezierPath.fillRect_(NSMakeRect(0, baseline_y + xh * scale, W, 1))

        # glyph sequence
        seq    = dlg._preview_sequence()
        params = dlg._last_params or {}
        zones  = params.get('zones', 9)
        z_h    = (y_top - y_bot) / float(zones)
        x      = 14.0

        i_gc      = dlg._glyph_cache.get('i')
        space_px  = (i_gc['aw'] * scale) if i_gc else fsize * 0.30

        for i, gname in enumerate(seq):
            if gname is None:
                x += space_px
                continue

            gc = dlg._glyph_cache.get(gname)
            if gc is None:
                continue
            aw_px = gc['aw'] * scale

            # zone overlays
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

            # glyph outline
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

            # kerning advance
            kern_px = 0.0
            if dlg._preview_show_kern and i + 1 < len(seq) and seq[i + 1]:
                kern_px = dlg._kern_dict.get((gname, seq[i + 1]), 0) * scale

            x += aw_px + kern_px
            if x > W + 200:
                break


# ══════════════════════════════════════════════════════════════════════════════
# DIALOG
# ══════════════════════════════════════════════════════════════════════════════

# Parameter definitions:  (attr_name, display_label, tooltip, default_value)
_PARAM_DEFS = [
    ('zones',     'Zones',      'Horizontal slices across the em height. More = finer detail, slower.',        9),
    ('smooth',    'Smooth',     'Reciprocal smoothing (0=off, 99=max). Limits step between adjacent zones.',   60),
    ('bowl',      'Bowl',       'Quadratic profile curvature. Positive=bow out, negative=bow in.',             0),
    ('mingap',    'Min Gap %',  'Minimum allowed gap as % of UPM. Prevents glyph collision.',                  8),
    ('blur',      'Blur',       'Sub-zones per zone. Higher = smoother, slower.',                              10),
    ('round_mod', 'Round mod',  'Snap corrections to multiples of N (1 = plain integer rounding).',            1),
    ('threshold', 'Threshold',  'Discard corrections whose absolute value is below this.',                     0),
    ('tracking',  'Tracking',   'Global offset added to the base value before computing corrections.',         0),
    ('pairlimit', 'Pair limit', 'Max pairs to compute, ranked by frequency. 0 = all pairs.',               5000),
    ('baselc',    'Base LC',    'Reference glyph for lowercase baseline (default: o).',                       'o'),
    ('baseuc',    'Base UC',    'Reference glyph for uppercase baseline (default: O).',                       'O'),
]

_ROW_H   = 22   # height of each parameter row
_ROW_GAP = 5    # gap between rows
_LW      = 268  # left panel width
_M       = 10   # outer margin


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
        self._fields      = {}   # attr_name → EditText
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

        # Compute required height for the left panel
        n_rows   = len(_PARAM_DEFS)
        rows_h   = n_rows * (rh + rg)
        left_h   = m + 18 + 6 + 24 + 8 + rows_h + 8 + 32 + 8 + 28 + 8 + 24 + 8 + 28 + m
        win_h    = max(600, left_h + 20)
        win_w    = 980

        self.w = vanilla.Window(
            (win_w, win_h),
            'Coupler  ·  %s  ·  %s' % (
                self._font.familyName or 'Untitled',
                self._master.name     or 'Master'),
            minSize=(760, 520),
        )

        # ── Left column ──────────────────────────────────────────────────────
        y = m

        # Master / UPM info
        self.w.lbl_master = vanilla.TextBox(
            (m, y, lw, 18),
            'Master: %s   UPM: %d' % (self._master.name, self._font.upm),
            sizeStyle='small',
        )
        y += 24

        # Preset popup
        self.w.lbl_preset = vanilla.TextBox(
            (m, y + 3, 52, 18), 'Preset:', sizeStyle='small')
        self.w.pop_preset = vanilla.PopUpButton(
            (m + 54, y, lw - 54, 22),
            ['↺ Presets'] + list(PARAM_PRESETS.keys()),
            sizeStyle='small', callback=self._on_preset,
        )
        y += 30

        # Divider
        self.w.line_top = vanilla.HorizontalLine((m, y, lw, 1))
        y += 8

        # Parameter rows — each added via setattr so vanilla registers the view
        for attr, label, tip, default in _PARAM_DEFS:
            lbl = vanilla.TextBox(
                (m, y + 3, 120, rh), label, sizeStyle='small')
            lbl._nsObject.setToolTip_(tip)
            setattr(self.w, 'lbl_' + attr, lbl)

            fld = vanilla.EditText(
                (m + 124, y, lw - 124, rh), str(default), sizeStyle='small')
            fld._nsObject.setToolTip_(tip)
            setattr(self.w, 'fld_' + attr, fld)

            self._fields[attr] = fld
            y += rh + rg

        y += 4
        self.w.line_mid = vanilla.HorizontalLine((m, y, lw, 1))
        y += 8

        # Stats
        hw = lw // 2
        self.w.stat_glyphs  = vanilla.TextBox((m,      y, hw, 16), 'Glyphs: —',  sizeStyle='mini')
        self.w.stat_pairs   = vanilla.TextBox((m + hw, y, hw, 16), 'Pairs: —',   sizeStyle='mini')
        y += 18
        self.w.stat_base_lc = vanilla.TextBox((m,      y, hw, 16), 'Base LC: —', sizeStyle='mini')
        self.w.stat_base_uc = vanilla.TextBox((m + hw, y, hw, 16), 'Base UC: —', sizeStyle='mini')
        y += 24

        # Progress bar + status label
        self.w.progress = vanilla.ProgressBar(
            (m, y, lw, 8), minValue=0, maxValue=100, isIndeterminate=False)
        y += 12
        self.w.lbl_progress = vanilla.TextBox((m, y, lw, 14), '', sizeStyle='mini')
        y += 18

        # Compute button
        self.w.btn_compute = vanilla.Button(
            (m, y, lw, 28), '▶  Compute Kerning', callback=self._on_compute)
        y += 36

        # Log output
        self.w.log = vanilla.TextEditor((m, y, lw, -m), '', readOnly=True)

        # ── Right column ─────────────────────────────────────────────────────
        rx = lw + m * 3

        # vertical positions (preview panel sits above filter + table)
        pv_ctrl_y = m                           # preview controls row
        pv_view_y = pv_ctrl_y + 26             # preview NSView
        filt_y    = pv_view_y + _PV_H + 6      # filter row
        list_y    = filt_y + 28                 # results table

        # ── Preview controls ─────────────────────────────────────────────────
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

        # ── Preview panel placeholder (NSView added after open) ───────────────
        self.w.pv_container = vanilla.Group((rx, pv_view_y, -m, _PV_H))

        # ── Filter row ───────────────────────────────────────────────────────
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

        # ── Results table ────────────────────────────────────────────────────
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
            (rx, list_y, -m, -m),
            [],
            columnDescriptions=cols,
            showColumnTitles=True,
            allowsMultipleSelection=False,
            allowsSorting=True,
            selectionCallback=self._on_list_selection,
        )

        self.w.open()

        # Attach the custom preview NSView inside the placeholder group
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
            self._font.familyName,
            self._master.name,
            len(self._font.glyphs),
        ))

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
            smooth    = max(0,  min(99, fv('smooth',    60))),
            bowl      =         fv('bowl',      0),
            mingap    = max(0,  fv('mingap',    8)),
            blur      = max(1,  iv('blur',      10)),
            round_mod = max(1,  iv('round_mod', 1)),
            threshold = max(0,  fv('threshold', 0)),
            tracking  =         fv('tracking',  0),
            baselc    =         sv('baselc',    'o'),
            baseuc    =         sv('baseuc',    'O'),
            pairlimit = max(0,  iv('pairlimit', 0)),
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

    # ── log ──────────────────────────────────────────────────────────────────

    def _log(self, msg):
        print('[Coupler] ' + msg)
        try:
            self.w.log.set(self.w.log.get() + msg + '\n')
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
                'zones_str':  '  '.join('z%d:%s' % (v[0], v[1])
                                        for v in d['zones']),
            })
        self.w.result_list.set(rows)

    # ── preview controls ─────────────────────────────────────────────────────

    def _on_pv_text(self, sender):
        self._preview_text = sender.get()
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

    def _on_pv_preset(self, sender):
        idx = sender.get()
        if idx == 0:
            return
        sample = _PREVIEW_SAMPLES[idx - 1]
        self.w.pv_text.set(sample)
        self._preview_text = sample
        sender.set(0)
        self._refresh_preview()

    def _on_preview_mode(self, sender):
        self._preview_pair_mode = (sender.get() == 1)
        self._refresh_preview()

    def _on_sc_osf(self, sender):
        self._preview_sc_osf = bool(sender.get())
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
        """Returns list of glyph_name (str) or None (space)."""
        if self._preview_pair_mode and self._selected_pair:
            L, R = self._selected_pair
            parts = ['o', L, R, 'o', None, 'n', L, R, 'n', None,
                     'O', L, R, 'O', None, 'H', L, R, 'H']
        else:
            parts = []
            for ch in self._preview_text:
                if ch == ' ':
                    parts.append(None)
                else:
                    parts.append(self._char_to_glyph(ch))
        return parts

    def _char_to_glyph(self, ch):
        """Map a single character to a glyph name; applies Sc/Osf variants when active."""
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
        """Lazily build and cache NSBezierPath for a glyph."""
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

    # ── compute ──────────────────────────────────────────────────────────────

    def _on_compute(self, sender):
        try:
            self.w.btn_compute.enable(False)
        except Exception:
            pass
        try:
            self.w.btn_apply.enable(False)
        except Exception:
            pass
        try:
            self._run_analysis()
        except BaseException:
            tb = traceback.format_exc()
            print('[Coupler] ERROR:\n' + tb)
            try:
                self._log('ERROR:\n' + tb[:4000])
            except Exception:
                pass
        finally:
            try:
                self.w.btn_compute.enable(True)
            except Exception:
                pass
            try:
                self.w.btn_apply.enable(True)
            except Exception:
                pass
            try:
                self.w.btn_compute._nsObject.setTitle_('▶  Recompute')
            except Exception:
                pass

    @staticmethod
    def _pump():
        """Flush pending AppKit events so the UI repaints mid-loop."""
        try:
            from Foundation import NSRunLoop, NSDate
            NSRunLoop.currentRunLoop().runUntilDate_(NSDate.date())
        except Exception:
            pass

    def _prog(self, pct, msg=''):
        self.w.progress.set(pct)
        if msg:
            self.w.lbl_progress.set(msg)
        self._pump()

    def _run_analysis(self):
        font      = self._font
        master    = self._master
        upm       = font.upm
        master_id = master.id
        p         = self._params()
        y_top     = master.ascender
        y_bot     = master.descender
        self._last_params  = p
        self._bezier_cache = {}   # invalidate on each compute (params may change margins)

        self._log('\n─── Computing ───')
        self._log(
            'zones=%d  smooth=%g  bowl=%g  blur=%d  mingap=%g%%  '
            'round=%d  threshold=%g  tracking=%g  '
            'baseLc=%s  baseUc=%s  pairlimit=%s' % (
                p['zones'], p['smooth'], p['bowl'], p['blur'], p['mingap'],
                p['round_mod'], p['threshold'], p['tracking'],
                p['baselc'], p['baseuc'],
                str(p['pairlimit']) if p['pairlimit'] > 0 else 'all',
            )
        )

        # Step 1 — margins
        self._prog(0, 'Measuring margins…')
        self._glyph_cache = {}
        all_glyphs = list(font.glyphs)
        n_all = max(len(all_glyphs), 1)

        for g_idx, glyph in enumerate(all_glyphs):
            layer = glyph.layers[master_id]
            if layer is None:
                continue
            # skip glyphs with neither direct paths nor components
            # (_compute_margins handles decomposition internally)
            if not layer.paths and not (layer.components and len(layer.components) > 0):
                continue

            left, right, l_raw, r_raw, aw = _compute_margins(layer, p, y_bot, y_top)
            cls   = _classify(glyph)
            label = glyph.name
            if glyph.unicode:
                try:
                    label = chr(int(glyph.unicode, 16))
                except (ValueError, TypeError):
                    pass

            self._glyph_cache[glyph.name] = {
                'left':  left,
                'right': right,
                'cls':   cls,
                'label': label,
                'aw':    aw,
            }
            if g_idx % 20 == 0:
                self._prog(int(40 * g_idx / n_all), 'Margins %d%%…' % int(100 * g_idx / n_all))

        n_glyphs = len(self._glyph_cache)
        self.w.stat_glyphs.set('Glyphs: %d' % n_glyphs)
        self._log('Margins: %d glyphs with outlines.' % n_glyphs)
        for _gn, _tag in [(p['baselc'], 'BaseLc'), (p['baseuc'], 'BaseUc')]:
            _in = _gn in self._glyph_cache
            self._log('%s glyph "%s" in cache: %s' % (_tag, _gn, _in))
            if _in:
                _gc = self._glyph_cache[_gn]
                _nzl = [v for v in _gc['left']  if v != -1]
                _nzr = [v for v in _gc['right'] if v != -1]
                self._log('  left  %d/%d zones filled, sample=%s' % (
                    len(_nzl), p['zones'], _nzl[:3] if _nzl else 'ALL -1'))
                self._log('  right %d/%d zones filled, sample=%s' % (
                    len(_nzr), p['zones'], _nzr[:3] if _nzr else 'ALL -1'))
                if not _nzl or not _nzr:
                    _gl = font.glyphs[_gn]
                    _ly = _gl.layers[master_id] if _gl else None
                    if _ly and _ly.paths:
                        _nds = list(_ly.paths[0].nodes)
                        if _nds:
                            _nd0 = _nds[0]
                            self._log('  paths=%d  node0: x=%s y=%s type=%r' % (
                                len(_ly.paths), _nd0.x, _nd0.y, _nd0.type))

        # Step 2 — baselines
        def _ref(gn):
            gc = self._glyph_cache.get(gn)
            return _pair_mean(gc['right'], gc['left']) if gc else None

        lc_ref = _ref(p['baselc'])
        uc_ref = _ref(p['baseuc'])
        if lc_ref is None:
            self._log('  lc_ref=None — all margin zones for "%s" are -1' % p['baselc'])
        if uc_ref is None:
            self._log('  uc_ref=None — all margin zones for "%s" are -1' % p['baseuc'])
        self._base_lc = (_r1(lc_ref['mean']) if lc_ref else 0.0) + p['tracking']
        self._base_uc = ((_r1(uc_ref['mean']) if uc_ref else self._base_lc - p['tracking'])
                         + p['tracking'])

        self.w.stat_base_lc.set('Base LC: %s' % _r1(self._base_lc))
        self.w.stat_base_uc.set('Base UC: %s' % _r1(self._base_uc))
        self._log('Base LC (%s+%s): Ø%s + tracking %s = %s' % (
            p['baselc'], p['baselc'],
            _r1(lc_ref['mean']) if lc_ref else 0, p['tracking'],
            _r1(self._base_lc)))
        self._log('Base UC (%s+%s): %s' % (
            p['baseuc'], p['baseuc'], _r1(self._base_uc)))

        # Step 3 — pair corrections
        self._prog(45, 'Building pair queue…')
        min_gap_fu = upm * p['mingap'] / 100.0
        gks = list(self._glyph_cache.keys())
        n_gks = len(gks)

        if p['pairlimit'] > 0:
            pair_queue = self._freq_queue(gks, p['pairlimit'])
            n_pairs    = max(len(pair_queue), 1)
            self._prog(50, 'Computing %d pairs…' % len(pair_queue))
            self._log('Pairs queued: %d   min gap floor: %s fu' % (
                len(pair_queue), _r1(min_gap_fu)))
        else:
            # Generator: never materialises the full N² list in RAM
            pair_queue = ((a, b) for a in gks for b in gks)
            n_pairs    = max(n_gks * n_gks, 1)
            self._prog(50, 'Computing all %d×%d pairs…' % (n_gks, n_gks))
            self._log('Pairs: all %d×%d=%d   min gap floor: %s fu' % (
                n_gks, n_gks, n_gks * n_gks, _r1(min_gap_fu)))

        self._kerning = []
        n_total = 0
        for p_idx, (k_a, k_b) in enumerate(pair_queue):
            if p_idx % 500 == 0:
                self._prog(50 + int(45 * p_idx / n_pairs),
                           'Pairs %d%%…' % int(100 * p_idx / n_pairs))
            gc_a = self._glyph_cache[k_a]
            gc_b = self._glyph_cache[k_b]
            calc = _pair_mean(gc_a['right'], gc_b['left'])
            if calc is None:
                continue
            n_total += 1
            both_uc = gc_a['cls'] == 'UC' and gc_b['cls'] == 'UC'
            base = self._base_uc if both_uc else self._base_lc
            tag  = ('UC'    if both_uc else
                    'mixed' if gc_a['cls'] != gc_b['cls'] else 'LC')
            corr   = _rtm(base - calc['mean'], p['round_mod'])
            capped = False
            if min_gap_fu > 0 and corr < 0:
                room    = calc['min_sum'] - min_gap_fu
                max_neg = -_rtm(room, p['round_mod']) if room > 0 else 0
                if corr < max_neg:
                    corr = max_neg;  capped = True
            if p['threshold'] > 0 and abs(corr) < p['threshold']:
                corr = 0
            if corr != 0:
                self._kerning.append({
                    'left': k_a, 'right': k_b, 'correction': corr,
                    'mean': _r1(calc['mean']), 'base': _r1(base),
                    'tag': tag, 'capped': capped, 'zones': calc['zones'],
                })

        # Space pairs: treat space as having 'i' margins on either side
        i_gc = self._glyph_cache.get('i')
        n_space = 0
        if i_gc:
            for gn, gc in self._glyph_cache.items():
                for r_zones, l_zones, left_name, right_name in (
                    (gc['right'],    i_gc['left'],  gn,      'space'),
                    (i_gc['right'],  gc['left'],    'space',  gn),
                ):
                    calc = _pair_mean(r_zones, l_zones)
                    if calc is None:
                        continue
                    both_uc = gc['cls'] == 'UC'
                    base    = self._base_uc if both_uc else self._base_lc
                    tag     = gc['cls']
                    corr    = _rtm(base - calc['mean'], p['round_mod'])
                    capped  = False
                    if min_gap_fu > 0 and corr < 0:
                        room    = calc['min_sum'] - min_gap_fu
                        max_neg = -_rtm(room, p['round_mod']) if room > 0 else 0
                        if corr < max_neg:
                            corr = max_neg;  capped = True
                    if p['threshold'] > 0 and abs(corr) < p['threshold']:
                        corr = 0
                    if corr != 0:
                        self._kerning.append({
                            'left': left_name, 'right': right_name, 'correction': corr,
                            'mean': _r1(calc['mean']), 'base': _r1(base),
                            'tag': tag, 'capped': capped, 'zones': calc['zones'],
                        })
                        n_space += 1
            self._log('Space pairs (via i proxy): %d non-zero.' % n_space)

        n_nz = len(self._kerning)
        self.w.stat_pairs.set('Pairs: %d' % n_total)
        self._prog(100, 'Done — %d non-zero of %d.' % (n_nz, n_total))
        self._log('Result: %d valid pairs  /  %d non-zero stored.' % (n_total, n_nz))
        self._filtered = self._kerning[:]
        self._kern_dict = {(d['left'], d['right']): d['correction'] for d in self._kerning}
        self._render_table()
        self._refresh_preview()

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


# ── Entry point ───────────────────────────────────────────────────────────────
try:
    _coupler_instance   # preserve existing instance across re-runs
except NameError:
    _coupler_instance = None


def _open_coupler():
    global _coupler_instance
    try:
        if (_coupler_instance is not None
                and hasattr(_coupler_instance, 'w')
                and _coupler_instance.w._window is not None
                and _coupler_instance.w._window.isVisible()):
            _coupler_instance.w._window.makeKeyAndOrderFront_(None)
            return
    except Exception:
        pass
    _coupler_instance = CouplerDialog()


_open_coupler()
