// ------------------------------------------------
// PII REDACTION (in-memory, send-time only)
// ------------------------------------------------
// Masks personally identifiable information with shape-preserving
// placeholders so the conversation stays readable to the model
// ("call me at +91 XXXXXXXXXX" flows; "call me at ****" does not).
//
// Spec shapes (kept visible → masked):
//   +91 98765 43210  →  +91 XXXXX XXXXX   (country code visible)
//   +919876543210    →  +91XXXXXXXXXX
//   9876543210       →  XXXXXXXXXX
//   user@mail.com     →  user@XXXXX        (local part visible)
//   UPI name@okhdfc   →  name@XXXXX
//   card 16 digits    →  XXXXXXXXXXXXXXXX
//   otp ... 4829      →  otp ... XXXX      (keyword context kept)
//
// IMPORTANT: redaction happens ONLY on data leaving for AI
// providers. Stored files and the UI always keep originals.
// ------------------------------------------------

// Country-code phone: keep the +CC prefix visible, mask the rest
const PHONE_CC_PATTERN = /(\+\d{1,3})([\s-]?\d{5}[\s-]?\d{5}|\d{10})/g;

// Bare 10-digit Indian number
const PHONE_BARE_PATTERN = /\b\d{10}\b/g;

const EMAIL_PATTERN = /\b([\w.+-]+)@[\w-]+(?:\.[\w.-]+)+\b/g;

// 16-digit card numbers (with optional 4-4-4-4 grouping)
const CARD_PATTERN = /\b(?:\d{4}[\s-]?){3}\d{4}\b/g;

// UPI IDs: name@bank-handle — only the handle part is masked
const UPI_PATTERN = /\b[\w.-]+@(?:okhdfc|oksbi|okicici|okaxis|paytm|ybl|ibl|axl|upi|okbizaxis)\b/gi;

// OTP-like codes: 4-8 digits within a short window after a keyword
const OTP_PATTERN =
  /\b(?:otp|o\.t\.p|code|codigo|pin|password|pass)\b[^0-9\n]{0,12}(\d{4,8})\b/gi;

function maskDigitsOnly(text) {
  return text.replace(/\d/g, "X");
}

function redactText(text) {
  if (typeof text !== "string" || text.length === 0) return text;

  let result = text;

  // Cards first (most specific numeric pattern)
  result = result.replace(CARD_PATTERN, (card) => maskDigitsOnly(card));

  // Country-code phones: keep +CC, mask the subscriber number
  result = result.replace(PHONE_CC_PATTERN, (match, cc, rest) =>
    `${cc}${maskDigitsOnly(rest)}`
  );

  // Bare 10-digit phones (only digits remain to be masked — the
  // country-code pattern above already consumed spaced forms)
  result = result.replace(PHONE_BARE_PATTERN, (phone) =>
    /\d/.test(phone) ? maskDigitsOnly(phone) : phone
  );

  // Emails: keep the local part, mask the domain
  result = result.replace(EMAIL_PATTERN, (match, local) =>
    `${local}@XXXXX`
  );

  // UPI IDs: keep the name, mask the handle
  result = result.replace(UPI_PATTERN, (upi) => {
    const at = upi.indexOf("@");
    return `${upi.slice(0, at)}@XXXXX`;
  });

  // OTP-like codes: mask the digits, keep the keyword context
  result = result.replace(OTP_PATTERN, (match, code) => {
    return match.replace(code, "X".repeat(code.length));
  });

  return result;
}

/** Redact a whole message array (returns a new array). */
function redactMessages(messages) {
  if (!Array.isArray(messages)) return messages;

  return messages.map((m) => ({
    ...m,
    message: redactText(m?.message),
  }));
}

module.exports = { redactText, redactMessages };
