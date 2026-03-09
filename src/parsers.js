// src/parsers.js — File Parsers
//
// InputParser
//   Reads the system input file and extracts:
//     - The Rectangle (work area) from the "Rectangle" section
//     - The list of commanded target Points from the "Points" section
//     - Any invalid lines from the Points section (returned as invalidInputLines)
//
// OutputParser
//   Reads the system output file (the raw log produced by the robot arm).
//   Separates valid coordinate lines from malformed lines.
//
// parsePoint (exported helper)
//   Converts a "(x, y)" string into a Point. Returns null for anything that
//   does not match — callers decide what to do with non-matching lines.

'use strict';

const fs   = require('fs');
const path = require('path');
const { Point, Rectangle } = require('./models');

// Strict coordinate pattern: parentheses required, floats and negatives OK.
// Rejects: {}, (a,b), (,), bare "1 2", empty parens ().
const POINT_PATTERN =
  /^\(\s*([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*\)$/;

// Validate that a file path ends in .txt (case-insensitive).
// playwright.config.js checks first; this is the second line of defence for
// callers that construct parsers directly (scripts, unit tests).
function requireTxtFile(filepath, label) {
  const ext = path.extname(filepath).toLowerCase();
  if (ext !== '.txt') {
    throw new Error(
      `${label} must be a .txt file, ` +
      `got: "${path.basename(filepath)}" (extension: "${ext || 'none'}")`
    );
  }
}

/**
 * Parse a "(x, y)" string into a Point.
 *
 * Uses isFinite() not isNaN() — isNaN(Infinity) is false, so "1e999"
 * (which parseFloat turns into Infinity) would pass an isNaN check and
 * silently enter the system as a valid coordinate.
 *
 * @param   {string}     text
 * @returns {Point|null}
 */
const parsePoint = (text) => {
  if (!text) return null;
  const match = POINT_PATTERN.exec(text.trim());
  if (!match) return null;
  const x = parseFloat(match[1]);
  const y = parseFloat(match[2]);
  if (!isFinite(x) || !isFinite(y)) return null;
  return new Point(x, y);
};

// ─────────────────────────────────────────────────────────────────────────────
// INPUT PARSER
// ─────────────────────────────────────────────────────────────────────────────

class InputParser {
  constructor(filepath) {
    this.filepath = filepath;
  }

  /**
   * @returns {{
   *   rectangle:         Rectangle,
   *   inputPoints:       Point[],
   *   invalidInputLines: Array<{ lineNumber: number, content: string }>
   * }}
   *
   * invalidInputLines contains every non-blank line in the Points section
   * that is not a valid (x, y) coordinate — e.g. {}, (a,b), (,), text.
   * These are shown in the INVALID LINES section of the report and counted
   * as failures in REQ-1.
   */
  parse() {
    requireTxtFile(this.filepath, 'Input file');
    if (!fs.existsSync(path.join(__dirname, `..${path.sep}` ,this.filepath))) {
      throw new Error(`Input file not found: ${this.filepath}`);
    }

    const lines             = fs.readFileSync(this.filepath, 'utf8').split('\n');
    const corners           = [];
    const inputPoints       = [];
    const invalidInputLines = [];
    let   section           = null;

    lines.forEach((rawLine, idx) => {
      const line       = rawLine.trim();
      const lineNumber = idx + 1;

      if (!line) return;

      if (line === 'Rectangle') { section = 'rectangle'; return; }
      if (line === 'Points')    { section = 'points';    return; }

      if (section === 'rectangle') {
        const matches = [...line.matchAll(/\(([^)]+)\)/g)];
        for (const m of matches) {
          const [x, y] = m[1].split(',').map(Number);
          // isFinite() rejects both NaN and Infinity — isNaN(Infinity) is false
          if (isFinite(x) && isFinite(y)) corners.push(new Point(x, y));
        }
      }

      if (section === 'points') {
        const pt = parsePoint(line);
        if (pt) {
          inputPoints.push(pt);
        } else {
          // Track every non-blank, non-parseable line with its line number.
          // Examples that land here: {}, (a,b), (,), hello, ()
          invalidInputLines.push({ lineNumber, content: line });
        }
      }
    });

    if (corners.length !== 4) {
      throw new Error(
        `Expected exactly 4 rectangle corners in input file, found ${corners.length}`
      );
    }

    // Rectangle constructor validates shape — throws with a clear message
    // if corners are not perpendicular or contain non-finite values.
    return { rectangle: new Rectangle(corners), inputPoints, invalidInputLines };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT PARSER
// ─────────────────────────────────────────────────────────────────────────────

class OutputParser {
  constructor(filepath) {
    this.filepath = filepath;
  }

  /**
   * @returns {{
   *   points:    Point[],
   *   malformed: Array<{ lineNumber: number, content: string }>
   * }}
   */
  parse() {
    requireTxtFile(this.filepath, 'Output file');

    if (!fs.existsSync(path.join(__dirname, `..${path.sep}` ,this.filepath))) {
      throw new Error(`Output file not found: ${this.filepath}`);
    }

    const lines    = fs.readFileSync(this.filepath, 'utf8').split('\n');
    const points   = [];
    const malformed = [];

    lines.forEach((rawLine, index) => {
      const stripped   = rawLine.trim();
      const lineNumber = index + 1;

      if (!stripped) return;

      const pt = parsePoint(stripped);
      if (pt !== null) {
        points.push(pt);
      } else {
        malformed.push({ lineNumber, content: stripped });
      }
    });

    return { points, malformed };
  }
}

module.exports = { parsePoint, InputParser, OutputParser };