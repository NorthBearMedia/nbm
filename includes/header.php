<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo isset($pageTitle) ? $pageTitle . ' | ' : ''; ?>Musk Engineering Ltd | Precision and Innovation in Engineering</title>
    <meta name="description" content="<?php echo isset($pageDescription) ? $pageDescription : 'With a legacy in mechanical process engineering, Musk Engineering provides high-quality, precision-driven solutions for complex industrial projects.'; ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header class="site-header">
        <div class="container">
            <div class="header-inner">
                <a href="/" class="logo">
                    <img src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=768,fit=crop,q=95/Yanqkw6EPbi7qy6G/untitled-design-1-AVL1RJx35PuxaJWz.png" alt="Musk Engineering Ltd" class="logo-img">
                </a>
                <nav class="main-nav" id="mainNav">
                    <ul>
                        <li><a href="/" <?php echo (!isset($currentPage) || $currentPage === 'home') ? 'class="active"' : ''; ?>>Home</a></li>
                        <li><a href="/about.php" <?php echo (isset($currentPage) && $currentPage === 'about') ? 'class="active"' : ''; ?>>About</a></li>
                        <li class="nav-dropdown">
                            <a href="/services.php" <?php echo (isset($currentPage) && $currentPage === 'services') ? 'class="active"' : ''; ?>>Services</a>
                            <ul class="dropdown-menu">
                                <li><a href="/services/design.php">Design, Management &amp; Planning</a></li>
                                <li><a href="/services/skids.php">Pre-fabricated Skids</a></li>
                                <li><a href="/services/vessels.php">Process Vessels</a></li>
                                <li><a href="/services/fabrications.php">General Fabrications</a></li>
                                <li><a href="/services/installation.php">On Site Installation</a></li>
                                <li><a href="/services/turnkey.php">Turnkey Solutions</a></li>
                                <li><a href="/services/welding.php">Coded Welding &amp; Quality</a></li>
                            </ul>
                        </li>
                        <li class="nav-dropdown">
                            <a href="/projects.php" <?php echo (isset($currentPage) && $currentPage === 'projects') ? 'class="active"' : ''; ?>>Projects</a>
                            <ul class="dropdown-menu">
                                <li><a href="/projects/fabrications.php">General Fabrications &amp; Skids</a></li>
                                <li><a href="/projects/water-treatment.php">Water Treatment</a></li>
                                <li><a href="/projects/food-beverage.php">Food &amp; Beverage</a></li>
                                <li><a href="/projects/chemical-pharma.php">Chemical &amp; Pharmaceutical</a></li>
                            </ul>
                        </li>
                        <li><a href="/contact.php" <?php echo (isset($currentPage) && $currentPage === 'contact') ? 'class="active"' : ''; ?>>Contact</a></li>
                    </ul>
                </nav>
                <div class="header-right">
                    <a href="https://www.linkedin.com/company/steve-musk-engineering" target="_blank" rel="noopener noreferrer" class="header-linkedin" aria-label="LinkedIn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    </a>
                    <button class="mobile-toggle" id="mobileToggle" aria-label="Toggle navigation">
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>
                </div>
            </div>
        </div>
    </header>
