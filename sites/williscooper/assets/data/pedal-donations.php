<?php
/*
 * Pedal for a Purpose: live JustGiving total for pedal-for-a-purpose.html.
 * Reads the public JustGiving page at most once every 5 minutes, keeps the last
 * good figures in pedal-donations-cache.txt and serves those if JustGiving fails.
 * Takes no input. Safe to delete, with its cache file, once the appeal has closed.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

$source = 'https://www.justgiving.com/page/willis-cooper';
$cacheFile = __DIR__ . '/pedal-donations-cache.txt';
$ttl = 300;

function read_cache($file) {
    if (!is_file($file)) { return null; }
    $data = json_decode((string) @file_get_contents($file), true);
    return is_array($data) && isset($data['total']) ? $data : null;
}

function to_number($text) {
    return (float) str_replace(',', '', $text);
}

function fetch_figures($url) {
    if (!function_exists('curl_init')) { return null; }
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; WillisCooperTracker/1.0)',
    ));
    $html = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($html === false || $code !== 200) { return null; }

    $text = preg_replace('#<(script|style)\b.*?</\1>#si', ' ', $html);
    $text = html_entity_decode(strip_tags((string) $text), ENT_QUOTES, 'UTF-8');
    $text = preg_replace('/\s+/u', ' ', (string) $text);

    if (!preg_match('/Total\s*£([\d,]+(?:\.\d{2})?)(?:\s*\+\s*£([\d,]+(?:\.\d{2})?)\s*Gift Aid)?/u', (string) $text, $m)) {
        return null;
    }
    $figures = array('total' => to_number($m[1]), 'giftAid' => isset($m[2]) ? to_number($m[2]) : 0.0);
    if ($figures['total'] <= 0) { return null; }

    $figures['donations'] = (preg_match('/supporters-count"[^>]*>(\d+)/', $html, $c) || preg_match('/(\d+)\s*donations?/', (string) $text, $c)) ? (int) $c[1] : null;
    $figures['target'] = preg_match('/targetWithCurrency[^0-9]{1,60}value[^0-9]{1,6}(\d+)/', $html, $t) ? ((int) $t[1]) / 100 : null;
    return $figures;
}

$cached = read_cache($cacheFile);
if ($cached && isset($cached['checked']) && time() - (int) $cached['checked'] < $ttl) {
    echo json_encode($cached);
    exit;
}

/* Only one visitor refreshes at a time, everyone else gets the last good figures. */
$lock = @fopen($cacheFile . '.lock', 'c');
if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) {
    if ($cached) { echo json_encode($cached); exit; }
    flock($lock, LOCK_EX);
}

$figures = fetch_figures($source);
if ($figures) {
    if ($figures['target'] === null && $cached && isset($cached['target'])) { $figures['target'] = $cached['target']; }
    if ($figures['donations'] === null && $cached && isset($cached['donations'])) { $figures['donations'] = $cached['donations']; }
    $figures['checked'] = time();
    @file_put_contents($cacheFile, json_encode($figures), LOCK_EX);
    echo json_encode($figures);
} elseif ($cached) {
    echo json_encode($cached);
} else {
    http_response_code(503);
    echo json_encode(array('error' => 'unavailable'));
}
if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
