/**
 * Shared footer behaviour: current year + back-to-top.
 * Safe to load on every page; no-ops when the footer markup is absent.
 */
(function initFooter() {
    const year = document.getElementById('footerYear');
    if (year) year.textContent = new Date().getFullYear();

    const toTop = document.getElementById('toTopBtn');
    if (!toTop) return;

    toTop.addEventListener('click', () => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
})();
