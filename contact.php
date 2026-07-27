<?php
$currentPage = 'contact';
$pageTitle = 'Contact';
$pageDescription = 'Get in touch with Musk Engineering Ltd for your mechanical process engineering requirements. Based in Derbyshire, serving clients across the UK.';

$formSubmitted = false;
$formError = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = isset($_POST['name']) ? htmlspecialchars(trim($_POST['name']), ENT_QUOTES, 'UTF-8') : '';
    $email = isset($_POST['email']) ? htmlspecialchars(trim($_POST['email']), ENT_QUOTES, 'UTF-8') : '';
    $message = isset($_POST['message']) ? htmlspecialchars(trim($_POST['message']), ENT_QUOTES, 'UTF-8') : '';

    if (!empty($email) && !empty($message) && filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $to = 'info@muskengineering.co.uk';
        $emailSubject = 'Website Enquiry';
        $emailBody = "Name: $name\n";
        $emailBody .= "Email: $email\n\n";
        $emailBody .= "Message:\n$message\n";

        $headers = "From: noreply@muskengineering.co.uk\r\n";
        $headers .= "Reply-To: $email\r\n";

        if (mail($to, $emailSubject, $emailBody, $headers)) {
            $formSubmitted = true;
        } else {
            $formError = true;
        }
    } else {
        $formError = true;
    }
}

include 'includes/header.php';
?>

    <!-- Contact Section -->
    <section class="contact-hero-section">
        <div class="container">
            <div class="contact-hero-grid">
                <div class="contact-hero-text">
                    <h1 class="contact-hero-h1 slide-up">Get in Touch</h1>
                    <p class="contact-hero-subtitle fade-in">We value your enquiries. Reach out to discuss your engineering needs and discover our innovative solutions.</p>
                </div>
                <div class="contact-form-card scale-in">
                    <?php if ($formSubmitted): ?>
                        <div class="form-success">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            <h3>Thank You!</h3>
                            <p>Your message has been sent successfully. We'll get back to you as soon as possible.</p>
                        </div>
                    <?php else: ?>
                        <?php if ($formError): ?>
                            <div class="form-error">
                                <p>There was an error sending your message. Please ensure all required fields are filled in correctly and try again.</p>
                            </div>
                        <?php endif; ?>
                        <form method="POST" action="/contact.php" class="contact-form" id="contactForm">
                            <div class="form-group">
                                <label for="name">Your First Name</label>
                                <input type="text" id="name" name="name" placeholder="Your First Name">
                            </div>
                            <div class="form-group">
                                <label for="email">Your Email Address <span class="required">*</span></label>
                                <input type="email" id="email" name="email" required placeholder="Your Email Address">
                            </div>
                            <div class="form-group">
                                <label for="message">Your Message <span class="required">*</span></label>
                                <textarea id="message" name="message" rows="6" required placeholder="Your Message"></textarea>
                            </div>
                            <button type="submit" class="btn btn-black btn-full">Submit Your Inquiry</button>
                        </form>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </section>

    <!-- Testimonial removed -->

<?php include 'includes/footer.php'; ?>
