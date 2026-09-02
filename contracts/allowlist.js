// The allowlist root, and the proofs that open it.
//
// One implementation, used twice: this is what the operator runs to publish a
// root, and it is also what contracts/test-keys.js checks against the real
// MerkleProof verifier on a real EVM. A second copy written for the tooling
// would be a copy that has never been verified against the chain.
//
//   node contracts/allowlist.js addresses.txt          prints the root
//   node contracts/allowlist.js addresses.txt out.json writes every proof too
//
// addresses.txt is one address per line; blanks and # comments are ignored.
const fs = require('fs');
const { keccak256 } = require('ethereumjs-util');

const hex = b => '0x' + b.toString('hex');

/// OpenZeppelin hashes each pair in sorted order, so a proof carries no
/// left/right flags. Reproduce that exactly or the root will not verify.
const pair = (x, y) => Buffer.compare(x, y) <= 0
  ? keccak256(Buffer.concat([x, y]))
  : keccak256(Buffer.concat([y, x]));

/// The leaf ProofKeys.mintAllowlist builds: keccak256(abi.encodePacked(msg.sender)).
const leafOf = a => keccak256(Buffer.from(normalize(a).slice(2), 'hex'));

function normalize(a) {
  const s = String(a).trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(s)) throw new Error('not an address: ' + a);
  return s;
}

/// Builds the tree. Duplicate addresses are rejected rather than deduplicated:
/// a list that says the same wallet twice is a list somebody got wrong, and
/// silently accepting it publishes a root nobody meant to publish.
function merkle(addresses) {
  const seen = new Set();
  for (const a of addresses) {
    const n = normalize(a);
    if (seen.has(n)) throw new Error('duplicate address in the list: ' + n);
    seen.add(n);
  }
  if (!addresses.length) throw new Error('empty allowlist');

  const leaves = addresses.map(leafOf);
  const layers = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const cur = layers[layers.length - 1], next = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push(i + 1 < cur.length ? pair(cur[i], cur[i + 1]) : cur[i]);
    }
    layers.push(next);
  }

  return {
    root: layers[layers.length - 1][0],
    proof(a) {
      const want = leafOf(a);
      let idx = leaves.findIndex(l => l.equals(want));
      if (idx < 0) throw new Error('not on the allowlist: ' + a);
      const p = [];
      for (let d = 0; d < layers.length - 1; d++) {
        const sib = idx ^ 1;
        if (sib < layers[d].length) p.push(layers[d][sib]);
        idx >>= 1;
      }
      return p;
    },
  };
}

module.exports = { merkle, leafOf, pair, normalize };

if (require.main === module) {
  const [file, outFile] = process.argv.slice(2);
  if (!file) {
    console.error('usage: node contracts/allowlist.js addresses.txt [proofs.json]');
    process.exit(1);
  }
  const addresses = fs.readFileSync(file, 'utf8')
    .split('\n').map(l => l.split('#')[0].trim()).filter(Boolean);
  const t = merkle(addresses);

  console.log(`${addresses.length} alamat`);
  console.log(`root  ${hex(t.root)}`);
  console.log(`\nsetAllowlistRoot(${hex(t.root)})`);

  if (outFile) {
    const proofs = {};
    for (const a of addresses) proofs[normalize(a)] = t.proof(a).map(hex);
    fs.writeFileSync(outFile, JSON.stringify({ root: hex(t.root), proofs }, null, 2));
    console.log(`\nbukti per alamat -> ${outFile}`);
  }
}
