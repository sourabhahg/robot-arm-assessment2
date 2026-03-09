// src/ResultsWriter.js — Test Results Report Writer
//
// Report structure:
//
//   Header
//     Generated timestamp only. No file paths — those live in .env / config.
//
//   INVALID LINES IN INPUT FILE  (only printed when there are bad input lines)
//     Table of every unparseable line found in the Points section.
//     Examples: {}, (a,b), (,), hello
//
//   Point-by-point table  (output-driven, preserves output file order)
//     One row per line in the output file, then missing input points appended.
//
//     Verdict key:
//       PASS  — in-bounds input point correctly visited
//       FAIL  — any of the cases below
//       SKIP  — out-of-bounds input point correctly not visited (not shown
//               here — those points simply do not appear in the output file)
//
//   Requirement summary
//     REQ-0 through REQ-3 with Result: PASS/FAIL and detail messages.
//     Overall verdict at the bottom.

'use strict';

const fs   = require('fs');
const path = require('path');
const { parsePoint } = require('./parsers');

const COL = 28;   // coordinate column width
const RES = 12;   // result column width

const pad = (str, width) => String(str).padEnd(width);

// ─────────────────────────────────────────────────────────────────────────────

class ResultsWriter {
  /**
   * @param {string} outputFile   — path to the system output file (re-read for line order)
   * @param {string} resultsFile  — destination path for test_results.txt
   */
  constructor(outputFile, resultsFile) {
    this.outputFile  = outputFile;
    this.resultsFile = resultsFile;
  }

  /**
   * @param {Object}    params
   * @param {Object[]}  params.requirementResults  — [{ req, passed, messages }]
   * @param {Object[]}  params.invalidInputLines   — [{ lineNumber, content }]
   * @param {Object[]}  params.malformed           — [{ lineNumber, content }]
   * @param {Point[]}   params.inputPoints
   * @param {Point[]}   params.actualPoints
   * @param {Rectangle} params.rectangle
   */
  write({ requirementResults, invalidInputLines, malformed, inputPoints, actualPoints, rectangle }) {
    const sep = '═'.repeat(100);

    const lines = [
      sep,
      ' Robot Arm Work-Area Verification — Test Results',
      ` Generated : ${new Date().toISOString()}`,
      sep,
      '',
    ];

    // Only show the INVALID LINES section when there are bad input lines.
    // If the input file is clean this section is omitted entirely.
    if (invalidInputLines && invalidInputLines.length > 0) {
      lines.push(...this._buildInvalidInputSection(invalidInputLines));
      lines.push('');
    }

    lines.push(...this._buildPointTable(inputPoints, rectangle));
    lines.push('');
    lines.push(...this._buildRequirementSummary(requirementResults));
    lines.push(sep);

    fs.mkdirSync(path.dirname(this.resultsFile), { recursive: true });
    fs.writeFileSync(this.resultsFile, lines.join('\n') + '\n', 'utf8');
  }

  // ── INVALID LINES IN INPUT FILE ──────────────────────────────────────────
  //
  // Shown at the top so the operator immediately sees corrupt input lines
  // before reading the point table.

  _buildInvalidInputSection(invalidInputLines) {
    const divider    = '─'.repeat(100);
    const LINE_COL   = 12;
    const CONTENT_COL = 28;
    const lines      = [];

    lines.push(divider);
    lines.push('INVALID LINES IN INPUT FILE');
    lines.push(divider);
    lines.push(`${pad('Line #', LINE_COL)}${pad('Content', CONTENT_COL)}Reason`);
    lines.push(divider);

    for (const { lineNumber, content } of invalidInputLines) {
      lines.push(
        `${pad(`Line ${lineNumber}`, LINE_COL)}${pad(content, CONTENT_COL)}Not a valid coordinate — skipped`
      );
    }

    return lines;
  }

  // ── Point-by-point table ─────────────────────────────────────────────────
  //
  // Output-driven: walks the output file line by line, then appends any
  // in-bounds input points that were never visited.
  //
  // Remarks:
  //   "Outside work area — should have been skipped"
  //     The output point was listed in the input as an out-of-bounds point.
  //     The arm should have skipped it.
  //
  //   "Was never in the input file"
  //     The output point was never listed in the input at all (phantom).
  //
  //   "Unreadable line"
  //     The output line could not be parsed as a (x, y) coordinate.
  //
  //   "Visited more times than expected"
  //     The output contains this point more times than the input commanded.
  //
  //   "Expected but never visited"
  //     An in-bounds input point that never appeared in the output.

  _buildPointTable(inputPoints, rectangle) {
    const lines   = [];
    const divider = '─'.repeat(100);

    lines.push(divider);
    lines.push(
      `${pad('Expected visited points', COL)}  ${pad('Actual visited points', COL)}  ${pad('Result', RES)}Remarks`
    );
    lines.push(divider);

    // Identify out-of-bounds input points — used to distinguish
    // "should have been skipped" from "was never in the input file".
    const outOfBoundsInput = inputPoints.filter(p => !rectangle.contains(p));

    // Quota map: tracks how many times each in-bounds input point still
    // needs to be visited.  Decremented when matching output lines are found.
    const quota = new Map();
    for (const p of inputPoints) {
      if (rectangle.contains(p)) {
        const key   = p.toKey();
        const entry = quota.get(key);
        entry ? (entry.remaining += 1) : quota.set(key, { remaining: 1, point: p });
      }
    }

    // Walk the output file in its original line order
    const outputLines = fs.readFileSync(this.outputFile, 'utf8').split('\n');

    for (const rawLine of outputLines) {
      const stripped = rawLine.trim();
      if (!stripped) continue;

      const pt = parsePoint(stripped);

      if (pt === null) {
        // Line could not be parsed — system wrote garbage
        lines.push(
          `${pad('', COL)}  ${pad(stripped, COL)}  ${pad('FAIL', RES)}Malformed data`
        );

      } else if (outOfBoundsInput.some(p => p.equals(pt))) {
        // Arm visited a point that was in the input but outside the rectangle
        lines.push(
          `${pad('', COL)}  ${pad(pt.toString(), COL)}  ${pad('FAIL', RES)}Outside work area — should have been skipped`
        );

      } else {
        const key   = pt.toKey();
        const entry = quota.get(key);

        if (entry && entry.remaining > 0) {
          // Valid expected visit — consume one quota slot
          entry.remaining -= 1;
          lines.push(
            `${pad(pt.toString(), COL)}  ${pad(pt.toString(), COL)}  ${pad('PASS', RES)}`
          );
        } else if (entry && entry.remaining === 0) {
          // Point already fully visited — this is an extra visit
          lines.push(
            `${pad('', COL)}  ${pad(pt.toString(), COL)}  ${pad('FAIL', RES)}Visited more times than expected`
          );
        } else {
          // Coordinate is valid but was never listed in the input at all
          lines.push(
            `${pad('', COL)}  ${pad(pt.toString(), COL)}  ${pad('FAIL', RES)}Was never in the input file`
          );
        }
      }
    }

    // Append in-bounds input points that were never visited
    for (const { remaining, point } of quota.values()) {
      for (let i = 0; i < remaining; i++) {
        lines.push(
          `${pad(point.toString(), COL)}  ${pad('NOT VISITED', COL)}  ${pad('FAIL', RES)}Expected but never visited`
        );
      }
    }

    return lines;
  }

  // ── Requirement summary ──────────────────────────────────────────────────

  _buildRequirementSummary(requirementResults) {
    const lines   = [];
    const divider = '─'.repeat(70);

    lines.push(divider);
    lines.push('REQUIREMENT SUMMARY');
    lines.push(divider);

    for (const { req, passed, messages } of requirementResults) {
      lines.push('');
      lines.push(`${req.name}: ${req.description}`);
      lines.push(`Result: ${passed ? 'PASS' : 'FAIL'}`);
      for (const msg of (messages ?? [])) {
        lines.push(`  - ${msg}`);
      }
    }

    const overall = requirementResults.every(r => r.passed) ? 'PASS' : 'FAIL';
    lines.push('');
    lines.push(divider);
    lines.push(`OVERALL: ${overall}`);

    return lines;
  }
}

module.exports = { ResultsWriter };