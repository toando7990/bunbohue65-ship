// Thay thế / điều chỉnh hoá đơn đã phát hành (Bkav lệnh 123 / 124) —
// hộp thoại Kế toán. Số tiền giữ nguyên, chỉ đổi thông tin người mua.

import { InvoiceCorrectionDialog } from "@/components/InvoiceCorrectionDialog";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockCorrect = vi.fn();
const mockLookup = vi.fn();
vi.mock("@/lib/vps-client", () => ({
  enterpriseCorrectInvoice: (...a: unknown[]) => mockCorrect(...a),
  enterpriseLookupTaxCode: (...a: unknown[]) => mockLookup(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const target = {
  orderId: "ORD-X",
  invoiceId: "123",
  invoiceSerial: "C26MAA",
  amount: 45000,
  createdAt: Date.now(),
};

function setup(kind: "replace" | "adjust" = "replace") {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(
    <InvoiceCorrectionDialog
      deviceId="dev-acc"
      target={target}
      initialKind={kind}
      onClose={onClose}
      onDone={onDone}
    />,
  );
  return { onClose, onDone };
}

describe("InvoiceCorrectionDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the original invoice and requires a reason before submitting", () => {
    setup();
    expect(
      screen.getByTestId("accounting.correction_original"),
    ).toHaveTextContent("C26MAA · 123");
    expect(
      screen.getByTestId("accounting.correction_submit_button"),
    ).toBeDisabled();
    fireEvent.change(screen.getByTestId("accounting.correction_reason_input"), {
      target: { value: "Khách cần hoá đơn công ty" },
    });
    expect(
      screen.getByTestId("accounting.correction_submit_button"),
    ).toBeEnabled();
  });

  it("looks up the tax code, fills company name + address, and replaces the invoice", async () => {
    mockLookup.mockResolvedValue({
      ok: true,
      found: true,
      name: "CÔNG TY TNHH ABC",
      address: "Hà Nội",
    });
    mockCorrect.mockResolvedValue({
      ok: true,
      kind: "replace",
      invoiceNo: "124",
    });
    const { onDone, onClose } = setup();
    fireEvent.change(screen.getByTestId("accounting.correction_tax_input"), {
      target: { value: "0101243150" },
    });
    fireEvent.click(screen.getByTestId("accounting.correction_lookup_button"));
    await waitFor(() =>
      expect(
        screen.getByTestId("accounting.correction_name_input"),
      ).toHaveValue("CÔNG TY TNHH ABC"),
    );
    expect(
      screen.getByTestId("accounting.correction_address_input"),
    ).toHaveValue("Hà Nội");
    fireEvent.change(screen.getByTestId("accounting.correction_reason_input"), {
      target: { value: "Khách cần hoá đơn công ty" },
    });
    fireEvent.click(screen.getByTestId("accounting.correction_submit_button"));
    await waitFor(() =>
      expect(mockCorrect).toHaveBeenCalledWith("dev-acc", "ORD-X", {
        kind: "replace",
        buyerTaxCode: "0101243150",
        buyerName: "CÔNG TY TNHH ABC",
        buyerAddress: "Hà Nội",
        receiverEmail: "",
        reason: "Khách cần hoá đơn công ty",
      }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("switches to 'Điều chỉnh thông tin' and shows Bkav's real rejection inline", async () => {
    mockCorrect.mockRejectedValue(
      new Error("Bkav từ chối: Hoá đơn gốc không tồn tại"),
    );
    const { onDone } = setup("replace");
    fireEvent.click(screen.getByTestId("accounting.correction_kind.adjust"));
    expect(
      screen.getByTestId("accounting.correction_submit_button"),
    ).toHaveTextContent("Phát hành hoá đơn điều chỉnh");
    fireEvent.change(screen.getByTestId("accounting.correction_reason_input"), {
      target: { value: "Sai địa chỉ công ty" },
    });
    fireEvent.click(screen.getByTestId("accounting.correction_submit_button"));
    await waitFor(() =>
      expect(
        screen.getByTestId("accounting.correction_error"),
      ).toHaveTextContent("Hoá đơn gốc không tồn tại"),
    );
    expect(mockCorrect.mock.calls[0][2].kind).toBe("adjust");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("rejects an invalid tax code and requires the company name when a tax code is given", () => {
    setup();
    fireEvent.change(screen.getByTestId("accounting.correction_reason_input"), {
      target: { value: "Khách cần hoá đơn công ty" },
    });
    fireEvent.change(screen.getByTestId("accounting.correction_tax_input"), {
      target: { value: "123" },
    });
    expect(screen.getByText(/MST gồm 10, 12, 14 số/)).toBeInTheDocument();
    expect(
      screen.getByTestId("accounting.correction_submit_button"),
    ).toBeDisabled();
    fireEvent.change(screen.getByTestId("accounting.correction_tax_input"), {
      target: { value: "0101243150" },
    });
    expect(
      screen.getByTestId("accounting.correction_submit_button"),
    ).toBeDisabled();
    fireEvent.change(screen.getByTestId("accounting.correction_name_input"), {
      target: { value: "CÔNG TY ABC" },
    });
    expect(
      screen.getByTestId("accounting.correction_submit_button"),
    ).toBeEnabled();
  });
});
