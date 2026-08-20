import AccessControl "mo:caffeineai-authorization/access-control";
import Map "mo:core/Map";

import MenuSeedLib "../lib/menu-seed";
import CoreTypes "../types/core";

// Public API surface for the menu-seed domain.
// The seed is idempotent: it only adds the 'Dụng cụ đựng đồ ăn' item when no
// item with that name + category exists. It runs automatically on init/upgrade
// (see main.mo postupgrade) and can also be re-run manually by an admin.
mixin (
  accessControlState : AccessControl.AccessControlState,
  menus : Map.Map<Text, CoreTypes.MenuItem>,
) {
  // Admin only. Run the idempotent menu seed. Returns true if the item was
  // added, false if it already existed (no duplicate).
  public shared ({ caller }) func seedMenuItems() : async Bool {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return false;
    };
    MenuSeedLib.seedMenuItems(menus);
  };
};
