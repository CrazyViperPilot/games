<?php
// php fruhno/test.php – plays many random games with the engine and checks invariants.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/engine.php';

function check($cond, $msg) { if (!$cond) { fwrite(STDERR, "FAIL: $msg\n"); exit(1); } }

check(count(fr_deck()) === 108, 'deck has 108 cards');

$totalTurns = 0;
for ($game = 0; $game < 300; $game++) {
    $n = 2 + $game % 2;
    $names = array_slice(FR_NAMES, 0, $n);
    $g = fr_new_game($names, $game);
    for ($turn = 0; $turn < 2000; $turn++) {
        $count = count($g['draw']) + count($g['discard']);
        foreach ($g['hands'] as $h) $count += count($h);
        check($count === 108, "card conservation game $game turn $turn ($count)");
        check(in_array($g['color'], [0, 1, 2, 3], true), 'color valid');
        check($g['turnName'] === $g['order'][$g['turnIdx']], 'turn consistent');
        $err = fr_bot_move($g, $g['turnName']);
        check($err === null, "bot move error: $err");
        $totalTurns++;
        if (!empty($g['winner'])) break;
    }
    check(!empty($g['winner']), "game $game finished");
    check(count($g['hands'][$g['winner']]) === 0, 'winner has no cards');
}
// rules
// Rule checks need a neutral table: a random start card (+2, reverse) would leave a draw chain or reversed direction.
function fr_fresh($names) { $g = fr_new_game($names); $g['pending'] = 0; $g['dir'] = 1; return $g; }
$g = fr_fresh(['Daniel', 'Lea']);
$g['color'] = 1; $g['discard'][] = [1, 5];
$g['turnIdx'] = 0; $g['turnName'] = 'Daniel'; $g['drawn'] = null;
$g['hands']['Daniel'] = [[1, 7], [4, FR_WILD4], [2, 5], [0, 3]];
check(fr_playable($g, 'Daniel') === [0, 2], 'color/number match, +4 blocked while color in hand');
$g['hands']['Daniel'] = [[4, FR_WILD4], [2, 2]];
check(fr_playable($g, 'Daniel') === [0], '+4 allowed without color');
$g['hands']['Daniel'] = [[1, FR_REVERSE], [0, 0], [0, 1]];
$g['discard'][] = [1, 5];
fr_play($g, 'Daniel', 0, [1, FR_REVERSE], -1);
check($g['turnName'] === 'Daniel', 'reverse acts as skip with 2 players');
// +2/+4: the player who plays them is never on turn again right after (2 and 3 players)
foreach ([2, 3] as $n) foreach ([FR_DRAW2, FR_WILD4, FR_WILD] as $w) {
    $g = fr_fresh(array_slice(FR_NAMES, 0, $n));
    $p = $g['turnName'];
    $g['color'] = 0; $g['discard'][] = [0, 5]; $g['drawn'] = null;
    $g['hands'][$p] = $w === FR_DRAW2 ? [[0, FR_DRAW2], [0, 1], [0, 2]] : [[4, $w], [1, 1], [1, 2]];
    check(fr_play($g, $p, 0, $g['hands'][$p][0], 2) === null, "play $w");
    check($g['turnName'] !== $p, "after card $w with $n players another player is on turn");
}
// +4 house rule: the victim draws 4 and is on turn (3 players)
$g = fr_fresh(FR_NAMES);
$p = $g['turnName'];
$g['color'] = 0; $g['discard'][] = [0, 5]; $g['drawn'] = null;
$g['hands'][$p] = [[4, FR_WILD4], [1, 1], [1, 2]];
$victim = $g['order'][fr_next($g, $g['turnIdx'])];
$before = count($g['hands'][$victim]);
check(fr_play($g, $p, 0, [4, FR_WILD4], 3) === null, 'play +4');
check($g['turnName'] === $victim && count($g['hands'][$victim]) === $before + 4, 'victim draws 4 and is on turn');
check($g['color'] === 3, 'wished color applies');
// +2 stacking: +2 on +2 passes the sum on; only +2 is playable on an open chain; drawing takes the sum and keeps the turn
$g = fr_fresh(FR_NAMES);
$a = $g['turnName']; $b = $g['order'][fr_next($g, $g['turnIdx'])];
$g['color'] = 0; $g['discard'][] = [0, 5]; $g['drawn'] = null; $g['pending'] = 0;
$g['hands'][$a] = [[0, FR_DRAW2], [0, 1], [0, 2]];
$g['hands'][$b] = [[1, FR_DRAW2], [4, FR_WILD4], [1, 3], [0, 4]];
check(fr_play($g, $a, 0, [0, FR_DRAW2], -1) === null, 'play +2');
check($g['turnName'] === $b && $g['pending'] === 2, 'next player on turn with 2 pending');
check(fr_playable($g, $b) === [0], 'only +2 playable on chain (not +4)');
$c = $g['order'][fr_next($g, $g['turnIdx'])];
$before = count($g['hands'][$b]);
check(fr_play($g, $b, 0, [1, FR_DRAW2], -1) === null && $g['pending'] === 4 && $g['turnName'] === $c, '+2 on +2 gives 4');
$before = count($g['hands'][$c]);
check(fr_draw_action($g, $c) === null && count($g['hands'][$c]) === $before + 4 && $g['pending'] === 0 && $g['turnName'] === $c, 'draw takes sum, keeps turn');
echo "OK ($totalTurns turns)\n";
