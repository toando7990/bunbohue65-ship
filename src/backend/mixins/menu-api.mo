import AccessControl "mo:caffeineai-authorization/access-control";
import Map "mo:core/Map";
import Result "mo:core/Result";

import MenuLib "../lib/menu";
import CoreTypes "../types/core";

// Public API surface for the menu domain.
// State slices (menus, restaurants, restaurantMenuOverrides, accessControlState)
// are injected from main.mo. Admin-only endpoints enforce authorization via
// AccessControl.isAdmin(accessControlState, caller).
mixin (
  accessControlState : AccessControl.AccessControlState,
  menus : Map.Map<Text, CoreTypes.MenuItem>,
  restaurants : Map.Map<Text, CoreTypes.Restaurant>,
  overrides : Map.Map<Text, Map.Map<Text, Nat>>,
) {
  // Admin only. Create a new MenuItem with visible=true. Returns the created item.
  public shared ({ caller }) func addItem(
    itemId : Text,
    name : Text,
    price : Nat,
    unitName : Text,
    vatRate : Nat,
    category : Text,
    imageUrl : Text,
  ) : async Result.Result<CoreTypes.MenuItem, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    MenuLib.addItem(menus, itemId, name, price, unitName, vatRate, category, imageUrl);
  };

  // Admin only. Update an existing MenuItem (including visibility). Returns the updated item.
  public shared ({ caller }) func updateItem(
    itemId : Text,
    name : Text,
    price : Nat,
    unitName : Text,
    vatRate : Nat,
    category : Text,
    imageUrl : Text,
    visible : Bool,
  ) : async Result.Result<CoreTypes.MenuItem, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    MenuLib.updateItem(menus, itemId, name, price, unitName, vatRate, category, imageUrl, visible);
  };

  // Admin only. Delete a MenuItem. Returns success.
  public shared ({ caller }) func deleteItem(itemId : Text) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    MenuLib.deleteItem(menus, itemId);
  };

  // Return all menu items (visible + hidden) for admin.
  public query func listMenus() : async [CoreTypes.MenuItem] {
    MenuLib.listMenus(menus);
  };

  // Return only visible menu items for frontend customers.
  public query func getMenu() : async [CoreTypes.MenuItem] {
    MenuLib.getMenu(menus);
  };

  // Admin only. Create a new Restaurant with visible=true. Returns the created restaurant.
  public shared ({ caller }) func addRestaurant(
    restaurantId : Text,
    name : Text,
    address : Text,
    phone : Text,
  ) : async Result.Result<CoreTypes.Restaurant, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    MenuLib.addRestaurant(restaurants, restaurantId, name, address, phone);
  };

  // Admin only. Update an existing Restaurant (including visibility). Returns the updated restaurant.
  public shared ({ caller }) func updateRestaurant(
    restaurantId : Text,
    name : Text,
    address : Text,
    phone : Text,
    visible : Bool,
  ) : async Result.Result<CoreTypes.Restaurant, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    MenuLib.updateRestaurant(restaurants, restaurantId, name, address, phone, visible);
  };

  // Admin only. Delete a Restaurant and its related price overrides. Returns success.
  public shared ({ caller }) func deleteRestaurant(restaurantId : Text) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    MenuLib.deleteRestaurant(restaurants, overrides, restaurantId);
  };

  // Return all restaurants (visible + hidden) for admin.
  public query func listRestaurants() : async [CoreTypes.Restaurant] {
    MenuLib.listRestaurants(restaurants);
  };

  // Return only visible restaurants for frontend customers.
  public query func getRestaurants() : async [CoreTypes.Restaurant] {
    MenuLib.getRestaurants(restaurants);
  };

  // Admin only. Set a price override for a (restaurantId, itemId) pair. Returns success.
  public shared ({ caller }) func setRestaurantPriceOverride(
    restaurantId : Text,
    itemId : Text,
    price : Nat,
  ) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    MenuLib.setRestaurantPriceOverride(overrides, restaurantId, itemId, price);
  };

  // Return visible menu items with price overrides applied for a specific restaurant.
  public query func getMenuForRestaurant(restaurantId : Text) : async [CoreTypes.MenuItem] {
    MenuLib.getMenuForRestaurant(menus, overrides, restaurantId);
  };
};
