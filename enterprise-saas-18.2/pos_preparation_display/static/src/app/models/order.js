import { Reactive } from "@web/core/utils/reactive";
import { deserializeDateTime } from "@web/core/l10n/dates";

export class Order extends Reactive {
    constructor(
        {
            id,
            stage_id,
            pdis_general_customer_note,
            displayed,
            responsible,
            orderlines,
            create_date,
            last_stage_change,
            pos_order_id,
            customer_count,
            tracking_number,
        },
        blinkingNote
    ) {
        super();
        this.setup(...arguments, blinkingNote);
    }

    setup(order, blinkingNote) {
        this.id = order.id;
        this.stageId = order.stage_id;
        this.pdis_general_customer_note = order.pdis_general_customer_note;
        this.pdis_internal_note = order.pdis_internal_note;
        this.displayed = order.displayed;
        this.responsible = order.responsible;
        this.orderlines = order.orderlines;
        this.createDate = order.create_date;
        this.lastStageChange = order.last_stage_change;
        this.posOrderId = order.pos_order_id;
        this.customer_count = order.customer_count;
        this.changeStageTimeout = null;
        this.tracking_number = order.tracking_number;
        this.pos_reference = order.pos_reference;
        this.preset_name = order.preset_name;
        this.preset_time = order.preset_time;
        this.blinkingNote = blinkingNote || false;

        if (this.blinkingNote) {
            setTimeout(() => {
                this.blinkingNote = false;
            }, 20000);
        }
    }

    clearChangeTimeout() {
        clearTimeout(this.changeStageTimeout);
        this.changeStageTimeout = null;
    }

    computeDuration() {
        return this.computeDurationSinceDate(deserializeDateTime(this.lastStageChange));
    }

    computeDurationSinceDate(startDateTime) {
        const timeDiff = ((luxon.DateTime.now().ts - startDateTime.ts) / 1000).toFixed(0);
        return Math.round(timeDiff / 60);
    }
}
