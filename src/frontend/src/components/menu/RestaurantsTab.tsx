// RestaurantsTab — tab "Nhà hàng" của trang Thực đơn & Nhà hàng: thẻ từng
// cơ sở (tên, địa chỉ, SĐT, trạng thái, số món giá riêng, cảnh báo thiếu
// toạ độ), tìm + chip lọc, công tắc "Hiện với khách", Giá riêng (chuyển sang
// tab Thực đơn với giá của cơ sở), Sửa, ⋯ Xoá (xác nhận).

import type { Restaurant } from "@/backend";
import type { PriceOverrides } from "@/components/menu/MenuTab";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useDeleteRestaurant, useUpdateRestaurant } from "@/hooks/useQueries";
import {
  AlertTriangle,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Filter = "all" | "on" | "off" | "nogeo";

export function hasCoords(r: Restaurant): boolean {
  return (
    Number.isFinite(r.lat) &&
    Number.isFinite(r.lng) &&
    !(r.lat === 0 && r.lng === 0)
  );
}

interface Props {
  restaurants: Restaurant[];
  overrides: PriceOverrides | undefined;
  onEdit: (r: Restaurant) => void;
  onOpenPrices: (restaurantId: string) => void;
}

export function RestaurantsTab({
  restaurants,
  overrides,
  onEdit,
  onOpenPrices,
}: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingDelete, setPendingDelete] = useState<Restaurant | null>(null);
  const updateMutation = useUpdateRestaurant();
  const deleteMutation = useDeleteRestaurant();

  const q = search.trim().toLowerCase();
  const list = restaurants.filter((r) => {
    if (
      q &&
      ![r.name, r.address, r.phone].some((x) => x?.toLowerCase().includes(q))
    )
      return false;
    if (filter === "on") return r.visible;
    if (filter === "off") return !r.visible;
    if (filter === "nogeo") return !hasCoords(r);
    return true;
  });

  const chips: Array<[Filter, string, number]> = [
    ["all", "Tất cả", restaurants.length],
    ["on", "Đang nhận đơn", restaurants.filter((r) => r.visible).length],
    ["off", "Tạm ẩn", restaurants.filter((r) => !r.visible).length],
    ["nogeo", "Thiếu toạ độ", restaurants.filter((r) => !hasCoords(r)).length],
  ];

  async function toggle(r: Restaurant) {
    try {
      await updateMutation.mutateAsync({ ...r, visible: !r.visible });
      toast.success(
        r.visible ? `Đã tạm ẩn ${r.name}.` : `${r.name} đã hiện với khách.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không đổi được trạng thái.",
      );
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteMutation.mutateAsync(pendingDelete.restaurantId);
      toast.success(`Đã xoá ${pendingDelete.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xoá được.");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-ocid="restaurant.tab">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm tên, địa chỉ, SĐT…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-ocid="restaurant.search"
          />
        </div>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {chips.map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${filter === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
              data-ocid={`restaurant.filter.${k}`}
            >
              {label} · {n}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground"
          data-ocid="restaurant.empty"
        >
          {restaurants.length === 0
            ? "Chưa có nhà hàng. Bấm “Thêm nhà hàng” để bắt đầu."
            : "Không có nhà hàng nào khớp bộ lọc."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {list.map((r) => {
            const own = overrides?.get(r.restaurantId)?.size ?? 0;
            const geo = hasCoords(r);
            const busy =
              updateMutation.isPending &&
              updateMutation.variables?.restaurantId === r.restaurantId;
            return (
              <div
                key={r.restaurantId}
                className={`flex flex-col gap-3 rounded-lg border bg-card p-4 ${r.visible ? "border-border" : "border-dashed border-border"}`}
                data-ocid={`restaurant.card.${r.restaurantId}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className={`font-display text-base font-semibold ${r.visible ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {r.name}
                    </p>
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {r.address || "—"}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      {r.phone || "—"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${r.visible ? "badge-success" : "border-border bg-muted text-muted-foreground"}`}
                  >
                    {r.visible ? "Đang nhận đơn" : "Tạm ẩn"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span
                    className={`rounded-full px-2 py-0.5 ${own ? "bg-info/10 text-info" : "bg-muted text-muted-foreground"}`}
                  >
                    {own ? `Giá riêng: ${own} món` : "Giá chung"}
                  </span>
                  {geo ? (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
                      Có toạ độ
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-warning"
                      data-ocid={`restaurant.nogeo.${r.restaurantId}`}
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      Thiếu toạ độ — khách không tìm được cơ sở gần nhất
                    </span>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      id={`rvis-${r.restaurantId}`}
                      checked={r.visible}
                      disabled={busy}
                      onCheckedChange={() => void toggle(r)}
                      data-ocid={`restaurant.visible_toggle.${r.restaurantId}`}
                    />
                    <label htmlFor={`rvis-${r.restaurantId}`}>
                      Hiện với khách
                    </label>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenPrices(r.restaurantId)}
                      data-ocid={`restaurant.prices.${r.restaurantId}`}
                    >
                      <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                      Giá riêng
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(r)}
                      data-ocid={`restaurant.edit.${r.restaurantId}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Sửa
                    </Button>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Thao tác khác cho ${r.name}`}
                          data-ocid={`restaurant.more.${r.restaurantId}`}
                        >
                          <MoreHorizontal
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => setPendingDelete(r)}
                          className="text-destructive focus:text-destructive"
                          data-ocid={`restaurant.delete.${r.restaurantId}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Xoá nhà hàng
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
      >
        <AlertDialogContent data-ocid="restaurant.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Xoá cả giá riêng của cơ sở này. Nếu chỉ tạm ngừng nhận đơn, hãy
              tắt "Hiện với khách". Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-ocid="restaurant.delete_dialog.confirm_button"
            >
              Xoá nhà hàng
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
