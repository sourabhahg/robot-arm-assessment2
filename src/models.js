// src/models.js — Domain Models
//
// Point
//   An immutable 2D coordinate. Constructed with validated, finite values.
//   Equality uses a relative epsilon so comparisons stay correct at any scale.
//
// Rectangle
//   The robot arm's work area, defined by exactly 4 corner points in any order.
//   Supports BOTH axis-aligned AND tilted rectangles.
//
//   Construction validates:
//     • Exactly 4 corners are provided
//     • All corner coordinates are finite (no NaN / Infinity)
//     • The 4 points actually form a rectangle (perpendicular adjacent sides)
//
//   WHY dot-product instead of axis-alignment check:
//     The previous version required exactly 2 unique X values and 2 unique Y
//     values, which rejected any tilted rectangle.  The correct test is that
//     adjacent sides are perpendicular — dot product of adjacent edge vectors
//     must be zero.  This accepts rectangles of any orientation while still
//     rejecting parallelograms, trapezoids, and random 4-point shapes.
//
//   contains() uses dot-product projection onto two adjacent edges, which
//   works correctly for both axis-aligned and tilted rectangles.

'use strict';

const REL_EPS = 1e-9;

// ─────────────────────────────────────────────────────────────────────────────
// POINT
// ─────────────────────────────────────────────────────────────────────────────

class Point {
  /**
   * @param {number} x
   * @param {number} y
   * @throws {Error} if x or y is not a finite number (rejects NaN, ±Infinity)
   */
  constructor(x, y) {
    if (!isFinite(x) || !isFinite(y)) {
      throw new Error(
        `Point coordinates must be finite numbers, got (${x}, ${y}). ` +
        `NaN and Infinity are not valid coordinates.`
      );
    }
    this.x = x;
    this.y = y;
    Object.freeze(this);
  }

  /**
   * Float-tolerant equality using a relative epsilon.
   * Tolerance scales with coordinate magnitude so equality is correct
   * whether coordinates are near zero or very large.
   */
  equals(other) {
    const ex = Math.max(Math.abs(this.x), Math.abs(other.x), 1) * REL_EPS;
    const ey = Math.max(Math.abs(this.y), Math.abs(other.y), 1) * REL_EPS;
    return Math.abs(this.x - other.x) < ex &&
           Math.abs(this.y - other.y) < ey;
  }

  toKey() {
    return `${Math.round(this.x * 1e9) / 1e9},${Math.round(this.y * 1e9) / 1e9}`;
  }

  toString() {
    return `(${this.x}, ${this.y})`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECTANGLE
// ─────────────────────────────────────────────────────────────────────────────

class Rectangle {
  /**
   * @param {Point[]} corners — exactly 4 corner points, any order, any orientation
   * @throws {Error} if corner count ≠ 4
   * @throws {Error} if any coordinate is not finite
   * @throws {Error} if the 4 points do not form a valid rectangle
   */
  constructor(corners) {

    // ── Validation 1: exactly 4 corners ──────────────────────────────────────
    if (corners.length !== 4) {
      throw new Error(
        `Rectangle requires exactly 4 corners, got ${corners.length}. ` +
        `Check the Rectangle section of the input file.`
      );
    }

    // ── Validation 2: all coordinates must be finite ──────────────────────────
    for (const c of corners) {
      if (!isFinite(c.x) || !isFinite(c.y)) {
        throw new Error(
          `Rectangle corner ${c} contains a non-finite coordinate. ` +
          `All corner coordinates must be real, finite numbers.`
        );
      }
    }

    // ── Validation 3: corners must form a valid rectangle ─────────────────────
    //
    // Sort corners into a consistent winding order, then check that each pair
    // of adjacent sides is perpendicular (dot product = 0).
    //
    // This correctly accepts:
    //   • Axis-aligned rectangles given in any corner order (jumbled)
    //   • Tilted rectangles of any orientation
    //
    // And correctly rejects:
    //   • Parallelograms (equal sides, but not perpendicular)
    //   • Trapezoids and other 4-point shapes
    //
    // Tolerance: scaled by the square of the longest side so the check stays
    // proportional regardless of the rectangle's physical size.
    this._sorted = this._sortCCW(corners);
    this._validatePerpendicular(this._sorted);

    this.rawCorners = corners;
  }

  // Sort corners counter-clockwise around the centroid using atan2.
  // Consistent winding is required so contains() always picks the same
  // A, B, D corners regardless of input file order.
  _sortCCW(corners) {
    const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
    const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
    return [...corners].sort(
      (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
    );
  }

  // Verify that each pair of adjacent edges is perpendicular.
  _validatePerpendicular(sorted) {
    const [A, B, C, D] = sorted;
    const sides = [
      { x: B.x - A.x, y: B.y - A.y },  // AB
      { x: C.x - B.x, y: C.y - B.y },  // BC
      { x: D.x - C.x, y: D.y - C.y },  // CD
      { x: A.x - D.x, y: A.y - D.y },  // DA
    ];
    const dot    = (a, b) => a.x * b.x + a.y * b.y;
    const len2   = v => v.x * v.x + v.y * v.y;
    const maxLen2 = Math.max(...sides.map(len2));
    const eps    = maxLen2 * 1e-9;

    for (let i = 0; i < 4; i++) {
      if (Math.abs(dot(sides[i], sides[(i + 1) % 4])) > eps) {
        throw new Error(
          `The 4 corners do not form a valid rectangle — ` +
          `adjacent sides are not perpendicular. ` +
          `Corners: ${sorted.map(p => p.toString()).join(', ')}`
        );
      }
    }
  }

  /**
   * Returns true if the point lies inside or on the boundary.
   *
   * Uses dot-product projection onto two adjacent edges (AB and AD).
   * A point P is inside when both projections fall in [0, 1]:
   *
   *   u = (AP · AB) / |AB|²   must be in [0, 1]
   *   v = (AP · AD) / |AD|²   must be in [0, 1]
   *
   * This works for any rectangle orientation — axis-aligned or tilted.
   *
   * Default mode: REL_EPS tolerance on the normalised [0,1] range.
   *   Absorbs float rounding when coordinates are computed from expressions.
   *
   * Strict mode: no tolerance, exact [0,1] range check.
   *
   * @param   {Point}   point
   * @param   {object}  [opts]
   * @param   {boolean} [opts.strict=false]
   * @returns {boolean}
   */
  contains(point, { strict = false } = {}) {
    const [A, B, , D] = this._sorted;
    const dot = (v1, v2) => v1.x * v2.x + v1.y * v2.y;

    const AB = { x: B.x - A.x, y: B.y - A.y };
    const AD = { x: D.x - A.x, y: D.y - A.y };
    const AP = { x: point.x - A.x, y: point.y - A.y };

    const u = dot(AP, AB) / dot(AB, AB);
    const v = dot(AP, AD) / dot(AD, AD);

    if (strict) {
      return u >= 0 && u <= 1 && v >= 0 && v <= 1;
    }

    return u >= -REL_EPS && u <= 1 + REL_EPS &&
           v >= -REL_EPS && v <= 1 + REL_EPS;
  }

  toString() {
    return `Rectangle(${this.rawCorners.map(c => c.toString()).join(', ')})`;
  }
}

module.exports = { Point, Rectangle };