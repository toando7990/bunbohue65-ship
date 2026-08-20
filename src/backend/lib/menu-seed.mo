import Map "mo:core/Map";

import Types "../types/menu-seed";

// Domain logic for the menu-seed domain.
// State (menus) is injected by the caller; this module exposes a pure,
// idempotent seed function that operates on the injected store.
module {
  public type Menus = Map.Map<Text, Types.MenuItem>;

  // Idempotent seed: ensure the 'Dụng cụ đựng đồ ăn' item exists in the 'Khác'
  // category. If an item with this name + category already exists, do nothing
  // (no duplicate). Otherwise add it with the configured defaults so the VPS
  // can fetch its unit price when computing quotes. Returns true when the item
  // was added, false when it already existed.
  public func seedMenuItems(menus : Menus) : Bool {
    let exists = menus.toArray().any(func((_id : Text, i : Types.MenuItem)) : Bool {
      i.name == Types.SEED_ITEM_NAME and i.category == Types.SEED_ITEM_CATEGORY
    });
    if (exists) {
      return false;
    };
    menus.add(Types.SEED_ITEM_ID, {
      itemId = Types.SEED_ITEM_ID;
      name = Types.SEED_ITEM_NAME;
      price = Types.SEED_ITEM_PRICE;
      unitName = Types.SEED_ITEM_UNIT;
      vatRate = Types.SEED_ITEM_VAT_RATE;
      category = Types.SEED_ITEM_CATEGORY;
      image = ("" : Blob);
      visible = true;
    });
    true;
  };
};
