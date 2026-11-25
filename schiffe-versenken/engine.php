<?php
// Schiffe versenken: Spielregeln ohne Ein-/Ausgabe (von api.php und test.php genutzt).
//
// Brett 10×10, Zelle = y * 10 + x. Flotte nach der klassischen Papier-Regel, in fester Reihenfolge:
//   1 Schlachtschiff (5), 2 Kreuzer (4), 3 Zerstörer (3), 4 U-Boote (2) – zusammen 10 Schiffe, 30 Felder.
// Fehler kommen als Code (z. B. 'touch'); sv_error_text() liefert den deutschen Text dazu.
// Schiffe dürfen sich nicht berühren (auch nicht über Eck). Treffer → nochmal schießen.

const SV_SIZE = 10;
const SV_FLEET = [5, 4, 4, 3, 3, 3, 2, 2, 2, 2];
const SV_CLASS_NAMES = [5 => 'Schlachtschiff', 4 => 'Kreuzer', 3 => 'Zerstörer', 2 => 'U-Boot'];
const SV_ERRORS = [
    'fleet' => 'Die Flotte ist unvollständig', 'ship' => 'Ungültiges Schiff', 'edge' => 'Ein Schiff ragt über den Rand',
    'touch' => 'Schiffe dürfen sich nicht berühren', 'cell' => 'Ungültiges Feld', 'shot' => 'Da hast du schon hingeschossen',
    'name' => 'Bitte einen Namen eingeben', 'full' => 'Das Spiel ist schon voll', 'busy' => 'Gerade sind zu viele Spiele offen',
    'gone' => 'Das Spiel gibt es nicht mehr', 'notin' => 'Du spielst hier nicht mit', 'noplace' => 'Gerade wird nicht aufgestellt',
    'nofight' => 'Das Gefecht läuft nicht', 'noturn' => 'Du bist nicht dran', 'cant' => 'Geht gerade nicht',
];
function sv_error_text($code) { return isset(SV_ERRORS[$code]) ? SV_ERRORS[$code] : $code; }
/** Name des Schiffs Nr. $i („Kreuzer“). */
function sv_ship_name($i) { return SV_CLASS_NAMES[SV_FLEET[$i]]; }

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

/** Prüft und normalisiert eine Flotte aus dem Request. Gibt [ships, null] oder [null, Fehlercode] zurück. */
function sv_validate_fleet($raw) {
    if (!is_array($raw) || count($raw) !== count(SV_FLEET)) return [null, 'fleet'];
    $ships = [];
    $occ = array_fill(0, SV_SIZE * SV_SIZE, -1);
    foreach (array_values($raw) as $i => $r) {
        if (!is_array($r) || !isset($r['x'], $r['y'], $r['dir'])) return [null, 'ship'];
        $s = ['x' => (int)$r['x'], 'y' => (int)$r['y'], 'len' => SV_FLEET[$i], 'dir' => $r['dir'] === 'v' ? 'v' : 'h', 'hits' => 0, 'sunk' => false];
        foreach (sv_cells($s) as [$x, $y]) {
            if ($x < 0 || $y < 0 || $x >= SV_SIZE || $y >= SV_SIZE) return [null, 'edge'];
            for ($dy = -1; $dy <= 1; $dy++) for ($dx = -1; $dx <= 1; $dx++) {
                $nx = $x + $dx; $ny = $y + $dy;
                if ($nx < 0 || $ny < 0 || $nx >= SV_SIZE || $ny >= SV_SIZE) continue;
                $o = $occ[$ny * SV_SIZE + $nx];
                if ($o >= 0 && $o !== $i) return [null, 'touch'];
            }
            $occ[$y * SV_SIZE + $x] = $i;
        }
        $ships[] = $s;
    }
    return [$ships, null];
}

/** Zufällige gültige Flotte (für Tests; der Client würfelt selbst). Setzt Schiff für Schiff, größtes zuerst. */
function sv_random_fleet() {
    for ($try = 0; $try < 500; $try++) {
        $raw = [];
        foreach (SV_FLEET as $len) {
            $placed = false;
            for ($k = 0; $k < 80 && !$placed; $k++) {
                $dir = mt_rand(0, 1) ? 'h' : 'v';
                $s = ['x' => mt_rand(0, SV_SIZE - ($dir === 'h' ? $len : 1)), 'y' => mt_rand(0, SV_SIZE - ($dir === 'v' ? $len : 1)), 'dir' => $dir];
                if (sv_fleet_fits(array_merge($raw, [$s]))) { $raw[] = $s; $placed = true; }
            }
            if (!$placed) continue 2;
        }
        [$ships] = sv_validate_fleet($raw);
        if ($ships) return $ships;
    }
    return null;
}

/** Passen die ersten count($raw) Schiffe der Flotte ohne Berührung aufs Brett? */
function sv_fleet_fits($raw) {
    $occ = array_fill(0, SV_SIZE * SV_SIZE, -1);
    foreach ($raw as $i => $r) {
        $s = ['x' => $r['x'], 'y' => $r['y'], 'len' => SV_FLEET[$i], 'dir' => $r['dir']];
        foreach (sv_cells($s) as [$x, $y]) {
            if ($x < 0 || $y < 0 || $x >= SV_SIZE || $y >= SV_SIZE) return false;
            for ($dy = -1; $dy <= 1; $dy++) for ($dx = -1; $dx <= 1; $dx++) {
                $nx = $x + $dx; $ny = $y + $dy;
                if ($nx < 0 || $ny < 0 || $nx >= SV_SIZE || $ny >= SV_SIZE) continue;
                $o = $occ[$ny * SV_SIZE + $nx];
                if ($o >= 0 && $o !== $i) return false;
            }
            $occ[$y * SV_SIZE + $x] = $i;
        }
    }
    return true;
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
    if (!is_int($x) || !is_int($y) || $x < 0 || $y < 0 || $x >= SV_SIZE || $y >= SV_SIZE) return ['error' => 'cell'];
    $c = $y * SV_SIZE + $x;
    if ($grid[$c] !== 0) return ['error' => 'shot'];
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
