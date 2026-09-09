// Cover tests for the enterprise device activation form.
//
// Accepted behavior:
//   - entering a valid 6-char code for the expected role activates the device,
//     saves {restaurantId, deviceId, name} to the shared enterprise activation
//     storage, and calls onActivated;
//   - a code that resolves to a DIFFERENT role is rejected with a role-mismatch
//     error and onActivated is NOT called.
//
// The canister actor is mocked; this is component-level coverage of the
// enterprise activation form, not a real backend call.

import { type Device, DeviceRole } from "@/backend";
import { EnterpriseActivationForm } from "@/components/EnterpriseActivationForm";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockActivateDevice = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useActivateDevice: () => ({
    mutateAsync: mockActivateDevice,
    isPending: false,
  }),
}));

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    active: true,
    activatedAt: 1_700_000_000_000_000_000n,
    name: "Nguyễn Văn A",
    role: DeviceRole.paymentQueue,
    restaurantId: "R1",
    deviceId: "dev-abc123",
    phone: "0901234567",
    ...overrides,
  };
}

function fillForm(code: string) {
  fireEvent.change(screen.getByLabelText("Tên nhân viên"), {
    target: { value: "Nguyễn Văn A" },
  });
  fireEvent.change(screen.getByLabelText("Số điện thoại nhân viên"), {
    target: { value: "0901234567" },
  });
  fireEvent.change(screen.getByLabelText("Mã kích hoạt 6 ký tự"), {
    target: { value: code },
  });
  fireEvent.click(screen.getByTestId("enterprise_activation.submit_button"));
}

describe("EnterpriseActivationForm enterprise device activation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("activates the device, saves the activation, and calls onActivated when the role matches", async () => {
    mockActivateDevice.mockResolvedValue(makeDevice());
    const onActivated = vi.fn();

    render(
      <EnterpriseActivationForm
        expectedRole={DeviceRole.paymentQueue}
        expectedRoleLabel="Hàng đợi thanh toán"
        onActivated={onActivated}
      />,
    );

    fillForm("ABC123");

    await waitFor(() => {
      expect(onActivated).toHaveBeenCalledTimes(1);
    });

    // The activation is persisted to the shared enterprise storage key.
    const stored = JSON.parse(
      localStorage.getItem("bbh_enterprise_activation") ?? "{}",
    );
    expect(stored).toMatchObject({
      restaurantId: "R1",
      deviceId: "dev-abc123",
      name: "Nguyễn Văn A",
    });
  });

  it("rejects a code whose role does not match the expected role", async () => {
    // The form expects paymentQueue; the code resolves to an accounting device.
    mockActivateDevice.mockResolvedValue(
      makeDevice({ role: DeviceRole.accounting }),
    );
    const onActivated = vi.fn();

    render(
      <EnterpriseActivationForm
        expectedRole={DeviceRole.paymentQueue}
        expectedRoleLabel="Hàng đợi thanh toán"
        onActivated={onActivated}
      />,
    );

    fillForm("ABC123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Mã này không dành cho thiết bị Hàng đợi thanh toán/,
      );
    });
    expect(onActivated).not.toHaveBeenCalled();
    // Nothing is persisted on a role mismatch.
    expect(localStorage.getItem("bbh_enterprise_activation")).toBeNull();
  });
});
