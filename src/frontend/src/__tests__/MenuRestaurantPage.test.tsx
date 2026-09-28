// Trang "Thực đơn & Nhà hàng" (gộp Menu + Nhà hàng): nhóm món, lọc, sửa giá
// riêng ngay trên danh sách (lưu gộp; ✕ / để trống / bằng giá chung = bỏ giá
// riêng = 0n), tab Nhà hàng (thiếu toạ độ, ẩn/hiện, Giá riêng → tab Thực đơn).

import { groupByCategory, pendingEntries } from "@/components/menu/MenuTab";
import { MenuRestaurantPage } from "@/pages/MenuRestaurantPage";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveAsync = vi.fn();
const updateRestAsync = vi.fn();
const setVisibleAsync = vi.fn();

function item(
  itemId: string,
  name: string,
  price: number,
  category: string,
  visible = true,
) {
  return {
    itemId,
    name,
    price: BigInt(price),
    category,
    unitName: "tô",
    visible,
    vatRate: 8n,
    image: new Uint8Array(),
  };
}
const MENU = [
  item("bb-db", "Bún bò đặc biệt", 65000, "Món chính"),
  item("bb-gh", "Bún bò giò heo", 55000, "Món chính"),
  item("bb-cc", "Bún bò chả cua", 60000, "Món chính", false),
  item("tra-da", "Trà đá", 5000, "Đồ uống"),
];
const RESTS = [
  {
    restaurantId: "r1",
    name: "Cơ sở Cầu Giấy",
    address: "65 Trần Thái Tông",
    phone: "0901",
    visible: true,
    lat: 21.03,
    lng: 105.8,
  },
  {
    restaurantId: "r2",
    name: "Cơ sở Hà Đông",
    address: "88 Quang Trung",
    phone: "0902",
    visible: true,
    lat: 0,
    lng: 0,
  },
];
const OV = new Map([["r1", new Map([["bb-db", 70000n]])]]);

const mut = (fn = vi.fn()) => ({
  mutateAsync: fn,
  isPending: false,
  variables: undefined,
});

vi.mock("@/hooks/useQueries", () => ({
  useMenus: () => ({ data: MENU, isLoading: false }),
  useRestaurants: () => ({ data: RESTS, isLoading: false }),
  useRestaurantPriceOverrides: () => ({ data: OV }),
  useItemImage: () => ({ data: undefined, isSuccess: true }),
  useSaveRestaurantPrices: () => mut(saveAsync),
  useSetItemVisible: () => mut(setVisibleAsync),
  useDeleteItem: () => mut(),
  useAddRestaurant: () => mut(),
  useUpdateRestaurant: () => mut(updateRestAsync),
  useDeleteRestaurant: () => mut(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/MenuItemForm", () => ({
  MENU_CATEGORY_OPTIONS: ["Món chính", "Món phụ", "Đồ uống"],
  MenuItemForm: (p: { defaultCategory?: string; item?: { name: string } }) => (
    <div>
      form:{p.item?.name ?? "mới"}:{p.defaultCategory ?? "-"}
    </div>
  ),
}));
vi.mock("@/components/RestaurantForm", () => ({
  RestaurantForm: () => <div>form-nha-hang</div>,
}));

describe("MenuRestaurantPage", () => {
  beforeEach(() => {
    saveAsync.mockResolvedValue(undefined);
    updateRestAsync.mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("món xếp theo nhóm, chip đếm và nhãn giá riêng", () => {
    render(<MenuRestaurantPage />);
    expect(screen.getByTestId("menu.group.Món chính")).toHaveTextContent(
      "3 món",
    );
    expect(screen.getByTestId("menu.cat.Đồ uống")).toHaveTextContent("1");
    expect(screen.getByTestId("menu.filter.off")).toHaveTextContent(
      "Tạm ẩn · 1",
    );
    expect(screen.getByTestId("menu.row.bb-db")).toHaveTextContent(
      "Giá riêng ở 1 cơ sở",
    );

    fireEvent.click(screen.getByTestId("menu.filter.off"));
    expect(screen.getByTestId("menu.row.bb-cc")).toBeInTheDocument();
    expect(screen.queryByTestId("menu.row.bb-gh")).not.toBeInTheDocument();
  });

  it("tìm món theo tên", () => {
    render(<MenuRestaurantPage />);
    fireEvent.change(screen.getByTestId("menu.search"), {
      target: { value: "trà" },
    });
    expect(screen.getByTestId("menu.row.tra-da")).toBeInTheDocument();
    expect(screen.queryByTestId("menu.row.bb-db")).not.toBeInTheDocument();
  });

  it("sửa giá riêng tại 1 cơ sở rồi Lưu gộp", async () => {
    render(<MenuRestaurantPage />);
    fireEvent.click(screen.getByTestId("menu.scope.r1"));

    expect(screen.getByTestId("menu.price_input.bb-db")).toHaveValue("70.000");
    expect(screen.getByTestId("menu.price_save")).toBeDisabled();

    fireEvent.change(screen.getByTestId("menu.price_input.bb-gh"), {
      target: { value: "58.000" },
    });
    expect(screen.getByTestId("menu.price_banner")).toHaveTextContent(
      "1 thay đổi chưa lưu",
    );
    // Món tạm ẩn không nhập được giá riêng.
    expect(screen.getByTestId("menu.price_input.bb-cc")).toBeDisabled();

    fireEvent.click(screen.getByTestId("menu.price_save"));
    await waitFor(() =>
      expect(saveAsync).toHaveBeenCalledWith({
        restaurantId: "r1",
        entries: [["bb-gh", 58000n]],
      }),
    );
  });

  it("✕ đưa món về giá chung (lưu 0n)", async () => {
    render(<MenuRestaurantPage />);
    fireEvent.click(screen.getByTestId("menu.scope.r1"));
    fireEvent.click(screen.getByTestId("menu.price_reset.bb-db"));
    fireEvent.click(screen.getByTestId("menu.price_save"));
    await waitFor(() =>
      expect(saveAsync).toHaveBeenCalledWith({
        restaurantId: "r1",
        entries: [["bb-db", 0n]],
      }),
    );
  });

  it("tab Nhà hàng: cảnh báo thiếu toạ độ, Giá riêng chuyển sang tab Thực đơn", () => {
    render(<MenuRestaurantPage initialTab="restaurants" />);
    expect(screen.getByTestId("restaurant.nogeo.r2")).toBeInTheDocument();
    expect(screen.queryByTestId("restaurant.nogeo.r1")).not.toBeInTheDocument();
    expect(screen.getByTestId("restaurant.card.r1")).toHaveTextContent(
      "Giá riêng: 1 món",
    );

    fireEvent.click(screen.getByTestId("restaurant.prices.r1"));
    expect(screen.getByTestId("menu_restaurant.tab.menu")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("menu.price_banner")).toHaveTextContent(
      "Cơ sở Cầu Giấy",
    );
  });

  it("tắt 'Hiện với khách' gọi updateRestaurant với visible=false", async () => {
    render(<MenuRestaurantPage initialTab="restaurants" />);
    fireEvent.click(screen.getByTestId("restaurant.visible_toggle.r1"));
    await waitFor(() =>
      expect(updateRestAsync).toHaveBeenCalledWith(
        expect.objectContaining({ restaurantId: "r1", visible: false }),
      ),
    );
  });

  it("+ Thêm vào nhóm mở form với nhóm chọn sẵn", () => {
    render(<MenuRestaurantPage />);
    const group = screen.getByTestId("menu.group.Đồ uống");
    fireEvent.click(within(group).getByText("+ Thêm vào nhóm"));
    expect(screen.getByText("form:mới:Đồ uống")).toBeInTheDocument();
  });
});

describe("pendingEntries / groupByCategory", () => {
  const items = [
    item("a", "A", 10000, "Món chính"),
    item("b", "B", 20000, "Lạ"),
    item("c", "C", 30000, "Đồ uống"),
  ];

  it("chỉ lấy thay đổi thật; trống hoặc bằng giá chung = 0n", () => {
    const cur = new Map([["a", 12000n]]);
    expect(pendingEntries(items, { a: "12000" }, cur)).toEqual([]);
    expect(pendingEntries(items, { a: "" }, cur)).toEqual([["a", 0n]]);
    expect(pendingEntries(items, { a: "10000" }, cur)).toEqual([["a", 0n]]);
    expect(pendingEntries(items, { b: "20000" }, cur)).toEqual([]);
    expect(pendingEntries(items, { b: "25000" }, cur)).toEqual([["b", 25000n]]);
  });

  it("nhóm theo thứ tự danh mục, nhóm lạ xếp cuối", () => {
    expect(groupByCategory(items).map(([c]) => c)).toEqual([
      "Món chính",
      "Đồ uống",
      "Lạ",
    ]);
  });
});
