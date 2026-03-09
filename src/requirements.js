// src/requirements.js — Requirement Verifiers
//
// Each requirement is its own class with a verify(context) method
// returning { passed, messages }.
//
// All heavy iteration happens once in buildContext() inside robot.test.js.
// verify() only reads pre-computed arrays — no loops, no recomputation.

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// BASE CLASS
// ─────────────────────────────────────────────────────────────────────────────

class Requirement {
  get name()        { throw new Error('Subclasses must define name'); }
  get description() { throw new Error('Subclasses must define description'); }
  verify(_context)  { throw new Error('Subclasses must implement verify()'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// REQ-0 — Rectangle in the input file is valid
//
// Checked before any other requirement. If the rectangle is invalid the
// test run throws during parsing — so if we reach here it is already known
// to be good. REQ-0 surfaces that clearly in the report.
//
// Reads: context.rectangle
// ─────────────────────────────────────────────────────────────────────────────

class REQ0 extends Requirement {
  get name()        { return 'REQ-0'; }
  get description() { return 'Rectangle in input file is valid'; }

  verify({ rectangle }) {
    if (!rectangle) {
      return { passed: false, messages: ['No valid rectangle found in the input file.'] };
    }
    return { passed: true, messages: ['Rectangle is valid.'] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REQ-1 — Arm visited all expected in-bounds points
//
// Two things must be true:
//   (a) No invalid (unparseable) lines in the input Points section
//   (b) Every in-bounds input point appears in the output
//
// Reads: context.invalidInputLines, context.validInputPoints, context.missingPoints
// ─────────────────────────────────────────────────────────────────────────────

class REQ1 extends Requirement {
  get name()        { return 'REQ-1'; }
  get description() { return 'Arm visited all expected in-bounds points'; }

  verify({ invalidInputLines, validInputPoints, missingPoints }) {
    const messages = [];

    // (a) Invalid lines — listed first because they represent corrupt input
    //     data. The operator must fix the input file before re-running.
    for (const { lineNumber, content } of (invalidInputLines ?? [])) {
      messages.push(
        `Invalid point on input line ${lineNumber}: "${content}" — not a valid coordinate`
      );
    }

    // (b) Missing visits
    for (const pt of missingPoints) {
      messages.push(`Missing: ${pt} was expected but never visited`);
    }

    if (validInputPoints.length === 0 && messages.length === 0) {
      messages.push('Input file contains no in-bounds points to verify against');
      return { passed: false, messages };
    }

    const passed = messages.length === 0;
    if (passed) messages.push(`All ${validInputPoints.length} in-bounds input point(s) were visited.`);
    return { passed, messages };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REQ-2 — Arm only visited valid in-bounds points with no duplicates
//
// Three things must all be true:
//   (a) Every output point is inside the rectangle
//   (b) No point visited more times than it appears in the input
//   (c) No point visited that was never in the input at all
//
// Reads: context.outOfBoundsPoints, context.duplicatePoints, context.phantomPoints
// ─────────────────────────────────────────────────────────────────────────────

class REQ2 extends Requirement {
  get name()        { return 'REQ-2'; }
  get description() { return 'Arm only visited valid in-bounds points with no duplicates'; }

  verify({ outOfBoundsPoints, duplicatePoints, phantomPoints }) {
    const messages = [];

    for (const pt of outOfBoundsPoints) {
      messages.push(`Out of bounds: ${pt} is outside the work area`);
    }

    for (const { point, visitedCount, allowedCount } of duplicatePoints) {
      messages.push(
        `Visited too many times: ${point.toKey()} was visited ${visitedCount}x but only appears ${allowedCount}x in input`
      );
    }

    for (const pt of phantomPoints) {
      messages.push(`Unexpected visit: ${pt} was visited but was never in the input`);
    }

    const passed = messages.length === 0;
    if (passed) messages.push('All visited points are in-bounds and visited exactly once.');
    return { passed, messages };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REQ-3 — Output file has valid coordinates on every line
//
// Every non-blank line in the output must be a valid (x, y) coordinate.
// Reads: context.actualPoints, context.malformed
// ─────────────────────────────────────────────────────────────────────────────

class REQ3 extends Requirement {
  get name()        { return 'REQ-3'; }
  get description() { return 'Output file has valid coordinates on every line'; }

  verify({ actualPoints, malformed }) {
    const messages = [];

    if (actualPoints.length === 0) {
      messages.push('Output file contains no valid coordinate entries at all');
    }

    for (const { lineNumber, content } of malformed) {
      messages.push(`Line ${lineNumber}: "${content}" is not a valid coordinate`);
    }

    const passed = messages.length === 0;
    if (passed) {
      messages.push(
        `Output file is well-formed: ${actualPoints.length} valid coordinate(s), 0 malformed lines.`
      );
    }
    return { passed, messages };
  }
}

module.exports = { Requirement, REQ0, REQ1, REQ2, REQ3 };