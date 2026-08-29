// PromotionTable — bảng chương trình KM: tên, ngày hiệu lực, số khung giờ,
// số mức, trạng thái, nút Sửa/Xoá. UI tiếng Việt.

import type { Promotion } from "@/backend";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export interface PromotionTableProps {
  promotions: Promotion[];
  isLoading?: boolean;
  isDeleting?: boolean;
  onEdit: (promotion: Promotion) => void;
  onDelete: (code: string) => void;
}

export function PromotionTable({
  promotions,
  isLoading = false,
  isDeleting = false,
  onEdit,
  onDelete,
}: PromotionTableProps) {
  const [pendingDelete, setPendingDelete] = useState<Promotion | null>(null);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
        data-ocid="promotion.table.loading_state"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải danh sách chương trình…
      </div>
    );
  }

  if (promotions.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 py-10 text-center"
        data-ocid="promotion.table.empty_state"
      >
        <p className="text-sm text-muted-foreground">
          Chưa có chương trình khuyến mại nào. Bấm "Thêm chương trình" để tạo
          chương trình đầu tiên.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className="overflow-x-auto rounded-lg border border-border"
        data-ocid="promotion.table"
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Mã</TableHead>
              <TableHead>Tên chương trình</TableHead>
              <TableHead>Hiệu lực</TableHead>
              <TableHead>Khung giờ</TableHead>
              <TableHead>Mức KM</TableHead>
              <TableHead className="text-center">Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promotions.map((promo) => (
              <TableRow
                key={promo.code}
                data-ocid={`promotion.table.row.${promo.code}`}
              >
                <TableCell className="font-mono text-xs">
                  {promo.code}
                </TableCell>
                <TableCell className="font-medium">{promo.name}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(promo.startDate)} - {formatDate(promo.endDate)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {promo.timeSlots
                    .map(
                      (s) =>
                        `${pad2(Number(s.startHour))}:${pad2(Number(s.startMinute))} (${s.durationMinutes}p)`,
                    )
                    .join(", ")}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {promo.tiers.length} mức
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className={
                      promo.active
                        ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                        : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    }
                  >
                    {promo.active ? "Đang bật" : "Đã tắt"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(promo)}
                      aria-label={`Sửa ${promo.name}`}
                      data-ocid={`promotion.table.edit_button.${promo.code}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPendingDelete(promo)}
                      aria-label={`Xoá ${promo.name}`}
                      data-ocid={`promotion.table.delete_button.${promo.code}`}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent data-ocid="promotion.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá chương trình?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xoá chương trình "{pendingDelete?.name}"? Hành
              động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="promotion.delete_dialog.cancel_button">
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete.code);
                setPendingDelete(null);
              }}
              disabled={isDeleting}
              data-ocid="promotion.delete_dialog.confirm_button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Xoá chương trình
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
