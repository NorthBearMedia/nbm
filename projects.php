<?php
$currentPage = 'projects';
$pageTitle = 'Projects';
$pageDescription = 'Musk Engineering projects across the most demanding sectors including food and beverage, pharmaceutical, chemical processing, energy and infrastructure industries.';
include 'includes/header.php';
?>

    <section class="projects-page-section">
        <div class="container">
            <h3 class="projects-page-heading">Our Projects</h3>
            <p class="projects-page-subtitle">Showcasing precision-driven engineering across multiple sectors.</p>

            <div class="project-category-grid">
                <a href="/projects/fabrications.php" class="project-category-card">
                    <img src="https://raw.githubusercontent.com/NorthBearMedia/nbm/claude/musk-engineering-php-site-d5Kfw/images/IMG_0554.jpg" alt="General Fabrications & Skids" class="project-category-img">
                    <h6 class="project-category-title">General Fabrications &amp; Skids</h6>
                </a>
                <a href="/projects/water-treatment.php" class="project-category-card">
                    <img src="https://raw.githubusercontent.com/NorthBearMedia/nbm/claude/musk-engineering-php-site-d5Kfw/images/IMG_4123.JPG" alt="Water Treatment" class="project-category-img">
                    <h6 class="project-category-title">Water Treatment</h6>
                </a>
                <a href="/projects/food-beverage.php" class="project-category-card">
                    <img src="https://raw.githubusercontent.com/NorthBearMedia/nbm/claude/musk-engineering-php-site-d5Kfw/images/IMG_0144.jpg" alt="Food & Beverage" class="project-category-img">
                    <h6 class="project-category-title">Food &amp; Beverage</h6>
                </a>
                <a href="/projects/chemical-pharma.php" class="project-category-card">
                    <img src="https://raw.githubusercontent.com/NorthBearMedia/nbm/claude/musk-engineering-php-site-d5Kfw/images/IMG_4134.JPG" alt="Chemical & Pharmaceutical" class="project-category-img">
                    <h6 class="project-category-title">Chemical &amp; Pharmaceutical</h6>
                </a>
            </div>

            <div class="projects-video-embed" style="margin-top: 3rem;">
                <iframe src="https://drive.google.com/file/d/1ut1KRR9l22cR5Z7c8mxxaoSg_7KsO4J3/preview" width="100%" height="600px" allow="autoplay"></iframe>
            </div>
        </div>
    </section>

<?php include 'includes/footer.php'; ?>
