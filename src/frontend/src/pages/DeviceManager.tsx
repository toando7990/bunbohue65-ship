// DeviceManager — trang /admin/devices: group thiết bị theo nhà hàng
// (useDevicesByRestaurant), filter role (dropdown), hiển thị DeviceTable,
// nút Thu hồi. UI tiếng Việt: Quản lý thiết bị, Theo nhà hàng, Theo vai trò.

import { type Device, DeviceRole } from "@/backend";
import { DeviceTable } from "@/components/DeviceTable";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDevicesByRestaurant,
  useRestaurants,
  useRevokeDevice,
} from "@/hooks/useQueries";
import { Loader2, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type RoleFilter = "all" | DeviceRole;

const ROLE_FILTER_OPTIONS: Array<{ value: RoleFilter; label: string }> = [
  { value: "all", label: "Tất cả vai trò" },
  { value: DeviceRole.admin, label: "Quản trị" },
  { value: DeviceRole.cashier, label: "Thu ngân" },
  { value: DeviceRole.driver, label: "Tài xế" },
];

function matchesRole(device: Device, filter: RoleFilter): boolean {
  if (filter === "all") return true;
  return device.role === filter;
}

export function DeviceManager() {
  const { data: restaurants, isLoading: restaurantsLoading } = useRestaurants();
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);

  const devicesQuery = useDevicesByRestaurant(selectedRestaurant || undefined);
  const revokeMutation = useRevokeDevice();

  const activeRestaurantId =
    selectedRestaurant || restaurants?.[0]?.restaurantId;
  const devices = (devicesQuery.data ?? []).filter((d) =>
    matchesRole(d, roleFilter),
  );

  async function handleRevoke(deviceId: string) {
    setRevokingDeviceId(deviceId);
    try {
      await revokeMutation.mutateAsync(deviceId);
      toast.success("Đã thu hồi thiết bị.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể thu hồi thiết bị.";
      toast.error(message);
    } finally {
      setRevokingDeviceId(null);
    }
  }

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10"
      data-ocid="device.page"
    >
      <div className="flex flex-col gap-1">
        <h1
          className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
          data-ocid="device.title"
        >
          Quản lý thiết bị
        </h1>
        <p className="text-sm text-muted-foreground">
          Xem và thu hồi thiết bị đã kích hoạt theo nhà hàng và vai trò.
        </p>
      </div>

      {/* Filters */}
      <div
        className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end"
        data-ocid="device.filters"
      >
        <div className="flex flex-col gap-2">
          <label
            htmlFor="device-restaurant"
            className="text-sm font-medium text-muted-foreground"
          >
            Theo nhà hàng
          </label>
          <Select
            value={selectedRestaurant}
            onValueChange={setSelectedRestaurant}
            disabled={restaurantsLoading}
          >
            <SelectTrigger
              id="device-restaurant"
              className="w-full sm:w-[260px]"
              data-ocid="device.restaurant_select"
            >
              <SelectValue
                placeholder={
                  restaurantsLoading ? "Đang tải…" : "Tất cả nhà hàng"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" data-ocid="device.restaurant_option.all">
                Tất cả nhà hàng
              </SelectItem>
              {restaurants?.map((r) => (
                <SelectItem
                  key={r.restaurantId}
                  value={r.restaurantId}
                  data-ocid={`device.restaurant_option.${r.restaurantId}`}
                >
                  {r.name || r.restaurantId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="device-role"
            className="text-sm font-medium text-muted-foreground"
          >
            Theo vai trò
          </label>
          <Select
            value={roleFilter}
            onValueChange={(v) => setRoleFilter(v as RoleFilter)}
          >
            <SelectTrigger
              id="device-role"
              className="w-full sm:w-[200px]"
              data-ocid="device.role_select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_FILTER_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  data-ocid={`device.role_option.${opt.value}`}
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="mt-6" data-ocid="device.content">
        {restaurantsLoading && !restaurants ? (
          <div
            className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
            data-ocid="device.loading_state"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải danh sách nhà hàng…
          </div>
        ) : !activeRestaurantId ? (
          <Card data-ocid="device.empty_restaurant_state">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display">
                <Smartphone
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Chưa có nhà hàng
              </CardTitle>
              <CardDescription>
                Thêm nhà hàng trước khi quản lý thiết bị.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card data-ocid="device.table_card">
            <CardHeader>
              <CardTitle className="font-display">
                Thiết bị của{" "}
                {restaurants?.find((r) => r.restaurantId === activeRestaurantId)
                  ?.name ?? activeRestaurantId}
              </CardTitle>
              <CardDescription>
                {devices.length} thiết bị hiển thị sau khi lọc.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeviceTable
                devices={devices}
                isLoading={devicesQuery.isLoading}
                onRevoke={handleRevoke}
                revokingDeviceId={revokingDeviceId}
                emptyMessage="Chưa có thiết bị nào khớp với bộ lọc."
              />
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
