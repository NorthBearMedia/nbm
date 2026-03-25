<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo isset($pageTitle) ? $pageTitle . ' | ' : ''; ?>Musk Engineering Ltd | Precision and Innovation in Engineering</title>
    <meta name="description" content="<?php echo isset($pageDescription) ? $pageDescription : 'With a legacy in mechanical process engineering, Musk Engineering provides high-quality, precision-driven solutions for complex industrial projects.'; ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header class="site-header">
        <div class="container">
            <div class="header-inner">
                <a href="/" class="logo">
                    <span class="logo-text">MUSK</span>
                    <span class="logo-sub">ENGINEERING LTD</span>
                </a>
                <nav class="main-nav" id="mainNav">
                    <ul>
                        <li><a href="/" <?php echo (!isset($currentPage) || $currentPage === 'home') ? 'class="active"' : ''; ?>>Home</a></li>
                        <li><a href="/about.php" <?php echo (isset($currentPage) && $currentPage === 'about') ? 'class="active"' : ''; ?>>About</a></li>
                        <li><a href="/services.php" <?php echo (isset($currentPage) && $currentPage === 'services') ? 'class="active"' : ''; ?>>Services</a></li>
                        <li><a href="/sectors.php" <?php echo (isset($currentPage) && $currentPage === 'sectors') ? 'class="active"' : ''; ?>>Sectors</a></li>
                        <li><a href="/contact.php" <?php echo (isset($currentPage) && $currentPage === 'contact') ? 'class="active"' : ''; ?>>Contact</a></li>
                    </ul>
                </nav>
                <button class="mobile-toggle" id="mobileToggle" aria-label="Toggle navigation">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
            </div>
        </div>
    </header>
