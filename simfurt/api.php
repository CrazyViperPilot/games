<?php
// Simfurt Spielstand-API: drei Plätze, nur für Daniel (kein Login, kein Code).
//
//   GET  api.php?ping=1        → {"ok":true,"app":"simfurt"}  (Erreichbarkeit)
//   GET  api.php?list=1        → {"slots": {"1": {meta}|null, "2": ..., "3": ...}}
//   GET  api.php?slot=N        → {"meta": {...}, "data": "<base64 gzip>"} oder {"meta": null}
//   POST api.php               → {"action":"save","slot":N,"meta":{...},"data":"<base64 gzip>"} | {"action":"delete","slot":N}
//
// Das Spiel (GitHub Pages) schickt den gepackten Spielstand; der Server speichert ihn unverändert.
// Dateien liegen in simfurt/data/ (per .htaccess gesperrt, wird beim Deploy nie überschrieben).

const SF_MAX_BYTES = 4 * 1024 * 1024; // gepackter Stand, normal < 100 KB
const SF_SLOTS = [1, 2, 3];

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowed = $origin === 'https://crazyviperpilot.github.io' || preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin);
if ($allowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

// Browser anderer Seiten dürfen nicht schreiben.
if ($origin !== '' && !$allowed) fail(403, 'Herkunft nicht erlaubt');

$dir = __DIR__ . '/data';
if (!is_dir($dir) && !mkdir($dir, 0750, true)) fail(500, 'Datenordner nicht anlegbar');

$lock = fopen($dir . '/lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) fail(500, 'Sperre nicht möglich');

function sf_cut($s, $n) { return function_exists('mb_substr') ? mb_substr($s, 0, $n, 'UTF-8') : substr($s, 0, $n); }

function slot_files($dir, $slot) { return [$dir . "/slot$slot.bin", $dir . "/slot$slot.meta.json"]; }

function read_meta($dir, $slot) {
    [$bin, $meta] = slot_files($dir, $slot);
    if (!is_file($meta) || !is_file($bin)) return null;
    $m = json_decode((string) file_get_contents($meta), true);
    return is_array($m) ? $m : null;
}

function write_atomic($path, $bytes) {
    $tmp = $path . '.tmp';
    if (file_put_contents($tmp, $bytes) !== strlen($bytes)) { @unlink($tmp); return false; }
    return rename($tmp, $path);
}

function get_slot($src) {
    $slot = isset($src['slot']) ? (int) $src['slot'] : 0;
    if (!in_array($slot, SF_SLOTS, true)) fail(400, 'Platz ungültig');
    return $slot;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['ping'])) { echo json_encode(['ok' => true, 'app' => 'simfurt']); exit; }
    if (isset($_GET['list'])) {
        $out = [];
        foreach (SF_SLOTS as $s) $out[(string) $s] = read_meta($dir, $s);
        echo json_encode(['slots' => $out]);
        exit;
    }
    $slot = get_slot($_GET);
    $meta = read_meta($dir, $slot);
    if (!$meta) { echo json_encode(['meta' => null]); exit; }
    [$bin] = slot_files($dir, $slot);
    echo json_encode(['meta' => $meta, 'data' => base64_encode((string) file_get_contents($bin))]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'Methode nicht erlaubt');

$body = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($body) || !isset($body['action'])) fail(400, 'Ungültige Anfrage');
$slot = get_slot($body);
[$bin, $metaFile] = slot_files($dir, $slot);

if ($body['action'] === 'delete') {
    @unlink($bin); @unlink($metaFile); @unlink($dir . "/prev$slot.bin"); @unlink($dir . "/prev$slot.meta.json");
    echo json_encode(['ok' => true]);
    exit;
}

if ($body['action'] !== 'save') fail(400, 'Unbekannte Aktion');
$meta = isset($body['meta']) ? $body['meta'] : null;
$data = isset($body['data']) ? $body['data'] : null;
if (!is_array($meta) || !is_string($data)) fail(400, 'meta oder data fehlt');
foreach (['savedAt', 'format', 'year', 'month', 'pop', 'money'] as $k) {
    if (!isset($meta[$k]) || !is_numeric($meta[$k])) fail(400, "meta.$k fehlt");
}
$bytes = base64_decode($data, true);
if ($bytes === false || strlen($bytes) < 20 || strlen($bytes) > SF_MAX_BYTES) fail(413, 'Stand ungültig oder zu groß');
if (substr($bytes, 0, 2) !== "\x1f\x8b") fail(400, 'Stand ist nicht gepackt (gzip)');

// Nur bekannte Meta-Felder speichern.
$clean = [
    'savedAt' => (float) $meta['savedAt'], 'format' => (int) $meta['format'],
    'name' => isset($meta['name']) ? sf_cut((string) $meta['name'], 24) : 'Simfurt',
    'year' => (int) $meta['year'], 'month' => (int) $meta['month'], 'pop' => (int) $meta['pop'], 'money' => (int) $meta['money'],
    'mapSize' => isset($meta['mapSize']) ? (int) $meta['mapSize'] : (isset($meta['size']) && (int) $meta['size'] <= 256 ? (int) $meta['size'] : 64),
    'bytes' => strlen($bytes),
];

// Den bisherigen Stand als Rückfall behalten.
if (is_file($bin) && is_file($metaFile)) {
    @copy($bin, $dir . "/prev$slot.bin");
    @copy($metaFile, $dir . "/prev$slot.meta.json");
}
if (!write_atomic($bin, $bytes) || !write_atomic($metaFile, json_encode($clean, JSON_UNESCAPED_UNICODE))) fail(500, 'Schreiben fehlgeschlagen');
echo json_encode(['ok' => true, 'meta' => $clean]);
