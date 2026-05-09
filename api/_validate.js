// Ticker validation for US stocks + some international (BRK.B, BF.B)
// Allows uppercase letters, digits, and dot (for share classes)
// Max 6 characters to prevent abuse
function validateTicker(raw) {
  const ticker = (raw || '').trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.]{1,6}$/.test(ticker)) {
    throw new Error('Invalid ticker symbol.');
  }
  return ticker;
}

module.exports = { validateTicker };
