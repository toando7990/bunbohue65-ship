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
  // `image` carries the dish image bytes (Blob) directly into canister state,
  // replacing the previous VPS-hosted imageUrl string.
  public shared ({ caller }) func addItem(
    itemId : Text,
    name : Text,
    price : Nat,
    unitName : Text,
    vatRate : Nat,
    category : Text,
    image : Blob,
  ) : async Result.Result<CoreTypes.MenuItem, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    MenuLib.addItem(menus, itemId, name, price, unitName, vatRate, category, image);
  };

  // Admin only. Update an existing MenuItem (including visibility). Returns the updated item.
  // `image` carries the dish image bytes (Blob) directly into canister state,
  // replacing the previous VPS-hosted imageUrl string.
  public shared ({ caller }) func updateItem(
    itemId : Text,
    name : Text,
    price : Nat,
    unitName : Text,
    vatRate : Nat,
    category : Text,
    image : Blob,
    visible : Bool,
  ) : async Result.Result<CoreTypes.MenuItem, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    MenuLib.updateItem(menus, itemId, name, price, unitName, vatRate, category, image, visible);
  };

  // Admin only. Bật/tắt hiển thị món — CHỈ đổi field visible, KHÔNG đụng tới
  // ảnh hay các field khác. Tách riêng khỏi updateItem để UI bật/tắt hiển thị
  // (MenuItemTable.tsx) không cần tải lại ảnh gốc trước rồi gửi lại — tránh
  // rủi ro vô tình gửi ảnh rỗng đè lên ảnh thật.
  public shared ({ caller }) func setItemVisible(
    itemId : Text,
    visible : Bool,
  ) : async Result.Result<CoreTypes.MenuItem, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    MenuLib.setItemVisible(menus, itemId, visible);
  };

  // Admin only. Delete a MenuItem. Returns success.
  public shared ({ caller }) func deleteItem(itemId : Text) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    MenuLib.deleteItem(menus, itemId);
  };

  // Return all menu items (visible + hidden) for admin. Ảnh luôn rỗng — lấy
  // riêng qua getItemImage(itemId) để tránh vượt giới hạn kích thước phản
  // hồi IC (3MB) khi catalogue có nhiều món/ảnh.
  public query func listMenus() : async [CoreTypes.MenuItem] {
    MenuLib.listMenus(menus);
  };

  // Return only visible menu items for frontend customers. Ảnh luôn rỗng —
  // lấy riêng qua getItemImage(itemId).
  public query func getMenu() : async [CoreTypes.MenuItem] {
    MenuLib.getMenu(menus);
  };

  // Trả về ảnh (Blob) của ĐÚNG 1 món theo itemId. Public — khách hàng browse
  // menu cũng cần gọi được, không chỉ admin. Mỗi lần gọi chỉ 1 ảnh, không
  // bao giờ vượt giới hạn kích thước phản hồi IC dù catalogue phình to.
  public query func getItemImage(itemId : Text) : async ?Blob {
    MenuLib.getItemImage(menus, itemId);
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

  // Return visible menu items with price overrides applied for a specific
  // restaurant. Ảnh luôn rỗng — lấy riêng qua getItemImage(itemId).
  public query func getMenuForRestaurant(restaurantId : Text) : async [CoreTypes.MenuItem] {
    MenuLib.getMenuForRestaurant(menus, overrides, restaurantId);
  };
};
