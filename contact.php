<?php
$currentPage = 'contact';
$pageTitle = 'Contact';
$pageDescription = 'Get in touch with Musk Engineering Ltd for your mechanical process engineering requirements. Based in Derbyshire, serving clients across the UK.';

$formSubmitted = false;
$formError = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = isset($_POST['name']) ? htmlspecialchars(trim($_POST['name']), ENT_QUOTES, 'UTF-8') : '';
    $email = isset($_POST['email']) ? htmlspecialchars(trim($_POST['email']), ENT_QUOTES, 'UTF-8') : '';
    $phone = isset($_POST['phone']) ? htmlspecialchars(trim($_POST['phone']), ENT_QUOTES, 'UTF-8') : '';
    $subject = isset($_POST['subject']) ? htmlspecialchars(trim($_POST['subject']), ENT_QUOTES, 'UTF-8') : '';
    $message = isset($_POST['message']) ? htmlspecialchars(trim($_POST['message']), ENT_QUOTES, 'UTF-8') : '';

    if (!empty($name) && !empty($email) && !empty($message) && filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $to = 'info@muskengineering.co.uk';
        $emailSubject = 'Website Enquiry: ' . $subject;
        $emailBody = "Name: $name\n";
        $emailBody .= "Email: $email\n";
        $emailBody .= "Phone: $phone\n";
        $emailBody .= "Subject: $subject\n\n";
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

    <section class="page-hero">
        <div class="container">
            <span class="section-label">Contact Us</span>
            <h1>Get in Touch</h1>
            <p>Whether you have a question about our services or want to discuss a project, we're here to help.</p>
        </div>
    </section>

    <section class="contact-section">
        <div class="container">
            <div class="contact-grid">
                <div class="contact-info">
                    <h2>Contact Information</h2>
                    <p>Reach out to us and our team will respond promptly to discuss your engineering requirements.</p>

                    <div class="contact-item">
                        <div class="contact-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        </div>
                        <div>
                            <h4>Location</h4>
                            <p>Derbyshire, United Kingdom</p>
                        </div>
                    </div>

                    <div class="contact-item">
                        <div class="contact-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        </div>
                        <div>
                            <h4>Email</h4>
                            <p><a href="mailto:info@muskengineering.co.uk">info@muskengineering.co.uk</a></p>
                        </div>
                    </div>

                    <div class="contact-item">
                        <div class="contact-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </div>
                        <div>
                            <h4>Working Hours</h4>
                            <p>Monday - Friday: 8:00 AM - 5:00 PM</p>
                        </div>
                    </div>

                    <div class="contact-social">
                        <h4>Follow Us</h4>
                        <a href="https://www.linkedin.com/company/steve-musk-engineering" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="LinkedIn">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        </a>
                    </div>
                </div>

                <div class="contact-form-wrapper">
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
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="name">Full Name <span class="required">*</span></label>
                                    <input type="text" id="name" name="name" required placeholder="Your full name">
                                </div>
                                <div class="form-group">
                                    <label for="email">Email Address <span class="required">*</span></label>
                                    <input type="email" id="email" name="email" required placeholder="your@email.com">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="phone">Phone Number</label>
                                    <input type="tel" id="phone" name="phone" placeholder="Your phone number">
                                </div>
                                <div class="form-group">
                                    <label for="subject">Subject</label>
                                    <input type="text" id="subject" name="subject" placeholder="What is this regarding?">
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="message">Message <span class="required">*</span></label>
                                <textarea id="message" name="message" rows="6" required placeholder="Tell us about your project or enquiry..."></textarea>
                            </div>
                            <button type="submit" class="btn btn-primary btn-full">Send Message</button>
                        </form>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </section>

<?php include 'includes/footer.php'; ?>
