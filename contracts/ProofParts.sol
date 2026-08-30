// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ProofParts
/// @notice Every character layer, as constant strings.
///
///  Split out from the renderer purely for the 24KB code limit — 38 shape
///  variants plus the assembler does not fit in one contract.
///
///  The head sits at x=300 in every key, which is what lets these be constants
///  instead of arithmetic. Colours are the only thing interpolated.
contract ProofParts {
    string private constant DARK = "#12161B";
    string private constant DEEP = "#0B0E12";

    /* ─────────── backgrounds ─────────── */

    function bg(uint8 i, string memory a, string memory b, string memory uid)
        external pure returns (bytes memory)
    {
        bytes memory base = abi.encodePacked('<rect width="600" height="600" fill="#090B0D"/>');

        if (i == 0)        // Chamber — studio falloff
            base = abi.encodePacked(base,
                '<rect width="600" height="600" fill="url(#ch', uid, ')"/>',
                '<rect y="392" width="600" height="208" fill="url(#fl', uid, ')"/>');
        else if (i == 1)   // Halation — bloom behind the head
            base = abi.encodePacked(base,
                '<circle cx="300" cy="238" r="268" fill="url(#ch', uid, ')"/>',
                '<ellipse cx="300" cy="238" rx="150" ry="150" fill="', a, '" opacity=".07"/>');
        else if (i == 2)   // Monolith — a slab it stands against
            base = abi.encodePacked(base,
                '<rect x="150" y="46" width="300" height="470" rx="26" fill="url(#mo', uid, ')"/>',
                '<rect x="150" y="46" width="300" height="470" rx="26" fill="none" stroke="', a,
                '" stroke-width="1.1" opacity=".3"/>');
        else if (i == 3)   // Aperture — partial arcs, never full rings
            base = abi.encodePacked(base,
                '<path d="M130 300A170 170 0 0 1 470 300" fill="none" stroke="', a,
                '" stroke-width="1.2" opacity=".26" stroke-linecap="round" transform="rotate(-24 300 300)"/>',
                '<path d="M76 300A224 224 0 0 1 524 300" fill="none" stroke="', a,
                '" stroke-width="1.2" opacity=".20" stroke-linecap="round" transform="rotate(-8 300 300)"/>',
                '<path d="M22 300A278 278 0 0 1 578 300" fill="none" stroke="', a,
                '" stroke-width="1.2" opacity=".14" stroke-linecap="round" transform="rotate(8 300 300)"/>',
                '<rect width="600" height="600" fill="url(#ch', uid, ')" opacity=".55"/>');
        else if (i == 4)   // Nightfall — horizon behind the shoulders
            base = abi.encodePacked(base,
                '<rect width="600" height="600" fill="url(#nf', uid, ')"/>',
                '<line x1="0" y1="408" x2="600" y2="408" stroke="', a,
                '" stroke-width=".9" opacity=".26"/>');
        else               // Ashfall — drifting particles
            base = abi.encodePacked(base, _ash(b), '<rect width="600" height="600" fill="url(#ch',
                uid, ')" opacity=".6"/>');

        // Vignette on every backdrop, then a ground shadow. These two layers
        // are most of the difference between "premium" and "pasted on".
        return abi.encodePacked(base,
            '<rect width="600" height="600" fill="url(#vg', uid, ')"/>',
            '<ellipse cx="300" cy="588" rx="212" ry="34" fill="#000" opacity=".5"/>');
    }

    function _ash(string memory b) internal pure returns (bytes memory o) {
        uint16[13] memory xs = [uint16(64),148,232,316,400,484,110,194,278,362,446,530,86];
        uint16[13] memory ys = [uint16(92),218,54,340,166,282,410,128,466,244,368,180,520];
        for (uint256 i; i < 13; i++) {
            o = abi.encodePacked(o, '<circle cx="', _u(xs[i]), '" cy="', _u(ys[i]),
                '" r="', _u(1 + (i % 4)), '" fill="', b, '" opacity=".', _u(6 + (i % 5) * 3),
                '"><animate attributeName="cy" values="', _u(ys[i]), ';', _u(ys[i] + 38), ';',
                _u(ys[i]), '" dur="', _u(7 + (i % 5)), 's" repeatCount="indefinite"/></circle>');
        }
    }

    /* ─────────── outfit ─────────── */

    function fit(uint8 i, string memory a, string memory skin) external pure returns (bytes memory) {
        bytes memory o = abi.encodePacked(
            '<path d="M96 600C96 500 176 434 300 434C420 434 504 500 504 600Z" fill="', DARK, '"/>');
        if (i == 1) return abi.encodePacked(o,
            '<path d="M226 452L260 540L300 470L340 540L374 452" fill="none" stroke="', a,
            '" stroke-width="2.2" opacity=".8"/>');
        if (i == 2) return abi.encodePacked(o,
            '<path d="M110 596C118 512 168 468 214 452L232 520Z" fill="', skin, '" opacity=".85"/>',
            '<path d="M490 596C482 512 432 468 386 452L368 520Z" fill="', skin, '" opacity=".85"/>',
            '<path d="M110 596C118 512 168 468 214 452M490 596C482 512 432 468 386 452" fill="none" stroke="',
            a, '" stroke-width="1.5" opacity=".6"/>');
        if (i == 3) return abi.encodePacked(o,
            '<path d="M212 470L362 600M388 470L238 600" stroke="', a,
            '" stroke-width="3.6" opacity=".5"/>');
        if (i == 4) return abi.encodePacked(o,
            '<path d="M300 448V600" stroke="', a,
            '" stroke-width="2.1" opacity=".55" stroke-dasharray="7 7"/>');
        if (i == 5) return abi.encodePacked(o,
            '<path d="M96 600C96 494 172 430 300 430C424 430 504 494 504 600Z" fill="none" stroke="',
            a, '" stroke-width="1.95" opacity=".45"/>',
            '<path d="M244 436L204 600M356 436L396 600" stroke="', a,
            '" stroke-width="1.5" opacity=".3"/>');
        return o;
    }

    /* ─────────── head, always drawn ─────────── */

    function head(string memory skin, string memory a, string memory b)
        external pure returns (bytes memory)
    {
        return abi.encodePacked(
            '<rect x="266" y="330" width="68" height="86" rx="18" fill="', skin, '" opacity=".82"/>',
            '<rect x="208" y="146" width="184" height="212" rx="56" fill="', skin, '"/>',
            '<rect x="208" y="146" width="184" height="212" rx="56" fill="none" stroke="', a,
            '" stroke-width=".9" opacity=".28"/>',
            '<rect x="228" y="196" width="144" height="128" rx="34" fill="', DEEP, '" opacity=".92"/>',
            // Rim light down the left edge. One stroke, and the head stops looking flat.
            '<path d="M208 302V202A56 56 0 0 1 264 146" fill="none" stroke="', b,
            '" stroke-width="1.8" opacity=".5" stroke-linecap="round"/>');
    }

    /* ─────────── headwear ─────────── */

    function hood(uint8 i, string memory a) external pure returns (bytes memory) {
        if (i == 0) return abi.encodePacked(
            '<path d="M176 400C160 250 208 118 300 118C392 118 440 250 424 400C396 344 392 214 300 214C208 214 204 344 176 400Z" fill="', DARK, '"/>',
            '<path d="M176 400C160 250 208 118 300 118C392 118 440 250 424 400" fill="none" stroke="',
            a, '" stroke-width="1.5" opacity=".55"/>');
        if (i == 1) return abi.encodePacked(
            '<path d="M200 300V206C200 150 244 118 300 118C356 118 400 150 400 206V300Z" fill="', DARK, '"/>',
            '<rect x="216" y="236" width="168" height="52" rx="16" fill="', DEEP, '"/>',
            '<path d="M200 300V206C200 150 244 118 300 118C356 118 400 150 400 206V300" fill="none" stroke="',
            a, '" stroke-width="1.5" opacity=".6"/>');
        if (i == 2) return abi.encodePacked(
            '<path d="M196 190C196 138 242 112 300 112C358 112 404 138 404 190Z" fill="', DARK, '"/>',
            '<rect x="166" y="186" width="268" height="20" rx="10" fill="', DARK, '"/>',
            '<rect x="166" y="186" width="268" height="20" rx="10" fill="none" stroke="', a,
            '" stroke-width="1" opacity=".5"/>');
        return "";
    }

    /// @notice Horns, halo, antenna and crown sit above everything else.
    function over(uint8 i, string memory a) external pure returns (bytes memory) {
        if (i == 4) return abi.encodePacked(
            '<path d="M208 168C164 128 150 74 162 44C196 68 216 112 222 152M392 168C436 128 450 74 438 44C404 68 384 112 378 152" fill="none" stroke="',
            a, '" stroke-width="3.3" stroke-linecap="round" opacity=".85"/>');
        if (i == 5) return abi.encodePacked(
            '<ellipse cx="300" cy="108" rx="86" ry="18" fill="none" stroke="', a,
            '" stroke-width="3" opacity=".8"><animate attributeName="cy" values="108;98;108" dur="3.9s" calcMode="spline" keyTimes="0;.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite"/></ellipse>');
        if (i == 6) return abi.encodePacked(
            '<path d="M352 152L386 74" stroke="', a, '" stroke-width="2.4" opacity=".8"/>',
            '<circle cx="386" cy="66" r="10" fill="', a,
            '"><animate attributeName="opacity" values="1;.15;1;1" keyTimes="0;.12;.3;1" dur="1.6s" repeatCount="indefinite"/></circle>');
        if (i == 7) return abi.encodePacked(
            '<path d="M212 152L234 88L270 128L300 66L330 128L366 88L388 152Z" fill="none" stroke="',
            a, '" stroke-width="2.4" stroke-linejoin="round" opacity=".9"/>');
        return "";
    }

    /* ─────────── eyes: the focal point ─────────── */

    function eyes(uint8 i, string memory a, string memory b) external pure returns (bytes memory) {
        if (i == 0) return abi.encodePacked(
            '<rect x="238" y="249" width="124" height="26" rx="13" fill="', a, '" opacity=".28"/>',
            '<rect x="244" y="254" width="112" height="16" rx="8" fill="', b, '"/>');
        if (i == 1) return abi.encodePacked(
            '<circle cx="268" cy="262" r="14" fill="', a, '" opacity=".3"/>',
            '<circle cx="332" cy="262" r="14" fill="', a, '" opacity=".3"/>',
            '<circle cx="268" cy="262" r="8" fill="', b, '"/>',
            '<circle cx="332" cy="262" r="8" fill="', b, '"/>');
        if (i == 2) return abi.encodePacked(
            '<path d="M238 252L286 264M362 252L314 264" stroke="', a,
            '" stroke-width="13" stroke-linecap="round" opacity=".3"/>',
            '<path d="M240 253L282 263M360 253L318 263" stroke="', b,
            '" stroke-width="6" stroke-linecap="round"/>');
        if (i == 3) return abi.encodePacked(
            '<circle cx="300" cy="262" r="32" fill="', a, '" opacity=".26"/>',
            '<circle cx="300" cy="262" r="20" fill="', b, '"/>',
            '<circle cx="300" cy="262" r="8" fill="', DEEP, '"/>');
        if (i == 4) {
            bytes memory o = abi.encodePacked(
                '<rect x="236" y="247" width="128" height="30" rx="6" fill="', a, '" opacity=".22"/>');
            for (uint256 j; j < 7; j++)
                o = abi.encodePacked(o, '<rect x="', _u(242 + j * 17),
                    '" y="252" width="7" height="20" rx="3" fill="', b,
                    '" opacity=".', _u(55 + (j % 3) * 22), '"/>');
            return o;
        }
        if (i == 5) return abi.encodePacked(
            '<path d="M254 248L282 276M254 276L282 248M318 248L346 276M318 276L346 248" stroke="',
            b, '" stroke-width="7" stroke-linecap="round"/>');
        if (i == 6) return abi.encodePacked(
            '<rect x="236" y="246" width="52" height="32" rx="7" fill="', a, '" opacity=".3"/>',
            '<rect x="312" y="246" width="52" height="32" rx="7" fill="', a, '" opacity=".3"/>',
            '<rect x="241" y="251" width="42" height="22" rx="5" fill="', b, '"/>',
            '<rect x="317" y="251" width="42" height="22" rx="5" fill="', b, '"/>');
        return abi.encodePacked(
            '<ellipse cx="268" cy="262" rx="17" ry="21" fill="#05070A"/>',
            '<ellipse cx="332" cy="262" rx="17" ry="21" fill="#05070A"/>',
            '<circle cx="268" cy="266" r="4" fill="', b, '"/>',
            '<circle cx="332" cy="266" r="4" fill="', b, '"/>');
    }

    /* ─────────── mask ─────────── */

    function mask(uint8 i, string memory a) external pure returns (bytes memory) {
        if (i == 1) {
            bytes memory o = abi.encodePacked(
                '<rect x="248" y="300" width="104" height="52" rx="18" fill="', DARK, '" stroke="',
                a, '" stroke-width="1.5" opacity=".95"/>');
            for (uint256 j; j < 3; j++)
                o = abi.encodePacked(o, '<rect x="', _u(270 + j * 22),
                    '" y="314" width="7" height="24" rx="3" fill="', a, '" opacity=".55"/>');
            return o;
        }
        if (i == 2) return abi.encodePacked(
            '<path d="M216 312C260 346 340 346 384 312L384 348C340 374 260 374 216 348Z" fill="',
            DARK, '" stroke="', a, '" stroke-width="1.5" opacity=".9"/>');
        if (i == 3) {
            bytes memory o = abi.encodePacked(
                '<rect x="254" y="308" width="92" height="42" rx="8" fill="', DEEP, '"/>');
            for (uint256 j; j < 5; j++)
                o = abi.encodePacked(o, '<rect x="', _u(262 + j * 18),
                    '" y="312" width="5" height="34" rx="2" fill="', a, '" opacity=".7"/>');
            return o;
        }
        if (i == 4) return abi.encodePacked(
            '<path d="M220 308L380 308L300 372Z" fill="', DARK, '" stroke="', a,
            '" stroke-width="1.5" opacity=".9"/>');
        if (i == 5) return abi.encodePacked(
            '<circle cx="300" cy="324" r="26" fill="', DARK, '" stroke="', a, '" stroke-width="1.5"/>',
            '<circle cx="300" cy="324" r="11" fill="', a, '" opacity=".5"/>',
            '<path d="M326 334C370 350 388 376 392 408" fill="none" stroke="', a,
            '" stroke-width="2.4" opacity=".6"/>');
        return "";
    }

    /* ─────────── aura ─────────── */

    function aura(uint8 i, string memory a, string memory uid) external pure returns (bytes memory) {
        if (i == 1) return abi.encodePacked(
            '<circle cx="300" cy="255" r="185" fill="url(#au', uid,
            ')"><animate attributeName="opacity" values="1;.55;1" dur="4.4s" repeatCount="indefinite"/></circle>');
        if (i == 2) return abi.encodePacked(
            '<circle cx="300" cy="255" r="172" fill="none" stroke="', a,
            '" stroke-width="2.2" opacity=".42" stroke-dasharray="26 14">',
            '<animateTransform attributeName="transform" type="rotate" from="0 300 255" to="360 300 255" dur="22s" repeatCount="indefinite"/></circle>');
        if (i == 3) return abi.encodePacked(
            '<g opacity=".45"><animateTransform attributeName="transform" type="rotate" from="360 300 255" to="0 300 255" dur="30s" repeatCount="indefinite"/>',
            '<circle cx="300" cy="255" r="180" fill="none" stroke="', a,
            '" stroke-width="2" stroke-dasharray="3 18"/></g>');
        return "";
    }

    function _u(uint256 v) internal pure returns (bytes memory) {
        if (v == 0) return "0";
        uint256 len; for (uint256 t = v; t != 0; t /= 10) len++;
        bytes memory b = new bytes(len);
        while (v != 0) { b[--len] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return b;
    }
}
