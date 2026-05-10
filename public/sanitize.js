/**
 * PULSE Sanitization Utilities
 * Prevents XSS while supporting safe citation rendering from AI responses
 */

/**
 * Strips ALL HTML tags and encodes special characters.
 * Use for: tickers, names, labels, structured data that should never contain markup.
 */
function sanitizeText(str) {
  if (str == null) return '';
  return String(str)
    .replace(/<[^>]*>/g, '')        // Remove all HTML tags
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * HTML-encodes everything, then selectively restores ONLY <cite> tags.
 * Use for: AI-generated analysis text that may contain citation markup.
 *
 * Security: All HTML is encoded first, then only valid <cite index="N"> patterns
 * are restored with safe data attributes. Attack vectors like onclick are neutralized.
 */
function sanitizeWithCitations(str) {
  if (str == null) return '';

  // First: HTML-encode everything (neutralizes all HTML)
  let safe = String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // Second: selectively restore ONLY <cite> tags with safe attributes
  // Pattern after encoding: &lt;cite index=&quot;N&quot;&gt;text&lt;/cite&gt;
  safe = safe.replace(
    /&lt;cite\s+index=&quot;(\d+)&quot;&gt;(.*?)&lt;\/cite&gt;/gi,
    function(match, index, text) {
      // text is already HTML-encoded, which prevents XSS in citation content
      return '<cite class="citation" data-index="' + index + '">' + text + '</cite>';
    }
  );

  return safe;
}

/**
 * Initialize click handlers for citations.
 * Call once when page loads (after DOM ready).
 */
function initCitationHandlers() {
  document.addEventListener('click', function(e) {
    if (e.target.matches('.citation, .citation *')) {
      const cite = e.target.closest('.citation');
      const index = cite.getAttribute('data-index');
      if (index) {
        console.log('Citation clicked:', index);
        // Visual feedback
        cite.style.background = 'rgba(29, 184, 126, 0.2)';
        setTimeout(() => cite.style.background = '', 300);
      }
    }
  });
}
