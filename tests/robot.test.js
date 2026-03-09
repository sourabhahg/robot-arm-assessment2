// tests/robot.test.js

const { test } = require('@playwright/test');

const { InputParser, OutputParser } = require('../src/parsers');
const { REQ0, REQ1, REQ2, REQ3 }   = require('../src/requirements');
const { ResultsWriter }             = require('../src/ResultsWriter');

let context;

// ─────────────────────────────────────────────────────────────────────────────
// buildContext — pre-computes every derived array exactly once in beforeAll.
// All verify() calls and afterAll read from these fields — no re-iteration.
// ─────────────────────────────────────────────────────────────────────────────

function buildFrequency(points) {
  const freq = new Map();
  for (const p of points) {
    const key = p.toKey();
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  return freq;
}

function buildContext({
  rectangle, inputPoints, invalidInputLines,
  actualPoints, malformed, outputFile, resultsFile,
}) {
  const validInputPoints = inputPoints.filter(p => rectangle.contains(p));
  const inputFreq        = buildFrequency(inputPoints);
  const actualFreq       = buildFrequency(actualPoints);

  const actualKeySet  = new Set(actualPoints.map(p => p.toKey()));
  const missingPoints = validInputPoints.filter(p => !actualKeySet.has(p.toKey()));

  const outOfBoundsPoints = actualPoints.filter(p => !rectangle.contains(p));

  const duplicatePoints = [];
  for (const [key, visitedCount] of actualFreq) {
    const allowedCount = inputFreq.get(key) ?? 0;
    if (visitedCount > allowedCount) {
      const point = actualPoints.find(p => p.toKey() === key);
      duplicatePoints.push({ point, visitedCount, allowedCount });
    }
  }

  const inputKeySet   = new Set(inputPoints.map(p => p.toKey()));
  const phantomPoints = actualPoints.filter(p => !inputKeySet.has(p.toKey()));

  return {
    rectangle,
    inputPoints,
    validInputPoints,
    invalidInputLines,   // non-parseable lines from the input Points section
    actualPoints,
    malformed,
    outputFile,
    resultsFile,
    missingPoints,
    outOfBoundsPoints,
    duplicatePoints,
    phantomPoints,
    // Initialised to null — afterAll detects null and falls back to verify()
    // if a test crashed before caching its result.
    reqResults: { REQ0: null, REQ1: null, REQ2: null, REQ3: null },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────────────────

test.beforeAll(async ({}, testInfo) => {
  const { inputFile, outputFile, resultsFile } = testInfo.project.use;

  // InputParser now returns invalidInputLines alongside rectangle and inputPoints
  const { rectangle, inputPoints, invalidInputLines } = new InputParser(inputFile).parse();
  const { points: actualPoints, malformed }           = new OutputParser(outputFile).parse();

  context = buildContext({
    rectangle, inputPoints, invalidInputLines,
    actualPoints, malformed, outputFile, resultsFile,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// Each test caches its result silently. afterAll prints all failures together.
// ─────────────────────────────────────────────────────────────────────────────

test('REQ-0 | rectangle in input file is valid', () => {
  const result = new REQ0().verify(context);
  context.reqResults.REQ0 = result;
  if (!result.passed) throw new Error('REQ-0 FAILED');
});

test('REQ-1 | arm visited all expected in-bounds points', () => {
  const result = new REQ1().verify(context);
  context.reqResults.REQ1 = result;
  if (!result.passed) throw new Error('REQ-1 FAILED');
});

test('REQ-2 | arm only visited valid in-bounds points with no duplicates', () => {
  const result = new REQ2().verify(context);
  context.reqResults.REQ2 = result;
  if (!result.passed) throw new Error('REQ-2 FAILED');
});

test('REQ-3 | output file has valid coordinates on every line', () => {
  const result = new REQ3().verify(context);
  context.reqResults.REQ3 = result;
  if (!result.passed) throw new Error('REQ-3 FAILED');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEARDOWN — write results file and print consolidated failure summary
// ─────────────────────────────────────────────────────────────────────────────

test.afterAll(() => {
  if (!context) {
    console.warn('[WARN] context not initialised — report not written.');
    return;
  }

  const reqs = [new REQ0(), new REQ1(), new REQ2(), new REQ3()];
  const keys = ['REQ0', 'REQ1', 'REQ2', 'REQ3'];

  // Use cached result from the test; fall back to verify() only when a test
  // crashed before caching (so verify() is never called twice in normal runs).
  const requirementResults = reqs.map((req, i) => {
    const cached = context.reqResults[keys[i]];
    const result = cached ?? req.verify(context);
    return { ...result, req };
  });

  new ResultsWriter(context.outputFile, context.resultsFile).write({
    requirementResults,
    invalidInputLines: context.invalidInputLines,
    malformed:         context.malformed,
    inputPoints:       context.inputPoints,
    actualPoints:      context.actualPoints,
    rectangle:         context.rectangle,
  });

  console.log(`\nResults written to: ${context.resultsFile}`);

  // Print all failures together once — after all three tests have finished.
  // This avoids output scattered across individual test blocks.
  const failed = requirementResults.filter(r => !r.passed);
  if (failed.length > 0) {
    const HR = '─'.repeat(60);
    console.log(`\n${HR}`);
    console.log(`  FAILURE SUMMARY (${failed.length} of ${reqs.length} requirements failed)`);
    console.log(HR);
    for (const { req, messages } of failed) {
      console.log(`\n  [${req.name}] — ${messages.length} issue(s):`);
      messages.forEach(m => console.log(`    • ${m}`));
    }
    console.log(`\n${HR}`);
  }
});