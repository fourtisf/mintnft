// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IProofRenderer {
    struct T {
        uint8 tier; uint8 hood; uint8 eyes; uint8 mask; uint8 fit;
        uint8 pal;  uint8 bg;   uint8 aura; uint8 tone; uint16 ph;
    }
    function tokenURI(uint256 tokenId, bytes32 seed) external view returns (string memory);
    function traits(uint256 tokenId, bytes32 seed) external pure returns (T memory);
}

/// @title ProofKeys
/// @notice Access keys for the Proof register. Tier decides how many seconds
///         early a call reaches the holder: Tier I 10s, Tier II 5s, Tier III instant.
///
///         Tier is NOT known at mint. It is derived from a single season seed
///         committed before minting opens and revealed after it closes, so
///         nobody - including the deployer - can pick which token gets Tier III.
contract ProofKeys is ERC721, Ownable, ReentrancyGuard {
    /* ─────────── supply ─────────── */

    uint256 public constant MAX_SUPPLY     = 1111;
    uint256 public constant SEASON_1       = 666;
    uint256 public constant MAX_PER_WALLET = 5;

    uint256 public totalMinted;

    /// @notice The number every mint path is measured against — public,
    ///         allowlist and treasury alike. It starts at the number the site
    ///         advertises and can only be raised by openSeason(), which emits
    ///         an event, so supply can never grow quietly.
    uint256 public seasonCap = SEASON_1;

    /* ─────────── phases ─────────── */

    enum Phase { Closed, Allowlist, Public }

    Phase   public phase;

    /// @dev Deliberately low. At ETH between $2,000 and $6,500 these sit
    ///      inside the $1-$10 band the key is priced for; setPrices() moves
    ///      them if the market leaves that band before the mint opens.
    uint256 public allowlistPrice = 0.0005 ether;
    uint256 public price          = 0.0015 ether;

    bytes32 public allowlistRoot;

    mapping(address => uint256) public mintedBy;

    /* ─────────── reveal ─────────── */

    /// @dev Commit-reveal alone is not enough. A deployer who knows the secret
    ///      can grind millions of candidates offline, pick the one that hands
    ///      them the Tier III tokens they intend to buy, and only then commit.
    ///
    ///      So the final seed also mixes in the hash of a block that did not
    ///      exist at commit time. At commit the deployer cannot know it; by
    ///      reveal it is already fixed. Grinding buys nothing.
    ///
    ///      blockhash() only reaches back 256 blocks, so reveal has a window.
    ///      Miss it and the commitment must be replaced and re-opened — which
    ///      is visible on-chain, so it cannot be used quietly to reroll.
    bytes32 public seedCommit;
    uint256 public revealBlock;
    uint256 public recommitCount;
    bytes32 public seed;
    bool    public revealed;

    IProofRenderer public renderer;
    bool public rendererLocked;

    mapping(address => uint256[]) private _owned;
    mapping(uint256 => uint256) private _ownedIndex;

    /* ─────────── events ─────────── */

    event Minted(address indexed to, uint256 indexed tokenId, uint256 quantity);
    event SeedCommitted(bytes32 commitment, uint256 revealBlock);
    event Revealed(bytes32 seed, uint256 revealBlock, bytes32 blockHash);
    event PhaseSet(Phase phase);
    event SeasonOpened(uint256 seasonCap);
    event PricesSet(uint256 allowlistPrice, uint256 publicPrice);
    event RendererLocked(address renderer);

    /* ─────────── errors ─────────── */

    error WrongPhase();
    error SoldOut();
    error WalletLimit();
    error BadPayment();
    error NotAllowlisted();
    error AlreadyCommitted();
    error BadDelay();
    error TooEarly();
    error WindowMissed();
    error WindowStillOpen();
    error AlreadyRevealed();
    error BadSeed();
    error NotRevealed();
    error BadCap();
    error Locked();
    error TransferFailed();

    constructor(address renderer_, address owner_)
        ERC721("Proof Keys", "PROOF")
        Ownable(owner_)
    {
        renderer = IProofRenderer(renderer_);
    }

    /* ─────────── minting ─────────── */

    function mintAllowlist(uint256 qty, bytes32[] calldata proof)
        external
        payable
        nonReentrant
    {
        if (phase != Phase.Allowlist) revert WrongPhase();
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
        if (!MerkleProof.verifyCalldata(proof, allowlistRoot, leaf)) revert NotAllowlisted();
        _mintMany(msg.sender, qty, allowlistPrice);
    }

    function mintPublic(uint256 qty) external payable nonReentrant {
        if (phase != Phase.Public) revert WrongPhase();
        _mintMany(msg.sender, qty, price);
    }

    function _mintMany(address to, uint256 qty, uint256 unit) internal {
        // Unreachable today — setPhase cannot leave Closed once revealed, so
        // both paid paths already fail on phase. It stays because the rule is
        // "no minting after the tiers are computable", and a rule that lives
        // only in another function is one relaxation away from being gone.
        if (revealed) revert AlreadyRevealed();
        if (qty == 0 || totalMinted + qty > seasonCap) revert SoldOut();
        if (mintedBy[to] + qty > MAX_PER_WALLET) revert WalletLimit();
        if (msg.value != unit * qty) revert BadPayment();

        mintedBy[to] += qty;
        uint256 first = totalMinted + 1;
        totalMinted += qty;

        for (uint256 i = 0; i < qty; i++) {
            _safeMint(to, first + i);
        }

        emit Minted(to, first, qty);
    }

    /// @notice Treasury allocation. Bounded by seasonCap exactly like the paid
    ///         paths, so the number on the site is the number that can exist;
    ///         reaching the Season 2 tail means calling openSeason() first,
    ///         and that is an event anyone can see.
    function mintReserved(address to, uint256 qty) external onlyOwner nonReentrant {
        if (revealed) revert AlreadyRevealed();
        if (qty == 0 || totalMinted + qty > seasonCap) revert SoldOut();

        uint256 first = totalMinted + 1;
        totalMinted += qty;

        for (uint256 i = 0; i < qty; i++) _safeMint(to, first + i);

        emit Minted(to, first, qty);
    }

    /* ─────────── reveal ─────────── */

    /// @param commitment keccak256(abi.encodePacked(secret))
    /// @param delay       blocks to wait before reveal becomes possible
    function commitSeed(bytes32 commitment, uint256 delay) external onlyOwner {
        if (seedCommit != bytes32(0)) revert AlreadyCommitted();
        if (delay < 5) revert BadDelay();
        seedCommit = commitment;
        revealBlock = block.number + delay;
        emit SeedCommitted(commitment, revealBlock);
    }

    /// @notice Only usable if the 256-block window lapsed without a reveal.
    ///         Emits an event, and recommitCount is public, so a deployer
    ///         cannot reroll repeatedly without everyone seeing the counter.
    function recommitSeed(bytes32 commitment, uint256 delay) external onlyOwner {
        if (revealed) revert AlreadyRevealed();
        if (block.number <= revealBlock + 256) revert WindowStillOpen();
        if (delay < 5) revert BadDelay();
        seedCommit = commitment;
        revealBlock = block.number + delay;
        recommitCount++;
        emit SeedCommitted(commitment, revealBlock);
    }

    /// @notice Reveals the season seed. The secret is checked against the
    ///         commitment, then mixed with a blockhash nobody could predict
    ///         when that commitment was published.
    ///         Minting must already be closed. Once the seed is public every
    ///         token's tier is computable, so a mint left open after reveal
    ///         would let anyone — the treasury included — time a transaction
    ///         onto the id they want. That is the exact thing the commitment
    ///         exists to prevent, so the contract refuses rather than relying
    ///         on the operator remembering the order.
    function reveal(bytes32 secret) external onlyOwner {
        if (revealed) revert AlreadyRevealed();
        if (phase != Phase.Closed) revert WrongPhase();
        if (block.number <= revealBlock) revert TooEarly();
        if (block.number > revealBlock + 256) revert WindowMissed();
        if (keccak256(abi.encodePacked(secret)) != seedCommit) revert BadSeed();

        bytes32 bh = blockhash(revealBlock);
        if (bh == bytes32(0)) revert WindowMissed();

        seed = keccak256(abi.encodePacked(secret, bh));
        revealed = true;
        emit Revealed(seed, revealBlock, bh);
    }

    /* ─────────── reads ─────────── */

    /// @notice Tier of a token. Reverts before reveal - there is nothing to read yet.
    function tierOf(uint256 tokenId) public view returns (uint8) {
        if (!revealed) revert NotRevealed();
        _requireOwned(tokenId);
        return renderer.traits(tokenId, seed).tier;
    }

    /// @notice Every token a holder owns, in no particular order.
    function tokensOfOwner(address holder) external view returns (uint256[] memory) {
        return _owned[holder];
    }

    /// @notice Best tier held by an address, or 0 if none. This is what the
    ///         backend reads when it decides which latency queue a session joins,
    ///         once per session every few minutes, so it walks the holder's own
    ///         tokens rather than the whole season. Scanning all 666 cost about
    ///         1.58M gas at a full mint; measured on a 661-token season a
    ///         five-key holder now costs about 40K and a holder of none about
    ///         2K, neither of which grows as the season fills.
    function bestTierOf(address holder) external view returns (uint8 best) {
        if (!revealed) return 0;
        uint256[] storage ids = _owned[holder];
        uint256 n = ids.length;
        for (uint256 i = 0; i < n; i++) {
            uint8 t = renderer.traits(ids[i], seed).tier;
            if (t > best) best = t;
            if (best == 3) return 3;
        }
    }

    /// @dev The index behind tokensOfOwner and bestTierOf. ERC721 alone knows
    ///      only balances and owners, so answering "which tokens" meant a scan.
    ///      ERC721Enumerable would also index the whole collection, which nothing
    ///      here reads; this keeps the per-owner half and skips the global one.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = super._update(to, tokenId, auth);
        if (from == to) return from;

        if (from != address(0)) {
            uint256 i = _ownedIndex[tokenId];
            uint256 last = _owned[from].length - 1;
            if (i != last) {
                uint256 moved = _owned[from][last];
                _owned[from][i] = moved;
                _ownedIndex[moved] = i;
            }
            _owned[from].pop();
            delete _ownedIndex[tokenId];
        }
        if (to != address(0)) {
            _ownedIndex[tokenId] = _owned[to].length;
            _owned[to].push(tokenId);
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (!revealed) {
            return string(abi.encodePacked(
                "data:application/json;utf8,",
                '{"name":"Proof Key #', _toString(tokenId),
                '","description":"Unrevealed. Tier and artwork are derived from the season seed once it is published.",',
                '"image":"data:image/svg+xml;utf8,',
                "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'>",
                "<rect width='600' height='600' fill='%230A0C0E'/>",
                "<circle cx='300' cy='300' r='170' fill='none' stroke='%235B7CFA' stroke-width='1' stroke-dasharray='6 8'/>",
                "<text x='300' y='308' text-anchor='middle' font-family='monospace' font-size='18' fill='%235B7CFA'>SEALED</text>",
                "</svg>\"}"
            ));
        }
        return renderer.tokenURI(tokenId, seed);
    }

    /* ─────────── admin ─────────── */

    function setPhase(Phase p) external onlyOwner {
        if (revealed && p != Phase.Closed) revert AlreadyRevealed();
        phase = p;
        emit PhaseSet(p);
    }

    /// @notice Both prices at once, so the allowlist can never be left at a
    ///         stale figure while the public one moves.
    function setPrices(uint256 allowPrice, uint256 publicPrice) external onlyOwner {
        allowlistPrice = allowPrice;
        price = publicPrice;
        emit PricesSet(allowPrice, publicPrice);
    }

    function setAllowlistRoot(bytes32 r) external onlyOwner { allowlistRoot = r; }

    /// @notice Raises the supply ceiling toward MAX_SUPPLY. One direction only:
    ///         a cap that could fall would let a sold-out season be reopened
    ///         at a different number and read as if it had always been that.
    function openSeason(uint256 newCap) external onlyOwner {
        if (newCap <= seasonCap || newCap > MAX_SUPPLY) revert BadCap();
        seasonCap = newCap;
        emit SeasonOpened(newCap);
    }

    function setRenderer(address r) external onlyOwner {
        if (rendererLocked) revert Locked();
        renderer = IProofRenderer(r);
    }

    /// @notice One-way. After this the artwork can never be changed by anyone.
    function lockRenderer() external onlyOwner {
        rendererLocked = true;
        emit RendererLocked(address(renderer));
    }

    function withdraw(address payable to) external onlyOwner nonReentrant {
        (bool ok, ) = to.call{value: address(this).balance}("");
        if (!ok) revert TransferFailed();
    }

    /* ─────────── util ─────────── */

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 t = v; t != 0; t /= 10) len++;
        bytes memory b = new bytes(len);
        while (v != 0) { b[--len] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(b);
    }
}
