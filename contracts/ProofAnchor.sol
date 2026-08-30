// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * Publishes the register's integrity chain somewhere the register's operator
 * cannot reach it.
 *
 * The hash chain in the engine proves the register is internally consistent.
 * On its own that catches accidental corruption and nothing else: whoever can
 * write the register can also recompute every hash in it and be consistent
 * again. What they cannot do is reach back and change a value already written
 * to this contract.
 *
 * Two commitments per anchor:
 *
 *   chainHead   the head of the hash chain at seqTo, so the register's shape
 *               is pinned as a whole
 *   merkleRoot  root over that window's record hashes, so any single call can
 *               be proved against the anchor without publishing the rest
 *
 * seqTo must strictly increase. Without that the owner could anchor a long
 * history, rewrite it shorter, and anchor again — a fresh anchor at or below a
 * seq already covered is the shape of exactly that attempt, so it reverts.
 *
 * There is no update, no delete, and no owner transfer. Losing the key stops
 * anchoring, which is visible to everyone; it cannot rewrite anything.
 */
contract ProofAnchor {
    struct Anchor {
        uint64  seqTo;
        uint64  publishedAt;
        bytes32 chainHead;
        bytes32 merkleRoot;
    }

    address public immutable owner;
    Anchor[] private _anchors;

    event Anchored(uint256 indexed id, uint64 indexed seqTo, bytes32 chainHead, bytes32 merkleRoot);

    error NotOwner();
    error NotMonotonic(uint64 given, uint64 last);
    error NoSuchAnchor();

    constructor(address owner_) {
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function anchor(uint64 seqTo, bytes32 chainHead, bytes32 merkleRoot)
        external onlyOwner returns (uint256 id)
    {
        uint256 n = _anchors.length;
        if (n != 0) {
            uint64 last = _anchors[n - 1].seqTo;
            if (seqTo <= last) revert NotMonotonic(seqTo, last);
        }
        id = n;
        _anchors.push(Anchor(seqTo, uint64(block.timestamp), chainHead, merkleRoot));
        emit Anchored(id, seqTo, chainHead, merkleRoot);
    }

    function count() external view returns (uint256) {
        return _anchors.length;
    }

    function anchorAt(uint256 id) external view returns (Anchor memory) {
        if (id >= _anchors.length) revert NoSuchAnchor();
        return _anchors[id];
    }

    function latest() external view returns (Anchor memory) {
        uint256 n = _anchors.length;
        if (n == 0) revert NoSuchAnchor();
        return _anchors[n - 1];
    }

    /**
     * Anyone can check one call against a published anchor. sha256 with sorted
     * pairs, matching merkle.js — sorted so the proof carries no position bits,
     * sha256 because it is a precompile here and the same primitive the engine
     * already hashes records with.
     */
    function verify(uint256 id, bytes32 leaf, bytes32[] calldata proof)
        external view returns (bool)
    {
        if (id >= _anchors.length) revert NoSuchAnchor();
        bytes32 h = leaf;
        for (uint256 i = 0; i < proof.length; ++i) {
            bytes32 s = proof[i];
            h = h <= s ? sha256(abi.encodePacked(h, s)) : sha256(abi.encodePacked(s, h));
        }
        return h == _anchors[id].merkleRoot;
    }
}
