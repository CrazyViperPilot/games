<?php
// Fruhno game rules (UNO with breakfast cards). Pure functions, no I/O.
//
// A card is [color, value]. Colors: 0 Süßes, 1 Backwaren, 2 Getränke, 3 Belag, 4 wild.
// Values: 0-9 numbers, 10 skip, 11 reverse, 12 draw two, 13 wild, 14 wild draw four.

const FR_SKIP = 10, FR_REVERSE = 11, FR_DRAW2 = 12, FR_WILD = 13, FR_WILD4 = 14;
const FR_NAMES = ['Daniel', 'Lea', 'Kira'];
const FR_MAX_PLAYERS = 3;

const FR_COLOR_TEXT = ['Süßes 🍯', 'Backwaren 🥐', 'Getränke ☕', 'Belag 🧀'];
const FR_SPECIAL_TEXT = [10 => 'Verschlafen', 11 => 'Rührei wenden', 12 => 'Doppelte Portion (+2)', 13 => 'Frühstücksbuffet', 14 => 'Großes Buffet (+4)'];

function fr_card_text($c) {
    if ($c[0] === 4) return FR_SPECIAL_TEXT[$c[1]];
    return FR_COLOR_TEXT[$c[0]] . ' ' . ($c[1] <= 9 ? $c[1] : FR_SPECIAL_TEXT[$c[1]]);
}

// Human-readable events (played card, draws, skips) are collected here and turned into chat lines by the API.
function fr_event(&$g, $text) { $g['events'][] = $text; }

function fr_deck() {
    $deck = [];
    for ($c = 0; $c < 4; $c++) {
        $deck[] = [$c, 0];
        for ($v = 1; $v <= 12; $v++) { $deck[] = [$c, $v]; $deck[] = [$c, $v]; }
    }
    for ($i = 0; $i < 4; $i++) { $deck[] = [4, FR_WILD]; $deck[] = [4, FR_WILD4]; }
    return $deck;
}

function fr_card_points($card) {
    if ($card[1] <= 9) return $card[1];
    return $card[1] >= FR_WILD ? 50 : 20;
}

function fr_next($g, $i, $steps = 1) {
    $n = count($g['order']);
    return (($i + $g['dir'] * $steps) % $n + $n) % $n;
}

function fr_sort_hand(&$hand) {
    usort($hand, function ($a, $b) { return $a[0] === $b[0] ? $a[1] <=> $b[1] : $a[0] <=> $b[0]; });
}

function fr_can_play($card, $g, $hand) {
    // Open +2 chain: only another +2 (any color) may be played, everything else must draw the sum.
    if (!empty($g['pending'])) return $card[0] !== 4 && $card[1] === FR_DRAW2;
    if ($card[0] === 4) {
        if ($card[1] === FR_WILD4) {
            foreach ($hand as $h) if ($h[0] === $g['color']) return false;
        }
        return true;
    }
    $top = $g['discard'][count($g['discard']) - 1];
    return $card[0] === $g['color'] || $card[1] === $top[1];
}

function fr_playable($g, $name) {
    $out = [];
    if ($g['turnName'] !== $name) return $out;
    $hand = $g['hands'][$name];
    foreach ($hand as $i => $card) {
        if (isset($g['drawn']) && $g['drawn'] !== null && $g['drawn'] !== $i) continue;
        if (fr_can_play($card, $g, $hand)) $out[] = $i;
    }
    return $out;
}

// Takes $count cards from the draw pile (reshuffling the discard pile when empty).
function fr_draw(&$g, $name, $count) {
    $last = null;
    for ($k = 0; $k < $count; $k++) {
        if (!$g['draw']) {
            $top = array_pop($g['discard']);
            $pile = $g['discard'];
            shuffle($pile);
            $g['draw'] = $pile;
            $g['discard'] = [$top];
            if (!$g['draw']) break;
        }
        $last = array_pop($g['draw']);
        $g['hands'][$name][] = $last;
    }
    fr_sort_hand($g['hands'][$name]);
    $g['called'][$name] = false;
    return $last;
}

function fr_set_turn(&$g, $idx) {
    $g['turnIdx'] = $idx;
    $g['turnName'] = $g['order'][$idx];
    $g['drawn'] = null;
}

// Applies the effect of a card played by player index $p and moves the turn on.
function fr_apply_card(&$g, $card, $p) {
    $n = count($g['order']);
    switch ($card[1]) {
        case FR_SKIP:
            fr_set_turn($g, fr_next($g, $p, 2));
            break;
        case FR_REVERSE:
            $g['dir'] = -$g['dir'];
            fr_set_turn($g, $n === 2 ? $p : fr_next($g, $p));
            break;
        case FR_DRAW2:
            // House rule: +2 can be stacked; the next player draws the sum (not skipped) unless they add another +2.
            $g['pending'] = (isset($g['pending']) ? $g['pending'] : 0) + 2;
            fr_set_turn($g, fr_next($g, $p));
            break;
        case FR_WILD4:
            // House rule: the victim draws 4 but is not skipped; they must play the wished color or draw.
            $v = fr_next($g, $p);
            fr_draw($g, $g['order'][$v], 4);
            fr_set_turn($g, $v);
            break;
        default:
            fr_set_turn($g, fr_next($g, $p));
    }
}

function fr_new_game($names, $startIdx = 0) {
    $deck = fr_deck();
    shuffle($deck);
    $g = ['order' => array_values($names), 'dir' => 1, 'hands' => [], 'draw' => $deck, 'discard' => [],
          'color' => 0, 'pending' => 0, 'turnIdx' => 0, 'turnName' => '', 'drawn' => null, 'called' => [], 'uno' => null];
    foreach ($g['order'] as $name) {
        $g['hands'][$name] = [];
        fr_draw($g, $name, 7);
        $g['called'][$name] = false;
    }
    do { $start = array_pop($g['draw']); if ($start[0] === 4) array_unshift($g['draw'], $start); } while ($start[0] === 4);
    $g['discard'][] = $start;
    $g['color'] = $start[0];
    $n = count($g['order']);
    $startIdx = $startIdx % $n;
    // Start card acts as if played by the player before the first one.
    fr_apply_card($g, $start, ($startIdx - 1 + $n) % $n);
    if ($start[1] <= 9) fr_set_turn($g, $startIdx);
    return $g;
}

// Returns an error message or null. May set $g['winner'].
function fr_play(&$g, $name, $index, $card, $color) {
    if ($g['turnName'] !== $name) return 'Du bist nicht dran';
    $hand = $g['hands'][$name];
    if (!isset($hand[$index]) || $hand[$index][0] !== $card[0] || $hand[$index][1] !== $card[1]) return 'Karte nicht mehr aktuell';
    if (!in_array($index, fr_playable($g, $name), true)) return 'Diese Karte passt nicht';
    $c = $hand[$index];
    if ($c[0] === 4 && !in_array($color, [0, 1, 2, 3], true)) return 'Farbe fehlt';
    $p = $g['turnIdx'];
    $victim = $g['order'][fr_next($g, $p)];
    $two = count($g['order']) === 2;
    $text = "$name legt " . fr_card_text($c);
    if ($c[0] === 4) $text .= ' und wünscht sich ' . FR_COLOR_TEXT[$color];
    if ($c[1] === FR_SKIP) $text .= " – $victim setzt aus";
    elseif ($c[1] === FR_REVERSE) $text .= $two ? " – $name ist nochmal dran" : ' – Richtung wechselt';
    elseif ($c[1] === FR_DRAW2) {
        $sum = (isset($g['pending']) ? $g['pending'] : 0) + 2;
        $text .= " – $victim muss $sum Karten ziehen oder eine +2 drauflegen";
    }
    elseif ($c[1] === FR_WILD4) $text .= " – $victim zieht 4 Karten und ist dran";
    fr_event($g, $text);
    array_splice($g['hands'][$name], $index, 1);
    $g['discard'][] = $c;
    $g['color'] = $c[0] === 4 ? $color : $c[0];
    $left = count($g['hands'][$name]);
    $g['uno'] = $left === 1 ? ['name' => $name, 'called' => !empty($g['called'][$name])] : null;
    fr_apply_card($g, $c, $p);
    if ($left === 0) { $g['winner'] = $name; $g['uno'] = null; }
    return null;
}

// Draws one card. A playable drawn card may be played right away (or passed).
function fr_draw_action(&$g, $name) {
    if ($g['turnName'] !== $name) return 'Du bist nicht dran';
    if ($g['drawn'] !== null) return 'Schon gezogen';
    $g['uno'] = null;
    if (!empty($g['pending'])) {
        // Take the whole +2 chain; the turn stays with this player, who may then play normally.
        fr_event($g, "$name zieht {$g['pending']} Karten");
        fr_draw($g, $name, $g['pending']);
        $g['pending'] = 0;
        return null;
    }
    fr_event($g, "$name zieht eine Karte");
    $card = fr_draw($g, $name, 1);
    $hand = $g['hands'][$name];
    if ($card !== null && fr_can_play($card, $g, $hand)) {
        foreach ($hand as $i => $c) if ($c[0] === $card[0] && $c[1] === $card[1]) { $g['drawn'] = $i; return null; }
    }
    fr_set_turn($g, fr_next($g, $g['turnIdx']));
    return null;
}

function fr_pass(&$g, $name) {
    if ($g['turnName'] !== $name) return 'Du bist nicht dran';
    if ($g['drawn'] === null) return 'Erst ziehen';
    fr_event($g, "$name passt");
    fr_set_turn($g, fr_next($g, $g['turnIdx']));
    return null;
}

function fr_bot_color($hand) {
    $count = [0, 0, 0, 0];
    foreach ($hand as $h) if ($h[0] < 4) $count[$h[0]]++;
    return array_search(max($count), $count);
}

// Simple bot: play the best fitting card (actions first), otherwise draw and play/pass.
function fr_bot_move(&$g, $name) {
    $hand = $g['hands'][$name];
    $best = null;
    foreach (fr_playable($g, $name) as $i) {
        $c = $hand[$i];
        $score = $c[0] === 4 ? ($c[1] === FR_WILD4 ? 1 : 2) : ($c[1] > 9 ? 4 : 3);
        if ($best === null || $score > $best[0]) $best = [$score, $i];
    }
    if ($best === null) {
        $err = fr_draw_action($g, $name);
        if ($err !== null || $g['turnName'] !== $name || $g['drawn'] === null) return $err;
        $best = [0, $g['drawn']];
        $hand = $g['hands'][$name];
    }
    if (count($hand) === 2) $g['called'][$name] = true;
    $card = $hand[$best[1]];
    return fr_play($g, $name, $best[1], $card, $card[0] === 4 ? fr_bot_color($hand) : $card[0]);
}

function fr_scores($g, $winner) {
    $sum = 0;
    foreach ($g['hands'] as $name => $hand) {
        if ($name === $winner) continue;
        foreach ($hand as $c) $sum += fr_card_points($c);
    }
    return $sum;
}
