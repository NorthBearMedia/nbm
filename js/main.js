// Musk Engineering Ltd - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {

    // Mobile navigation toggle
    const mobileToggle = document.getElementById('mobileToggle');
    const mainNav = document.getElementById('mainNav');

    if (mobileToggle && mainNav) {
        mobileToggle.addEventListener('click', function() {
            mainNav.classList.toggle('active');
            this.classList.toggle('active');
        });

        // Close nav when clicking a link
        mainNav.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                mainNav.classList.remove('active');
                mobileToggle.classList.remove('active');
            });
        });
    }

    // Header scroll effect
    const header = document.querySelector('.site-header');
    if (header) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                header.style.background = 'rgba(15, 38, 64, 0.98)';
                header.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
            } else {
                header.style.background = 'rgba(15, 38, 64, 0.95)';
                header.style.boxShadow = 'none';
            }
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            var targetId = this.getAttribute('href');
            if (targetId === '#') return;
            var target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                var headerHeight = header ? header.offsetHeight : 0;
                var targetPos = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20;
                window.scrollTo({ top: targetPos, behavior: 'smooth' });
            }
        });
    });

    // Simple scroll animation
    var animateElements = document.querySelectorAll('.service-card, .stat-card, .sector-card, .value-card, .sector-detail-card, .process-step, .stat-block');

    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        animateElements.forEach(function(el) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    }

    // Contact form validation
    var contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            var name = document.getElementById('name');
            var email = document.getElementById('email');
            var message = document.getElementById('message');
            var valid = true;

            [name, email, message].forEach(function(field) {
                if (field && !field.value.trim()) {
                    field.style.borderColor = '#e53e3e';
                    valid = false;
                } else if (field) {
                    field.style.borderColor = '';
                }
            });

            if (email && email.value && !email.value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                email.style.borderColor = '#e53e3e';
                valid = false;
            }

            if (!valid) {
                e.preventDefault();
            }
        });
    }
});
