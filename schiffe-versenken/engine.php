<?php
// Schiffe versenken: Spielregeln ohne Ein-/Ausgabe (von api.php und test.php genutzt).
//
// Brett 10×10, Zelle = y * 10 + x. Flotte in fester Reihenfolge:
//   0 Flugzeugträger (5), 1 Schlachtschiff (4), 2 Kreuzer (3), 3 U-Boot (3), 4 Zerstörer (2).
// Schiffe dürfen sich nicht berühren (auch nicht über Eck). Treffer → nochmal schießen.

const SV_SIZE = 10;
const SV_FLEET = [5, 4, 3, 3, 2];
const SV_SHIP_NAMES = ['Flugzeugträger', 'Schlachtschiff', 'Kreuzer', 'U-Boot', 'Zerstörer'];

/** Zellen eines Schiffs {x, y, len, dir: 'h'|'v'}. */
function sv_cells($s) {
    $out = [];
    for ($i = 0; $i < $s['len']; $i++) {
        $x = $s['x'] + ($s['dir'] === 'h' ? $i : 0);
        $y = $s['y'] + ($s['dir'] === 'v' ? $i : 0);
        $out[] = [$x, $y];
    }
    return $out;
}

/** Prüft und normalisiert eine Flotte aus dem Request. Gibt [ships, null] oder [null, Fehlertext] zurück. */
function sv_validate_fleet($raw) {
    if (!is_array($raw) || count($raw) !== count(SV_FLEET)) return [null, 'Die Flotte ist unvollständig'];
    $ships = [];
    $occ = array_fill(0, SV_SIZE * SV_SIZE, -1);
    foreach (array_values($raw) as $i => $r) {
        if (!is_array($r) || !isset($r['x'], $r['y'], $r['dir'])) return [null, 'Ungültiges Schiff'];
        $s = ['x' => (int)$r['x'], 'y' => (int)$r['y'], 'len' => SV_FLEET[$i], 'dir' => $r['dir'] === 'v' ? 'v' : 'h', 'hits' => 0, 'sunk' => false];
        foreach (sv_cells($s) as [$x, $y]) {
            if ($x < 0 || $y < 0 || $x >= SV_SIZE || $y >= SV_SIZE) return [null, SV_SHIP_NAMES[$i] . ' ragt über den Rand'];
            for ($dy = -1; $dy <= 1; $dy++) for ($dx = -1; $dx <= 1; $dx++) {
                $nx = $x + $dx; $ny = $y + $dy;
                if ($nx < 0 || $ny < 0 || $nx >= SV_SIZE || $ny >= SV_SIZE) continue;
                $o = $occ[$ny * SV_SIZE + $nx];
                if ($o >= 0 && $o !== $i) return [null, 'Schiffe dürfen sich nicht berühren'];
            }
            $occ[$y * SV_SIZE + $x] = $i;
        }
        $ships[] = $s;
    }
    return [$ships, null];
}

/** Zufällige gültige Flotte (für Tests; der Client würfelt selbst). */
function sv_random_fleet() {
    for ($try = 0; $try < 500; $try++) {
        $raw = [];
        foreach (SV_FLEET as $len) {
            $dir = mt_rand(0, 1) ? 'h' : 'v';
            $raw[] = ['x' => mt_rand(0, SV_SIZE - ($dir === 'h' ? $len : 1)), 'y' => mt_rand(0, SV_SIZE - ($dir === 'v' ? $len : 1)), 'dir' => $dir];
        }
        [$ships] = sv_validate_fleet($raw);
        if ($ships) return $ships;
    }
    return null;
}

/** Index des Schiffs auf (x, y) oder -1. */
function sv_ship_at($ships, $x, $y) {
    foreach ($ships as $i => $s) foreach (sv_cells($s) as [$cx, $cy]) if ($cx === $x && $cy === $y) return $i;
    return -1;
}

/**
 * Schuss auf eine Flotte. $grid: 100 Felder (0 frei, 1 Wasser, 2 Treffer), wird verändert.
 * Rückgabe ['res' => 'miss'|'hit'|'sunk', 'ship' => idx|-1, 'won' => bool] oder ['error' => …].
 */
function sv_shoot(&$ships, &$grid, $x, $y) {
    if (!is_int($x) || !is_int($y) || $x < 0 || $y < 0 || $x >= SV_SIZE || $y >= SV_SIZE) return ['error' => 'Ungültiges Feld'];
    $c = $y * SV_SIZE + $x;
    if ($grid[$c] !== 0) return ['error' => 'Da hast du schon hingeschossen'];
    $i = sv_ship_at($ships, $x, $y);
    if ($i < 0) { $grid[$c] = 1; return ['res' => 'miss', 'ship' => -1, 'won' => false]; }
    $grid[$c] = 2;
    $ships[$i]['hits']++;
    if ($ships[$i]['hits'] < $ships[$i]['len']) return ['res' => 'hit', 'ship' => $i, 'won' => false];
    $ships[$i]['sunk'] = true;
    $won = true;
    foreach ($ships as $s) if (!$s['sunk']) { $won = false; break; }
    return ['res' => 'sunk', 'ship' => $i, 'won' => $won];
}

/** Koordinate wie „B7“. */
function sv_coord($x, $y) { return chr(65 + $x) . ($y + 1); }
