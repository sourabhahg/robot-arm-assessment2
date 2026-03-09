# Robot Arm Work-Area Verification — Test Suite

This project verifies that a robot arm system is doing the right thing. It reads the input file the system was given and the output file it produced, then checks whether the rectangle work area is valid, whether the arm visited the right coordinates, stayed inside its boundaries, and wrote its log in a clean format. If anything went wrong, the tests tell you exactly what failed and why.

---

## What does it do

The robot arm receives a list of target coordinates from an input file and writes a log of the coordinates it actually visited to an output file. After every run, four things need to be confirmed:

**REQ-0 — Is the work area rectangle valid?**
Before anything else can be checked, the input file must define a proper rectangle. The four corners must form a geometrically valid rectangle — perpendicular adjacent sides, finite coordinates, no missing corners. If the rectangle is bad, none of the other results can be trusted.

**REQ-1 — Did the arm visit everything it was supposed to?**
Every point that falls inside the work area and appears in the input file must also appear in the output. If a commanded point is missing from the log, that is a failure. Invalid lines in the Points section — like `{}` or `(a,b)` — are also flagged here because they represent corrupt input data.

**REQ-2 — Did the arm stay inside the boundaries?**
No coordinate in the output should be outside the rectangle. No point should be visited more times than it appeared in the input. No phantom visits that were never in the input at all.

**REQ-3 — Is the output file well-formed?**
Every non-blank line in the output should be a valid `(x, y)` coordinate. Lines like `error` or `()` mean something went wrong with the system itself.

Each of these maps to one test. Pass all four and the system is behaving correctly. Fail any one and the report tells you the exact coordinates and line numbers involved.

---

## Why Playwright

Playwright is typically associated with browser testing, but its test runner is a solid general-purpose framework for any kind of automated verification. The reasons it was chosen here:

- **Structured test lifecycle.** `beforeAll`, `afterAll`, and individual test hooks give a clean place for setup, teardown, and report writing without any boilerplate.
- **Parallel-safe context.** Each test project gets its own isolated context, which makes it straightforward to pass file paths and shared state without globals.
- **HTML report out of the box.** Running `npm run test:report` produces a browsable report with pass/fail history and error detail at no extra cost.
- **One dependency.** The whole test runner, assertion library, and report generation comes from a single `@playwright/test` package. There is nothing else to wire together.

The alternative was writing a plain Node.js test harness from scratch. That would have worked, but it would also have required reinventing structure that Playwright already provides cleanly.

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher
- npm (comes with Node.js)
- Git

### Clone the repository

```bash
git clone https://github.com/sourabhahg/robot-arm-assessment2.git
cd robot-arm-refactored
```

### Install dependencies

```bash
npm install
```

`npm install` pulls in the Playwright test runner and the dotenv package. `npx playwright install` downloads the browser binaries that Playwright needs internally. This only needs to be done once.

---

## Project structure

```
robot-arm-refactored/
│
├── src/                         Core logic — parsing, geometry, requirements
│   ├── models.js                Point and Rectangle classes with validation
│   ├── parsers.js               Reads the input and output .txt files
│   ├── requirements.js          One class per requirement (REQ0, REQ1, REQ2, REQ3)
│   └── ResultsWriter.js         Writes test_results.txt after a run
│
├── tests/
│   └── robot.test.js            Playwright tests — one per requirement
│
├── testdata/                    Put your input and output .txt files here
│   ├── system_input_file_*.txt  The commanded target coordinates
│   ├── system_ouput_file_*.txt  The arm's actual visit log
│   ├── input_success.txt        Sample: valid run
│   └── output_success.txt       Sample: valid run output
│
├── test-results/
│   └── test_results.txt         Generated report — created automatically
│
├── .env                         Your local config (never committed)
├── .env.example                 Template showing available variables
├── playwright.config.js         Resolves file paths, configures Playwright
└── package.json
```

---

## Where files are picked from

The test suite needs two files to run: an input file and an output file. Both must be plain `.txt` files — any other extension is rejected before the tests start. There are three ways to tell the suite where to find them, in order of priority:

**1. Shell environment variables (highest priority)**
```bash
INPUT_FILE=./testdata/my_input.txt OUTPUT_FILE=./testdata/my_output.txt npm test
```
Input, Output and Result files path should be relative to the directories.

Whatever you set in the shell wins over everything else. Useful for one-off runs or CI pipelines.

**2. The `.env` file**
Set paths in `.env` and they will be picked up every time you run `npm test` without having to type them again. See [Environment setup](#environment-setup-with-env) below.

**3. Auto-detection (fallback)**
If neither of the above is set, `playwright.config.js` looks inside the `testdata/` folder for files whose names start with `system_input_file` and `system_output_file` (the typo variant `system_ouput_file` is also handled). If it finds them, it uses them. If it cannot find them, it throws a clear error telling you what to do.

### Input file format

```
Rectangle
(-4, -150), (-4, 150), (160, -150), (160, 150)
Points
(-3, -149)
(4, 150)
(0.045, 0.001)
{}
```

The `Rectangle` section defines the four corners of the work area. Corners can be given in any order — axis-aligned or tilted rectangles are both accepted. The `Points` section lists the coordinates the arm was commanded to visit. Each valid coordinate must use `(x, y)` format with parentheses. Lines that do not match — like `{}` or `(a,b)` — are flagged as invalid input lines and reported separately.

### Output file format

```
(-3, -149)
(4, 150)
error
()
(160, -150)
```

One coordinate per line. Lines that are not valid `(x, y)` coordinates are treated as malformed system output and flagged under REQ-3.

---

## Environment setup with .env

The project uses a `.env` file to configure file paths and the runtime environment without having to type them on the command line every time.

### First-time setup

```bash
cp .env.example .env
```

Open `.env` and fill in the paths to your files:

```ini
INPUT_FILE=testdata/system_input_file_1630412935.txt
OUTPUT_FILE=testdata/system_ouput_file_1630412935.txt
RESULTS_FILE=test-results/test_results.txt
NODE_ENV=development
```

### Available variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `INPUT_FILE` | No | auto-detected from `testdata/` | Path to the system input `.txt` file |
| `OUTPUT_FILE` | No | auto-detected from `testdata/` | Path to the system output `.txt` file |
| `RESULTS_FILE` | No | `test-results/test_results.txt` | Where the report is written |
| `NODE_ENV` | No | `development` | `development` or `ci` |

### Switching between different test files

Comment out the active paths and uncomment the ones you want:

```ini
# Run against the real system data
INPUT_FILE=testdata/system_input_file_1630412935.txt
OUTPUT_FILE=testdata/system_ouput_file_1630412935.txt

# Run against the success sample
# INPUT_FILE=testdata/input_success.txt
# OUTPUT_FILE=testdata/output_success.txt
```

### Important: never commit `.env`

The `.env` file is listed in `.gitignore` and will not be pushed to GitHub. Commit `.env.example` instead — it is the template that anyone who clones the project should copy and fill in. Real paths and environment-specific values stay local.

---

## Running the tests

**Standard run:**
```bash
npm test
```
Results appear in the terminal and a report is written to `test-results/test_results.txt`.

**With an HTML report you can open in a browser:**
```bash
npm run test:report
npx playwright show-report
```

**Override files for a single run without editing `.env`:**
```bash
INPUT_FILE=testdata/input_success.txt OUTPUT_FILE=testdata/output_success.txt npm test
```

**Point the report to a different location:**
```bash
RESULTS_FILE=./my-reports/run1.txt npm test
```

---

## Understanding the results

After a run, open `test-results/test_results.txt`. It has up to three sections depending on what the test run found.

### Section 1 — Invalid lines in input file

This section only appears when the Points section of the input file contains lines that are not valid `(x, y)` coordinates. It is printed at the very top so the problem is immediately visible before the point table.

```
────────────────────────────────────────────────────────────────────────────────
INVALID LINES IN INPUT FILE
────────────────────────────────────────────────────────────────────────────────
Line #      Content                     Reason
────────────────────────────────────────────────────────────────────────────────
Line 12     {}                          Not a valid coordinate — skipped
```

Each row shows the line number in the input file, the raw content of the line, and why it was rejected. The line is skipped — it does not appear in the point table and the arm would never be commanded to visit it. These failures are reported under REQ-1 in the requirement summary.

If the input file is clean this section is omitted entirely.

### Section 2 — Point-by-point table

Every line in the output file gets its own row showing what was expected and what the system actually produced. The `Result` column gives the verdict and the `Remarks` column explains failures in plain English.

```
────────────────────────────────────────────────────────────────────────────────────────────────────
Expected visited points     Actual visited points       Result      Remarks
────────────────────────────────────────────────────────────────────────────────────────────────────
(-3, -149)                  (-3, -149)                  PASS
(4, 150)                    (4, 150)                    PASS
                            (170, 150)                  FAIL        Outside work area — should have been skipped
                            (0, 0)                      FAIL        Was never in the input file
                            error                       FAIL        Unreadable line
(-4, -150)                  (-4, -150)                  PASS
                            (4, 150)                    FAIL        Visited more times than expected
(0.045, 0.001)              NOT VISITED                 FAIL        Expected but never visited
```

The table is output-driven — rows follow the order lines appear in the output file. Any in-bounds input points that were never visited are appended at the bottom.

| Result | Remarks | Meaning |
|---|---|---|
| `PASS` | _(none)_ | In-bounds point correctly visited |
| `FAIL` | `Expected but never visited` | Commanded in-bounds point missing from the output |
| `FAIL` | `Outside work area — should have been skipped` | Arm visited a point that was in the input but outside the rectangle |
| `FAIL` | `Was never in the input file` | Arm visited a coordinate that was not commanded at all |
| `FAIL` | `Visited more times than expected` | Arm visited this point more times than it appeared in the input |
| `FAIL` | `Unreadable line` | Output line could not be parsed as a valid `(x, y)` coordinate |

In input file provided we have points which are out of the working area — but that is the opposite of what the assignment requires. REQ-2 explicitly states the arm must visit points only within the work area. A point outside the rectangle was never supposed to be visited at all. Showing it under "Expected" is misleading. Thats the reason in result.txt we are not displying the points which are out of rectangle.

### Section 3 — Requirement summary

Below the table, each requirement gets a block showing its `Result: PASS` or `Result: FAIL` and the specific issues that caused any failures. The overall verdict sits at the very bottom.

```
──────────────────────────────────────────────────────────────────────
REQUIREMENT SUMMARY
──────────────────────────────────────────────────────────────────────

REQ-0: Rectangle in input file is valid
Result: PASS
  - Rectangle is valid.

REQ-1: Arm visited all expected in-bounds points
Result: FAIL
  - Invalid point on input line 12: "{}" — not a valid coordinate
  - Missing: (0.045, 0.001) was expected but never visited

REQ-2: Arm only visited valid in-bounds points with no duplicates
Result: FAIL
  - Out of bounds: (170, 150) is outside the work area
  - Out of bounds: (150, -155) is outside the work area
  - Visited too many times: 4,150 was visited 2x but only appears 1x in input
  - Unexpected visit: (0, 0) was visited but was never in the input

REQ-3: Output file has valid coordinates on every line
Result: FAIL
  - Line 5: "error" is not a valid coordinate
  - Line 12: "()" is not a valid coordinate

──────────────────────────────────────────────────────────────────────
OVERALL: FAIL
```

All four requirements are checked independently even if one fails, so you always get the full picture in one run.

### Failure summary in the terminal

When tests fail, a consolidated block is also printed to the terminal after all requirements have been checked:

```
────────────────────────────────────────────────────────────
  FAILURE SUMMARY (3 of 4 requirements failed)
────────────────────────────────────────────────────────────

  [REQ-1] — 2 issue(s):
    • Invalid point on input line 12: "{}" — not a valid coordinate
    • Missing: (0.045, 0.001) was expected but never visited

  [REQ-2] — 9 issue(s):
    • Out of bounds: (170, 150) is outside the work area
    • Visited too many times: 4,150 was visited 2x but only appears 1x in input
    ...

  [REQ-3] — 2 issue(s):
    • Line 5: "error" is not a valid coordinate
    • Line 12: "()" is not a valid coordinate

────────────────────────────────────────────────────────────
```

Printing everything in one block at the end — rather than mid-test as each requirement runs — means the output is easier to read and action.
