<?php
// Tests der Spielregeln: php schiffe-versenken/test.php
require __DIR__ . '/engine.php';

$fails = 0;
function check($cond, $msg) { global $fails; if (!$cond) { $fails++; echo "FAIL: $msg\n"; } else echo "ok   $msg\n"; }

$good = [['x' => 0, 'y' => 0, 'dir' => 'h'], ['x' => 0, 'y' => 2, 'dir' => 'h'], ['x' => 0, 'y' => 4, 'dir' => 'h'],
         ['x' => 0, 'y' => 6, 'dir' => 'h'], ['x' => 9, 'y' => 0, 'dir' => 'v']];
[$ships, $err] = sv_validate_fleet($good);
check($ships && !$err, 'gültige Flotte wird angenommen');

$bad = $good; $bad[1]['y'] = 1;
check(sv_validate_fleet($bad)[1] === 'Schiffe dürfen sich nicht berühren', 'anliegende Schiffe werden abgelehnt');
$bad = $good; $bad[4] = ['x' => 5, 'y' => 1, 'dir' => 'h'];
check(sv_validate_fleet($bad)[1] === 'Schiffe dürfen sich nicht berühren', 'Berührung über Eck wird abgelehnt');
$bad = $good; $bad[0]['x'] = 6;
check(sv_validate_fleet($bad)[1] !== null, 'Schiff über den Rand wird abgelehnt');
check(sv_validate_fleet(array_slice($good, 0, 4))[1] !== null, 'unvollständige Flotte wird abgelehnt');

for ($i = 0; $i < 50; $i++) { if (!sv_random_fleet()) break; }
check($i === 50, 'Zufallsflotten sind gültig');

$grid = array_fill(0, 100, 0);
check(sv_shoot($ships, $grid, 5, 9)['res'] === 'miss', 'Wasser');
check(isset(sv_shoot($ships, $grid, 5, 9)['error']), 'doppelter Schuss wird abgelehnt');
check(sv_shoot($ships, $grid, 9, 0)['res'] === 'hit', 'Treffer');
$r = sv_shoot($ships, $grid, 9, 1);
check($r['res'] === 'sunk' && $r['ship'] === 4 && !$r['won'], 'Zerstörer versenkt');
$last = null;
foreach ([[0, 0, 5], [0, 2, 4], [0, 4, 3], [0, 6, 3]] as [$sx, $sy, $len]) for ($k = 0; $k < $len; $k++) $last = sv_shoot($ships, $grid, $sx + $k, $sy);
check($last['won'] === true, 'alle versenkt → gewonnen');
check(sv_coord(1, 6) === 'B7', 'Koordinate B7');

echo $fails ? "\n$fails Fehler\n" : "\nAlle Tests grün\n";
exit($fails ? 1 : 0);
