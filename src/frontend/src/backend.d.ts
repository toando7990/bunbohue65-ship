import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export type SendCodeResult = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export type Result_2 = {
    __kind__: "ok";
    ok: MenuItem;
} | {
    __kind__: "err";
    err: string;
};
export type Result_Km = {
    __kind__: "ok";
    ok: bigint;
} | {
    __kind__: "err";
    err: string;
};
export interface TimeSlot {
    startHour: bigint;
    startMinute: bigint;
    durationMinutes: bigint;
}
export interface DiscountTier {
    minOrderValue: bigint;
    discountAmount: bigint;
}
export interface Promotion {
    code: string;
    name: string;
    startDate: string;
    endDate: string;
    daysOfWeek: Array<boolean>;
    timeSlots: Array<TimeSlot>;
    dailyOrderLimit: bigint;
    perCustomerDailyLimit: bigint;
    tiers: Array<DiscountTier>;
    active: boolean;
}
export type Result_Promo = {
    __kind__: "ok";
    ok: Promotion;
} | {
    __kind__: "err";
    err: string;
};
export type Result_PromoList = {
    __kind__: "ok";
    ok: Array<Promotion>;
} | {
    __kind__: "err";
    err: string;
};
export interface ApplyPromotionOk {
    promotionCode: string;
    discountAmount: bigint;
}
export type Result_Apply = {
    __kind__: "ok";
    ok: ApplyPromotionOk;
} | {
    __kind__: "err";
    err: string;
};
export interface Voucher {
    code: string;
    programCode: string;
    email: string;
    value: bigint;
    startDate: string;
    endDate: string;
    used: boolean;
    issuedAt: bigint;
}
export type Result_Voucher = {
    __kind__: "ok";
    ok: bigint;
} | {
    __kind__: "err";
    err: string;
};
export interface RegistrationPromo {
    code: string;
    name: string;
    startDate: string;
    endDate: string;
    voucherValue: bigint;
    voucherValidDays: bigint;
    active: boolean;
}
export type Result_RegPromo = {
    __kind__: "ok";
    ok: RegistrationPromo;
} | {
    __kind__: "err";
    err: string;
};
export type Result_RegPromoList = {
    __kind__: "ok";
    ok: Array<RegistrationPromo>;
} | {
    __kind__: "err";
    err: string;
};
export interface SalesTier {
    minSales: bigint;
    voucherValue: bigint;
}
export interface SalesPromo {
    code: string;
    name: string;
    startDate: string;
    endDate: string;
    weeklyTiers: Array<SalesTier>;
    monthlyTiers: Array<SalesTier>;
    voucherValidDays: bigint;
    active: boolean;
}
export type Result_SalesPromo = {
    __kind__: "ok";
    ok: SalesPromo;
} | {
    __kind__: "err";
    err: string;
};
export type Result_SalesPromoList = {
    __kind__: "ok";
    ok: Array<SalesPromo>;
} | {
    __kind__: "err";
    err: string;
};
export interface OrderItem {
    itemId: string;
    name: string;
    quantity: bigint;
    price: bigint;
    vatRate: bigint;
    unitName: string;
}
export interface Result__1 {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export type Result_5 = {
    __kind__: "ok";
    ok: OrderStatus;
} | {
    __kind__: "err";
    err: string;
};
export type RestaurantId = string;
export type Result_1 = {
    __kind__: "ok";
    ok: Restaurant;
} | {
    __kind__: "err";
    err: string;
};
export interface RestaurantMenuOverrideEntry {
    restaurantId: string;
    overrides: Array<[string, bigint]>;
}
export interface RestaurantEntry {
    restaurantId: string;
    restaurant: Restaurant;
}
export type Result_4 = {
    __kind__: "ok";
    ok: Device;
} | {
    __kind__: "err";
    err: string;
};
export interface MenuEntry {
    itemId: string;
    menu: MenuItem;
}
export interface OrderStatus {
    paymentStatus: PaymentStatus;
    tingeeQrCode: string;
    invoiceId: string;
    sharedLink: string;
    bookingStatus: BookingStatus;
    pdfUrl: string;
    tingeeQrId: string;
    invoiceStatus: InvoiceStatus;
}
export interface Cell {
    value: Value;
    name: string;
}
export type Result_7 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export type Value = {
    __kind__: "int";
    int: bigint;
} | {
    __kind__: "nat";
    nat: bigint;
} | {
    __kind__: "float";
    float: number;
} | {
    __kind__: "bool";
    bool: boolean;
} | {
    __kind__: "null";
    null: null;
} | {
    __kind__: "text";
    text: string;
};
export type Email = string;
export type VerifyResult = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export type DeviceId = string;
export interface StoreHours {
    closeMinute: bigint;
    closeHour: bigint;
    openMinute: bigint;
    openHour: bigint;
}
export type Result_6 = {
    __kind__: "ok";
    ok: PendingActivation;
} | {
    __kind__: "err";
    err: string;
};
export type Error_ = {
    __kind__: "FrontendOriginsNotConfigured";
    FrontendOriginsNotConfigured: null;
} | {
    __kind__: "MixedSsoSources";
    MixedSsoSources: {
        otherKeys: Array<string>;
        ssoKeys: Array<string>;
    };
} | {
    __kind__: "Stale";
    Stale: {
        ageNs: bigint;
    };
} | {
    __kind__: "MalformedCandid";
    MalformedCandid: null;
} | {
    __kind__: "AmbiguousAttribute";
    AmbiguousAttribute: {
        field: string;
        sources: Array<string>;
    };
} | {
    __kind__: "NoAttributes";
    NoAttributes: null;
} | {
    __kind__: "UnknownNonce";
    UnknownNonce: null;
} | {
    __kind__: "UntrustedSsoSource";
    UntrustedSsoSource: {
        domain: string;
    };
} | {
    __kind__: "MissingField";
    MissingField: string;
} | {
    __kind__: "FrontendOriginMismatch";
    FrontendOriginMismatch: {
        got: string;
        expected: Array<string>;
    };
};
export interface DeviceEntry {
    device: Device;
    deviceId: string;
}
export interface Restaurant {
    name: string;
    restaurantId: string;
    address: string;
    visible: boolean;
    phone: string;
}
export interface PendingActivationEntry {
    code: string;
    activation: PendingActivation;
}
export interface Order {
    paymentStatus: PaymentStatus;
    cusTaxCode: string;
    cusName: string;
    createdAt: bigint;
    taxTotal: bigint;
    ahamoveOrderId: string;
    tingeeQrCode: string;
    shippingFee: bigint;
    invoiceId: string;
    sharedLink: string;
    cusPhone: string;
    orderId: string;
    restaurantId: string;
    updatedAt: bigint;
    bookingStatus: BookingStatus;
    receiverEmail: string;
    pickupCode: string;
    expireAt?: bigint;
    pdfUrl: string;
    tingeeQrId: string;
    goodsAmount: bigint;
    items: Array<OrderItem>;
    amount: bigint;
    cusAddress: string;
    invoiceStatus: InvoiceStatus;
    billId?: string;
    qrCode?: string;
}
export interface Device {
    active: boolean;
    activatedAt: bigint;
    role: DeviceRole;
    restaurantId: string;
    deviceId: string;
    name: string;
    phone: string;
}
export interface MenuItem {
    itemId: string;
    name: string;
    visible: boolean;
    category: string;
    image: Uint8Array;
    price: bigint;
    vatRate: bigint;
    unitName: string;
}
export type Result = {
    __kind__: "ok";
    ok: Order;
} | {
    __kind__: "err";
    err: string;
};
export type Result_3 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export type Hmac = string;
export interface PendingActivation {
    expiresAt: bigint;
    code: string;
    createdAt: bigint;
    role: DeviceRole;
    used: boolean;
    restaurantId: string;
}
export interface OrderEntry {
    order: Order;
    orderId: OrderId;
}
export type OrderId = string;
export interface UpgradeState {
    menus: Array<MenuEntry>;
    orders: Array<OrderEntry>;
    restaurants: Array<RestaurantEntry>;
    restaurantMenuOverrides: Array<RestaurantMenuOverrideEntry>;
    devices: Array<DeviceEntry>;
    pendingActivations: Array<PendingActivationEntry>;
}
export enum BookingStatus {
    cancelled = "cancelled",
    pending = "pending",
    completed = "completed",
    shipping = "shipping",
    pickedUp = "pickedUp",
    confirmed = "confirmed"
}
export enum DeviceRole {
    admin = "admin",
    cashier = "cashier",
    driver = "driver"
}
export enum InvoiceStatus {
    none = "none",
    invoiced = "invoiced",
    failed = "failed"
}
export enum PaymentStatus {
    expired = "expired",
    paid = "paid",
    refunded = "refunded",
    unpaid = "unpaid"
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    activateDevice(code: string, deviceId: DeviceId, name: string, phone: string): Promise<Result_4>;
    addItem(itemId: string, name: string, price: bigint, unitName: string, vatRate: bigint, category: string, image: Uint8Array): Promise<Result_2>;
    addRestaurant(restaurantId: string, name: string, address: string, phone: string): Promise<Result_1>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    cancelOrder(orderId: string, hmac: string): Promise<Result>;
    cleanupExpiredActivations(): Promise<bigint>;
    createOrder(orderId: string, restaurantId: string, cusName: string, cusPhone: string, cusAddress: string, cusTaxCode: string, receiverEmail: string, items: Array<OrderItem>, amount: bigint, goodsAmount: bigint, shippingFee: bigint, taxTotal: bigint, ahamoveOrderId: string, tingeeQrId: string, sharedLink: string, tingeeQrCode: string, pickupCode: string, hmac: string): Promise<Result>;
    deleteItem(itemId: string): Promise<Result_3>;
    deleteRestaurant(restaurantId: string): Promise<Result_3>;
    execute(qJson: string): Promise<Result__1>;
    generateActivationCode(restaurantId: RestaurantId, role: DeviceRole): Promise<Result_6>;
    getCallerUserRole(): Promise<UserRole>;
    /**
     * / Returns the canister's own id as text, so the VPS knows which canister
     * / it is talking to. `Principal.fromActor(Main)` resolves the actor's own
     * / canister principal at runtime (mo:core/IC.getCanisterId does not exist in
     * / core 2.6.1).
     */
    getCanisterIdText(): Promise<string>;
    getMenu(): Promise<Array<MenuItem>>;
    getMenuForRestaurant(restaurantId: string): Promise<Array<MenuItem>>;
    getKmUsageCount(email: string, programCode: string): Promise<bigint>;
    createPromotion(name: string, startDate: string, endDate: string, daysOfWeek: Array<boolean>, timeSlots: Array<TimeSlot>, dailyOrderLimit: bigint, perCustomerDailyLimit: bigint, tiers: Array<DiscountTier>): Promise<Result_Promo>;
    updatePromotion(code: string, name: string, startDate: string, endDate: string, daysOfWeek: Array<boolean>, timeSlots: Array<TimeSlot>, dailyOrderLimit: bigint, perCustomerDailyLimit: bigint, tiers: Array<DiscountTier>, active: boolean): Promise<Result_Promo>;
    deletePromotion(code: string): Promise<Result_3>;
    listPromotions(): Promise<Result_PromoList>;
    getCurrentPromotion(): Promise<Promotion | null>;
    applyPromotion(email: string, orderAmount: bigint, hmac: string): Promise<Result_Apply>;
    applyVoucher(email: string, code: string, orderAmount: bigint, hmac: string): Promise<Result_Voucher>;
    listMyVouchers(email: string): Promise<Array<Voucher>>;
    createRegistrationPromo(name: string, startDate: string, endDate: string, voucherValue: bigint, voucherValidDays: bigint): Promise<Result_RegPromo>;
    updateRegistrationPromo(code: string, name: string, startDate: string, endDate: string, voucherValue: bigint, voucherValidDays: bigint, active: boolean): Promise<Result_RegPromo>;
    deleteRegistrationPromo(code: string): Promise<Result_3>;
    listRegistrationPromos(): Promise<Result_RegPromoList>;
    createSalesPromo(name: string, startDate: string, endDate: string, weeklyTiers: Array<SalesTier>, monthlyTiers: Array<SalesTier>, voucherValidDays: bigint): Promise<Result_SalesPromo>;
    updateSalesPromo(code: string, name: string, startDate: string, endDate: string, weeklyTiers: Array<SalesTier>, monthlyTiers: Array<SalesTier>, voucherValidDays: bigint, active: boolean): Promise<Result_SalesPromo>;
    deleteSalesPromo(code: string): Promise<Result_3>;
    listSalesPromos(): Promise<Result_SalesPromoList>;
    getItemImage(itemId: string): Promise<Uint8Array | null>;
    getOrder(orderId: string): Promise<Result>;
    getOrderStatus(orderId: string): Promise<Result_5>;
    getPaymentMode(): Promise<string>;
    getRestaurants(): Promise<Array<Restaurant>>;
    getStoreHours(): Promise<StoreHours>;
    getUpgradeState(): Promise<UpgradeState>;
    isCallerAdmin(): Promise<boolean>;
    isEmailVerified(email: Email): Promise<boolean>;
    isStoreOpen(): Promise<boolean>;
    listDevicesByRestaurant(restaurantId: RestaurantId): Promise<Array<Device>>;
    listDevicesByRole(role: DeviceRole): Promise<Array<Device>>;
    listMenus(): Promise<Array<MenuItem>>;
    listOrders(): Promise<Array<Order>>;
    getOrdersByEmail(email: string): Promise<Array<Order>>;
    listPaidOrdersForPickup(): Promise<Array<Order>>;
    listPendingPaymentOrders(restaurantId: string): Promise<Array<Order>>;
    listRestaurants(): Promise<Array<Restaurant>>;
    markPaymentExpired(orderId: string, hmac: string): Promise<Result>;
    markPickedUp(orderId: string): Promise<Result>;
    restoreUpgradeState(blob: Uint8Array): Promise<boolean>;
    revokeDevice(deviceId: DeviceId): Promise<Result_4>;
    schema(): Promise<string>;
    seedMenuItems(): Promise<boolean>;
    sendVerificationCode(email: Email): Promise<SendCodeResult>;
    setPaymentMode(mode: string): Promise<Result_3>;
    setRestaurantPriceOverride(restaurantId: string, itemId: string, price: bigint): Promise<Result_3>;
    setStoreHours(hours: StoreHours): Promise<Result_3>;
    setVpsSecret(newSecret: string): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
    snapshotUpgradeState(): Promise<Uint8Array>;
    updateInvoiceStatus(orderId: OrderId, invoiceStatus: InvoiceStatus, invoiceId: string, pdfUrl: string, hmac: Hmac): Promise<Result>;
    updateItem(itemId: string, name: string, price: bigint, unitName: string, vatRate: bigint, category: string, image: Uint8Array, visible: boolean): Promise<Result_2>;
    setItemVisible(itemId: string, visible: boolean): Promise<Result_2>;
    updateOrderQr(orderId: string, qrCode: string | null, billId: string | null, expireAt: bigint | null, hmac: string): Promise<Result>;
    updatePaymentStatus(orderId: OrderId, paymentStatus: PaymentStatus, hmac: Hmac): Promise<Result>;
    updateRestaurant(restaurantId: string, name: string, address: string, phone: string, visible: boolean): Promise<Result_1>;
    updateStatus(orderId: OrderId, bookingStatus: BookingStatus, hmac: Hmac): Promise<Result>;
    tryConsumeKmSlot(email: string, programCode: string, dailyLimit: bigint, hmac: string): Promise<Result_Km>;
    verifyEmailCode(email: Email, code: string): Promise<VerifyResult>;
}
