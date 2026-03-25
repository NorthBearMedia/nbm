<?php
// Generate self-contained preview.html with all pages

$pages = [
    'home' => '/home/user/nbm/index.php',
    'about' => '/home/user/nbm/about.php',
    'services' => '/home/user/nbm/services.php',
    'services-design' => '/home/user/nbm/services/design.php',
    'services-skids' => '/home/user/nbm/services/skids.php',
    'services-vessels' => '/home/user/nbm/services/vessels.php',
    'services-fabrications' => '/home/user/nbm/services/fabrications.php',
    'services-installation' => '/home/user/nbm/services/installation.php',
    'services-turnkey' => '/home/user/nbm/services/turnkey.php',
    'services-welding' => '/home/user/nbm/services/welding.php',
    'projects' => '/home/user/nbm/projects.php',
    'projects-fabrications' => '/home/user/nbm/projects/fabrications.php',
    'projects-water-treatment' => '/home/user/nbm/projects/water-treatment.php',
    'projects-food-beverage' => '/home/user/nbm/projects/food-beverage.php',
    'projects-chemical-pharma' => '/home/user/nbm/projects/chemical-pharma.php',
    'contact' => '/home/user/nbm/contact.php',
];

$css = file_get_contents('/home/user/nbm/css/style.css');

$rendered = [];
foreach ($pages as $key => $file) {
    $_SERVER['DOCUMENT_ROOT'] = '/home/user/nbm';
    ob_start();
    include $file;
    $html = ob_get_clean();
    $rendered[$key] = $html;
}

$labels = [
    'home' => 'Home',
    'about' => 'About',
    'services' => 'Services',
    'services-design' => 'Design & Planning',
    'services-skids' => 'Skids',
    'services-vessels' => 'Vessels',
    'services-fabrications' => 'Fabrications',
    'services-installation' => 'Installation',
    'services-turnkey' => 'Turnkey',
    'services-welding' => 'Welding',
    'projects' => 'Projects',
    'projects-fabrications' => 'Project: Fabrications',
    'projects-water-treatment' => 'Project: Water',
    'projects-food-beverage' => 'Project: Food',
    'projects-chemical-pharma' => 'Project: Chemical',
    'contact' => 'Contact',
];

$output = '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Musk Engineering Ltd | Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600&display=swap" rel="stylesheet">
<style>' . $css . '
/* Preview navigation bar */
.preview-nav { position: fixed; bottom: 0; left: 0; right: 0; background: #1a1a1a; z-index: 9999; padding: 10px 16px; display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; box-shadow: 0 -2px 12px rgba(0,0,0,0.3); overflow-x: auto; }
.preview-nav button { background: #333; color: #fff; border: none; padding: 6px 14px; border-radius: 999px; cursor: pointer; font-size: 12px; font-family: Roboto, sans-serif; white-space: nowrap; transition: all 0.2s; }
.preview-nav button:hover { background: #555; }
.preview-nav button.active { background: rgb(78, 193, 180); color: #0d141a; font-weight: 600; }
.page-container { display: none; }
.page-container.active { display: block; }
body { padding-bottom: 60px; }
</style>
</head>
<body>
';

// Add page containers
foreach ($rendered as $key => $html) {
    // Extract just the body content between <body> and </body>
    $bodyContent = $html;
    if (preg_match('/<body[^>]*>(.*)<\/body>/s', $html, $m)) {
        $bodyContent = $m[1];
    }
    // Remove script tags that reference local JS
    $bodyContent = preg_replace('/<script src="\/js\/main\.js"><\/script>/', '', $bodyContent);

    $activeClass = ($key === 'home') ? ' active' : '';
    $output .= '<div class="page-container' . $activeClass . '" id="page-' . $key . '">' . $bodyContent . '</div>' . "\n";
}

// Add navigation bar
$output .= '<div class="preview-nav">' . "\n";
foreach ($labels as $key => $label) {
    $activeClass = ($key === 'home') ? ' class="active"' : '';
    $output .= '  <button onclick="showPage(\'' . $key . '\')"' . $activeClass . '>' . htmlspecialchars($label) . '</button>' . "\n";
}
$output .= '</div>' . "\n";

// Add JS
$output .= '<script>
function showPage(id) {
    document.querySelectorAll(".page-container").forEach(function(el) { el.classList.remove("active"); });
    document.querySelectorAll(".preview-nav button").forEach(function(el) { el.classList.remove("active"); });
    var page = document.getElementById("page-" + id);
    if (page) { page.classList.add("active"); }
    event.target.classList.add("active");
    window.scrollTo(0, 0);
}
// Mobile nav toggle
document.addEventListener("click", function(e) {
    if (e.target.closest(".mobile-toggle")) {
        var nav = e.target.closest(".site-header").querySelector(".main-nav");
        var toggle = e.target.closest(".mobile-toggle");
        if (nav) nav.classList.toggle("active");
        if (toggle) toggle.classList.toggle("active");
    }
});
// Intercept internal links to switch pages
document.addEventListener("click", function(e) {
    var link = e.target.closest("a");
    if (!link) return;
    var href = link.getAttribute("href");
    if (!href) return;
    var map = {
        "/": "home",
        "/index.php": "home",
        "/about.php": "about",
        "/services.php": "services",
        "/services/design.php": "services-design",
        "/services/skids.php": "services-skids",
        "/services/vessels.php": "services-vessels",
        "/services/fabrications.php": "services-fabrications",
        "/services/installation.php": "services-installation",
        "/services/turnkey.php": "services-turnkey",
        "/services/welding.php": "services-welding",
        "/projects.php": "projects",
        "/projects/fabrications.php": "projects-fabrications",
        "/projects/water-treatment.php": "projects-water-treatment",
        "/projects/food-beverage.php": "projects-food-beverage",
        "/projects/chemical-pharma.php": "projects-chemical-pharma",
        "/contact.php": "contact"
    };
    if (map[href]) {
        e.preventDefault();
        showPage(map[href]);
        // Update nav buttons
        document.querySelectorAll(".preview-nav button").forEach(function(btn) {
            btn.classList.remove("active");
            if (btn.textContent === ' . json_encode($labels) . '[map[href]]) {
                btn.classList.add("active");
            }
        });
    }
});
</script>
</body>
</html>';

file_put_contents('/home/user/nbm/preview.html', $output);
echo "preview.html generated successfully (" . strlen($output) . " bytes)\n";
