import Map "mo:core/Map";
import Time "mo:core/Time";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Nat8 "mo:core/Nat8";
import Sha256 "mo:sha2/Sha256";
import EmailVerificationTypes "../types/email-verification";

// Domain logic for the email OTP verification domain.
//
// Stateless module functions operating on injected state. The mixin
// (mixins/email-verification-api.mo) owns the public endpoints and the
// transactional email dispatch via the `email` extension; this module owns the
// pure OTP generation / hashing / storage / verification rules.
module {
  public type Email = EmailVerificationTypes.Email;
  public type OtpRecord = EmailVerificationTypes.OtpRecord;
  public type SendCodeResult = EmailVerificationTypes.SendCodeResult;
  public type VerifyResult = EmailVerificationTypes.VerifyResult;

  // Stable state shape passed in from the actor / mixin layer: a Map keyed by
  // (lower-cased) email address holding the pending OTP record.
  public type State = Map.Map<Email, OtpRecord>;

  // Generate a fresh 6-digit OTP code (000000..999999). Synchronous and
  // stateless: derives six digits from a SHA-256 hash of the current time
  // (nanosecond resolution) so it avoids the deprecated mo:core/Random API and
  // needs no module-level mutable state. Each sendVerificationCode call crosses
  // an await boundary (the email dispatch), so two codes issued within the same
  // nanosecond are not a practical concern.
  public func generateCode() : Text {
    let seed = Int.toText(Time.now()).encodeUtf8();
    let hash = Sha256.fromBlob(#sha256, seed);
    let bytes = hash.toArray();
    var code = "";
    var i = 0;
    while (i < 6) {
      let digit = bytes[i].toNat() % 10;
      code := code # Nat.toText(digit);
      i += 1;
    };
    code;
  };

  // Hash a 6-digit OTP code into a Blob for secure storage/comparison.
  public func hashCode(code : Text) : Blob {
    Sha256.fromBlob(#sha256, code.encodeUtf8());
  };

  // Issue a new OTP for `email`: enforce the 3-send anti-spam cap, store the
  // given `code`'s hash with a 15-minute expiry, and increment the send count.
  // Returns #err("...") when the rate limit is exceeded.
  public func sendVerificationCode(state : State, email : Email, code : Text) : SendCodeResult {
    let normalized = email.toLower();
    let prevCount = switch (state.get(normalized)) {
      case (?record) record.sendCount;
      case null 0;
    };
    if (prevCount >= 3) {
      return #err("Đã đạt giới hạn 3 lần gửi mã xác nhận cho email này. Vui lòng thử lại sau.");
    };
    let record : OtpRecord = {
      email = normalized;
      codeHash = hashCode(code);
      expiresAt = Time.now() + 15 * 60 * 1000000000;
      sendCount = prevCount + 1;
      verified = false;
    };
    state.add(normalized, record);
    #ok;
  };

  // Verify a submitted code against the stored hash for `email`. Marks the
  // email verified when the code matches and has not expired; otherwise returns
  // a clear error distinguishing a wrong code from an expired one.
  public func verifyEmailCode(state : State, email : Email, code : Text) : VerifyResult {
    let normalized = email.toLower();
    switch (state.get(normalized)) {
      case null {
        #err("Mã xác nhận không đúng");
      };
      case (?record) {
        if (Time.now() > record.expiresAt) {
          #err("Mã xác nhận đã hết hạn");
        } else if (record.codeHash != hashCode(code)) {
          #err("Mã xác nhận không đúng");
        } else {
          let updated : OtpRecord = {
            email = record.email;
            codeHash = record.codeHash;
            expiresAt = record.expiresAt;
            sendCount = record.sendCount;
            verified = true;
          };
          state.add(normalized, updated);
          #ok;
        };
      };
    };
  };

  // Whether `email` has already been successfully verified.
  public func isEmailVerified(state : State, email : Email) : Bool {
    let normalized = email.toLower();
    switch (state.get(normalized)) {
      case (?record) record.verified;
      case null false;
    };
  };
};
