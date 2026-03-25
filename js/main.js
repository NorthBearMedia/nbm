// Musk Engineering Ltd - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {

    // Enable scroll animations only when JS is running
    document.body.classList.add('js-ready');

    // Mobile navigation toggle
    var mobileToggle = document.getElementById('mobileToggle');
    var mainNav = document.getElementById('mainNav');

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

        // Close nav when clicking outside
        document.addEventListener('click', function(e) {
            if (!mainNav.contains(e.target) && !mobileToggle.contains(e.target)) {
                mainNav.classList.remove('active');
                mobileToggle.classList.remove('active');
            }
        });
    }

    // Header scroll effect
    var header = document.querySelector('.site-header');
    if (header) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                header.style.boxShadow = '0 2px 16px rgba(0,0,0,0.1)';
            } else {
                header.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
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

    // Scroll animations (slide-up, fade-in, scale-in elements)
    var animElements = document.querySelectorAll('.slide-up, .fade-in, .scale-in');

    if ('IntersectionObserver' in window && animElements.length > 0) {
        var slideObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    slideObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        animElements.forEach(function(el) {
            slideObserver.observe(el);
        });
    }

    // Generic card animations
    var animateElements = document.querySelectorAll('.industry-card, .value-card, .project-detail-card, .process-step, .stat-block');

    if ('IntersectionObserver' in window && animateElements.length > 0) {
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
