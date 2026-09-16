// Coverage cho MenuPicker (groupByCategory) — xác nhận hiển thị LIÊN
// TỤC trong 1 lưới duy nhất, KHÔNG còn tiêu đề/ngắt quãng giữa các
// danh mục, nhưng vẫn giữ đúng thứ tự Món chính → Món phụ → Đồ uống.

import { MenuPicker } from "@/components/MenuPicker";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useQueries", () => ({
  useItemImage: () => ({ data: undefined }),
}));

const MENU = [
  {
    itemId: "MAIN1",
    name: "Bún bò Huế truyền thống",
    visible: true,
    category: "Món chính",
    image: new Uint8Array(),
    price: 45000n,
    vatRate: 8n,
    unitName: "tô",
  },
  {
    itemId: "MAIN2",
    name: "Bún bò giò heo",
    visible: true,
    category: "Món chính",
    image: new Uint8Array(),
    price: 50000n,
    vatRate: 8n,
    unitName: "tô",
  },
  {
    itemId: "SIDE1",
    name: "Chả cua chiên",
    visible: true,
    category: "Món phụ",
    image: new Uint8Array(),
    price: 25000n,
    vatRate: 8n,
    unitName: "cái",
  },
  {
    itemId: "DRINK1",
    name: "Trà đá",
    visible: true,
    category: "Đồ uống",
    image: new Uint8Array(),
    price: 5000n,
    vatRate: 0n,
    unitName: "ly",
  },
];

describe("MenuPicker (groupByCategory) — continuous list", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render any category heading (no visual breaks between groups)", () => {
    render(
      <MenuPicker
        menu={MENU}
        isLoading={false}
        cart={{}}
        onQuantityChange={vi.fn()}
        groupByCategory
      />,
    );

    expect(
      screen.queryByTestId(/menu_picker\.category_heading/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Món chính")).not.toBeInTheDocument();
    expect(screen.queryByText("Món phụ")).not.toBeInTheDocument();
    expect(screen.queryByText("Đồ uống")).not.toBeInTheDocument();
  });

  it("renders all items in a single continuous grid", () => {
    render(
      <MenuPicker
        menu={MENU}
        isLoading={false}
        cart={{}}
        onQuantityChange={vi.fn()}
        groupByCategory
      />,
    );

    const grid = screen.getByTestId("menu_picker.grouped_list");
    expect(grid).toBeInTheDocument();
    for (const item of MENU) {
      expect(screen.getByText(item.name)).toBeInTheDocument();
    }
  });

  it("keeps the correct order: Món chính -> Món phụ -> Đồ uống", () => {
    render(
      <MenuPicker
        menu={MENU}
        isLoading={false}
        cart={{}}
        onQuantityChange={vi.fn()}
        groupByCategory
      />,
    );

    const names = screen
      .getAllByText(
        /Bún bò Huế truyền thống|Bún bò giò heo|Chả cua chiên|Trà đá/,
      )
      .map((el) => el.textContent);

    expect(names).toEqual([
      "Bún bò Huế truyền thống",
      "Bún bò giò heo",
      "Chả cua chiên",
      "Trà đá",
    ]);
  });
});
