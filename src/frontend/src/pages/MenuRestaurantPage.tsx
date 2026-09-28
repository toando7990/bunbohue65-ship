// MenuRestaurantPage — trang /admin/thuc-don "Thực đơn & Nhà hàng" (gộp 2
// trang Menu + Nhà hàng cũ — giao diện đã duyệt). 2 tab:
//  - Thực đơn: món theo nhóm, "Xem giá tại" Giá chung / từng nhà hàng để sửa
//    giá riêng ngay trên danh sách;
//  - Nhà hàng: thẻ từng cơ sở; "Giá riêng" chuyển sang tab Thực đơn với giá
//    của cơ sở đó.
// /admin/menu và /admin/restaurants vẫn mở trang này (đúng tab).

import type { MenuItem, Restaurant } from "@/backend";
import { MenuItemForm } from "@/components/MenuItemForm";
import {
  RestaurantForm,
  type RestaurantFormValues,
} from "@/components/RestaurantForm";
import { MenuTab } from "@/components/menu/MenuTab";
import { RestaurantsTab } from "@/components/menu/RestaurantsTab";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAddRestaurant,
  useMenus,
  useRestaurantPriceOverrides,
  useRestaurants,
  useUpdateRestaurant,
} from "@/hooks/useQueries";
import { Loader2, Plus, Store, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Tab = "menu" | "restaurants";

type ItemDialog = { item?: MenuItem; category?: string } | null;
type RestDialog = { restaurant?: Restaurant } | null;

export function MenuRestaurantPage({
  initialTab = "menu",
}: {
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [scope, setScope] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<ItemDialog>(null);
  const [restDialog, setRestDialog] = useState<RestDialog>(null);

  const menusQuery = useMenus();
  const restaurantsQuery = useRestaurants();
  const overridesQuery = useRestaurantPriceOverrides();
  const addRestaurant = useAddRestaurant();
  const updateRestaurant = useUpdateRestaurant();

  const items = menusQuery.data ?? [];
  const restaurants = restaurantsQuery.data ?? [];
  const overrides = overridesQuery.data;
  const loading =
    (menusQuery.isLoading && !menusQuery.data) ||
    (restaurantsQuery.isLoading && !restaurantsQuery.data);
  const loadError = menusQuery.error ?? restaurantsQuery.error;

  function openPrices(restaurantId: string) {
    setScope(restaurantId);
    setTab("menu");
  }

  async function saveRestaurant(values: RestaurantFormValues) {
    const isEdit = !!restDialog?.restaurant;
    try {
      if (isEdit) await updateRestaurant.mutateAsync(values);
      else await addRestaurant.mutateAsync(values);
      toast.success(isEdit ? "Đã lưu nhà hàng." : "Đã thêm nhà hàng.");
      setRestDialog(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được.");
    }
  }

  const restSaving = addRestaurant.isPending || updateRestaurant.isPending;

  return (
    <section
      className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10"
      data-ocid="menu_restaurant.page"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Thực đơn &amp; Nhà hàng
          </h1>
          <p className="text-sm text-muted-foreground">
            Món ăn, giá chung, giá riêng từng cơ sở và thông tin nhà hàng.
          </p>
        </div>
        {tab === "menu" ? (
          <Button
            type="button"
            onClick={() => setItemDialog({})}
            data-ocid="menu.add_button"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm món
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => setRestDialog({})}
            data-ocid="restaurant.add_button"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm nhà hàng
          </Button>
        )}
      </div>

      <div
        className="mt-5 flex gap-1 border-b border-border"
        role="tablist"
        data-ocid="menu_restaurant.tabs"
      >
        {(
          [
            ["menu", "Thực đơn", items.length, UtensilsCrossed],
            ["restaurants", "Nhà hàng", restaurants.length, Store],
          ] as const
        ).map(([k, label, n, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium sm:px-4 ${tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            data-ocid={`menu_restaurant.tab.${k}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
            <span className="rounded-full bg-muted px-1.5 text-xs">{n}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loading ? (
          <div
            className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
            data-ocid="menu_restaurant.loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải…
          </div>
        ) : loadError ? (
          <div
            className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-8 text-center"
            data-ocid="menu_restaurant.error"
          >
            <p className="text-sm text-destructive">
              Không tải được dữ liệu:{" "}
              {loadError instanceof Error ? loadError.message : "lỗi mạng"}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void menusQuery.refetch();
                void restaurantsQuery.refetch();
              }}
            >
              Thử lại
            </Button>
          </div>
        ) : (
          <>
            {/* Giữ cả 2 tab trong DOM để không mất giá riêng đang sửa dở. */}
            <div hidden={tab !== "menu"}>
              {items.length === 0 ? (
                <div
                  className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center"
                  data-ocid="menu.empty_state"
                >
                  <p className="text-sm text-muted-foreground">
                    Chưa có món nào.
                  </p>
                  <Button type="button" onClick={() => setItemDialog({})}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Thêm món đầu tiên
                  </Button>
                </div>
              ) : (
                <MenuTab
                  items={items}
                  restaurants={restaurants}
                  overrides={overrides}
                  scope={scope}
                  onScopeChange={setScope}
                  onEdit={(item) => setItemDialog({ item })}
                  onAddToCategory={(category) => setItemDialog({ category })}
                />
              )}
            </div>
            <div hidden={tab !== "restaurants"}>
              <RestaurantsTab
                restaurants={restaurants}
                overrides={overrides}
                onEdit={(restaurant) => setRestDialog({ restaurant })}
                onOpenPrices={openPrices}
              />
            </div>
          </>
        )}
      </div>

      <Dialog
        open={!!itemDialog}
        onOpenChange={(o) => {
          if (!o) setItemDialog(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
          data-ocid="menu.form_dialog"
        >
          <DialogHeader>
            <DialogTitle>
              {itemDialog?.item ? "Sửa món" : "Thêm món"}
            </DialogTitle>
            <DialogDescription>
              Giá ở đây là giá chung. Giá riêng từng cơ sở chỉnh bằng "Xem giá
              tại".
            </DialogDescription>
          </DialogHeader>
          {itemDialog && (
            <MenuItemForm
              item={itemDialog.item}
              defaultCategory={itemDialog.category}
              onSaved={() => setItemDialog(null)}
              onCancel={() => setItemDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!restDialog}
        onOpenChange={(o) => {
          if (!o && !restSaving) setRestDialog(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
          data-ocid="restaurant.form_dialog"
        >
          <DialogHeader>
            <DialogTitle>
              {restDialog?.restaurant ? "Sửa nhà hàng" : "Thêm nhà hàng"}
            </DialogTitle>
            <DialogDescription>
              Toạ độ giúp khách tìm cơ sở gần nhất khi đặt món.
            </DialogDescription>
          </DialogHeader>
          {restDialog && (
            <RestaurantForm
              initial={restDialog.restaurant}
              submitting={restSaving}
              onSubmit={(v) => void saveRestaurant(v)}
              onCancel={() => setRestDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
