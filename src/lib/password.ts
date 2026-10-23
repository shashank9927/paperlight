export function validatePassword(password: string, required = false) {
  // QPDF's AES-256 key derivation uses at most 127 UTF-8 bytes. Reject rather
  // than silently truncating, normalizing, or replacing malformed UTF-16.
  if (
    (required && !password.length) ||
    password.includes('\0') ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(password) ||
    new TextEncoder().encode(password).length > 127
  )
    throw new Error(
      'Use a password of 1–127 UTF-8 bytes, without null characters or malformed Unicode. Passwords are never shortened or normalized.',
    );
}
