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
  public func addItem(
    menus : Menus,
    itemId : Text,
    name : Text,
    price : Nat,
    unitName : Text,
    vatRate : Nat,
    category : Text,
    imageUrl : Text,
  ) : Result.Result<Types.MenuItem, Text> {
    let item : Types.MenuItem = {
      itemId;
      name;
      price;
      unitName;
      vatRate;
      category;
      imageUrl;
      visible = true;
    };
    menus.add(itemId, item);
    #ok(item);
  };

  // Update an existing MenuItem in menus (including visibility).
  public func updateItem(
    menus : Menus,
    itemId : Text,
    name : Text,
    price : Nat,
    unitName : Text,
    vatRate : Nat,
    category : Text,
    imageUrl : Text,
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
          imageUrl;
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

  // Return all menu items (visible + hidden) for admin.
  public func listMenus(menus : Menus) : [Types.MenuItem] {
    menus.toArray().map(func((_id : Text, i : Types.MenuItem)) : Types.MenuItem = i);
  };

  // Return only visible menu items for frontend customers.
  public func getMenu(menus : Menus) : [Types.MenuItem] {
    menus.toArray()
      .filter(func((_id : Text, i : Types.MenuItem)) : Bool { i.visible })
      .map(func((_id : Text, i : Types.MenuItem)) : Types.MenuItem = i);
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

  // Return visible menu items with price overrides applied for a specific restaurant.
  public func getMenuForRestaurant(
    menus : Menus,
    overrides : Overrides,
    restaurantId : Text,
  ) : [Types.MenuItem] {
    menus.toArray()
      .filter(func((_id : Text, i : Types.MenuItem)) : Bool { i.visible })
      .map(func((_id : Text, i : Types.MenuItem)) : Types.MenuItem {
        switch (overrides.get(restaurantId)) {
          case null { i };
          case (?inner) {
            switch (inner.get(i.itemId)) {
              case null { i };
              case (?price) { { i with price = price } };
            };
          };
        };
      });
  };
};
