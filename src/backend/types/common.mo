module {
  // Nanoseconds since epoch (matches Time.now() / IC system time).
  public type Timestamp = Nat;

  // Identifier for a restaurant location (Bunbohue65 chain).
  public type RestaurantId = Text;

  // Stable identifier for an activated device (e.g. tablet/POS hardware id).
  public type DeviceId = Text;
};
