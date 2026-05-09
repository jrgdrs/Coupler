# encoding: utf-8
"""Tests for src/py/path_utils.py — pure Python, no Glyphs/AppKit required."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from src.py.path_utils import (
    _q2c,
    _apply_transform_to_nodes,
    _compose_transforms,
    _paths_to_js_commands,
    _IDENTITY_TRANSFORM,
    GSLINE, GSCURVE, GSQCURVE, GSOFFCURVE,
)


class TestQ2c:
    def test_identity_quadratic(self):
        """A degenerate quad (straight line) elevates to a cubic with collinear controls."""
        cp1x, cp1y, cp2x, cp2y = _q2c(0, 0, 0, 0, 10, 0)
        assert cp1x == 0.0
        assert cp2x == pytest_approx(10 * 2/3, abs=1e-9)

    def test_apex_quadratic(self):
        """Symmetric quad (0,0)→(5,10)→(10,0): cubic controls should be symmetric."""
        cp1x, cp1y, cp2x, cp2y = _q2c(0, 0, 5, 10, 10, 0)
        # cp1 = (0 + 2/3*(5-0), 0 + 2/3*(10-0)) = (10/3, 20/3)
        assert abs(cp1x - 10/3) < 1e-9
        assert abs(cp1y - 20/3) < 1e-9
        # cp2 = (10 + 2/3*(5-10), 0 + 2/3*(10-0)) = (10/3, 20/3) — symmetric
        assert abs(cp2x - 20/3) < 1e-9
        assert abs(cp2y - 20/3) < 1e-9

    def test_returns_four_values(self):
        result = _q2c(0, 0, 1, 1, 2, 0)
        assert len(result) == 4


class TestApplyTransform:
    def test_identity_unchanged(self):
        nodes = [(10.0, 20.0, GSLINE), (30.0, 40.0, GSCURVE)]
        out = _apply_transform_to_nodes(nodes, _IDENTITY_TRANSFORM)
        assert out[0][0] == 10.0
        assert out[0][1] == 20.0
        assert out[0][2] == GSLINE

    def test_translation(self):
        nodes = [(0.0, 0.0, GSLINE)]
        t = (1.0, 0.0, 0.0, 1.0, 100.0, 200.0)  # translate by (100, 200)
        out = _apply_transform_to_nodes(nodes, t)
        assert out[0][0] == 100.0
        assert out[0][1] == 200.0

    def test_scale(self):
        nodes = [(10.0, 5.0, GSLINE)]
        t = (2.0, 0.0, 0.0, 2.0, 0.0, 0.0)  # scale by 2
        out = _apply_transform_to_nodes(nodes, t)
        assert out[0][0] == 20.0
        assert out[0][1] == 10.0


class TestComposeTransforms:
    def test_identity_compose_identity(self):
        result = _compose_transforms(_IDENTITY_TRANSFORM, _IDENTITY_TRANSFORM)
        assert result == _IDENTITY_TRANSFORM

    def test_two_translations_add(self):
        t1 = (1.0, 0.0, 0.0, 1.0, 10.0, 20.0)
        t2 = (1.0, 0.0, 0.0, 1.0,  5.0, 15.0)
        r  = _compose_transforms(t1, t2)
        # Translation components should add
        assert abs(r[4] - 15.0) < 1e-9
        assert abs(r[5] - 35.0) < 1e-9

    def test_scale_compose(self):
        s2 = (2.0, 0.0, 0.0, 2.0, 0.0, 0.0)
        s3 = (3.0, 0.0, 0.0, 3.0, 0.0, 0.0)
        r  = _compose_transforms(s2, s3)
        assert abs(r[0] - 6.0) < 1e-9
        assert abs(r[3] - 6.0) < 1e-9


class TestPathsToJsCommands:
    def _square_nodes(self):
        """A simple closed square: four line nodes."""
        return [
            [(0.0, 0.0, GSLINE),
             (100.0, 0.0, GSLINE),
             (100.0, 100.0, GSLINE),
             (0.0, 100.0, GSLINE)]
        ]

    def test_square_produces_M_L_L_L_Z(self):
        cmds = _paths_to_js_commands(self._square_nodes())
        types = [c['type'] for c in cmds]
        assert types[0] == 'M'
        assert types[-1] == 'Z'
        assert types.count('L') == 3

    def test_y_is_negated(self):
        """Glyphs Y is up; canvas Y is down — plugin negates all y values."""
        cmds = _paths_to_js_commands(self._square_nodes())
        m = next(c for c in cmds if c['type'] == 'M')
        assert m['y'] == 0.0  # -0 = 0

    def test_cubic_segment(self):
        nodes = [
            [(0.0, 0.0, GSLINE),
             (10.0, 100.0, GSOFFCURVE),
             (90.0, 100.0, GSOFFCURVE),
             (100.0, 0.0, GSCURVE)]
        ]
        cmds = _paths_to_js_commands(nodes)
        types = [c['type'] for c in cmds]
        assert 'C' in types

    def test_empty_path_skipped(self):
        cmds = _paths_to_js_commands([[]])
        assert cmds == []

    def test_single_node_skipped(self):
        cmds = _paths_to_js_commands([[(0.0, 0.0, GSLINE)]])
        assert cmds == []

    def test_no_oncurve_skipped(self):
        nodes = [[(0.0, 0.0, GSOFFCURVE), (50.0, 50.0, GSOFFCURVE)]]
        cmds = _paths_to_js_commands(nodes)
        assert cmds == []


# pytest_approx helper for the _q2c test
try:
    from pytest import approx as pytest_approx
except ImportError:
    def pytest_approx(v, abs=1e-9):
        return v
