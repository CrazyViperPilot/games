<?php
// Schiffe versenken – Multiplayer-API für 2 Spieler. Ein JSON-File pro Raum, keine Datenbank, kein Passwort.
//
//   GET  api.php?list=1               → offene Räume (Lobby) zum Beitreten
//   GET  api.php?room=ABC123          → Raum aus Sicht des Spielers (Header X-SV-Token)
//   POST api.php {action, …}          → host {name}, join {room, name}, place {room, ships}, shoot {room, x, y},
//                                       chat {room, text}, rematch {room}, leave {room}
//
// Wer hostet oder beitritt, bekommt ein Token; damit spielt er weiter (auch nach einem Neuladen).

require __DIR__ . '/engine.php';

const SV_STALE = 20;          // s ohne Abfrage → offline
const SV_LOBBY_GONE = 600;    // offene Lobby ohne Host so lange → löschen
const SV_IDLE = 7200;         // Raum ohne Lebenszeichen so lange → löschen
const SV_MAX_ROOMS = 80;

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if ($origin === 'https://crazyviperpilot.github.io' || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, X-SV-Token');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir) && !mkdir($dataDir, 0750, true)) fail(500, 'Datenordner nicht anlegbar');
$now = microtime(true);

function room_file($id) { global $dataDir; return $dataDir . '/room-' . $id . '.json'; }
function valid_room_id($id) { return is_string($id) && preg_match('/^[A-Z0-9]{6}$/', $id); }
function clean_name($n) {
    $n = preg_replace('/[\x00-\x1F\x7F]/u', '', (string)$n);
    $n = trim(preg_replace('/\s+/u', ' ', $n));
    return mb_substr($n, 0, 16);
}
function last_seen($room) { $m = 0; foreach ($room['players'] as $p) $m = max($m, $p['seen']); return $m; }
function add_chat(&$room, $name, $text, $kind = 'msg') {
    $n = count($room['chat']) ? $room['chat'][count($room['chat']) - 1]['n'] + 1 : 1;
    $room['chat'][] = ['n' => $n, 'name' => $name, 'text' => $text, 't' => time(), 'kind' => $kind];
    $room['chat'] = array_slice($room['chat'], -80);
}
function reset_round(&$room) {
    foreach ($room['players'] as &$p) { $p['ships'] = null; $p['ready'] = false; $p['grid'] = array_fill(0, SV_SIZE * SV_SIZE, 0); $p['shots'] = 0; $p['hits'] = 0; }
    unset($p);
    $room['winner'] = null; $room['turn'] = null; $room['last'] = null;
}
function new_player($name, $now) {
    return ['name' => $name, 'token' => bin2hex(random_bytes(12)), 'seen' => $now, 'ready' => false, 'ships' => null,
            'grid' => array_fill(0, SV_SIZE * SV_SIZE, 0), 'shots' => 0, 'hits' => 0, 'score' => 0];
}

// --- Liste offener Räume (räumt nebenbei auf) ----------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['list'])) {
    $open = [];
    $running = 0;
    foreach (glob($dataDir . '/room-*.json') ?: [] as $f) {
        $room = json_decode((string)@file_get_contents($f), true);
        if (!is_array($room) || !isset($room['phase'])) { if (@filemtime($f) < time() - 60) @unlink($f); continue; }
        $seen = last_seen($room);
        if ($now - $seen > SV_IDLE || ($room['phase'] === 'lobby' && $now - $seen > SV_LOBBY_GONE)) { @unlink($f); continue; }
        if ($room['phase'] === 'lobby' && count($room['players']) === 1 && $now - $seen < SV_STALE) {
            $open[] = ['room' => $room['id'], 'host' => $room['players'][0]['name'], 'since' => (int)($now - $room['created'])];
        } elseif (count($room['players']) === 2 && $now - $seen < SV_STALE) {
            $running++;
        }
    }
    usort($open, function ($a, $b) { return $a['since'] - $b['since']; });
    echo json_encode(['rooms' => $open, 'running' => $running], JSON_UNESCAPED_UNICODE);
    exit;
}

// --- Raum öffnen ---------------------------------------------------------------------------------
$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body) || empty($body['action'])) fail(400, 'Erwartet {"action": …}');
} elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    fail(405, 'Nur GET und POST');
}
$action = isset($body['action']) ? (string)$body['action'] : null;
$token = isset($_SERVER['HTTP_X_SV_TOKEN']) ? (string)$_SERVER['HTTP_X_SV_TOKEN'] : '';
$issued = null;

if ($action === 'host') {
    $name = clean_name(isset($body['name']) ? $body['name'] : '');
    if ($name === '') fail(400, 'Bitte einen Namen eingeben');
    if (count(glob($dataDir . '/room-*.json') ?: []) >= SV_MAX_ROOMS) fail(503, 'Gerade sind zu viele Spiele offen');
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for ($try = 0; $try < 20; $try++) {
        $id = '';
        for ($i = 0; $i < 6; $i++) $id .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        $fp = @fopen(room_file($id), 'x+');
        if ($fp) break;
    }
    if (!$fp) fail(500, 'Raum nicht anlegbar');
    flock($fp, LOCK_EX);
    $p = new_player($name, $now);
    $issued = $p['token'];
    $room = ['id' => $id, 'created' => $now, 'version' => 1, 'phase' => 'lobby', 'round' => 0, 'players' => [$p],
             'turn' => null, 'winner' => null, 'last' => null, 'seq' => 0, 'chat' => []];
    add_chat($room, '', "$name hat das Spiel eröffnet", 'sys');
    $me = 0;
    $error = null;
} else {
    $id = isset($body['room']) ? $body['room'] : (isset($_GET['room']) ? $_GET['room'] : '');
    if (!valid_room_id($id)) fail(400, 'Ungültiger Raum');
    $fp = @fopen(room_file($id), 'r+');
    if (!$fp) fail(404, 'Das Spiel gibt es nicht mehr');
    flock($fp, LOCK_EX);
    $room = json_decode(stream_get_contents($fp), true);
    if (!is_array($room) || !isset($room['phase'])) { flock($fp, LOCK_UN); fclose($fp); fail(404, 'Das Spiel gibt es nicht mehr'); }

    $me = -1;
    if ($token !== '') foreach ($room['players'] as $i => $p) if (hash_equals($p['token'], $token)) $me = $i;
    if ($me >= 0) $room['players'][$me]['seen'] = $now;
    $error = null;

    if ($action !== null) {
        $other = $me >= 0 ? 1 - $me : -1;
        switch ($action) {
            case 'join':
                if ($me >= 0) break; // schon drin
                $name = clean_name(isset($body['name']) ? $body['name'] : '');
                if ($name === '') { $error = 'Bitte einen Namen eingeben'; break; }
                if ($room['phase'] !== 'lobby' || count($room['players']) >= 2) { $error = 'Das Spiel ist schon voll'; break; }
                if (mb_strtolower($room['players'][0]['name']) === mb_strtolower($name)) $name = mb_substr($name, 0, 14) . ' 2';
                $p = new_player($name, $now);
                $issued = $p['token'];
                $room['players'][] = $p;
                $me = 1;
                $room['phase'] = 'placing';
                $room['round']++;
                reset_round($room);
                add_chat($room, '', "$name ist an Bord – Schiffe aufstellen!", 'sys');
                break;
            case 'place':
                if ($me < 0) { $error = 'Du spielst hier nicht mit'; break; }
                if ($room['phase'] !== 'placing') { $error = 'Gerade wird nicht aufgestellt'; break; }
                [$ships, $err] = sv_validate_fleet(isset($body['ships']) ? $body['ships'] : null);
                if ($err) { $error = $err; break; }
                $room['players'][$me]['ships'] = $ships;
                $room['players'][$me]['ready'] = true;
                if (count($room['players']) === 2 && $room['players'][0]['ready'] && $room['players'][1]['ready']) {
                    $room['phase'] = 'playing';
                    // Runde 1 beginnt der Gast, danach immer der Verlierer der letzten Runde.
                    if ($room['turn'] === null) $room['turn'] = isset($room['starter']) ? $room['starter'] : 1;
                    add_chat($room, '', 'Alle Flotten bereit. ' . $room['players'][$room['turn']]['name'] . ' eröffnet das Feuer!', 'sys');
                }
                break;
            case 'unready':
                if ($me < 0 || $room['phase'] !== 'placing') { $error = 'Geht gerade nicht'; break; }
                $room['players'][$me]['ready'] = false;
                break;
            case 'shoot':
                if ($me < 0) { $error = 'Du spielst hier nicht mit'; break; }
                if ($room['phase'] !== 'playing') { $error = 'Das Gefecht läuft nicht'; break; }
                if ($room['turn'] !== $me) { $error = 'Du bist nicht dran'; break; }
                $x = isset($body['x']) ? $body['x'] : -1; $y = isset($body['y']) ? $body['y'] : -1;
                $target = &$room['players'][$other];
                $r = sv_shoot($target['ships'], $target['grid'], is_int($x) ? $x : -1, is_int($y) ? $y : -1);
                if (isset($r['error'])) { unset($target); $error = $r['error']; break; }
                $room['players'][$me]['shots']++;
                if ($r['res'] !== 'miss') $room['players'][$me]['hits']++;
                $room['seq']++;
                $room['last'] = ['seq' => $room['seq'], 'by' => $me, 'x' => $x, 'y' => $y, 'res' => $r['res'], 'ship' => $r['ship']];
                $who = $room['players'][$me]['name'];
                $at = sv_coord($x, $y);
                if ($r['res'] === 'miss') { $room['turn'] = $other; add_chat($room, '', "$who: $at – Wasser", 'act'); }
                elseif ($r['res'] === 'hit') add_chat($room, '', "$who: $at – Treffer!", 'act');
                else add_chat($room, '', "$who versenkt " . ($r['ship'] === 3 ? 'das ' : 'den ') . SV_SHIP_NAMES[$r['ship']] . " ($at)", 'sys');
                unset($target);
                if ($r['won']) {
                    $room['phase'] = 'finished';
                    $room['winner'] = $me;
                    $room['starter'] = $other;
                    $room['players'][$me]['score']++;
                    add_chat($room, '', "🏆 $who gewinnt die Seeschlacht!", 'sys');
                }
                break;
            case 'rematch':
                if ($me < 0 || $room['phase'] !== 'finished' || count($room['players']) < 2) { $error = 'Geht gerade nicht'; break; }
                $room['phase'] = 'placing';
                $room['round']++;
                reset_round($room);
                add_chat($room, '', $room['players'][$me]['name'] . ' will Revanche – neue Runde, Schiffe aufstellen!', 'sys');
                break;
            case 'chat':
                if ($me < 0) { $error = 'Du spielst hier nicht mit'; break; }
                $text = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', mb_substr((string)(isset($body['text']) ? $body['text'] : ''), 0, 200)));
                if ($text !== '') add_chat($room, $room['players'][$me]['name'], $text);
                break;
            case 'leave':
                if ($me < 0) break;
                $who = $room['players'][$me]['name'];
                array_splice($room['players'], $me, 1);
                $me = -1;
                if (!count($room['players'])) { $room['phase'] = 'gone'; break; }
                // Der Verbliebene wird Host einer neuen offenen Lobby.
                $room['phase'] = 'lobby';
                $room['players'][0]['score'] = 0;
                unset($room['starter']);
                reset_round($room);
                $room['created'] = $now;
                add_chat($room, '', "$who hat das Spiel verlassen. Warte auf neuen Gegner …", 'sys');
                break;
            default:
                $error = 'Unbekannte Aktion';
        }
        if ($error === null) $room['version']++;
    }
}

if ($room['phase'] === 'gone') {
    flock($fp, LOCK_UN); fclose($fp); @unlink(room_file($id));
    echo json_encode(['phase' => 'gone'], JSON_UNESCAPED_UNICODE);
    exit;
}
ftruncate($fp, 0); rewind($fp);
fwrite($fp, json_encode($room, JSON_UNESCAPED_UNICODE));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

// --- Antwort aus Sicht des Spielers --------------------------------------------------------------
$players = [];
foreach ($room['players'] as $i => $p) {
    $players[] = ['name' => $p['name'], 'online' => $now - $p['seen'] < SV_STALE, 'ready' => $p['ready'], 'score' => $p['score'],
                  'shots' => $p['shots'], 'hits' => $p['hits']];
}
$out = ['room' => $room['id'], 'version' => $room['version'], 'phase' => $room['phase'], 'round' => $room['round'],
        'players' => $players, 'you' => $me, 'turn' => $room['turn'], 'winner' => $room['winner'], 'last' => $room['last'],
        'chat' => $room['chat'], 'fleet' => SV_FLEET];
if ($me >= 0) {
    $mine = $room['players'][$me];
    $out['me'] = ['ships' => $mine['ships'], 'grid' => $mine['grid']];
    if (count($room['players']) === 2) {
        $opp = $room['players'][1 - $me];
        $sunk = [];
        foreach (($opp['ships'] ?: []) as $i => $s) {
            if ($s['sunk'] || $room['phase'] === 'finished') $sunk[] = ['i' => $i, 'x' => $s['x'], 'y' => $s['y'], 'len' => $s['len'], 'dir' => $s['dir'], 'sunk' => $s['sunk']];
        }
        $out['enemy'] = ['grid' => $opp['grid'], 'ships' => $sunk];
    }
}
if ($issued !== null && $error === null) $out['token'] = $issued;
if ($error !== null) $out['error'] = $error;
echo json_encode($out, JSON_UNESCAPED_UNICODE);
