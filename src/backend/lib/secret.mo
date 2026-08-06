import SecretTypes "../types/secret";

module {
  /// Rotates the VPS secret: copies the current `vpsSecret` into
  /// `vpsSecretPrevious`, then writes `newSecret` into `vpsSecret`.
  public func rotateSecret(state : SecretTypes.SecretState, newSecret : Text) : () {
    state.vpsSecretPrevious := state.vpsSecret;
    state.vpsSecret := newSecret;
  };
};
