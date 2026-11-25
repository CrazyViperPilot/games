<?php
// Tests der Spielregeln: php schiffe-versenken/test.php
require __DIR__ . '/engine.php';

$fails = 0;
function check($cond, $msg) { global $fails; if (!$cond) { $fails++; echo "FAIL: $msg\n"; } else echo "ok   $msg\n"; }

// 1×5, 2×4, 3×3, 4×2 – je Reihe mit Abstand
$good = [['x' => 0, 'y' => 0, 'dir' => 'h'],                                            // 5
         ['x' => 0, 'y' => 2, 'dir' => 'h'], ['x' => 5, 'y' => 2, 'dir' => 'h'],       // 4, 4
         ['x' => 0, 'y' => 4, 'dir' => 'h'], ['x' => 4, 'y' => 4, 'dir' => 'h'], ['x' => 0, 'y' => 6, 'dir' => 'h'], // 3, 3, 3
         ['x' => 4, 'y' => 6, 'dir' => 'h'], ['x' => 0, 'y' => 8, 'dir' => 'h'], ['x' => 3, 'y' => 8, 'dir' => 'h'], ['x' => 9, 'y' => 4, 'dir' => 'v']]; // 2er
check(SV_FLEET === [5, 4, 4, 3, 3, 3, 2, 2, 2, 2] && array_sum(SV_FLEET) === 30, 'Flotte 1×5, 2×4, 3×3, 4×2');
[$ships, $err] = sv_validate_fleet($good);
check($ships && !$err, 'gültige Flotte wird angenommen' . ($err ? " ($err)" : ''));

$bad = $good; $bad[1]['y'] = 1;
check(sv_validate_fleet($bad)[1] === 'touch', 'anliegende Schiffe werden abgelehnt');
$bad = $good; $bad[9] = ['x' => 5, 'y' => 1, 'dir' => 'h'];
check(sv_validate_fleet($bad)[1] === 'touch', 'Berührung über Eck wird abgelehnt');
$bad = $good; $bad[0]['x'] = 6;
check(sv_validate_fleet($bad)[1] === 'edge', 'Schiff über den Rand wird abgelehnt');
check(sv_validate_fleet(array_slice($good, 0, 9))[1] === 'fleet', 'unvollständige Flotte wird abgelehnt');
check(sv_error_text('touch') === 'Schiffe dürfen sich nicht berühren', 'Fehlertext zum Code');
check(sv_ship_name(0) === 'Schlachtschiff' && sv_ship_name(2) === 'Kreuzer' && sv_ship_name(5) === 'Zerstörer' && sv_ship_name(9) === 'U-Boot', 'Schiffsnamen');

for ($i = 0; $i < 50; $i++) { if (!sv_random_fleet()) break; }
check($i === 50, 'Zufallsflotten sind gültig');

$grid = array_fill(0, 100, 0);
check(sv_shoot($ships, $grid, 9, 9)['res'] === 'miss', 'Wasser');
check(sv_shoot($ships, $grid, 9, 9)['error'] === 'shot', 'doppelter Schuss wird abgelehnt');
check(sv_shoot($ships, $grid, 9, 4)['res'] === 'hit', 'Treffer');
$r = sv_shoot($ships, $grid, 9, 5);
check($r['res'] === 'sunk' && $r['ship'] === 9 && !$r['won'], 'U-Boot versenkt');
$last = null;
foreach (array_slice($good, 0, 9, true) as $i => $g) for ($k = 0; $k < SV_FLEET[$i]; $k++) $last = sv_shoot($ships, $grid, $g['x'] + $k, $g['y']);
check($last['won'] === true, 'alle versenkt → gewonnen');
check(sv_coord(1, 6) === 'B7', 'Koordinate B7');

echo $fails ? "\n$fails Fehler\n" : "\nAlle Tests grün\n";
exit($fails ? 1 : 0);
