module {
  /// State record holding the VPS secret rotation pair.
  /// Passed by reference from `main.mo` so mixin mutations propagate to actor state.
  public type SecretState = {
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
  };
};
