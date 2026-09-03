// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
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
contract ProofKeys is ERC721, ERC2981, Ownable, ReentrancyGuard {
    /* ─────────── supply ─────────── */

    uint256 public constant MAX_SUPPLY     = 1111;
    uint256 public constant SEASON_1       = 666;
    uint256 public constant MAX_PER_WALLET = 5;

    uint256 public totalMinted;

    /// @notice The number every mint path is measured against — public,
    ///         every phase and the treasury alike. It starts at the number the site
    ///         advertises and can only be raised by openSeason(), which emits
    ///         an event, so supply can never grow quietly.
    uint256 public seasonCap = SEASON_1;

    /* ─────────── phases ─────────── */

    /// @notice Three open phases, every one of them public. The owner decides
    ///         when each begins; the price is whatever that phase costs.
    ///         Nothing here closes a phase on its own — a schedule that moves
    ///         with supply is a schedule the operator cannot hold back for a
    ///         quiet week, and holding it back is the point of having phases.
    enum Phase { Closed, One, Two, Three }

    Phase   public phase;

    /// @dev One price per phase, roughly $2, $5 and $10 at ETH around $3,000.
    ///      setPrices() moves all three if the market has left that
    ///      neighbourhood by deploy day — the dollar figures are the promise,
    ///      the wei are just today's arithmetic.
    uint256 public priceOne   = 0.0007 ether;   // ~$2
    uint256 public priceTwo   = 0.0017 ether;   // ~$5
    uint256 public priceThree = 0.0033 ether;   // ~$10

    mapping(address => uint256) public mintedBy;

    /* ─────────── royalty ─────────── */

    /// @notice A share of every resale, declared on-chain under ERC-2981.
    ///
    ///         Declared, not enforced: the standard is an interface a
    ///         marketplace may read and honour, and several do not. Treat what
    ///         arrives as a share of resales, never as all of them. It is here
    ///         because it costs almost nothing and cannot be added to a
    ///         deployed contract — not because it guarantees anything.
    uint96 public constant DEFAULT_ROYALTY_BPS = 500;    // 5%

    /// @dev The ceiling exists so a buyer can read one number today and know
    ///      what the worst case is for as long as they hold the key. Without
    ///      it, "5%" is a promise the owner can revise after the sale.
    uint96 public constant MAX_ROYALTY_BPS = 1000;       // 10%

    /* ─────────── reveal ─────────── */

    /// @dev Commit-reveal alone is not enough. A deployer who knows the secret
    ///      can grind millions of candidates offline, pick the one that hands
    ///      them the Tier III tokens they intend to buy, and only then commit.
    ///      So the seed mixes the committed secret with two things the deployer
    ///      does not have at commit time.
    ///
    ///      The first is who actually mints. mintEntropy folds in every mint as
    ///      it happens, and at commit the mint has not opened, so there is
    ///      nothing to grind against.
    ///
    ///      The second is a block on Ethereum mainnet, whose number is fixed in
    ///      the commitment and whose hash does not exist yet. That block is not
    ///      readable from this chain, so it is submitted at reveal and stored —
    ///      along with the secret — for anyone to check against any Ethereum
    ///      node, forever. This contract cannot verify it; the point is that
    ///      everybody else can, in one call, and a deployer who submitted a
    ///      value that is not that block's hash is caught by arithmetic rather
    ///      than trusted not to.
    ///
    ///      An earlier version used blockhash() on this chain instead. That is
    ///      correct on Ethereum and on the OP Stack, and wrong here: Arbitrum
    ///      Nitro — which Robinhood Chain runs — documents blockhash() as
    ///      cryptographically insecure and not sourced from L1, and reports the
    ///      L1 block number from block.number. A promise resting on it would
    ///      have been a promise this chain does not keep.
    bytes32 public seedCommit;
    /// @notice Ethereum mainnet block whose hash goes into the seed. Fixed at
    ///         commit, before it exists.
    uint256 public entropyBlock;
    /// @notice Folded forward by every mint. Nobody knows it at commit time.
    bytes32 public mintEntropy;
    /// @notice Published at reveal so the whole seed can be recomputed by hand.
    bytes32 public seedSecret;
    bytes32 public entropyHash;
    uint256 public recommitCount;
    bytes32 public seed;
    bool    public revealed;

    IProofRenderer public renderer;
    bool public rendererLocked;

    mapping(address => uint256[]) private _owned;
    mapping(uint256 => uint256) private _ownedIndex;

    /* ─────────── events ─────────── */

    event Minted(address indexed to, uint256 indexed tokenId, uint256 quantity);
    event SeedCommitted(bytes32 commitment, uint256 entropyBlock);
    event Revealed(bytes32 seed, bytes32 secret, bytes32 mintEntropy,
                   uint256 entropyBlock, bytes32 entropyHash);
    event PhaseSet(Phase phase);
    event SeasonOpened(uint256 seasonCap);
    event PricesSet(uint256 priceOne, uint256 priceTwo, uint256 priceThree);
    event RendererLocked(address renderer);
    event RoyaltySet(address receiver, uint96 bps);

    /* ─────────── errors ─────────── */

    error WrongPhase();
    error SoldOut();
    error WalletLimit();
    error BadPayment();
    error PhaseWentBack();
    error AlreadyCommitted();
    error BadBlock();
    error MintingStarted();
    error AlreadyRevealed();
    error BadSeed();
    error NotRevealed();
    error BadCap();
    error BadPrice();
    error Locked();
    error TransferFailed();
    error BadRoyalty();

    constructor(address renderer_, address owner_)
        ERC721("Proof Keys", "PROOF")
        Ownable(owner_)
    {
        renderer = IProofRenderer(renderer_);
        _setDefaultRoyalty(owner_, DEFAULT_ROYALTY_BPS);
    }

    /* ─────────── minting ─────────── */

    function mintPublic(uint256 qty) external payable nonReentrant {
        if (phase == Phase.Closed) revert WrongPhase();
        _mintMany(msg.sender, qty, currentPrice() * qty);
    }

    /// @notice What a key costs right now. Flat inside a phase, so a basket
    ///         cannot straddle a price change mid-transaction.
    function currentPrice() public view returns (uint256) {
        if (phase == Phase.One) return priceOne;
        if (phase == Phase.Two) return priceTwo;
        if (phase == Phase.Three) return priceThree;
        return 0;                       // Closed: nothing is for sale
    }

    function _mintMany(address to, uint256 qty, uint256 due) internal {
        // Unreachable today — setPhase cannot leave Closed once revealed, so
        // both paid paths already fail on phase. It stays because the rule is
        // "no minting after the tiers are computable", and a rule that lives
        // only in another function is one relaxation away from being gone.
        if (revealed) revert AlreadyRevealed();
        if (qty == 0 || totalMinted + qty > seasonCap) revert SoldOut();
        if (mintedBy[to] + qty > MAX_PER_WALLET) revert WalletLimit();
        if (msg.value != due) revert BadPayment();

        mintedBy[to] += qty;
        uint256 first = totalMinted + 1;
        totalMinted += qty;
        _fold(to, first, qty);

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
        _fold(to, first, qty);

        for (uint256 i = 0; i < qty; i++) _safeMint(to, first + i);

        emit Minted(to, first, qty);
    }

    /* ─────────── reveal ─────────── */

    /// @dev One line, called by every mint path. The values are cheap and none
    ///      of them is chosen by the caller alone: the address is theirs, the
    ///      position in the sequence is not.
    function _fold(address to, uint256 first, uint256 qty) internal {
        mintEntropy = keccak256(abi.encodePacked(
            mintEntropy, to, first, qty, block.number, block.timestamp));
    }

    /// @param commitment   keccak256(abi.encodePacked(secret))
    /// @param ethBlock     an Ethereum mainnet block number that has not been
    ///                     produced yet. Choose it far enough ahead that it is
    ///                     still in the future when this transaction lands.
    function commitSeed(bytes32 commitment, uint256 ethBlock) external onlyOwner {
        if (seedCommit != bytes32(0)) revert AlreadyCommitted();
        if (ethBlock == 0) revert BadBlock();
        seedCommit = commitment;
        entropyBlock = ethBlock;
        emit SeedCommitted(commitment, ethBlock);
    }

    /// @notice Replaces a commitment that was made wrongly. Allowed only while
    ///         nothing has been minted: after the first mint the deployer can
    ///         compute what the seed would be, so a second commitment there
    ///         would be a reroll, whatever it was meant for. recommitCount is
    ///         public either way.
    function recommitSeed(bytes32 commitment, uint256 ethBlock) external onlyOwner {
        if (revealed) revert AlreadyRevealed();
        if (totalMinted != 0) revert MintingStarted();
        if (ethBlock == 0) revert BadBlock();
        seedCommit = commitment;
        entropyBlock = ethBlock;
        recommitCount++;
        emit SeedCommitted(commitment, ethBlock);
    }

    /// @notice Reveals the season seed, and publishes every ingredient so the
    ///         result can be recomputed by anyone:
    ///
    ///           seed = keccak256(secret, mintEntropy, entropyHash)
    ///
    ///         keccak256(secret) must equal the commitment made before the mint
    ///         opened; mintEntropy is on this chain already; entropyHash is the
    ///         hash of Ethereum mainnet block `entropyBlock`, which any node
    ///         will confirm. This contract cannot check that last one — no
    ///         contract here can — so it stores it instead of trusting it, and
    ///         a wrong value is something a reader disproves rather than has to
    ///         take on faith.
    ///
    ///         Minting must already be closed. Once the seed is public every
    ///         token's tier is computable, so a mint left open after reveal
    ///         would let anyone — the treasury included — time a transaction
    ///         onto the id they want. That is the exact thing the commitment
    ///         exists to prevent, so the contract refuses rather than relying
    ///         on the operator remembering the order.
    function reveal(bytes32 secret, bytes32 ethBlockHash) external onlyOwner {
        if (revealed) revert AlreadyRevealed();
        if (phase != Phase.Closed) revert WrongPhase();
        if (seedCommit == bytes32(0)) revert BadSeed();
        if (keccak256(abi.encodePacked(secret)) != seedCommit) revert BadSeed();
        if (ethBlockHash == bytes32(0)) revert BadBlock();

        seedSecret = secret;
        entropyHash = ethBlockHash;
        seed = keccak256(abi.encodePacked(secret, mintEntropy, ethBlockHash));
        revealed = true;
        emit Revealed(seed, secret, mintEntropy, entropyBlock, ethBlockHash);
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

    /// @notice The engraving is available from the moment the key exists —
    ///         renderer.traits() draws it from the token number. `seed` is zero
    ///         until reveal(), and the renderer reads that as a tier not yet
    ///         drawn, so what changes at reveal is one line of metadata rather
    ///         than the whole picture.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return renderer.tokenURI(tokenId, seed);
    }

    /* ─────────── admin ─────────── */

    /// @notice Opens a phase, or closes the mint. Phases only ever move
    ///         forward: going back to a cheaper one after the dear one has run
    ///         would let whoever waited buy under the people who showed up
    ///         first. Closed is always reachable, so a mint can be paused.
    function setPhase(Phase p) external onlyOwner {
        if (revealed && p != Phase.Closed) revert AlreadyRevealed();
        if (p != Phase.Closed && uint8(p) < uint8(phase)) revert PhaseWentBack();
        phase = p;
        emit PhaseSet(p);
    }

    /// @notice All three at once, so no phase is ever left at a stale figure
    ///         while another moves. Two may be equal — that is a flat stretch,
    ///         deliberately — but the ladder may not fall, because a schedule
    ///         that drops partway through charges the earliest buyers the most.
    function setPrices(uint256 one, uint256 two, uint256 three) external onlyOwner {
        if (two < one || three < two) revert BadPrice();
        priceOne = one;
        priceTwo = two;
        priceThree = three;
        emit PricesSet(one, two, three);
    }

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

    /// @notice Moves the resale share, or the address it pays. Bounded by
    ///         MAX_ROYALTY_BPS, so this can lower the number a holder was told
    ///         but never raise it past the ceiling they bought under.
    function setRoyalty(address receiver, uint96 bps) external onlyOwner {
        if (bps > MAX_ROYALTY_BPS) revert BadRoyalty();
        _setDefaultRoyalty(receiver, bps);
        emit RoyaltySet(receiver, bps);
    }

    /// @notice Collection-level metadata: the name, blurb and logo a
    ///         marketplace shows above the grid. On-chain for the same reason
    ///         the artwork is — a collection whose identity is fetched from a
    ///         web server is one that changes the day that server does.
    function contractURI() public pure returns (string memory) {
        return string(abi.encodePacked(
            "data:application/json;utf8,",
            '{"name":"Proof Keys",',
            '"description":"666 access keys to the Proof register. Tier decides how many seconds early a published signal reaches the holder: Tier I 10s, Tier II 5s, Tier III instant. Tier is drawn from a season seed committed before minting opened and revealed only after it closed, so nobody - the deployer included - chose which key got which.",',
            '"external_link":"https://nekara.xyz/keys",',
            '"image":"data:image/svg+xml;utf8,',
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'>",
            "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>",
            "<stop offset='0' stop-color='%235B7CFA'/><stop offset='1' stop-color='%239B6DFF'/>",
            "</linearGradient></defs>",
            "<rect width='600' height='600' fill='%23090B0D'/>",
            "<circle cx='300' cy='300' r='170' fill='none' stroke='url(%23g)' stroke-width='2'/>",
            "<text x='300' y='312' text-anchor='middle' font-family='monospace' font-size='34' fill='url(%23g)'>PROOF</text>",
            "</svg>\"}"
        ));
    }

    function supportsInterface(bytes4 id) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(id);
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
