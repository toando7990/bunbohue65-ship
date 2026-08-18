// MenuPicker — grid/list món với ảnh (imageUrl), tên, giá, số lượng +/-, category filter.
// Mobile-first responsive. Tiếng Việt. Giá VND (bigint → number cho hiển thị).

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, imageBytesToDataUrl } from "@/lib/utils";
import type { MenuItem } from "@/types";
import { Minus, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export interface CartLine {
  itemId: string;
  quantity: number;
}

interface MenuPickerProps {
  menu: MenuItem[] | undefined;
  isLoading: boolean;
  cart: Record<string, number>;
  onQuantityChange: (itemId: string, delta: number) => void;
  disabled?: boolean;
  /** Khi truyền vào: chỉ hiển thị món thuộc danh mục này, ẩn hẳn tab lọc danh mục. */
  fixedCategory?: string;
}

const ALL_CATEGORY = "Tất cả";

function formatVnd(value: bigint): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function MenuCard({
  item,
  quantity,
  onQuantityChange,
  disabled,
  index,
}: {
  item: MenuItem;
  quantity: number;
  onQuantityChange: (itemId: string, delta: number) => void;
  disabled?: boolean;
  index: number;
}) {
  // Cache one object URL per card so re-renders don't leak new URLs each time.
  const imageUrl = useMemo(() => imageBytesToDataUrl(item.image), [item.image]);

  // Revoke the cached object URL when the card unmounts.
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  return (
    <article
      className={cn(
        "flex gap-3 rounded-lg border border-border bg-card p-3 transition-smooth",
        quantity > 0 && "border-primary/60 ring-1 ring-primary/30",
      )}
      data-ocid={`menu_picker.item.${index}`}
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted sm:h-24 sm:w-24">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            Ảnh
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 text-sm font-semibold text-foreground">
            {item.name}
          </h4>
          <span className="shrink-0 text-xs text-muted-foreground">
            {item.unitName || "phần"}
          </span>
        </div>
        <p className="font-mono text-sm font-medium text-primary">
          {formatVnd(item.price)}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            VAT {Number(item.vatRate)}%
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label={`Giảm số lượng ${item.name}`}
              data-ocid={`menu_picker.decrease_button.${index}`}
              onClick={() => onQuantityChange(item.itemId, -1)}
              disabled={disabled || quantity <= 0}
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={quantity}
              onChange={(e) => {
                const v = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v >= 0) {
                  onQuantityChange(item.itemId, v - quantity);
                }
              }}
              aria-label={`Số lượng ${item.name}`}
              data-ocid={`menu_picker.quantity_input.${index}`}
              className="h-8 w-14 px-2 text-center font-mono text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label={`Tăng số lượng ${item.name}`}
              data-ocid={`menu_picker.increase_button.${index}`}
              onClick={() => onQuantityChange(item.itemId, 1)}
              disabled={disabled}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function MenuPicker({
  menu,
  isLoading,
  cart,
  onQuantityChange,
  disabled,
  fixedCategory,
}: MenuPickerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL_CATEGORY);
  // Khi có fixedCategory (trang đặt hàng chỉ muốn hiện "Món chính"), dùng thẳng
  // giá trị này để lọc, bỏ qua state tab (tab cũng bị ẩn ở JSX bên dưới).
  const effectiveCategory = fixedCategory ?? category;

  const categories = useMemo(() => {
    if (!menu?.length) return [ALL_CATEGORY];
    const set = new Set<string>();
    for (const m of menu) {
      if (m.category) set.add(m.category);
    }
    return [ALL_CATEGORY, ...Array.from(set)];
  }, [menu]);

  const filtered = useMemo(() => {
    if (!menu) return [];
    return menu.filter((m) => {
      if (!m.visible) return false;
      if (
        effectiveCategory !== ALL_CATEGORY &&
        m.category !== effectiveCategory
      )
        return false;
      if (query.trim()) {
        return m.name.toLowerCase().includes(query.trim().toLowerCase());
      }
      return true;
    });
  }, [menu, effectiveCategory, query]);
  if (isLoading) {
    return (
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        data-ocid="menu_picker.loading_state"
      >
        {Array.from({ length: 4 }, (_, i) => `skel-${i}`).map((id) => (
          <Skeleton key={id} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!menu?.length) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center"
        data-ocid="menu_picker.empty_state"
      >
        <p className="text-sm font-medium text-foreground">
          Chưa có món trong menu
        </p>
        <p className="text-xs text-muted-foreground">
          Vui lòng chọn nhà hàng khác hoặc quay lại sau.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-ocid="menu_picker.panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm món ăn…"
            aria-label="Tìm món ăn"
            data-ocid="menu_picker.search_input"
            className="h-10 pl-9"
          />
        </div>
      </div>

      {!fixedCategory && (
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Lọc theo danh mục"
          data-ocid="menu_picker.category_list"
        >
          {categories.map((c) => {
            const active = c === category;
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(c)}
                data-ocid={`menu_picker.category_tab.${c}`}
                className={cn(
                  "min-h-[36px] rounded-full border px-3 py-1.5 text-xs font-medium transition-smooth",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-secondary",
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}
      {filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center"
          data-ocid="menu_picker.no_results_state"
        >
          <p className="text-sm font-medium text-foreground">
            Không tìm thấy món phù hợp
          </p>
          <p className="text-xs text-muted-foreground">
            Thử thay đổi từ khoá hoặc danh mục.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((item, idx) => (
            <MenuCard
              key={item.itemId}
              item={item}
              index={idx}
              quantity={cart[item.itemId] ?? 0}
              onQuantityChange={onQuantityChange}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
