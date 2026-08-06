// AdminPanel — trang /admin: setVpsSecret, generateActivationCode,
// revokeDevice, cleanupExpiredActivations, getCanisterIdText. UI tiếng Việt.

import { ActivationCodeForm } from "@/components/ActivationCodeForm";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCanisterIdText,
  useCleanupExpiredActivations,
  useRevokeDevice,
  useSetVpsSecret,
} from "@/hooks/useQueries";
import {
  Copy,
  KeyRound,
  Loader2,
  ShieldOff,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Card data-ocid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AdminPanel() {
  const [newSecret, setNewSecret] = useState<string>("");
  const [revokeDeviceId, setRevokeDeviceId] = useState<string>("");
  const [cleanedCount, setCleanedCount] = useState<bigint | null>(null);

  const setSecretMutation = useSetVpsSecret();
  const revokeMutation = useRevokeDevice();
  const cleanupMutation = useCleanupExpiredActivations();
  const canisterIdQuery = useCanisterIdText();

  async function handleSetSecret(e: React.FormEvent) {
    e.preventDefault();
    if (!newSecret.trim()) {
      toast.error("Vui lòng nhập secret mới.");
      return;
    }
    if (newSecret.length < 8) {
      toast.error("Secret phải có ít nhất 8 ký tự.");
      return;
    }
    try {
      await setSecretMutation.mutateAsync(newSecret.trim());
      toast.success("Đã cập nhật secret VPS.");
      setNewSecret("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể cập nhật secret.";
      toast.error(message);
    }
  }

  async function handleRevoke(e: React.FormEvent) {
    e.preventDefault();
    if (!revokeDeviceId.trim()) {
      toast.error("Vui lòng nhập mã thiết bị.");
      return;
    }
    try {
      await revokeMutation.mutateAsync(revokeDeviceId.trim());
      toast.success("Đã thu hồi thiết bị.");
      setRevokeDeviceId("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể thu hồi thiết bị.";
      toast.error(message);
    }
  }

  async function handleCleanup() {
    try {
      const count = await cleanupMutation.mutateAsync();
      setCleanedCount(count);
      toast.success(`Đã dọn dẹp ${count.toString()} mã hết hạn.`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể dọn dẹp mã hết hạn.";
      toast.error(message);
    }
  }

  async function copyCanisterId() {
    const id = canisterIdQuery.data;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Đã sao chép Canister ID.");
    } catch {
      toast.error("Không sao chép được. Vui lòng sao chép thủ công.");
    }
  }

  return (
    <section
      className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10"
      data-ocid="admin.page"
    >
      <div className="flex flex-col gap-1">
        <h1
          className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
          data-ocid="admin.title"
        >
          Quản lý
        </h1>
        <p className="text-sm text-muted-foreground">
          Cấu hình hệ thống, mã kích hoạt, thiết bị và canister.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Canister ID */}
        <SectionCard
          icon={KeyRound}
          title="Canister ID"
          description="Định danh canister dùng để VPS xác thực HMAC."
          testId="admin.canister_card"
        >
          <div className="flex flex-col gap-3">
            {canisterIdQuery.isLoading ? (
              <div
                className="flex items-center gap-2 text-sm text-muted-foreground"
                data-ocid="admin.canister.loading_state"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Đang tải Canister ID…
              </div>
            ) : canisterIdQuery.isError ? (
              <p
                className="text-sm text-destructive"
                data-ocid="admin.canister.error_state"
              >
                Không tải được Canister ID.
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <code
                  className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground"
                  title={canisterIdQuery.data ?? ""}
                  data-ocid="admin.canister.id_value"
                >
                  {canisterIdQuery.data || "—"}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyCanisterId}
                  disabled={!canisterIdQuery.data}
                  data-ocid="admin.canister.copy_button"
                  aria-label="Sao chép Canister ID"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        </SectionCard>

        {/* VPS Secret */}
        <SectionCard
          icon={ShieldOff}
          title="Cập nhật secret VPS"
          description="Đặt lại khóa bí mật dùng để ký HMAC giữa canister và VPS worker."
          testId="admin.secret_card"
        >
          <form
            onSubmit={handleSetSecret}
            className="flex flex-col gap-3"
            data-ocid="admin.secret_form"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="vps-secret" className="text-sm font-medium">
                Secret mới
              </Label>
              <Input
                id="vps-secret"
                type="password"
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                placeholder="Ít nhất 8 ký tự"
                minLength={8}
                autoComplete="new-password"
                data-ocid="admin.secret_input"
              />
            </div>
            <Button
              type="submit"
              disabled={setSecretMutation.isPending || !newSecret.trim()}
              data-ocid="admin.secret.submit_button"
              className="w-full sm:w-auto"
            >
              {setSecretMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldOff className="h-4 w-4" aria-hidden="true" />
              )}
              Cập nhật secret
            </Button>
          </form>
        </SectionCard>

        {/* Activation code */}
        <SectionCard
          icon={KeyRound}
          title="Tạo mã kích hoạt"
          description="Tạo mã 6 ký tự hợp lệ 15 phút để kích hoạt thiết bị mới."
          testId="admin.activation_card"
        >
          <ActivationCodeForm />
        </SectionCard>

        {/* Revoke device */}
        <SectionCard
          icon={ShieldOff}
          title="Thu hồi thiết bị"
          description="Nhập mã thiết bị để thu hồi quyền truy cập ngay lập tức."
          testId="admin.revoke_card"
        >
          <form
            onSubmit={handleRevoke}
            className="flex flex-col gap-3"
            data-ocid="admin.revoke_form"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="revoke-device" className="text-sm font-medium">
                Mã thiết bị
              </Label>
              <Input
                id="revoke-device"
                value={revokeDeviceId}
                onChange={(e) => setRevokeDeviceId(e.target.value)}
                placeholder="VD: dev-abc123"
                data-ocid="admin.revoke_input"
              />
            </div>
            <Button
              type="submit"
              variant="destructive"
              disabled={revokeMutation.isPending || !revokeDeviceId.trim()}
              data-ocid="admin.revoke.submit_button"
              className="w-full sm:w-auto"
            >
              {revokeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldOff className="h-4 w-4" aria-hidden="true" />
              )}
              Thu hồi
            </Button>
          </form>
        </SectionCard>

        {/* Cleanup expired activations */}
        <SectionCard
          icon={Trash2}
          title="Dọn dẹp mã hết hạn"
          description="Xóa các mã kích hoạt đã quá hạn để giải phóng bộ nhớ canister."
          testId="admin.cleanup_card"
        >
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleCleanup}
              disabled={cleanupMutation.isPending}
              data-ocid="admin.cleanup.button"
              className="w-full sm:w-auto"
            >
              {cleanupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              Dọn dẹp
            </Button>
            {cleanedCount !== null && (
              <p
                className="text-sm text-muted-foreground"
                data-ocid="admin.cleanup.result"
              >
                Đã dọn dẹp{" "}
                <span className="font-semibold text-foreground">
                  {cleanedCount.toString()}
                </span>{" "}
                mã hết hạn.
              </p>
            )}
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
