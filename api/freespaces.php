<?php
/**
 * PHP-proxy for Bergen Parkering API (produksjon, f.eks. Hostinger).
 *
 * Tilsvarer /api/freespaces i server.py: gjør Basic Auth-kallet server-side,
 * skjuler tokenene og unngår CORS. Frontend kaller /api/freespaces (rutes hit
 * via .htaccess), og denne filen sender svaret videre uendret.
 *
 * Legitimasjon hentes fra (i prioritert rekkefølge):
 *   1. Miljøvariablene PARKING_TOKEN og PARKING_TOKENKEY
 *   2. secrets.json (samme fil som server.py bruker; må lastes opp separat,
 *      og er beskyttet mot nedlasting i .htaccess)
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$API_BASE = 'https://api.ledig-parkering.no/api/v3';

// --- Hent token/tokenKey ---
$token    = getenv('PARKING_TOKEN');
$tokenKey = getenv('PARKING_TOKENKEY');

if (!$token || !$tokenKey) {
    $path = __DIR__ . '/../secrets.json';
    if (is_readable($path)) {
        $secrets  = json_decode(file_get_contents($path), true);
        $token    = $token    ?: ($secrets['token']    ?? '');
        $tokenKey = $tokenKey ?: ($secrets['tokenKey'] ?? '');
    }
}

if (!$token || !$tokenKey) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Mangler token/tokenKey. Sett miljovariablene PARKING_TOKEN og '
                 . 'PARKING_TOKENKEY, eller last opp secrets.json paa serveren.',
    ]);
    exit;
}

// --- Kall det ekte API-et ---
$ch = curl_init($API_BASE . '/freespaces');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    CURLOPT_HTTPAUTH       => CURLAUTH_BASIC,
    CURLOPT_USERPWD        => $token . ':' . $tokenKey,
    CURLOPT_TIMEOUT        => 15,
]);

$body   = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err    = curl_error($ch);
curl_close($ch);

if ($body === false) {
    http_response_code(502);
    echo json_encode(['error' => $err ?: 'Nettverksfeil mot API-et']);
    exit;
}

// Send API-ets svar videre uendret (status + kropp).
http_response_code($status ?: 200);
echo $body;
