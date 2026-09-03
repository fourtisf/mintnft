// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Base64.sol";

interface IProofParts {
    function bg(uint8 i, string memory a, string memory b, string memory uid) external pure returns (bytes memory);
    function fit(uint8 i, string memory a, string memory skin) external pure returns (bytes memory);
    function head(string memory skin, string memory a, string memory b) external pure returns (bytes memory);
    function hood(uint8 i, string memory a) external pure returns (bytes memory);
    function over(uint8 i, string memory a) external pure returns (bytes memory);
    function eyes(uint8 i, string memory a, string memory b) external pure returns (bytes memory);
    function mask(uint8 i, string memory a) external pure returns (bytes memory);
    function aura(uint8 i, string memory a, string memory uid) external pure returns (bytes memory);
}

/// @title ProofRenderer v3
/// @notice Draws a Proof Key on-chain: a hooded operator built from flat vector
///         layers, animated with SMIL so the motion travels with the token.
///
///  Trait derivation here is the authority and the website reproduces it
///  exactly — same seed fold, same mulberry32 stream, same integer comparisons,
///  same guard rules. Verified token by token; see the parity test.
contract ProofRenderer {
    IProofParts public immutable parts;

    constructor(address parts_) { parts = IProofParts(parts_); }

    struct T {
        uint8 tier; uint8 hood; uint8 eyes; uint8 mask; uint8 fit;
        uint8 pal;  uint8 bg;   uint8 aura; uint8 tone; uint16 ph;
    }

    /* ─────────── the stream ─────────── */

    function _next(uint32 s) internal pure returns (uint32 ns, uint32 v) {
        unchecked {
            ns = s + 0x6D2B79F5;
            uint32 t = uint32(uint256(ns ^ (ns >> 15)) * uint256(uint32(1 | ns)));
            t = (t + uint32(uint256(t ^ (t >> 7)) * uint256(uint32(61 | t)))) ^ t;
            v = t ^ (t >> 14);
        }
    }

    /// @dev Folds all 256 seed bits in, then decorrelates adjacent ids.
    ///      The strength here is not the security boundary — fairness comes
    ///      from the seed being unpredictable at commit time. See ProofKeys.
    function _seed32(bytes32 seed, uint256 tokenId) internal pure returns (uint32 s) {
        unchecked {
            uint256 x = uint256(seed);
            uint32 f;
            for (uint256 i; i < 8; i++) { f ^= uint32(x); x >>= 32; }
            s = f + uint32(tokenId * 2654435761);
            (s, ) = _next(s); (s, ) = _next(s); (s, ) = _next(s);
        }
    }

    function _pick(uint32 v, uint16[] memory w) internal pure returns (uint8) {
        uint256 tot; for (uint256 i; i < w.length; i++) tot += w[i];
        uint256 x = uint256(v) * tot; uint256 cum;
        for (uint256 i; i < w.length; i++) {
            cum += w[i];
            if (x < cum << 32) return uint8(i);
        }
        return uint8(w.length - 1);
    }
    function _w(uint16[8] memory a, uint256 n) internal pure returns (uint16[] memory o) {
        o = new uint16[](n); for (uint256 i; i < n; i++) o[i] = a[i];
    }

    /* ─────────── traits ─────────── */

    /// @notice Two draws, deliberately separate.
    ///
    ///         The engraving comes from the token number alone, so it exists
    ///         the moment a key is minted and never changes. A buyer sees what
    ///         they bought instead of a placeholder for however long the season
    ///         runs.
    ///
    ///         The tier comes from the season seed, which is committed before
    ///         minting opens and published after it closes. That is the half
    ///         worth timing a purchase around, and it is the half nobody —
    ///         including the deployer — can see in advance. A zero seed means
    ///         the draw has not run: tier 0, rendered as undrawn rather than
    ///         as Tier I.
    function traits(uint256 tokenId, bytes32 seed) public pure returns (T memory t) {
        uint32 s = _seed32(bytes32(0), tokenId); uint32 v;

        (s, v) = _next(s); t.hood = _pick(v, _w([uint16(20),16,14,13,12,10,9,6], 8));
        (s, v) = _next(s); t.eyes = _pick(v, _w([uint16(18),16,15,13,12,11,9,6], 8));
        (s, v) = _next(s); t.mask = _pick(v, _w([uint16(24),20,17,15,13,11,0,0], 6));
        (s, v) = _next(s); t.fit  = _pick(v, _w([uint16(24),20,17,15,13,11,0,0], 6));
        (s, v) = _next(s); t.pal  = _palPick(v);
        (s, v) = _next(s); t.bg   = _pick(v, _w([uint16(23),20,17,15,14,11,0,0], 6));
        (s, v) = _next(s); t.aura = _pick(v, _w([uint16(38),28,22,12,0,0,0,0], 4));
        (s, v) = _next(s); t.tone = _pick(v, _w([uint16(34),28,22,16,0,0,0,0], 4));
        (s, v) = _next(s); t.ph   = uint16((uint256(v) * 1000) >> 32);

        if (seed != bytes32(0)) {
            (uint32 d, uint32 r) = _next(_seed32(seed, tokenId));
            d;
            uint256 roll = (uint256(r) * 10000) >> 32;
            t.tier = roll < 991 ? 3 : (roll < 3994 ? 2 : 1);
        }

        t = _guard(t);
    }

    function _palPick(uint32 v) internal pure returns (uint8) {
        uint16[] memory w = new uint16[](10);
        uint16[10] memory a = [uint16(14),13,12,11,10,9,8,7,5,3];
        for (uint256 i; i < 10; i++) w[i] = a[i];
        return _pick(v, w);
    }

    /// @notice Removes combinations that render as a shapeless dark blob.
    ///         The same four rules run on the site.
    function _guard(T memory t) internal pure returns (T memory) {
        if (t.hood == 3 && t.eyes == 7 && t.bg == 4) t.bg = 0;
        if (t.bg >= 4 && t.aura == 0 && t.fit == 0) t.aura = 1;
        if (t.hood == 1 && t.mask == 1) t.mask = 0;
        if (t.hood == 5 && t.aura == 2) t.aura = 1;
        return t;
    }

    /* ─────────── svg ─────────── */

    function svg(uint256 tokenId, bytes32 seed) public view returns (string memory) {
        T memory t = traits(tokenId, seed);
        (string memory a, string memory b) = _pal(t.pal);
        string memory skin = _tone(t.tone);
        string memory uid = "k";

        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">',
            _defs(a, b, uid),
            parts.bg(t.bg, a, b, uid),
            parts.aura(t.aura, a, uid),
            _figure(t, a, b, skin),
            _crt(uid),
            _plate(tokenId, t.tier, a),
            '</svg>'
        ));
    }

    function _figure(T memory t, string memory a, string memory b, string memory skin)
        internal view returns (bytes memory)
    {
        return abi.encodePacked(
            // The whole figure breathes. One transform, applied to the group.
            '<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0"',
            ' dur="4.6s" calcMode="spline" keyTimes="0;0.5;1"',
            ' keySplines="0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite"/>',
            parts.fit(t.fit, a, skin),
            parts.head(skin, a, b),
            parts.hood(t.hood, a),
            _scan(b),
            // Blink: a dip to near zero, then a softer flicker later.
            '<g><animate attributeName="opacity" values="1;1;.05;1;1;.7;1"',
            ' keyTimes="0;0.62;0.645;0.67;0.88;0.925;1" dur="5.6s" repeatCount="indefinite"/>',
            parts.eyes(t.eyes, a, b), '</g>',
            parts.mask(t.mask, a),
            parts.over(t.hood, a),
            '</g>'
        );
    }

    function _scan(string memory b) internal pure returns (bytes memory) {
        return abi.encodePacked(
            '<rect x="228" y="196" width="144" height="3" fill="', b, '">',
            '<animate attributeName="y" values="200;318;200" dur="3.8s" repeatCount="indefinite"/>',
            '<animate attributeName="opacity" values="0;.55;0;0" keyTimes="0;.3;.62;1" dur="3.8s" repeatCount="indefinite"/></rect>');
    }

    function _crt(string memory uid) internal pure returns (bytes memory) {
        return abi.encodePacked(
            '<rect width="600" height="600" fill="url(#sl', uid, ')" opacity=".085">',
            '<animateTransform attributeName="patternTransform" type="translate" values="0 0;0 7" dur="1.1s" repeatCount="indefinite"/></rect>');
    }

    function _plate(uint256 id, uint8 tier, string memory a) internal pure returns (bytes memory) {
        return abi.encodePacked(
            '<rect x="34" y="514" width="152" height="52" rx="10" fill="#0A0C0E" stroke="', a,
            '" stroke-width=".9" opacity=".94"/>',
            '<text x="50" y="538" font-family="monospace" font-size="15" font-weight="600" fill="', a,
            '">', _pad4(id), '</text>',
            '<text x="50" y="554" font-family="monospace" font-size="8" letter-spacing="1.6" fill="#585E68">TIER ',
            _roman(tier), '</text>');
    }

    function _defs(string memory a, string memory b, string memory uid)
        internal pure returns (bytes memory)
    {
        return abi.encodePacked('<defs>',
            '<linearGradient id="fl', uid, '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="', a,
            '" stop-opacity="0"/><stop offset="1" stop-color="', a, '" stop-opacity=".13"/></linearGradient>',
            '<radialGradient id="ch', uid, '" cx="50%" cy="26%" r="72%"><stop offset="0" stop-color="', a,
            '" stop-opacity=".17"/><stop offset="1" stop-color="', a, '" stop-opacity="0"/></radialGradient>',
            '<linearGradient id="mo', uid, '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="', a,
            '" stop-opacity=".16"/><stop offset="1" stop-color="', b, '" stop-opacity=".02"/></linearGradient>',
            '<linearGradient id="nf', uid, '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="', b,
            '" stop-opacity=".15"/><stop offset=".55" stop-color="', a,
            '" stop-opacity=".04"/><stop offset="1" stop-color="#05070A" stop-opacity=".9"/></linearGradient>',
            '<radialGradient id="vg', uid, '" cx="50%" cy="42%" r="70%"><stop offset=".55" stop-color="#000" stop-opacity="0"/>',
            '<stop offset="1" stop-color="#000" stop-opacity=".72"/></radialGradient>',
            '<radialGradient id="au', uid, '"><stop offset="0" stop-color="', a,
            '" stop-opacity=".4"/><stop offset="1" stop-color="', a, '" stop-opacity="0"/></radialGradient>',
            '<pattern id="sl', uid, '" width="7" height="7" patternUnits="userSpaceOnUse">',
            '<rect width="7" height="2.4" fill="#9FB4C8"/></pattern></defs>');
    }

    /* ─────────── metadata ─────────── */

    function tokenURI(uint256 tokenId, bytes32 seed) external view returns (string memory) {
        T memory t = traits(tokenId, seed);
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(abi.encodePacked(
            '{"name":"Proof Key ', _pad4(tokenId),
            '","description":"One of 1111 Proof Keys. Tier sets how many seconds early each signal reaches the holder. Artwork and animation are generated on-chain from the token id and the season seed.",',
            '"attributes":[',
            '{"trait_type":"Tier","value":"',
            t.tier == 0 ? "Not drawn yet" : _roman(t.tier), '"},',
            '{"trait_type":"Headwear","value":"', _name(0, t.hood), '"},',
            '{"trait_type":"Eyes","value":"', _name(1, t.eyes), '"},',
            '{"trait_type":"Mask","value":"', _name(2, t.mask), '"},',
            '{"trait_type":"Outfit","value":"', _name(3, t.fit), '"},',
            '{"trait_type":"Palette","value":"', _name(4, t.pal), '"},',
            '{"trait_type":"Backdrop","value":"', _name(5, t.bg), '"},',
            '{"trait_type":"Aura","value":"', _name(6, t.aura), '"}',
            '],"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg(tokenId, seed))), '"}'
        ))));
    }

    function _name(uint8 group, uint8 i) public pure returns (string memory) {
        if (group == 0) return ["Hood","Visorhelm","Cap","Bare","Horned","Halo","Antenna","Crown"][i];
        if (group == 1) return ["Visor","Dots","Slits","Cyclops","Scanline","Cross","Wide","Hollow"][i];
        if (group == 2) return ["None","Respirator","Scarf","Grill","Bandana","Rebreather"][i];
        if (group == 3) return ["Plain","Collar","Plated","Straps","Zipped","Cloak"][i];
        if (group == 4) return ["Azure","Iris","Prism","Cyan","Orchid","Glacier","Verdant","Ember","Platinum","Gilt"][i];
        if (group == 5) return ["Chamber","Halation","Monolith","Aperture","Nightfall","Ashfall"][i];
        return ["None","Glow","Ring","Static"][i];
    }

    function _pal(uint8 i) internal pure returns (string memory, string memory) {
        if (i == 0) return ("#5B7CFA", "#7E8CFF");
        if (i == 1) return ("#7E8CFF", "#9B6DFF");
        if (i == 2) return ("#B39BFF", "#6FD8FF");
        if (i == 3) return ("#4FD1C5", "#5B7CFA");
        if (i == 4) return ("#9B6DFF", "#FF6FB5");
        if (i == 5) return ("#6FD8FF", "#A8FFEA");
        if (i == 6) return ("#3ECF8E", "#6FD8FF");
        if (i == 7) return ("#FFB86F", "#FF6F91");
        if (i == 8) return ("#C0C6D4", "#8C929C");
        return ("#FFD86F", "#FF9F6F");
    }
    function _tone(uint8 i) internal pure returns (string memory) {
        if (i == 0) return "#232830";
        if (i == 1) return "#2C323B";
        if (i == 2) return "#171B21";
        return "#39414C";
    }
    function _roman(uint8 t) internal pure returns (string memory) {
        // 0 is not Tier I. It is a draw that has not happened, and the plate
        // and the metadata both have to say so rather than round down.
        if (t == 0) return unicode"—";
        return t == 3 ? "III" : (t == 2 ? "II" : "I");
    }
    function _pad4(uint256 v) internal pure returns (bytes memory) {
        bytes memory s = _u(v);
        if (s.length >= 4) return abi.encodePacked("#", s);
        bytes memory z = new bytes(4 - s.length);
        for (uint256 i; i < z.length; i++) z[i] = "0";
        return abi.encodePacked("#", z, s);
    }
    function _u(uint256 v) internal pure returns (bytes memory) {
        if (v == 0) return "0";
        uint256 len; for (uint256 t = v; t != 0; t /= 10) len++;
        bytes memory b = new bytes(len);
        while (v != 0) { b[--len] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return b;
    }
}
