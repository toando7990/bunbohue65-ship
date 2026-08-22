import Map "mo:core/Map";

// Email OTP verification domain types.
//
// Stable state: a Map keyed by email address holding the pending OTP record
// (code hash, expiry, send count, verified flag). The code itself is never
// stored in plaintext — only its hash — so a leaked state snapshot cannot be
// replayed to forge a verification.
module {
  // A verified email address (lower-cased before use as a Map key).
  public type Email = Text;

  // A pending OTP record for one email address.
  public type OtpRecord = {
    email : Email;
    // Hash of the 6-digit OTP (Blob.fromArray of the code's bytes). The raw
    // code is never persisted; only this hash is stored and compared.
    codeHash : Blob;
    // Expiry timestamp (nanoseconds since epoch). OTPs are valid for 15 min.
    expiresAt : Int;
    // Number of codes sent to this email so far — kept for observability
    // only; sending is not rate-limited (customers can always request a
    // fresh code).
    sendCount : Nat;
    // True once the email has been successfully verified.
    verified : Bool;
  };

  // Stable storage shape for the OTP records collection (keyed by Email).
  public type OtpStore = Map.Map<Email, OtpRecord>;

  // Result of sendVerificationCode. #ok when a fresh OTP was generated and the
  // transactional email was dispatched; #err carries a clear message (e.g. the
  // email dispatch itself failed). Sending is not rate-limited.
  public type SendCodeResult = {
    #ok;
    #err : Text;
  };

  // Result of verifyEmailCode. #ok when the submitted code matches the stored
  // hash and has not expired (email marked verified); #err carries a clear
  // message distinguishing a wrong code from an expired one.
  public type VerifyResult = {
    #ok;
    #err : Text;
  };
};
