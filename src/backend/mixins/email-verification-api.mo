import EmailClient "mo:caffeineai-email/emailClient";
import EmailVerificationLib "../lib/email-verification";
import EmailVerificationTypes "../types/email-verification";

// Public API surface for the email OTP verification domain. State is injected
// from main.mo.
//
// sendVerificationCode dispatches the OTP via the platform `email` extension
// (EmailClient.sendServiceEmail — transactional email from the app). The
// generated code is passed to the email client; only its hash is persisted.
mixin (state : EmailVerificationLib.State) {
  // Generate a 6-digit OTP for `email`, store it (hashed) with a 15-minute
  // expiry, and send the code via the transactional email extension. Sending
  // is not rate-limited — customers can always request a fresh code.
  // Returns #ok on success or #err when the email dispatch fails.
  public shared func sendVerificationCode(email : EmailVerificationTypes.Email) : async EmailVerificationTypes.SendCodeResult {
    let code = EmailVerificationLib.generateCode();
    switch (EmailVerificationLib.sendVerificationCode(state, email, code)) {
      case (#err e) {
        #err(e);
      };
      case (#ok) {
        let result = await EmailClient.sendServiceEmail(
          "no-reply",
          [email],
          "Mã xác nhận email của bạn",
          "Mã xác nhận của bạn là: <b>" # code # "</b>.<br/>Mã có hiệu lực trong 15 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.",
        );
        switch (result) {
          case (#ok) { #ok };
          case (#err e) {
            #err("Không thể gửi email xác nhận: " # e);
          };
        };
      };
    };
  };

  // Check the submitted `code` against the stored OTP for `email`. If correct
  // and not expired, marks the email verified and returns #ok; otherwise
  // returns a clear #err (wrong code or expired).
  public shared func verifyEmailCode(
    email : EmailVerificationTypes.Email,
    code : Text,
  ) : async EmailVerificationTypes.VerifyResult {
    EmailVerificationLib.verifyEmailCode(state, email, code);
  };

  // Whether `email` has already been successfully verified, so the frontend
  // can confirm state.
  public shared query func isEmailVerified(email : EmailVerificationTypes.Email) : async Bool {
    EmailVerificationLib.isEmailVerified(state, email);
  };
};
