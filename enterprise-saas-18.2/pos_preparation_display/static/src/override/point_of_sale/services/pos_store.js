import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        this["pos_preparation_display.display"] = [];
    },
    async sendOrderInPreparation(o, opts = {}) {
        const result = await super.sendOrderInPreparation(o, opts);
        if (this.models["pos_preparation_display.display"].length > 0) {
            for (const note of Object.values(o.uiState.noteHistory)) {
                for (const n of note) {
                    const line = o.getOrderline(n.lineId);
                    n.qty = line?.getQuantity();
                }
            }
            try {
                const process_order_options = {
                    general_customer_note: o.general_customer_note || "",
                    note_history: o.uiState.noteHistory,
                    cancelled: opts.cancelled,
                    fired_course_id: opts.firedCourseId,
                };

                if (opts.cancelled) {
                    await this.data.call("pos_preparation_display.order", "process_order", [
                        o.id,
                        process_order_options,
                    ]);
                } else {
                    this.syncAllOrders({
                        orders: [o],
                        context: {
                            preparation: {
                                process_order_options,
                            },
                        },
                    });
                    o.updateSavedQuantity();
                }
            } catch (error) {
                console.warn(error);

                // Show error popup only if warningTriggered is false
                if (!this.data.network.warningTriggered) {
                    this.dialog.add(AlertDialog, {
                        title: _t("Send failed"),
                        body: _t("Failed in sending the changes to preparation display"),
                    });
                }
            }
            o.uiState.noteHistory = {};
        }

        return result;
    },
});
