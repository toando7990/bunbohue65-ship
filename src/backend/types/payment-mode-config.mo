import CoreTypes "core";

// Domain types for the global payment-mode configuration.
//
// paymentMode is a global flag controlling who pays shipping:
//   #driver   — default; the driver pays at pickup (existing flow)
//   #customer — the customer pays; the order ends when the driver picks up
//               the goods (markPickedUp sets bookingStatus=#pickedUp).
//
// Persisted across upgrades via a stable `var` + transient wrapper + admin-only
// setter, mirroring the VPS secret config pattern (see lib/secret.mo and
// mixins/secret-api.mo). The stable `var` is shuttled through preupgrade /
// postupgrade hooks in main.mo (added by the develop phase) so the transient
// wrapper's mutations survive upgrades.
module {
  /// The global payment-mode flag.
  public type PaymentMode = {
    #driver;
    #customer;
  };

  /// Mutable-by-reference state record shared between main.mo and the
  /// payment-mode-config mixin. Wraps the stable `var paymentMode` by reference
  /// so mixin mutations propagate to actor state — same shape as
  /// SecretTypes.SecretState.
  public type PaymentModeState = {
    var paymentMode : PaymentMode;
  };

  /// Mutable record that mirrors the stable `var paymentMode` in main.mo. The
  /// preupgrade / postupgrade hooks build a fresh instance from the current
  /// stable value, hand it to the sync helpers for the copy, then write the
  /// (possibly mutated) field back to the stable `var`. Motoko passes primitive
  /// `var` actor fields by value, so the helper cannot mutate the stable var
  /// directly — this ref record is the by-reference shuttle, same pattern as
  /// SecretTypes.StableSecretRef.
  public type StablePaymentModeRef = {
    var paymentMode : PaymentMode;
  };

  /// Parse a Text value into a PaymentMode. Returns null for any value other
  /// than "driver" or "customer". Used by the admin-only setPaymentMode endpoint
  /// to reject invalid inputs.
  public func fromText(t : Text) : ?PaymentMode {
    switch t {
      case ("driver") { ?#driver };
      case ("customer") { ?#customer };
      case _ { null };
    };
  };

  /// Render a PaymentMode as the canonical Text used by setPaymentMode and
  /// returned by getPaymentMode. Mirrors the variant→text helpers in main.mo.
  public func toText(m : PaymentMode) : Text {
    switch m {
      case (#driver) { "driver" };
      case (#customer) { "customer" };
    };
  };
};
