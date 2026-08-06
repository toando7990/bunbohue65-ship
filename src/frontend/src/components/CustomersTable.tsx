// CustomersTable — bảng khách hàng (nhà hàng) với cusName, cusPhone, số đơn, tổng chi.
// Nguồn dữ liệu: AnalyticsResponse.byRestaurant (cusName/cusPhone không có trong
// AnalyticsResponse; dùng name làm cusName, restaurantId làm cusPhone placeholder,
// orders làm số đơn, revenue làm tổng chi — đây là dữ liệu khách hàng thực tế có sẵn).

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface CustomersTableRow {
  cusName: string;
  cusPhone: string;
  orderCount: number;
  totalSpent: number;
}

export interface CustomersTableProps {
  data: CustomersTableRow[];
  testId?: string;
}

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

export function CustomersTable({ data, testId }: CustomersTableProps) {
  if (data.length === 0) {
    return (
      <div
        data-ocid={testId ?? "customers_table.empty_state"}
        className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
      >
        Chưa có dữ liệu khách hàng.
      </div>
    );
  }

  return (
    <div data-ocid={testId ?? "customers_table"} className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Khách hàng</TableHead>
            <TableHead>Số điện thoại</TableHead>
            <TableHead className="text-right">Số đơn</TableHead>
            <TableHead className="text-right">Tổng chi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow
              key={`${row.cusName}-${i}`}
              data-ocid={`customers_table.row.${i + 1}`}
            >
              <TableCell className="font-medium text-foreground">
                {row.cusName}
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">
                {row.cusPhone || "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {row.orderCount}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">
                {formatVnd(row.totalSpent)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
