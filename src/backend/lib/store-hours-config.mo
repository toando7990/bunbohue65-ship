import StoreHoursConfigTypes "../types/store-hours-config";

// Domain logic for the store-hours-config domain.
//
// Stateless module functions operating on injected state. Mirrors the
// payment-mode-config pattern (lib/payment-mode-config.mo): a transient wrapper
// around a stable `var`, with preupgrade / postupgrade sync helpers that
// shuttle the value through a StableStoreHoursRef. Also provides the
// isStoreOpen helper that the frontend uses to decide whether to block order
// placement (both driver and customer flows).
module {
  public type StoreHours = StoreHoursConfigTypes.StoreHours;
  public type StoreHoursState = StoreHoursConfigTypes.StoreHoursState;
  public type StableStoreHoursRef = StoreHoursConfigTypes.StableStoreHoursRef;

  // Nanosecond constants for the UTC+7 time-of-day math — the same timezone as
  // the day-retention logic in lib/core.mo (the app is Vietnamese, UTC+7), so
  // store hours are interpreted in the store's local time. Computed via
  // functions because module-level `let` bindings must be static expressions.
  func HOUR_NS() : Int { 3600 * 1000000000 };
  func DAY_NS() : Int { 24 * HOUR_NS() };
  func MINUTE_NS() : Int { 60 * 1000000000 };
  func UTC7_OFFSET_NS() : Int { 7 * HOUR_NS() };

  /// Return the current storeHours from the transient wrapper. The wrapper is
  /// passed by reference from main.mo, so this always sees the live value.
  public func getStoreHours(state : StoreHoursState) : StoreHours {
    state.storeHours;
  };

  /// Set storeHours to `hours` in the transient wrapper. The wrapper is passed
  /// by reference, so the mutation propagates to actor state. The stable `var`
  /// is updated by the preupgrade hook (see syncToStable).
  public func setStoreHours(state : StoreHoursState, hours : StoreHours) : () {
    state.storeHours := hours;
  };

  /// Preupgrade sync: copy the LIVE (possibly mutated) storeHours from the
  /// transient wrapper into the stable `var` (shuttled via `ref`) so the value
  /// survives the upgrade. Mirrors PaymentModeConfigLib.syncToStable.
  public func syncToStable(state : StoreHoursState, ref : StableStoreHoursRef) : () {
    ref.storeHours := state.storeHours;
  };

  /// Postupgrade sync: restore the persisted stable `var` (shuttled via `ref`)
  /// into the transient wrapper so mixins read the surviving value immediately
  /// after upgrade. Mirrors PaymentModeConfigLib.syncFromStable.
  public func syncFromStable(state : StoreHoursState, ref : StableStoreHoursRef) : () {
    state.storeHours := ref.storeHours;
  };

  /// Determine whether the store is currently open at time `now` (nanoseconds
  /// since epoch, e.g. Time.now()). Returns true when the current time-of-day
  /// falls within [open, close). Handles overnight ranges where close < open
  /// (e.g. 22:00–06:00). Used by the frontend to block order placement on both
  /// the driver and customer flows when the store is closed.
  public func isStoreOpen(state : StoreHoursState, now : Int) : Bool {
    let hours = state.storeHours;
    // Current time-of-day in UTC+7, in minutes since midnight. `shifted % DAY_NS()`
    // is always in [0, DAY_NS) so the Int→Nat conversion is safe.
    let shifted = now + UTC7_OFFSET_NS();
    let timeOfDayMinutes : Nat = ((shifted % DAY_NS()) / MINUTE_NS()).toNat();
    let openMinutes = hours.openHour * 60 + hours.openMinute;
    let closeMinutes = hours.closeHour * 60 + hours.closeMinute;
    if (closeMinutes < openMinutes) {
      // Overnight range: open from openMinutes until midnight, then from
      // midnight until closeMinutes.
      timeOfDayMinutes >= openMinutes or timeOfDayMinutes < closeMinutes;
    } else {
      // Same-day range: open within [openMinutes, closeMinutes).
      timeOfDayMinutes >= openMinutes and timeOfDayMinutes < closeMinutes;
    };
  };
};
