// Check the OTP extractor against the shapes real verification emails use,
// and against emails that must NOT yield a code.
// Mirrors convex/mail/otp.ts exactly.

function extractCode(text) {
  if (!text) return null;
  const haystack = text.slice(0, 4000);

  const anchored = [
    /\b(?:code|otp|pin|passcode)\b[^0-9]{0,40}?([0-9]{4,8})\b/i,
    /\b([0-9]{4,8})\b[^0-9]{0,30}?\bis your\b/i,
    /\bverif\w*[^0-9]{0,40}?([0-9]{4,8})\b/i,
    /\b([0-9]{4,8})\b[^0-9]{0,30}?\bto (?:confirm|verify|activate|complete)\b/i,
  ];
  for (const re of anchored) {
    const m = re.exec(haystack);
    if (m) return m[1];
  }

  const standalone = /(?:^|\n)[ \t]*([0-9]{4,8})[ \t]*(?:\n|$)/.exec(haystack);
  return standalone ? standalone[1] : null;
}

const should = [
  ["Your verification code is 482913", "482913"],
  ["Your code: 4821", "4821"],
  ["OTP 934211 expires in 10 minutes.", "934211"],
  ["123456 is your one-time passcode.", "123456"],
  ["Enter this PIN to continue:\n\n  55219\n\nThanks.", "55219"],
  ["Hello,\n\n729481\n\nUse the number above to finish signing up.", "729481"],
  ["Please verify your email with code 88213.", "88213"],
  ["Your security code is 482913. Do not share it with anyone.", "482913"],
  ["Claims Portal\n\nVerification code\n\n610934\n\nValid for 15 minutes.", "610934"],
  ["Use 550132 to confirm your email address.", "550132"],
];

// The Sunvale email that opened the real case must never read as a code.
const sunvale = `Dear Mr Kashyap,
Thank you for your follow-up regarding the security deposit for Flat 4B.
The refundable amount after deductions stands at Rs 45,000 against a deposit
of Rs 60,000. Your handover was completed on 14 June 2026. Reference
SVE-2024-8817. Please call our helpline between 10am and 4pm.`;

const shouldNot = [
  sunvale,
  "Your refund of Rs 45,000 is being processed. Reference SVE-2024-8817.",
  "We received your claim on 14 June 2026.",
  "Invoice 90210 for the amount of 1,250 is attached.",
  "",
];

let pass = 0;
console.log("SHOULD FIND A CODE");
for (const [text, want] of should) {
  const got = extractCode(text);
  const ok = got === want;
  if (ok) pass++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} want=${want} got=${got}   "${text.slice(0, 44).replace(/\n/g, " ")}"`,
  );
}

console.log("\nMUST NOT FIND A CODE");
let clean = 0;
for (const text of shouldNot) {
  const got = extractCode(text);
  const ok = got === null;
  if (ok) clean++;
  console.log(`  ${ok ? "ok  " : "FAIL"} got=${got}   "${text.slice(0, 50).replace(/\n/g, " ")}"`);
}

console.log(`\n${pass}/${should.length} found, ${clean}/${shouldNot.length} correctly ignored`);
