<?php
// filter_vehicles.php

// Initialize the cURL request for data.
$curl = curl_init();

curl_setopt_array($curl, array(
    CURLOPT_URL => "https://api.autotrader.co.uk/stock?advertiserId=10012129",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => array(
        "Authorization: Bearer " . "YjI4NmIwODkxM2JjZmJlNThjMDFmYzE3NmY1YzZkMQ==:M5j3oaC/jDcL16O6yxmPasdZiLrdtT/XZcgh+Cj4SVIk8oJf4TZFFlsA/UqtFjqXxasqCKFRFNbVQkeVFBOCdA==",
        // "Authorization: Bearer " . "number here",
        "api-key: " . "HoldensAgency-DealerWebsite-14-11-23",
        // "api-key: " . "number here"
        "api-secret: " . "YuLBChmCHGryNtpLWLcSHGEzioJv1Vww"
        // "api-secret: " . "number here"
    ),
));

$response = curl_exec($curl);
$error = curl_error($curl);
curl_close($curl);

// Filter logic here.
$selected_make = $_POST['make'];

if ($error) {
    echo "cURL Error: $error";
} else {
    $data = json_decode($response, true);
    if (is_array($data)) {
        echo "<ul>";
        foreach ($data['results'] as $result) {
            $standard = $result['vehicle']['standard'];
            // if (empty($selected_make) || $selected_make === $standard['make']) {
                echo "<li>";
                echo "Make: " . $standard['make'];
                echo "</li>";
            // }
        }
        echo "</ul>";
    } else {
        echo "Failed to decode JSON.";
    }
}
?>
