import Map "mo:core/Map";
import Array "mo:core/Array";
import Text "mo:core/Text";
import Result "mo:core/Result";

import Types "../types/menu";

// Domain logic for the menu domain.
// State (menus, restaurants, restaurantMenuOverrides) is injected by the mixin;
// this module exposes pure functions operating on those injected stores.
module {
  public type Menus = Map.Map<Text, Types.MenuItem>;
  public type Restaurants = Map.Map<Text, Types.Restaurant>;
  public type Overrides = Map.Map<Text, Map.Map<Text, Nat>>;

  // Create a new MenuItem with visible=true and store it in menus.
  // `image` carries the dish image bytes (Blob) directly into canister state,
  // replacing the previous VPS-hosted imageUrl string.
  public func addItem(
    menus : Menus,
    itemId : Text,
    name : Text,
    price : Nat,
    unitName : Text,
    vatRate : Nat,
    category : Text,
    image : Blob,
  ) : Result.Result<Types.MenuItem, Text> {
    let item : Types.MenuItem = {
      itemId;
      name;
      price;
      unitName;
      vatRate;
      category;
      image;
      visible = true;
    };
    menus.add(itemId, item);
    #ok(item);
  };

  // Update an existing MenuItem in menus (including visibility).
  // `image` carries the dish image bytes (Blob) directly into canister state,
  // replacing the previous VPS-hosted imageUrl string.
  public func updateItem(
    menus : Menus,
    itemId : Text,
    name : Text,
    price : Nat,
    unitName : Text,
    vatRate : Nat,
    category : Text,
    image : Blob,
    visible : Bool,
  ) : Result.Result<Types.MenuItem, Text> {
    switch (menus.get(itemId)) {
      case null { #err("Not found") };
      case (?_) {
        let item : Types.MenuItem = {
          itemId;
          name;
          price;
          unitName;
          vatRate;
          category;
          image;
          visible;
        };
        menus.add(itemId, item);
        #ok(item);
      };
    };
  };

  // Remove a MenuItem from menus.
  public func deleteItem(menus : Menus, itemId : Text) : Result.Result<(), Text> {
    menus.remove(itemId);
    #ok;
  };

  // Return all menu items (visible + hidden) for admin — ẢNH LUÔN RỖNG (xem
  // getItemImage bên dưới). Lý do: response chứa TOÀN BỘ ảnh của mọi món đã
  // vượt giới hạn kích thước phản hồi IC (3MB/3,145,728 byte) khi số món +
  // dung lượng ảnh tích luỹ đủ lớn — lỗi "application payload size ... cannot
  // be larger than 3145728", sập hẳn tính năng xem menu cho MỌI khách hàng.
  // Ảnh giờ lấy riêng qua getItemImage(itemId) — mỗi lần gọi chỉ 1 ảnh, không
  // bao giờ chạm giới hạn dù catalogue phình to tới đâu.
  public func listMenus(menus : Menus) : [Types.MenuItem] {
    menus.toArray().map(func((_id : Text, i : Types.MenuItem)) : Types.MenuItem = { i with image = "" : Blob });
  };

  // Return only visible menu items for frontend customers. Ảnh rỗng — lý do
  // giống listMenus ở trên.
  public func getMenu(menus : Menus) : [Types.MenuItem] {
    menus.toArray()
      .filter(func((_id : Text, i : Types.MenuItem)) : Bool { i.visible })
      .map(func((_id : Text, i : Types.MenuItem)) : Types.MenuItem = { i with image = "" : Blob });
  };

  // Create a new Restaurant with visible=true and store it in restaurants.
  public func addRestaurant(
    restaurants : Restaurants,
    restaurantId : Text,
    name : Text,
    address : Text,
    phone : Text,
  ) : Result.Result<Types.Restaurant, Text> {
    let restaurant : Types.Restaurant = {
      restaurantId;
      name;
      address;
      phone;
      visible = true;
    };
    restaurants.add(restaurantId, restaurant);
    #ok(restaurant);
  };

  // Update an existing Restaurant (including visibility).
  public func updateRestaurant(
    restaurants : Restaurants,
    restaurantId : Text,
    name : Text,
    address : Text,
    phone : Text,
    visible : Bool,
  ) : Result.Result<Types.Restaurant, Text> {
    switch (restaurants.get(restaurantId)) {
      case null { #err("Not found") };
      case (?_) {
        let restaurant : Types.Restaurant = {
          restaurantId;
          name;
          address;
          phone;
          visible;
        };
        restaurants.add(restaurantId, restaurant);
        #ok(restaurant);
      };
    };
  };

  // Remove a Restaurant and its related price overrides.
  public func deleteRestaurant(
    restaurants : Restaurants,
    overrides : Overrides,
    restaurantId : Text,
  ) : Result.Result<(), Text> {
    restaurants.remove(restaurantId);
    overrides.remove(restaurantId);
    #ok;
  };

  // Return all restaurants (visible + hidden) for admin.
  public func listRestaurants(restaurants : Restaurants) : [Types.Restaurant] {
    restaurants.toArray().map(func((_id : Text, r : Types.Restaurant)) : Types.Restaurant = r);
  };

  // Return only visible restaurants for frontend customers.
  public func getRestaurants(restaurants : Restaurants) : [Types.Restaurant] {
    restaurants.toArray()
      .filter(func((_id : Text, r : Types.Restaurant)) : Bool { r.visible })
      .map(func((_id : Text, r : Types.Restaurant)) : Types.Restaurant = r);
  };

  // Set a price override for a (restaurantId, itemId) pair.
  public func setRestaurantPriceOverride(
    overrides : Overrides,
    restaurantId : Text,
    itemId : Text,
    price : Nat,
  ) : Result.Result<(), Text> {
    switch (overrides.get(restaurantId)) {
      case null {
        let inner = Map.empty<Text, Nat>();
        inner.add(itemId, price);
        overrides.add(restaurantId, inner);
      };
      case (?inner) {
        inner.add(itemId, price);
        overrides.add(restaurantId, inner);
      };
    };
    #ok;
  };

  // Return visible menu items with price overrides applied for a specific
  // restaurant. Ảnh rỗng — lý do giống listMenus (giới hạn kích thước phản
  // hồi IC 3MB) — lấy riêng qua getItemImage(itemId).
  public func getMenuForRestaurant(
    menus : Menus,
    overrides : Overrides,
    restaurantId : Text,
  ) : [Types.MenuItem] {
    menus.toArray()
      .filter(func((_id : Text, i : Types.MenuItem)) : Bool { i.visible })
      .map(func((_id : Text, i : Types.MenuItem)) : Types.MenuItem {
        let priced = switch (overrides.get(restaurantId)) {
          case null { i };
          case (?inner) {
            switch (inner.get(i.itemId)) {
              case null { i };
              case (?price) { { i with price = price } };
            };
          };
        };
        { priced with image = "" : Blob };
      });
  };

  // Trả về ảnh (Blob) của ĐÚNG 1 món theo itemId — mỗi lần gọi 1 ảnh duy
  // nhất, không bao giờ vượt giới hạn kích thước phản hồi IC dù catalogue có
  // bao nhiêu món. null nếu không tìm thấy item hoặc item không có ảnh.
  public func getItemImage(menus : Menus, itemId : Text) : ?Blob {
    switch (menus.get(itemId)) {
      case null { null };
      case (?item) {
        if (item.image.size() == 0) { null } else { ?item.image };
      };
    };
  };

  // Bật/tắt hiển thị món CHỈ đổi field visible, KHÔNG đụng tới các field
  // khác (đặc biệt là image) — tách riêng khỏi updateItem để tránh rủi ro
  // ghi đè nhầm ảnh thật bằng giá trị rỗng khi caller không có sẵn ảnh gốc
  // trong tay (ví dụ MenuItemTable.tsx bật/tắt hiển thị không tải lại ảnh).
  public func setItemVisible(
    menus : Menus,
    itemId : Text,
    visible : Bool,
  ) : Result.Result<Types.MenuItem, Text> {
    switch (menus.get(itemId)) {
      case null { #err("Not found") };
      case (?item) {
        let updated : Types.MenuItem = { item with visible };
        menus.add(itemId, updated);
        #ok(updated);
      };
    };
  };
};
