// MenuTab — tab "Thực đơn" của trang Thực đơn & Nhà hàng (giao diện đã
// duyệt). Món xếp theo nhóm, tìm + chip lọc. Thanh "Xem giá tại":
//  - "Giá chung": bật/tắt Đang bán, sửa, xoá món;
//  - 1 nhà hàng: cột giá thành ô nhập giá riêng tại cơ sở đó (để trống = giá
//    chung), ✕ = về giá chung, "Lưu" gộp mọi thay đổi một lần
//    (setRestaurantPriceOverrides; giá 0 = bỏ giá riêng).
// Nháp giá riêng giữ theo TỪNG nhà hàng nên chuyển qua lại không mất.

import type { MenuItem, Restaurant } from "@/backend";
import { MENU_CATEGORY_OPTIONS } from "@/components/MenuItemForm";
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
import {
  useDeleteItem,
  useItemImage,
  useSaveRestaurantPrices,
  useSetItemVisible,
} from "@/hooks/useQueries";
import { imageBytesToDataUrl } from "@/lib/utils";
import {
  Check,
  ImageOff,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type PriceOverrides = Map<string, Map<string, bigint>>;

export function formatVnd(n: bigint | number): string {
  return `${Number(n).toLocaleString("vi-VN")}đ`;
}
function formatDigits(d: string): string {
  return d ? Number(d).toLocaleString("vi-VN") : "";
}

// Nhóm món theo danh mục: thứ tự theo MENU_CATEGORY_OPTIONS, nhóm lạ xếp sau.
export function groupByCategory(items: MenuItem[]) {
  const map = new Map<string, MenuItem[]>();
  for (const it of items) {
    const key = it.category?.trim() || "Khác";
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  const order = (c: string) => {
    const i = MENU_CATEGORY_OPTIONS.indexOf(c);
    return i === -1 ? MENU_CATEGORY_OPTIONS.length : i;
  };
  return [...map.entries()].sort(
    (a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0], "vi"),
  );
}

// Số nhà hàng đặt giá riêng cho từng món.
export function countOverridesPerItem(ov: PriceOverrides | undefined) {
  const out = new Map<string, number>();
  for (const inner of ov?.values() ?? []) {
    for (const [itemId, price] of inner) {
      if (price > 0n) out.set(itemId, (out.get(itemId) ?? 0) + 1);
    }
  }
  return out;
}

// Thay đổi cần lưu cho 1 nhà hàng: nháp khác giá riêng hiện tại. Nháp trống
// hoặc bằng giá chung = bỏ giá riêng (0n).
export function pendingEntries(
  items: MenuItem[],
  drafts: Record<string, string>,
  current: Map<string, bigint> | undefined,
): Array<[string, bigint]> {
  const out: Array<[string, bigint]> = [];
  for (const it of items) {
    const d = drafts[it.itemId];
    if (d === undefined) continue;
    let next = d === "" ? 0n : BigInt(d);
    if (next === it.price) next = 0n;
    const now = current?.get(it.itemId) ?? 0n;
    if (next !== now) out.push([it.itemId, next]);
  }
  return out;
}

type Filter = "all" | "on" | "off" | "noimg" | "own";

interface Props {
  items: MenuItem[];
  restaurants: Restaurant[];
  overrides: PriceOverrides | undefined;
  scope: string | null; // null = giá chung
  onScopeChange: (restaurantId: string | null) => void;
  onEdit: (item: MenuItem) => void;
  onAddToCategory: (category: string) => void;
}

export function MenuTab({
  items,
  restaurants,
  overrides,
  scope,
  onScopeChange,
  onEdit,
  onAddToCategory,
}: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [pendingDelete, setPendingDelete] = useState<MenuItem | null>(null);
  const [noImage, setNoImage] = useState<Set<string>>(new Set());

  const saveMutation = useSaveRestaurantPrices();
  const deleteMutation = useDeleteItem();

  const restaurant = restaurants.find((r) => r.restaurantId === scope) ?? null;
  const current = scope ? overrides?.get(scope) : undefined;
  const scopeDrafts = scope ? (drafts[scope] ?? {}) : {};
  const pending = scope ? pendingEntries(items, scopeDrafts, current) : [];
  const overrideCount = countOverridesPerItem(overrides);

  // Đổi chế độ → bỏ các chip chỉ có ở chế độ kia.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy khi đổi scope
  useEffect(() => {
    setFilter("all");
  }, [scope === null]);

  const groups = groupByCategory(items);
  const q = search.trim().toLowerCase();
  const matches = (it: MenuItem) => {
    if (q && !it.name.toLowerCase().includes(q)) return false;
    if (category !== "all" && (it.category?.trim() || "Khác") !== category)
      return false;
    if (filter === "on") return it.visible;
    if (filter === "off") return !it.visible;
    if (filter === "noimg") return noImage.has(it.itemId);
    if (filter === "own") return (current?.get(it.itemId) ?? 0n) > 0n;
    return true;
  };
  const visibleGroups = groups
    .map(([cat, list]) => [cat, list.filter(matches)] as const)
    .filter(([, list]) => list.length > 0);

  function setDraft(itemId: string, value: string) {
    if (!scope) return;
    setDrafts((d) => ({ ...d, [scope]: { ...d[scope], [itemId]: value } }));
  }

  async function save() {
    if (!scope || pending.length === 0) return;
    try {
      await saveMutation.mutateAsync({ restaurantId: scope, entries: pending });
      setDrafts((d) => ({ ...d, [scope]: {} }));
      toast.success(`Đã lưu ${pending.length} giá tại ${restaurant?.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được giá.");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteMutation.mutateAsync(pendingDelete.itemId);
      toast.success(`Đã xoá món "${pendingDelete.name}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xoá được món.");
    } finally {
      setPendingDelete(null);
    }
  }

  const reportNoImage = useMemo(
    () => (itemId: string, missing: boolean) =>
      setNoImage((s) => {
        if (s.has(itemId) === missing) return s;
        const n = new Set(s);
        if (missing) n.add(itemId);
        else n.delete(itemId);
        return n;
      }),
    [],
  );

  const catCount = (c: string) =>
    items.filter((it) => (it.category?.trim() || "Khác") === c).length;
  const statusChips: Array<[Filter, string, number]> = scope
    ? [
        [
          "own",
          "Có giá riêng",
          items.filter((it) => (current?.get(it.itemId) ?? 0n) > 0n).length,
        ],
      ]
    : [
        ["on", "Đang bán", items.filter((i) => i.visible).length],
        ["off", "Tạm ẩn", items.filter((i) => !i.visible).length],
        ["noimg", "Chưa có ảnh", noImage.size],
      ];

  return (
    <div className="flex flex-col gap-3" data-ocid="menu.tab">
      {/* Xem giá tại */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Xem giá tại:
        </span>
        <div
          className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1"
          role="tablist"
          data-ocid="menu.scope"
        >
          {[null, ...restaurants.map((r) => r.restaurantId)].map((rid) => {
            const r = restaurants.find((x) => x.restaurantId === rid);
            const on = scope === rid;
            const n = rid ? (overrides?.get(rid)?.size ?? 0) : 0;
            const unsaved = rid
              ? pendingEntries(items, drafts[rid] ?? {}, overrides?.get(rid))
                  .length
              : 0;
            return (
              <button
                key={rid ?? "base"}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onScopeChange(rid)}
                className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ${on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                data-ocid={`menu.scope.${rid ?? "base"}`}
              >
                {r ? r.name || r.restaurantId : "Giá chung"}
                {n > 0 && ` · ${n}`}
                {unsaved > 0 && <span className="ml-1 text-warning">•</span>}
              </button>
            );
          })}
        </div>
      </div>

      {scope && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/40 bg-info/5 px-3 py-2 text-sm"
          data-ocid="menu.price_banner"
        >
          <span>
            Đang sửa <b>giá riêng tại {restaurant?.name ?? scope}</b>. Để trống
            = dùng giá chung.
          </span>
          <span className="flex items-center gap-2">
            {pending.length > 0 && (
              <span className="text-xs text-warning">
                {pending.length} thay đổi chưa lưu
              </span>
            )}
            <Button
              type="button"
              size="sm"
              disabled={pending.length === 0 || saveMutation.isPending}
              onClick={() => void save()}
              data-ocid="menu.price_save"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Lưu
            </Button>
          </span>
        </div>
      )}

      {/* Tìm + lọc */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm món…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-ocid="menu.search"
          />
        </div>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          <Chip
            on={category === "all"}
            onClick={() => setCategory("all")}
            id="menu.cat.all"
          >
            Tất cả · {items.length}
          </Chip>
          {groups.map(([c]) => (
            <Chip
              key={c}
              on={category === c}
              onClick={() => setCategory(c)}
              id={`menu.cat.${c}`}
            >
              {c} · {catCount(c)}
            </Chip>
          ))}
          <span className="mx-1 h-5 w-px shrink-0 self-center bg-border" />
          {statusChips.map(([k, label, n]) => (
            <Chip
              key={k}
              on={filter === k}
              onClick={() => setFilter(filter === k ? "all" : k)}
              id={`menu.filter.${k}`}
            >
              {label} · {n}
            </Chip>
          ))}
        </div>
      </div>

      {/* Danh sách */}
      {visibleGroups.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground"
          data-ocid="menu.empty_filtered"
        >
          Không có món nào khớp bộ lọc.
        </p>
      ) : (
        visibleGroups.map(([cat, list]) => (
          <div
            key={cat}
            className="overflow-hidden rounded-lg border border-border bg-card"
            data-ocid={`menu.group.${cat}`}
          >
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
              <p className="text-sm font-semibold">
                {cat}{" "}
                <span className="font-normal text-muted-foreground">
                  · {list.length} món
                </span>
              </p>
              {!scope && (
                <button
                  type="button"
                  className="text-xs text-info hover:underline"
                  onClick={() => onAddToCategory(cat)}
                >
                  + Thêm vào nhóm
                </button>
              )}
            </div>
            <div className="divide-y divide-border">
              {list.map((it) => (
                <MenuRow
                  key={it.itemId}
                  item={it}
                  scope={scope}
                  ownCount={overrideCount.get(it.itemId) ?? 0}
                  override={current?.get(it.itemId) ?? 0n}
                  draft={scopeDrafts[it.itemId]}
                  onDraft={(v) => setDraft(it.itemId, v)}
                  onEdit={() => onEdit(it)}
                  onDelete={() => setPendingDelete(it)}
                  onImage={reportNoImage}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
      >
        <AlertDialogContent data-ocid="menu.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Xoá món "{pendingDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Món bị xoá hẳn khỏi thực đơn mọi cơ sở. Nếu chỉ muốn ngừng bán tạm
              thời, hãy tắt "Đang bán". Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-ocid="menu.delete_dialog.confirm_button"
            >
              Xoá món
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
  id,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
      data-ocid={id}
    >
      {children}
    </button>
  );
}

function MenuRow({
  item,
  scope,
  ownCount,
  override,
  draft,
  onDraft,
  onEdit,
  onDelete,
  onImage,
}: {
  item: MenuItem;
  scope: string | null;
  ownCount: number;
  override: bigint;
  draft: string | undefined;
  onDraft: (v: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onImage: (itemId: string, missing: boolean) => void;
}) {
  const { data: bytes, isSuccess } = useItemImage(item.itemId);
  const url = useMemo(() => imageBytesToDataUrl(bytes), [bytes]);
  useEffect(() => {
    if (isSuccess) onImage(item.itemId, !url);
  }, [isSuccess, url, item.itemId, onImage]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const setVisible = useSetItemVisible();

  async function toggle(next: boolean) {
    try {
      await setVisible.mutateAsync({ itemId: item.itemId, visible: next });
      toast.success(
        next ? `Đang bán "${item.name}".` : `Đã ẩn "${item.name}".`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không đổi được trạng thái.",
      );
    }
  }

  const value =
    draft !== undefined ? draft : override > 0n ? String(override) : "";
  const dirty =
    draft !== undefined &&
    (draft === "" || BigInt(draft) === item.price ? 0n : BigInt(draft)) !==
      override;
  const hasOwn = value !== "" && BigInt(value) !== item.price;
  const diff = hasOwn ? BigInt(value) - item.price : 0n;
  const missingImg = isSuccess && !url;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 sm:px-4 ${dirty ? "bg-warning/5" : !item.visible ? "bg-muted/30" : ""}`}
      data-ocid={`menu.row.${item.itemId}`}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className="h-11 w-11 shrink-0 rounded-md border border-border object-cover"
        />
      ) : (
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed ${missingImg ? "border-warning/60 text-warning" : "border-border text-muted-foreground"}`}
        >
          <ImageOff className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${item.visible ? "text-foreground" : "text-muted-foreground"}`}
        >
          {item.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {scope ? (
            !item.visible ? (
              "Tạm ẩn — không bán ở cơ sở nào"
            ) : dirty ? (
              <span className="text-warning">Chưa lưu</span>
            ) : hasOwn ? (
              <span className="text-info">
                {diff > 0n ? "+" : "−"}
                {formatVnd(diff > 0n ? diff : -diff)} so với giá chung
              </span>
            ) : (
              "Giá chung"
            )
          ) : (
            <>
              {item.unitName || "—"} · VAT {String(item.vatRate)}%
              {!item.visible && " · Tạm ẩn"}
              {missingImg && (
                <span className="whitespace-nowrap text-warning">
                  {" "}
                  · chưa có ảnh
                </span>
              )}
              {ownCount > 0 && (
                <span className="ml-1.5 whitespace-nowrap rounded-full bg-info/10 px-1.5 py-0.5 text-[11px] text-info">
                  Giá riêng ở {ownCount} cơ sở
                </span>
              )}
            </>
          )}
        </p>
      </div>

      {scope ? (
        <div className="flex items-center gap-2">
          <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
            {formatVnd(item.price)}
          </span>
          <Input
            inputMode="numeric"
            className={`h-8 w-28 text-right tabular-nums ${hasOwn || dirty ? "border-info/60 font-semibold" : ""}`}
            placeholder={Number(item.price).toLocaleString("vi-VN")}
            value={formatDigits(value)}
            disabled={!item.visible}
            onChange={(e) => onDraft(e.target.value.replace(/\D/g, ""))}
            aria-label={`Giá tại cơ sở cho ${item.name}`}
            data-ocid={`menu.price_input.${item.itemId}`}
          />
          {hasOwn ? (
            <button
              type="button"
              title="Về giá chung"
              aria-label={`Về giá chung cho ${item.name}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onDraft("")}
              data-ocid={`menu.price_reset.${item.itemId}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <span className="w-4" />
          )}
        </div>
      ) : (
        <>
          <p className="text-right text-sm font-semibold tabular-nums sm:w-24">
            {formatVnd(item.price)}
          </p>
          <Switch
            checked={item.visible}
            disabled={setVisible.isPending}
            onCheckedChange={(v) => void toggle(v)}
            aria-label={`Đang bán ${item.name}`}
            data-ocid={`menu.visible_toggle.${item.itemId}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 sm:inline-flex"
            onClick={onEdit}
            aria-label={`Sửa món ${item.name}`}
            data-ocid={`menu.edit.${item.itemId}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Thao tác khác cho ${item.name}`}
                data-ocid={`menu.more.${item.itemId}`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit} className="sm:hidden">
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Sửa món
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Xoá món
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}
