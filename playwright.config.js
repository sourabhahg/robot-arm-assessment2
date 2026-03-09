// playwright.config.js
//
// Resolves input/output file paths and passes them into the test project.
// Override any path with an environment variable — useful for CI pipelines.
//
//   INPUT_FILE=./my_input.txt OUTPUT_FILE=./my_output.txt npm test

const { defineConfig } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
require('dotenv').config()

// Validate that a resolved file path has a .txt extension.
//
// WHY HERE (playwright.config.js):
//   This is the earliest point in the lifecycle — before beforeAll, before
//   any parser runs. A wrong file type fails immediately with a clear message
//   rather than producing a confusing parse error deep inside the test.
//
// WHY ALSO in parsers.js:
//   parsers.js is a second line of defence. If someone calls InputParser or
//   OutputParser directly (e.g. from the 25-sample test suite or a debug
//   script) without going through playwright.config.js, the check still fires.
function requireTxtFile(filepath, label) {
  const ext = path.extname(filepath).toLowerCase();
  if (ext !== '.txt') {
    throw new Error(
      `${label} must be a .txt file, ` +
      `got: "${path.basename(filepath)}" (extension: "${ext || 'none'}")`
    );
  }
}

function findFile(prefix) {
  const dir   = path.join(__dirname, 'testdata');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const match = files.find(f => f.startsWith(prefix));
  return match ? path.join(dir, match) : null;
}

const inputFile  = process.env.INPUT_FILE  || findFile('system_input_file');
const outputFile = process.env.OUTPUT_FILE || findFile('system_output_file') || findFile('system_ouput_file')
const resultsFile = process.env.RESULTS_FILE
                 || path.join(__dirname, 'test-results', 'test_results.txt');

if (!inputFile)  throw new Error('Input file not found. Add to testdata/ or set INPUT_FILE.');
if (!outputFile) throw new Error('Output file not found. Add to testdata/ or set OUTPUT_FILE.');

// Validate extensions — throws before defineConfig if wrong file type supplied
requireTxtFile(inputFile,  'INPUT_FILE');
requireTxtFile(outputFile, 'OUTPUT_FILE');

module.exports = defineConfig({
  testDir: './tests',
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    {
      name: 'robot-arm-verification',
      use: { inputFile, outputFile, resultsFile },
    },
  ],
});
