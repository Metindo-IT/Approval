import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    /**
     * @override
     */
    async setup() {
        await super.setup(...arguments);
        this.delivery_order_count = { urbanpiper: {} };
        this.delivery_providers = [];
        this.total_new_order = 0;
        this.delivery_providers_active = false;
        this.delivery_order_count = {};
        if (this.config.module_pos_urban_piper && this.config.urbanpiper_store_identifier) {
            await this._fetchUrbanpiperOrderCount(false);
        }
    },

    async updateStoreStatus(status = false) {
        if (this.config.module_pos_urban_piper && this.config.urbanpiper_store_identifier) {
            await this.data.call("pos.config", "update_store_status", [this.config.id, status]);
        }
    },

    async closePos() {
        await this.updateStoreStatus();
        return super.closePos();
    },

    async getServerOrders() {
        if (this.config.module_pos_urban_piper && this.config.urbanpiper_store_identifier) {
            return await this.loadServerOrders([
                ["company_id", "=", this.config.company_id.id],
                [
                    "delivery_provider_id",
                    "in",
                    this.config.urbanpiper_delivery_provider_ids.map((provider) => provider.id),
                ],
            ]);
        } else {
            return await super.getServerOrders(...arguments);
        }
    },

    get notificationOptions() {
        return {
            type: "success",
            sticky: false,
            buttons: [
                {
                    name: _t("Review Orders"),
                    onClick: () => {
                        const stateOverride = {
                            search: {
                                fieldName: "DELIVERYPROVIDER",
                                searchTerm:
                                    this.deliveryOrderNotification?.delivery_provider_id.name,
                            },
                            filter: "ACTIVE_ORDERS",
                        };
                        this.setOrder(this.deliveryOrderNotification);
                        if (this.mainScreen.component?.name == "TicketScreen") {
                            this.closeScreen();
                            setTimeout(() => {
                                this.showScreen("TicketScreen", { stateOverride });
                                this.env.services.ui.unblock();
                            }, 300);
                            return;
                        }
                        return this.showScreen("TicketScreen", { stateOverride });
                    },
                },
            ],
        };
    },

    async _fetchUrbanpiperOrderCount(order_id) {
        try {
            await this.getServerOrders();
        } catch {
            this.notification.add(_t("Order does not load from server"), {
                type: "warning",
                sticky: false,
            });
        }
        const response = await this.data.call(
            "pos.config",
            "get_delivery_data",
            [this.config.id],
            {}
        );
        this.delivery_order_count = response.delivery_order_count;
        this.delivery_providers = response.delivery_providers;
        this.total_new_order = response.total_new_order;
        this.delivery_providers_active = response.delivery_providers_active;
        const deliveryOrder = order_id ? this.models["pos.order"].get(order_id) : false;
        if (!deliveryOrder) {
            return;
        }
        if (deliveryOrder.delivery_status === "acknowledged") {
            if (!deliveryOrder.isFutureOrder()) {
                this.sendOrderInPreparationUpdateLastChange(deliveryOrder);
            }
        } else if (deliveryOrder.delivery_status === "placed") {
            this.sound.play("notification");
            this.deliveryOrderNotification = deliveryOrder;
            this.notification.add(_t("New online order received."), this.notificationOptions);
        } else if (deliveryOrder.delivery_status === "food_ready") {
            deliveryOrder.uiState.locked = true;
        }
    },

    /**
     * @override
     */
    addOrderIfEmpty(forceEmpty) {
        if (
            !this.getOrder() ||
            (this.getOrder().delivery_identifier && this.getOrder().state == "paid")
        ) {
            return this.addNewOrder();
        }
        return super.addOrderIfEmpty(...arguments);
    },

    async goToBack() {
        this.addPendingOrder([this.getOrder().id]);
        await this.syncAllOrders();
        this.showScreen("TicketScreen");
        if (this.getOrder().delivery_status !== "placed") {
            try {
                await this.sendOrderInPreparation(this.getOrder());
            } catch {
                this.notification.add(_t("Error to send in preparation display."), {
                    type: "warning",
                    sticky: false,
                });
            }
        }
    },
});
