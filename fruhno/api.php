<?php
// Fruhno multiplayer API (one JSON state file, no database).
//
//   GET  api.php            → state as seen by the player (hand of the caller only)
//   POST api.php {action…}  → host, join, leave, addbot, removebot, start, end,
//                              play, draw, pass, fruhno, catch, skip, chat
//
// Headers: X-Fruhno-Key (shared key, SHA-256 in config.php), X-Fruhno-Name (Daniel|Lea|Kira),
// X-Fruhno-Token (issued by host/join). config.php is written by the deploy workflow.

require __DIR__ . '/engine.php';

const FR_BOT_DELAY = 1.2;
const FR_STALE_PLAYER = 25;
const FR_IDLE_RESET = 7200;

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if ($origin === 'https://crazyviperpilot.github.io' || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, X-Fruhno-Key, X-Fruhno-Name, X-Fruhno-Token');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) fail(500, 'config.php fehlt');
$config = require $configFile;
$key = isset($_SERVER['HTTP_X_FRUHNO_KEY']) ? $_SERVER['HTTP_X_FRUHNO_KEY'] : '';
if ($key === '' || !hash_equals($config['key_sha256'], hash('sha256', $key))) fail(401, 'Falscher oder fehlender Schlüssel');

$name = isset($_SERVER['HTTP_X_FRUHNO_NAME']) ? $_SERVER['HTTP_X_FRUHNO_NAME'] : '';
if (!in_array($name, FR_NAMES, true)) fail(400, 'Unbekannter Spielername');
$token = isset($_SERVER['HTTP_X_FRUHNO_TOKEN']) ? $_SERVER['HTTP_X_FRUHNO_TOKEN'] : '';

$dataDir = isset($config['data_dir']) ? $config['data_dir'] : __DIR__ . '/data';
if (!is_dir($dataDir) && !mkdir($dataDir, 0750, true)) fail(500, 'Datenordner nicht anlegbar');
// The file name derives from the key hash, so it can't be guessed if the web server ignores .htaccess.
$fp = fopen($dataDir . '/state-' . substr($config['key_sha256'], 0, 20) . '.json', 'c+');
if (!$fp) fail(500, 'Datei nicht lesbar');
flock($fp, LOCK_EX);

function empty_state() {
    return ['version' => 0, 'phase' => 'none', 'host' => null, 'players' => [], 'scores' => [], 'game' => null,
            'winner' => null, 'points' => 0, 'chat' => [], 'log' => [], 'updated' => time(), 'botAt' => 0, 'round' => 0];
}

$st = json_decode(stream_get_contents($fp), true);
if (!is_array($st) || !isset($st['phase'])) $st = empty_state();
$now = microtime(true);
$dirty = false;

function player_idx($st, $n) { foreach ($st['players'] as $i => $p) if ($p['name'] === $n) return $i; return -1; }
function add_chat(&$st, $name, $text, $kind = 'msg') {
    if ($kind === true) $kind = 'sys';
    $n = count($st['chat']) ? $st['chat'][count($st['chat']) - 1]['n'] + 1 : 1;
    $st['chat'][] = ['n' => $n, 'name' => $name, 'text' => $text, 't' => time(), 'kind' => $kind, 'sys' => $kind !== 'msg'];
    $st['chat'] = array_slice($st['chat'], -60);
}
const FR_CHAT_TTL = 300;
// Moves the game's collected event texts into the chat as quiet action lines.
function drain_events(&$st) {
    if (empty($st['game']['events'])) return;
    foreach ($st['game']['events'] as $t) add_chat($st, '', $t, 'act');
    $st['game']['events'] = [];
}
function add_log(&$st, $text, $kind = 'act') { $st['log'][] = $text; $st['log'] = array_slice($st['log'], -6); add_chat($st, '', $text, $kind); }
function schedule_bot(&$st, $now) {
    $g = $st['game'];
    if ($st['phase'] !== 'playing' || !$g) return;
    $i = player_idx($st, $g['turnName']);
    if ($i >= 0 && !empty($st['players'][$i]['bot'])) $st['botAt'] = $now + FR_BOT_DELAY;
}
function finish_if_won(&$st) {
    $g = $st['game'];
    if (!$g || empty($g['winner'])) return;
    $w = $g['winner'];
    $pts = fr_scores($g, $w);
    $st['scores'][$w] = (isset($st['scores'][$w]) ? $st['scores'][$w] : 0) + $pts;
    $st['phase'] = 'finished';
    $st['winner'] = $w;
    $st['points'] = $pts;
    add_log($st, "🏆 $w gewinnt die Runde (+$pts)", 'sys');
}
function reset_all(&$st) {
    $chat = $st['chat'];
    $st = empty_state();
    $st['chat'] = array_slice($chat, -20);
}
function remove_player(&$st, $n) {
    $i = player_idx($st, $n);
    if ($i < 0) return;
    array_splice($st['players'], $i, 1);
    unset($st['scores'][$n]);
    if ($st['phase'] === 'playing' && $st['game']) {
        $g = &$st['game'];
        $nextName = $g['turnName'] === $n ? $g['order'][fr_next($g, $g['turnIdx'])] : $g['turnName'];
        foreach ($g['hands'][$n] as $c) array_unshift($g['draw'], $c);
        unset($g['hands'][$n], $g['called'][$n]);
        array_splice($g['order'], array_search($n, $g['order'], true), 1);
        if (count($g['order']) >= 2) fr_set_turn($g, array_search($nextName, $g['order'], true));
        if ($g['uno'] && $g['uno']['name'] === $n) $g['uno'] = null;
        unset($g);
    }
    if ($st['host'] === $n) {
        $st['host'] = null;
        foreach ($st['players'] as $p) if (empty($p['bot'])) { $st['host'] = $p['name']; break; }
    }
    $humans = 0;
    foreach ($st['players'] as $p) if (empty($p['bot'])) $humans++;
    if ($humans === 0 || ($st['phase'] === 'playing' && count($st['players']) < 2)) { reset_all($st); }
    elseif ($st['phase'] === 'finished' && count($st['players']) < 2) { $st['phase'] = 'lobby'; }
}

// --- housekeeping: expire dead lobbies/games, drop long-gone players -----------------------------
if ($st['phase'] !== 'none' && time() - $st['updated'] > FR_IDLE_RESET) { reset_all($st); $dirty = true; }

// Chat messages disappear after five minutes.
$kept = array_values(array_filter($st['chat'], function ($m) { return time() - $m['t'] < FR_CHAT_TTL; }));
if (count($kept) !== count($st['chat'])) { $st['chat'] = $kept; $dirty = true; }

$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body) || empty($body['action'])) fail(400, 'Erwartet {"action": …}');
} elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    fail(405, 'Nur GET und POST');
}

$me = player_idx($st, $name);
$issued = null;
$error = null;

// Presence + auth for players already in the table.
if ($me >= 0) {
    $p = &$st['players'][$me];
    $stale = $now - $p['seen'] > FR_STALE_PLAYER;
    $authed = $token !== '' && hash_equals($p['token'], $token);
    $p['seen'] = $now;
    unset($p);
    if (!$authed && !$stale) $me = -2; // name taken by someone else
}

// Bots act when due (before handling the request so state is current).
function tick_bots(&$st, $now, &$dirty) {
    for ($guard = 0; $guard < 6; $guard++) {
        if ($st['phase'] !== 'playing' || !$st['game'] || $st['botAt'] <= 0 || $now < $st['botAt']) return;
        $g = &$st['game'];
        $n = $g['turnName'];
        $i = player_idx($st, $n);
        if ($i < 0 || empty($st['players'][$i]['bot'])) { $st['botAt'] = 0; unset($g); return; }
        $wasCalled = !empty($g['called'][$n]);
                $err = fr_bot_move($g, $n);
        if (!$wasCalled && !empty($g['called'][$n]) && count($g['hands'][$n]) === 1) add_chat($st, $n, "$n ruft Fruhno! 🥐 Nur noch eine Karte", true);
        unset($g);
        drain_events($st);
        $st['version']++; $st['updated'] = time(); $dirty = true;
        finish_if_won($st);
        $st['botAt'] = 0;
        schedule_bot($st, $now);
        if ($st['botAt'] > 0) $st['botAt'] = $now + FR_BOT_DELAY * ($guard + 1); // never chain instantly
        return;
    }
}
tick_bots($st, $now, $dirty);

$action = isset($body['action']) ? $body['action'] : null;

if ($action !== null) {
    if ($me === -2) {
        $error = 'Der Name ist gerade belegt';
    } else switch ($action) {
        case 'host':
            if ($st['phase'] !== 'none') { $error = 'Es läuft schon ein Spiel oder eine Lobby'; break; }
            $chat = $st['chat'];
            $st = empty_state();
            $st['chat'] = $chat;
            $issued = bin2hex(random_bytes(12));
            $st['phase'] = 'lobby'; $st['host'] = $name;
            $st['players'] = [['name' => $name, 'bot' => false, 'token' => $issued, 'seen' => $now]];
            add_log($st, "$name hostet ein Spiel");
            break;
        case 'join':
            if ($st['phase'] !== 'lobby' && !($st['phase'] === 'playing' && $me >= 0) && !($st['phase'] === 'finished' && $me >= 0)) { $error = 'Keine offene Lobby'; break; }
            if ($me >= 0) { $st['players'][$me]['token'] = $issued = bin2hex(random_bytes(12)); break; } // rejoin
            if (count($st['players']) >= FR_MAX_PLAYERS) { $error = 'Die Lobby ist voll'; break; }
            $issued = bin2hex(random_bytes(12));
            $st['players'][] = ['name' => $name, 'bot' => false, 'token' => $issued, 'seen' => $now];
            add_log($st, "$name ist beigetreten");
            break;
        case 'leave':
            if ($me < 0) break;
            add_log($st, "$name hat das Spiel verlassen");
            remove_player($st, $name);
            break;
        case 'addbot':
            if ($st['host'] !== $name || !in_array($st['phase'], ['lobby', 'finished'], true)) { $error = 'Nur der Host in der Lobby'; break; }
            if (count($st['players']) >= FR_MAX_PLAYERS) { $error = 'Die Lobby ist voll'; break; }
            $bn = 'Bot';
            if (player_idx($st, $bn) >= 0) $bn = 'Bot 2';
            $st['players'][] = ['name' => $bn, 'bot' => true, 'token' => '', 'seen' => $now];
            add_log($st, "$bn wurde hinzugefügt");
            break;
        case 'removebot':
            if ($st['host'] !== $name || !in_array($st['phase'], ['lobby', 'finished'], true)) { $error = 'Nur der Host in der Lobby'; break; }
            foreach ($st['players'] as $p) if (!empty($p['bot'])) { remove_player($st, $p['name']); break; }
            break;
        case 'start':
            if ($st['host'] !== $name) { $error = 'Nur der Host kann starten'; break; }
            if (!in_array($st['phase'], ['lobby', 'finished'], true)) { $error = 'Schon gestartet'; break; }
            if (count($st['players']) < 2) { $error = 'Mindestens 2 Spieler nötig'; break; }
            $names = array_map(function ($p) { return $p['name']; }, $st['players']);
            $st['round']++;
            $st['game'] = fr_new_game($names, $st['round'] - 1);
            $st['phase'] = 'playing'; $st['winner'] = null; $st['points'] = 0;
            foreach ($names as $n) if (!isset($st['scores'][$n])) $st['scores'][$n] = 0;
            add_log($st, 'Runde ' . $st['round'] . ' beginnt');
            schedule_bot($st, $now);
            break;
        case 'end':
            if ($st['host'] !== $name || $st['phase'] === 'none') { $error = 'Nur der Host kann beenden'; break; }
            $chat = $st['chat'];
            reset_all($st);
            $st['chat'] = $chat;
            add_log($st, "$name hat das Spiel beendet");
            break;
        case 'chat':
            if ($me < 0) { $error = 'Nicht im Spiel'; break; }
            $text = trim(mb_substr((string)(isset($body['text']) ? $body['text'] : ''), 0, 200));
            if ($text === '') break;
            add_chat($st, $name, $text);
            break;
        case 'play': case 'draw': case 'pass': case 'fruhno': case 'catch': case 'skip':
            if ($st['phase'] !== 'playing' || $me < 0) { $error = 'Kein laufendes Spiel'; break; }
            $g = &$st['game'];
            if ($action === 'play') {
                $card = isset($body['card']) && is_array($body['card']) && count($body['card']) === 2 ? [(int)$body['card'][0], (int)$body['card'][1]] : [-1, -1];
                $error = fr_play($g, $name, (int)(isset($body['index']) ? $body['index'] : -1), $card, (int)(isset($body['color']) ? $body['color'] : -1));
                if (!$error) { drain_events($st); finish_if_won($st); }
            } elseif ($action === 'draw') {
                $error = fr_draw_action($g, $name);
                if (!$error) drain_events($st);
            } elseif ($action === 'pass') {
                $error = fr_pass($g, $name);
                if (!$error) drain_events($st);
            } elseif ($action === 'fruhno') {
                if (count($g['hands'][$name]) > 2) { $error = 'Zu früh'; break; }
                if (empty($g['called'][$name])) add_chat($st, $name, "$name ruft Fruhno! 🥐 Nur noch eine Karte", true);
                $g['called'][$name] = true;
                if ($g['uno'] && $g['uno']['name'] === $name) $g['uno']['called'] = true;
            } elseif ($action === 'catch') {
                if (!$g['uno'] || $g['uno']['called'] || $g['uno']['name'] === $name) { $error = 'Da gibt es nichts zu erwischen'; break; }
                $victim = $g['uno']['name'];
                fr_draw($g, $victim, 2);
                $g['uno'] = null;
                add_log($st, "$name erwischt $victim (+2)", 'sys');
            } elseif ($action === 'skip') {
                if ($st['host'] !== $name) { $error = 'Nur der Host kann überspringen'; break; }
                $g['uno'] = null;
                fr_set_turn($g, fr_next($g, $g['turnIdx']));
                add_log($st, $g['order'][fr_next($g, $g['turnIdx'], -1)] . ' wurde übersprungen');
            }
            unset($g);
            if (!$error) schedule_bot($st, $now);
            break;
        default:
            $error = 'Unbekannte Aktion';
    }
    if ($error === null) { $st['version']++; $st['updated'] = time(); $dirty = true; }
}
if ($me !== -2) $me = player_idx($st, $name);

if ($dirty || $action !== null) {
    ftruncate($fp, 0); rewind($fp);
    fwrite($fp, json_encode($st, JSON_UNESCAPED_UNICODE));
} elseif ($me >= 0) {
    // presence only: persist lastSeen quietly
    ftruncate($fp, 0); rewind($fp);
    fwrite($fp, json_encode($st, JSON_UNESCAPED_UNICODE));
}
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

// --- response: the table as seen by this player --------------------------------------------------
$players = [];
foreach ($st['players'] as $p) {
    $row = ['name' => $p['name'], 'bot' => !empty($p['bot']), 'online' => !empty($p['bot']) || $now - $p['seen'] < FR_STALE_PLAYER,
            'score' => isset($st['scores'][$p['name']]) ? $st['scores'][$p['name']] : 0];
    if ($st['game'] && isset($st['game']['hands'][$p['name']])) $row['cards'] = count($st['game']['hands'][$p['name']]);
    $players[] = $row;
}
$out = ['version' => $st['version'], 'phase' => $st['phase'], 'host' => $st['host'], 'players' => $players,
        'chat' => $st['chat'], 'log' => $st['log'], 'round' => $st['round'], 'winner' => $st['winner'], 'points' => $st['points'],
        'you' => $me >= 0 ? $name : null];
if ($issued !== null && $error === null) $out['token'] = $issued;
if ($error !== null) $out['error'] = $error;
if ($st['game']) {
    $g = $st['game'];
    $out['game'] = ['order' => $g['order'], 'turn' => $g['turnName'], 'dir' => $g['dir'], 'color' => $g['color'],
        'top' => $g['discard'][count($g['discard']) - 1], 'drawCount' => count($g['draw']), 'pending' => isset($g['pending']) ? $g['pending'] : 0, 'drawn' => $g['drawn'],
        'uno' => $g['uno'] ? ['name' => $g['uno']['name'], 'called' => $g['uno']['called']] : null];
    if ($me >= 0 && isset($g['hands'][$name])) {
        $out['game']['hand'] = $g['hands'][$name];
        $out['game']['playable'] = $st['phase'] === 'playing' ? fr_playable($g, $name) : [];
    }
    if ($st['phase'] === 'finished') $out['game']['hands'] = $g['hands'];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE);
