# encoding: utf-8
# path_utils.py — Glyphs path → JS draw-command conversion
# Pure Python, no external dependencies. Testable without Glyphs/AppKit.

GSOFFCURVE = 'offcurve'
GSLINE     = 'line'
GSCURVE    = 'curve'
GSQCURVE   = 'qcurve'

_IDENTITY_TRANSFORM = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def _q2c(p0x, p0y, qx, qy, p2x, p2y):
    """Elevate a quadratic Bezier (p0, q, p2) to cubic control points."""
    return (
        p0x + 2.0 / 3 * (qx - p0x),
        p0y + 2.0 / 3 * (qy - p0y),
        p2x + 2.0 / 3 * (qx - p2x),
        p2y + 2.0 / 3 * (qy - p2y),
    )


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
                ref_glyph = font.glyphs[str(comp.name)]
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


def _paths_to_js_commands(paths_py):
    """Convert a list of node-lists (from _collect_layer_paths) to JS draw commands."""
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
            p0 = nodes[oc_s]
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
            elif end_nd[2] == GSQCURVE:
                if not offs:
                    commands.append({'type': 'L', 'x': end_nd[0], 'y': -end_nd[1]})
                else:
                    cur_x, cur_y = p0[0], p0[1]
                    for k, q in enumerate(offs):
                        if k < len(offs) - 1:
                            nx = (q[0] + offs[k + 1][0]) * 0.5
                            ny = (q[1] + offs[k + 1][1]) * 0.5
                        else:
                            nx, ny = end_nd[0], end_nd[1]
                        cp1x, cp1y, cp2x, cp2y = _q2c(cur_x, cur_y, q[0], q[1], nx, ny)
                        commands.append({
                            'type': 'C',
                            'x1': cp1x, 'y1': -cp1y,
                            'x2': cp2x, 'y2': -cp2y,
                            'x':  nx,   'y':  -ny,
                        })
                        cur_x, cur_y = nx, ny
        commands.append({'type': 'Z'})
    return commands
