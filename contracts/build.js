// The one place the compiler is configured. parity.js and test-keys.js both
// build through here, so a setting can never be right in one harness and wrong
// in the other — viaIR in particular, which ProofRenderer does not compile
// without and which nothing else in the repo would have caught.
const solc = require('solc');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function findImports(p) {
  const t = path.join(ROOT, 'node_modules', p);
  return fs.existsSync(t) ? { contents: fs.readFileSync(t, 'utf8') } : { error: 'not found: ' + p };
}

const SETTINGS = {
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
};

/// Compiles the named contract files. Throws on any error, including the ones
/// solc reports as a list rather than an exception — a harness that reads
/// `undefined` off a failed compile reports a missing function, not a broken
/// build, and that is a wrong answer rather than a slow one.
function compile(files, inline = {}) {
  const sources = {};
  for (const f of files) {
    sources['contracts/' + f] = { content: fs.readFileSync(path.join(__dirname, f), 'utf8') };
  }
  // Test fixtures are passed in rather than filed under contracts/, which holds
  // only what actually gets deployed.
  for (const [name, content] of Object.entries(inline)) sources['contracts/' + name] = { content };
  const out = JSON.parse(solc.compile(
    JSON.stringify({ language: 'Solidity', sources, settings: SETTINGS }),
    { import: findImports },
  ));
  const errors = (out.errors || []).filter(e => e.severity === 'error');
  if (errors.length) throw new Error('solc:\n' + errors.map(e => e.formattedMessage).join('\n'));
  return out;
}

/// Bytecode plus ABI for one contract, by file and name.
function artifact(out, file, name) {
  const c = out.contracts['contracts/' + file] && out.contracts['contracts/' + file][name];
  if (!c) throw new Error(`compiled output has no ${name} in ${file}`);
  return {
    abi: c.abi,
    bytecode: c.evm.bytecode.object,
    deployedSize: c.evm.deployedBytecode.object.length / 2,
  };
}

module.exports = { compile, artifact, findImports, SETTINGS };
