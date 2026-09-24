import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Cell {
    value: Value;
    name: string;
}
export interface Device {
    active: boolean;
    activatedAt: bigint;
    name: string;
    role: DeviceRole;
    restaurantId: string;
    deviceId: string;
    phone: string;
}
export interface DeviceEntry {
    device: Device;
    deviceId: string;
}
export type DeviceId = string;
export interface DiscountTier {
    discountAmount: bigint;
    minOrderValue: bigint;
}
export type Email = string;
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
export type Hmac = string;
export interface MenuEntry {
    itemId: string;
    menu: MenuItem;
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
    kmDiscountAmount: bigint;
    pdfUrl: string;
    tingeeQrId: string;
    goodsAmount: bigint;
    items: Array<OrderItem>;
    voucherDiscountAmount: bigint;
    amount: bigint;
    paymentVerificationImage: string;
    cusAddress: string;
    invoiceStatus: InvoiceStatus;
    billId?: string;
    qrCode?: string;
}
export interface OrderEntry {
    order: Order;
    orderId: OrderId;
}
export type OrderId = string;
export interface OrderItem {
    itemId: string;
    name: string;
    quantity: bigint;
    price: bigint;
    vatRate: bigint;
    unitName: string;
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
export interface PendingActivation {
    expiresAt: bigint;
    code: string;
    createdAt: bigint;
    role: DeviceRole;
    used: boolean;
    restaurantId: string;
}
export interface PendingActivationEntry {
    code: string;
    activation: PendingActivation;
}
export interface Promotion {
    tiers: Array<DiscountTier>;
    active: boolean;
    endDate: string;
    timeSlots: Array<TimeSlot>;
    enabledOnline: boolean;
    code: string;
    name: string;
    daysOfWeek: Array<boolean>;
    enabledCounter: boolean;
    dailyOrderLimit: bigint;
    perCustomerDailyLimit: bigint;
    termsUrl: string;
    startDate: string;
}
export interface RegistrationPromo {
    active: boolean;
    endDate: string;
    code: string;
    name: string;
    voucherValidDays: bigint;
    voucherValue: bigint;
    termsUrl: string;
    startDate: string;
}
export interface Restaurant {
    lat: number;
    lng: number;
    name: string;
    restaurantId: string;
    address: string;
    visible: boolean;
    phone: string;
}
export interface RestaurantEntry {
    restaurantId: string;
    restaurant: Restaurant;
}
export type RestaurantId = string;
export interface RestaurantMenuOverrideEntry {
    restaurantId: string;
    overrides: Array<[string, bigint]>;
}
export type Result = {
    __kind__: "ok";
    ok: Order;
} | {
    __kind__: "err";
    err: string;
};
export type Result_1 = {
    __kind__: "ok";
    ok: SalesPromo;
} | {
    __kind__: "err";
    err: string;
};
export type Result_10 = {
    __kind__: "ok";
    ok: Array<RegistrationPromo>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_11 = {
    __kind__: "ok";
    ok: Array<Promotion>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_12 = {
    __kind__: "ok";
    ok: Voucher | null;
} | {
    __kind__: "err";
    err: string;
};
export type Result_13 = {
    __kind__: "ok";
    ok: boolean;
} | {
    __kind__: "err";
    err: string;
};
export type Result_14 = {
    __kind__: "ok";
    ok: OrderStatus;
} | {
    __kind__: "err";
    err: string;
};
export type Result_15 = {
    __kind__: "ok";
    ok: PendingActivation;
} | {
    __kind__: "err";
    err: string;
};
export type Result_16 = {
    __kind__: "ok";
    ok: {
        discountAmount: bigint;
        promotionCode: string;
    };
} | {
    __kind__: "err";
    err: string;
};
export type Result_18 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export type Result_2 = {
    __kind__: "ok";
    ok: Restaurant;
} | {
    __kind__: "err";
    err: string;
};
export type Result_3 = {
    __kind__: "ok";
    ok: RegistrationPromo;
} | {
    __kind__: "err";
    err: string;
};
export type Result_4 = {
    __kind__: "ok";
    ok: Promotion;
} | {
    __kind__: "err";
    err: string;
};
export type Result_5 = {
    __kind__: "ok";
    ok: MenuItem;
} | {
    __kind__: "err";
    err: string;
};
export type Result_6 = {
    __kind__: "ok";
    ok: bigint;
} | {
    __kind__: "err";
    err: string;
};
export type Result_7 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export type Result_8 = {
    __kind__: "ok";
    ok: Device;
} | {
    __kind__: "err";
    err: string;
};
export type Result_9 = {
    __kind__: "ok";
    ok: Array<SalesPromo>;
} | {
    __kind__: "err";
    err: string;
};
export interface Result__1 {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export interface SalesPromo {
    active: boolean;
    endDate: string;
    code: string;
    name: string;
    voucherValidDays: bigint;
    weeklyTiers: Array<SalesTier>;
    enabledCounter: boolean;
    monthlyTiers: Array<SalesTier>;
    termsUrl: string;
    startDate: string;
}
export interface SalesTier {
    minSales: bigint;
    voucherValue: bigint;
}
export type SendCodeResult = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export interface StoreHours {
    closeMinute: bigint;
    closeHour: bigint;
    openMinute: bigint;
    openHour: bigint;
}
export interface TimeSlot {
    durationMinutes: bigint;
    startMinute: bigint;
    startHour: bigint;
}
export interface UpgradeState {
    menus: Array<MenuEntry>;
    orders: Array<OrderEntry>;
    restaurants: Array<RestaurantEntry>;
    restaurantMenuOverrides: Array<RestaurantMenuOverrideEntry>;
    devices: Array<DeviceEntry>;
    pendingActivations: Array<PendingActivationEntry>;
}
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
export type VerifyResult = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export interface Voucher {
    endDate: string;
    value: bigint;
    code: string;
    used: boolean;
    email: string;
    programCode: string;
    issuedAt: bigint;
    startDate: string;
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
    accounting = "accounting",
    paymentQueue = "paymentQueue",
    admin = "admin",
    salesPromoReporting = "salesPromoReporting",
    cashier = "cashier",
    driver = "driver"
}
export enum EnterpriseRole {
    accounting = "accounting",
    paymentQueue = "paymentQueue",
    salesPromoReporting = "salesPromoReporting"
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
    activateDevice(code: string, deviceId: DeviceId, name: string, phone: string): Promise<Result_8>;
    addItem(itemId: string, name: string, price: bigint, unitName: string, vatRate: bigint, category: string, image: Uint8Array): Promise<Result_5>;
    addRestaurant(restaurantId: string, name: string, address: string, phone: string, lat: number, lng: number): Promise<Result_2>;
    applyPromotion(email: string, orderAmount: bigint, hmac: Hmac): Promise<Result_16>;
    applyPromotionCounter(orderAmount: bigint, hmac: Hmac): Promise<Result_16>;
    applyVoucher(email: string, code: string, orderAmount: bigint, hmac: Hmac): Promise<Result_6>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    callerHasEnterpriseRole(deviceId: DeviceId, role: EnterpriseRole): Promise<boolean>;
    cancelOrder(orderId: string, hmac: string): Promise<Result>;
    changeOrderRestaurant(orderId: string, newRestaurantId: string, hmac: string): Promise<Result>;
    claimOrderEmail(orderId: string, email: string): Promise<Result>;
    cleanupExpiredActivations(): Promise<bigint>;
    cleanupOrderByDevice(deviceId: string, orderId: string): Promise<Result>;
    countVouchersByProgram(programCode: string): Promise<bigint>;
    createOrder(orderId: string, restaurantId: string, cusName: string, cusPhone: string, cusAddress: string, cusTaxCode: string, receiverEmail: string, items: Array<OrderItem>, amount: bigint, goodsAmount: bigint, shippingFee: bigint, taxTotal: bigint, ahamoveOrderId: string, tingeeQrId: string, sharedLink: string, tingeeQrCode: string, pickupCode: string, kmDiscountAmount: bigint, voucherDiscountAmount: bigint, hmac: string): Promise<Result>;
    createPromotion(deviceId: string, name: string, startDate: string, endDate: string, daysOfWeek: Array<boolean>, timeSlots: Array<TimeSlot>, dailyOrderLimit: bigint, perCustomerDailyLimit: bigint, tiers: Array<DiscountTier>, termsUrl: string): Promise<Result_4>;
    createRegistrationPromo(deviceId: string, name: string, startDate: string, endDate: string, voucherValue: bigint, voucherValidDays: bigint, termsUrl: string): Promise<Result_3>;
    createSalesPromo(deviceId: string, name: string, startDate: string, endDate: string, weeklyTiers: Array<SalesTier>, monthlyTiers: Array<SalesTier>, voucherValidDays: bigint, termsUrl: string): Promise<Result_1>;
    deactivateExpiredPromotions(hmac: Hmac): Promise<Result_6>;
    deleteItem(itemId: string): Promise<Result_7>;
    deletePromotion(deviceId: string, code: string): Promise<Result_7>;
    deleteRegistrationPromo(deviceId: string, code: string): Promise<Result_7>;
    deleteRestaurant(restaurantId: string): Promise<Result_7>;
    deleteSalesPromo(deviceId: string, code: string): Promise<Result_7>;
    execute(qJson: string): Promise<Result__1>;
    generateActivationCode(restaurantId: RestaurantId, role: DeviceRole): Promise<Result_15>;
    getApiDoc(): Promise<string>;
    getCallerUserRole(): Promise<UserRole>;
    /**
     * / Returns the canister's own id as text, so the VPS knows which canister
     * / it is talking to. `Principal.fromActor(Main)` resolves the actor's own
     * / canister principal at runtime (mo:core/IC.getCanisterId does not exist in
     * / core 2.6.1).
     */
    getCanisterIdText(): Promise<string>;
    getCurrentPromotion(): Promise<Promotion | null>;
    getCurrentRegistrationPromo(): Promise<RegistrationPromo | null>;
    getCurrentSalesPromo(): Promise<SalesPromo | null>;
    getItemImage(itemId: string): Promise<Uint8Array | null>;
    getKmDailyCount(programCode: string): Promise<bigint>;
    getKmUsageCount(email: string, programCode: string): Promise<bigint>;
    getMenu(): Promise<Array<MenuItem>>;
    getMenuForRestaurant(restaurantId: string): Promise<Array<MenuItem>>;
    getOrder(orderId: string, deviceId: string): Promise<Result>;
    getOrderStatus(orderId: string): Promise<Result_14>;
    getOrdersByEmail(email: string, deviceId: string): Promise<Array<Order>>;
    /**
     * / Query: return the current paymentMode as its canonical Text ("driver" or
     * / "customer"). Public — no caller gating; the value is not sensitive.
     */
    getPaymentMode(): Promise<string>;
    getRestaurants(): Promise<Array<Restaurant>>;
    /**
     * / Query: return the current storeHours config. Public — no caller gating;
     * / the value is not sensitive and the frontend needs it to render the
     * / open/close state on both the driver and customer flows.
     */
    getStoreHours(): Promise<StoreHours>;
    getUpgradeState(): Promise<UpgradeState>;
    isCallerAdmin(): Promise<boolean>;
    isEmailVerified(email: Email): Promise<boolean>;
    isPromotionUsed(deviceId: string, code: string): Promise<Result_13>;
    isRegistrationPromoUsed(deviceId: string, code: string): Promise<Result_13>;
    isSalesPromoUsed(deviceId: string, code: string): Promise<Result_13>;
    /**
     * / Query: return whether the store is currently open based on the current
     * / time. Public — the frontend calls this on both the driver and customer
     * / flows to decide whether to block order placement and show a waiting
     * / screen instead of allowing item selection.
     */
    isStoreOpen(): Promise<boolean>;
    issueInvoiceByDevice(deviceId: string, orderId: string, invoiceId: string, pdfUrl: string): Promise<Result>;
    issueSalesBonus(email: string, periodType: string, periodKey: string, totalSales: bigint, hmac: Hmac): Promise<Result_12>;
    listDevicesByRestaurant(restaurantId: RestaurantId): Promise<Array<Device>>;
    listDevicesByRole(role: DeviceRole): Promise<Array<Device>>;
    listMenus(): Promise<Array<MenuItem>>;
    listMyVouchers(email: string): Promise<Array<Voucher>>;
    listOrders(deviceId: string): Promise<Array<Order>>;
    /**
     * / Query: return today's paid orders for the driver pickup queue — orders with
     * / paymentStatus=#paid AND bookingStatus=#confirmed (not yet picked up),
     * / created today (UTC+7 day boundary, same day-retention logic as
     * / listPendingPaymentOrders). Admin sees the full records WITH PII;
     * / non-admin/anonymous callers (the driver pickup-queue flow) get the records
     * / with PII fields blanked, mirroring listPendingPaymentOrders gating.
     */
    listPaidOrdersForPickup(): Promise<Array<Order>>;
    listPendingPaymentOrders(restaurantId: string): Promise<Array<Order>>;
    listPromotions(deviceId: string): Promise<Result_11>;
    listRegistrationPromos(deviceId: string): Promise<Result_10>;
    listRestaurants(): Promise<Array<Restaurant>>;
    listSalesPromos(deviceId: string): Promise<Result_9>;
    markPaymentExpired(orderId: string, hmac: string): Promise<Result>;
    /**
     * / Admin/driver update: mark an order as #pickedUp (Tài xế đã nhận hàng).
     * / Only succeeds when the order is currently #confirmed AND #paid; this ends
     * / the order lifecycle in customer mode. Returns the updated order on
     * / success, or #err if the caller is not an admin/driver, the order does not
     * / exist, or the order is not in the required state.
     */
    markPickedUp(orderId: string): Promise<Result>;
    pruneOldOrdersNow(hmac: string): Promise<Result_6>;
    restoreUpgradeState(blob: Uint8Array): Promise<boolean>;
    revokeDevice(deviceId: DeviceId): Promise<Result_8>;
    schema(): Promise<string>;
    seedMenuItems(): Promise<boolean>;
    sendKmNotifyEmails(emails: Array<string>, subject: string, htmlBody: string, hmac: Hmac): Promise<Result_7>;
    sendVerificationCode(email: Email): Promise<SendCodeResult>;
    setItemVisible(itemId: string, visible: boolean): Promise<Result_5>;
    /**
     * / Admin-only update: set paymentMode to "driver" or "customer". Rejects any
     * / other value with #err. Returns #ok on success, #err if the caller is not
     * / an admin or the value is invalid. Mirrors setVpsSecret in
     * / mixins/secret-api.mo.
     */
    setPaymentMode(mode: string): Promise<Result_7>;
    setRestaurantPriceOverride(restaurantId: string, itemId: string, price: bigint): Promise<Result_7>;
    /**
     * / Admin-only update: set the global store open/close hours. Rejects any
     * / caller that is not an admin with #err. Returns #ok on success, #err if the
     * / caller is not an admin. Mirrors setPaymentMode in
     * / mixins/payment-mode-config-api.mo.
     */
    setStoreHours(hours: StoreHours): Promise<Result_7>;
    /**
     * / Admin-only. Rotates the VPS secret: current `vpsSecret` is moved into
     * / `vpsSecretPrevious` before `newSecret` is written to `vpsSecret`.
     * / Returns `#ok` on success, `#err` if the caller is not an admin.
     */
    setVpsSecret(newSecret: string): Promise<{
        __kind__: "ok";
        ok: null;
    } | {
        __kind__: "err";
        err: string;
    }>;
    snapshotUpgradeState(): Promise<Uint8Array>;
    stopPromotion(deviceId: string, code: string): Promise<Result_4>;
    stopRegistrationPromo(deviceId: string, code: string): Promise<Result_3>;
    stopSalesPromo(deviceId: string, code: string): Promise<Result_1>;
    tryConsumeKmSlot(email: string, programCode: string, dailyLimit: bigint, hmac: Hmac): Promise<Result_6>;
    updateInvoiceStatus(orderId: OrderId, invoiceStatus: InvoiceStatus, invoiceId: string, pdfUrl: string, hmac: Hmac): Promise<Result>;
    updateItem(itemId: string, name: string, price: bigint, unitName: string, vatRate: bigint, category: string, image: Uint8Array, visible: boolean): Promise<Result_5>;
    updateOrderQr(orderId: string, qrCode: string | null, billId: string | null, expireAt: bigint | null, hmac: string): Promise<Result>;
    updatePaymentStatus(orderId: OrderId, paymentStatus: PaymentStatus, hmac: Hmac): Promise<Result>;
    updatePromotion(deviceId: string, code: string, name: string, startDate: string, endDate: string, daysOfWeek: Array<boolean>, timeSlots: Array<TimeSlot>, dailyOrderLimit: bigint, perCustomerDailyLimit: bigint, tiers: Array<DiscountTier>, active: boolean, enabledOnline: boolean, enabledCounter: boolean, termsUrl: string): Promise<Result_4>;
    updateRegistrationPromo(deviceId: string, code: string, name: string, startDate: string, endDate: string, voucherValue: bigint, voucherValidDays: bigint, active: boolean, termsUrl: string): Promise<Result_3>;
    updateRestaurant(restaurantId: string, name: string, address: string, phone: string, visible: boolean, lat: number, lng: number): Promise<Result_2>;
    updateSalesPromo(deviceId: string, code: string, name: string, startDate: string, endDate: string, weeklyTiers: Array<SalesTier>, monthlyTiers: Array<SalesTier>, voucherValidDays: bigint, active: boolean, enabledCounter: boolean, termsUrl: string): Promise<Result_1>;
    updateStatus(orderId: OrderId, bookingStatus: BookingStatus, hmac: Hmac): Promise<Result>;
    verifyEmailCode(email: Email, code: string): Promise<VerifyResult>;
}
