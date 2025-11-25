<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $spots = json_decode(file_get_contents('spots.json'), true) ?: [];
    $spots[] = [
        'name' => $data['name'],
        'lat' => $data['lat'],
        'lng' => $data['lng'],
        'author' => $data['author'] ?? 'Anonyme',
        'date' => date('Y-m-d H:i')
    ];
    file_put_contents('spots.json', json_encode($spots, JSON_PRETTY_PRINT));
    echo json_encode(['success' => true]);
} else {
    echo file_get_contents('spots.json');
}
?>
