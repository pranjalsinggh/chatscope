/**
 * PII redaction unit tests — real-looking Hinglish samples.
 * Run: node tests/redact.test.js
 */
const { redactText, redactMessages } = require("../redact");

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}`);
  }
}

// 1. +91 phone with spaces
check(
  "phone: +91 with spaces masked",
  redactText("call me at +91 98765 43210 ok?") ===
    "call me at +91 XXXXX XXXXX ok?"
);

// 2. +91 phone without spaces
check(
  "phone: +91 compact masked",
  redactText("whatsapp +919876543210") === "whatsapp +91XXXXXXXXXX"
);

// 3. Bare 10-digit number
check(
  "phone: bare 10-digit masked",
  redactText("my number is 9876543210") === "my number is XXXXXXXXXX"
);

// 4. Email masked, local part visible (spec: user@XXXXX)
const emailOut = redactText("mail me at aarav.sharma@gmail.com fast");
check(
  "email masked with shape",
  emailOut === "mail me at aarav.sharma@XXXXX fast",
  emailOut
);

// 5. OTP after keyword (English)
check(
  "otp: 4-digit after keyword masked",
  redactText("your OTP is 4829, use fast") ===
    "your OTP is XXXX, use fast"
);

// 6. OTP after keyword (lowercase 'code')
check(
  "otp: code keyword masked",
  redactText("the code is 987654 dont share") ===
    "the code is XXXXXX dont share"
);

// 7. OTP in Hinglish context
check(
  "otp: Hinglish phrasing masked",
  redactText("bhai otp batao 5521 jaldi") === "bhai otp batao XXXX jaldi"
);

// 8. Card number (4-4-4-4 grouping kept, digits masked)
check(
  "card: 16-digit grouped masked",
  redactText("pay with 4111 1111 1111 1111 now") ===
    "pay with XXXX XXXX XXXX XXXX now"
);

// 9. UPI ID handle masked
check(
  "upi: @okhdfc handle masked",
  redactText("send to aarav@okhdfc") === "send to aarav@XXXXX"
);

// 10. UPI ID paytm handle
check(
  "upi: @paytm handle masked",
  redactText("bhejo diya@paytm ko") === "bhejo diya@XXXXX ko"
);

// 11. Mixed Hinglish message — everything at once
const mixed = "yaar pay 4021 to rahul@ybl and call +91 90000 80000";
const mixedOut = redactText(mixed);
check(
  "mixed: phone masked",
  mixedOut.includes("+91 XXXXX XXXXX"),
  mixedOut
);
check("mixed: upi masked", mixedOut.includes("rahul@XXXXX"), mixedOut);

// 12. Normal Hinglish untouched
check(
  "clean text untouched",
  redactText("kya kar rahe ho aaj shaam ko?") ===
    "kya kar rahe ho aaj shaam ko?"
);

// 13. Numbers that are NOT PII stay untouched
check(
  "innocent number untouched",
  redactText("I walked 10k steps today") === "I walked 10k steps today"
);

// 14. redactMessages maps the array
const msgs = [
  { sender: "Aarav", message: "call +91 98765 43210", date: "01/06/25", time: "10:00" },
  { sender: "Diya", message: "no pii here", date: "01/06/25", time: "10:01" },
];
const out = redactMessages(msgs);
check(
  "redactMessages masks message 1",
  out[0].message === "call +91 XXXXX XXXXX"
);
check(
  "redactMessages keeps message 2",
  out[1].message === "no pii here"
);
check(
  "redactMessages preserves sender",
  out[0].sender === "Aarav"
);

// 15. Non-string input passes through
check("non-string passthrough", redactText(null) === null);

// 16. Already-masked text is stable (idempotent)
const once = redactText("call +91 98765 43210");
check("idempotent re-redaction", redactText(once) === once);

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  process.exit(1);
}
