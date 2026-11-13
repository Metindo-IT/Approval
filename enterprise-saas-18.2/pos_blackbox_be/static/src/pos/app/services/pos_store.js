import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { NumberPopup } from "@point_of_sale/app/components/popups/number_popup/number_popup";
import { BlackboxError } from "@pos_blackbox_be/pos/app/utils/blackbox_error";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        this.multiple_discount = false;
    },
    async initServerData() {
        await super.initServerData();
        if (this.useBlackBoxBe()) {
            await this.readUserSessionStatus();
            this.data.connectWebSocket("CLOCKING", (payload) => {
                if (payload.session_id == this.session.id) {
                    this.session._employees_clocked_ids = payload.employees_clocked_ids;
                    this.session._users_clocked_ids = payload.users_clocked_ids;
                }
            });
        }
    },
    //#region User Status
    async readUserSessionStatus() {
        if (this.useBlackBoxBe()) {
            const res = await this.data.orm.read(
                "pos.session",
                [this.session.id],
                ["employees_clocked_ids", "users_clocked_ids"],
                { load: false }
            );
            this.session._employees_clocked_ids = res[0].employees_clocked_ids;
            this.session._users_clocked_ids = res[0].users_clocked_ids;
        }
    },
    async setUserSessionStatus(status, all = false) {
        const cashier = this.getCashier();
        if (!cashier) {
            return;
        }
        await this.data.call("pos.session", "set_user_session_work_status", [this.session.id], {
            user_id: cashier.id,
            status: status,
            all_insz: all,
        });
    },
    get userSessionStatus() {
        const cashier_id = this.getCashier().id;
        return this.config.module_pos_hr
            ? this.session._employees_clocked_ids.includes(cashier_id)
            : this.session._users_clocked_ids.includes(cashier_id);
    },
    //#region User Clocking
    async clock(clock_in = true, inszs = []) {
        const automaticClock = Boolean(Object.keys(inszs).length > 0);
        if (Object.keys(inszs).length === 0) {
            inszs[this.getCashier().id] = this.config.module_pos_hr
                ? this.session._employee_insz_or_bis_number[this.getCashier().id]
                : this.user.insz_or_bis_number;
        }
        if (!this.clock_disabled) {
            try {
                this.clock_disabled = true;
                for (const insz of Object.entries(inszs)) {
                    const order = await this.createOrderForClocking(insz, clock_in);
                    await this.printReceipt({ order });
                    this.removeClockOrder(order);
                }
                await this.setUserSessionStatus(clock_in, automaticClock);
            } finally {
                this.clock_disabled = false;
            }
        }
        this.removeEmptyOrders();
    },
    async createOrderForClocking(insz, status) {
        const order = this.addNewOrder();
        this.addLineToOrder(
            {
                product_tmpl_id: status
                    ? this.config.work_in_product.product_tmpl_id
                    : this.config.work_out_product.product_tmpl_id,
            },
            order,
            {},
            false
        );
        try {
            order.uiState.clock = status ? "in" : "out";
            order.uiState.insz = insz;
            if (this.config.module_pos_hr) {
                order.employee_id = insz[0];
            } else {
                order.user_id = insz[0];
            }
            order.state = "paid";
            const result = await this.syncAllOrders({ throw: true, orders: [order] });
            return result[0];
        } catch (error) {
            const order = this.getOrder();
            this.removeClockOrder(order);
            throw error;
        }
    },
    removeClockOrder(order) {
        this.removeOrder(order, false);
        this.selectedOrderUuid = null;
        this.showScreen(this.defaultScreen);
    },
    removeEmptyOrders() {
        const orders = this.models["pos.order"].filter((o) => !o.finalized);
        for (const order of orders) {
            if (order.isEmpty()) {
                this.removeOrder(order, false);
            }
        }
    },
    //#region Override
    get printOptions() {
        const res = super.printOptions;
        if (this.useBlackBoxBe()) {
            return Object.assign(res, { blackboxPrint: true });
        }
        return res;
    },
    async addLineToCurrentOrder(vals, opt = {}, configure = true) {
        const product = vals.product_tmpl_id;
        const order = this.getOrder();
        if (!vals.qty) {
            vals.qty = order.preset_id?.is_return ? -1 : 1;
        }
        if (this.useBlackBoxBe()) {
            if (product.taxes_id.length === 0 && !product.isCombo()) {
                this.dialog.add(AlertDialog, {
                    title: _t("POS error"),
                    body: _t("Product has no tax associated with it."),
                });
                return;
            } else if (
                !this.userSessionStatus &&
                product !== this.config.work_in_product.product_tmpl_id &&
                !opt.force
            ) {
                this.dialog.add(AlertDialog, {
                    title: _t("POS error"),
                    body: _t("User must be clocked in."),
                });
                return;
            } else if (!product.taxes_id.every((tax) => tax?.tax_group_id.pos_receipt_label)) {
                this.dialog.add(AlertDialog, {
                    title: _t("POS error"),
                    body: _t(
                        "Product has no tax receipt label. Please add one on the tax group of the tax (A, B, C or D)."
                    ),
                });
                return;
            } else if (
                [
                    this.config.work_in_product.product_tmpl_id.id,
                    this.config.work_out_product.product_tmpl_id.id,
                ].includes(product.id) &&
                !opt.force
            ) {
                this.dialog.add(AlertDialog, {
                    title: _t("POS error"),
                    body: _t("This product is not allowed to be sold"),
                });
                return;
            }
        }

        return await super.addLineToCurrentOrder(vals, opt, configure);
    },
    async processServerData(loadedData) {
        await super.processServerData(loadedData);

        this.config.work_in_product = this.models["product.product"].get(
            this.session._product_product_work_in
        );
        this.config.work_out_product = this.models["product.product"].get(
            this.session._product_product_work_out
        );
    },
    disallowLineQuantityChange() {
        const result = super.disallowLineQuantityChange();
        return this.useBlackBoxBe() || result;
    },
    restrictLineDiscountChange() {
        const result = super.restrictLineDiscountChange();
        return this.useBlackBoxBe() || result;
    },
    restrictLinePriceChange() {
        const result = super.restrictLinePriceChange();
        return this.useBlackBoxBe() || result;
    },
    doNotAllowRefundAndSales() {
        const result = super.doNotAllowRefundAndSales();
        return this.useBlackBoxBe() || result;
    },
    async preSyncAllOrders(orders) {
        if (this.useBlackBoxBe() && orders.length > 0) {
            for (const order of orders) {
                const serialized = order.serialize({ orm: true });
                if (serialized.lines.length === 0 && serialized.state === "draft") {
                    continue;
                }
                order.uiState.receipt_type = false;
                const result = await this.pushOrderToBlackbox(order);
                if (!result) {
                    order.state = "draft";
                    throw new Error(_t("Error pushing order to blackbox"));
                }
                order.setDataForPushOrderFromBlackbox(result);
                await this.createLog(order);
            }
        }
        return super.preSyncAllOrders(orders);
    },
    getReceiptHeaderData(order) {
        const result = super.getReceiptHeaderData(...arguments);
        result.useBlackBoxBe = this.useBlackBoxBe();
        result.posIdentifier = this.config.name;
        if (order && this.useBlackBoxBe()) {
            result.receipt_type = order.uiState.receipt_type;
            result.blackbox_date = order.blackbox_date;
            result.blackbox_order_sequence = order.blackbox_order_sequence;
        }
        return result;
    },
    async increaseCashboxOpeningCounter() {
        await this.data.call("pos.session", "increase_cash_box_opening_counter", [this.session.id]);
    },
    async increaseCorrectionCounter(amount) {
        await this.data.call("pos.session", "increase_correction_counter", [
            this.session.id,
            amount,
        ]);
    },
    async transferOrder(orderUuid, destinationTable = null, destinationOrder = null) {
        const order = this.models["pos.order"].find((o) => o.uuid === orderUuid);
        if (this.useBlackBoxBe() && order && typeof order.id === "number") {
            await this.pushCorrection(order);
        }
        await super.transferOrder(orderUuid, destinationTable, destinationOrder);
        if (this.useBlackBoxBe()) {
            await this.pushProFormaOrderLog(this.getOrder());
        }
    },
    async setDiscountFromUI(line, discount) {
        if (
            this.useBlackBoxBe() &&
            this.getOrder() &&
            typeof line.discount === "number" &&
            discount !== line.getDiscountStr() &&
            !this.multiple_discount
        ) {
            const selectedNumpadMode = this.numpadMode;
            const order = this.getOrder();
            await this.pushCorrection(order, [line]);
            const res = await super.setDiscountFromUI(...arguments);
            this.addPendingOrder([order.id]);
            await this.syncAllOrders({ throw: true });
            this.numpadMode = selectedNumpadMode;
            return res;
        } else {
            return await super.setDiscountFromUI(...arguments);
        }
    },
    async _onBeforeDeleteOrder(order) {
        if (this.useBlackBoxBe() && !order.isEmpty()) {
            /*
                Deleting an order in a certified POS involves registering the order as a PS.
                Then, registering it as a PR
                ultimately selling it as an NS at a price of 0.
            */
            try {
                this.ui.block();
                await this.pushCorrection(order);
                const serializedOrder = order.serialize();
                serializedOrder.blackbox_tax_category_a = 0;
                serializedOrder.blackbox_tax_category_b = 0;
                serializedOrder.blackbox_tax_category_c = 0;
                serializedOrder.blackbox_tax_category_d = 0;
                serializedOrder.receipt_type = "NS";
                serializedOrder.amount_tax = 0;
                serializedOrder.amount_total = 0;
                serializedOrder.lines = [];
                //add bb fields too);
                serializedOrder.blackbox_order_sequence = await this.getBlackboxSequence(order);
                serializedOrder.pos_version = this.session._server_version.server_version;
                const dataToSend = this.createOrderDataForBlackbox({
                    ...serializedOrder,
                    receipt_total: 0,
                    plu: order.getPlu([]),
                });
                const blackbox_response = await this.pushToBlackbox(dataToSend);
                order.uiState.receipt_type = "NS";
                order.blackbox_tax_category_a = 0;
                order.blackbox_tax_category_b = 0;
                order.blackbox_tax_category_c = 0;
                order.blackbox_tax_category_d = 0;
                order.setDataForPushOrderFromBlackbox(blackbox_response);
                await this.createLog(order, {}, false, false, false, true);
                await this.increaseCorrectionCounter(order.getTotalWithTax());
            } finally {
                this.ui.unblock();
            }
        }
        return super._onBeforeDeleteOrder(...arguments);
    },
    //#region Blackbox
    useBlackBoxBe() {
        return Boolean(this.config.iface_fiscal_data_module);
    },
    //#region Push Pro Forma
    async pushProFormaOrderLog(order) {
        order.updateReceiptType();
        const result = await this.pushOrderToBlackbox(order);
        if (result) {
            order.setDataForPushOrderFromBlackbox(result);
            await this.createLog(order);
        }
        return result;
    },
    async pushProFormaRefundOrder(order, lines = false) {
        const serializedOrder = order.serialize();
        const bbFields = await this.getBlackboxFields(order, "PR");
        Object.assign(serializedOrder, bbFields);
        if (lines) {
            serializedOrder.receipt_total = order.getTotalWithTaxOfLines(lines);
            serializedOrder.plu = order.getPlu(lines);
            serializedOrder.blackbox_tax_category_a = order.getTaxAmountByPercent(21, lines);
            serializedOrder.blackbox_tax_category_b = order.getTaxAmountByPercent(12, lines);
            serializedOrder.blackbox_tax_category_c = order.getTaxAmountByPercent(6, lines);
            serializedOrder.blackbox_tax_category_d = order.getTaxAmountByPercent(0, lines);
        } else {
            serializedOrder.plu = order.getPlu();
            serializedOrder.receipt_total = order.getTotalWithTax();
        }

        if (serializedOrder.receipt_total > 0) {
            serializedOrder.receipt_type = "PR";
        } else if (serializedOrder.receipt_total < 0) {
            serializedOrder.receipt_type = "PS";
        } else if (lines && lines.length > 0 && lines[0].getQuantity() < 0) {
            serializedOrder.receipt_type = "PS";
        } else if (lines && lines.length > 0 && lines[0].getQuantity() >= 0) {
            serializedOrder.receipt_type = "PR";
        } else if (order.lines && order.lines.length > 0 && order.lines[0].getQuantity() < 0) {
            serializedOrder.receipt_type = "PS";
        } else {
            serializedOrder.receipt_type = "PR";
        }

        //add bb fields too
        const dataToSend = this.createOrderDataForBlackbox(serializedOrder);
        const blackbox_response = await this.pushToBlackbox(dataToSend);
        if (!blackbox_response) {
            return;
        }
        await this.createLog(
            order,
            blackbox_response,
            serializedOrder.blackbox_order_sequence,
            serializedOrder.receipt_type,
            lines
        );
    },
    async pushCorrection(order, lines = []) {
        if (lines.length == 0) {
            lines = order.lines;
        }
        await this.pushProFormaOrderLog(order); //push the pro forma order to the blackbox and log
        await this.pushProFormaRefundOrder(order, lines); //push the pro forma refund order to the blackbox and log
    },
    getEmptyLogFields(order) {
        return {
            state: "paid",
            create_date: order.date_order,
            employee_name: this.getCashier().name,
            amount_total: 0,
            amount_paid: 0,
            currency_id: order.currency.id,
            pos_reference: order.pos_reference,
            config_name: this.config.name,
            session_id: this.session.id,
            lines: [],
            blackbox_order_sequence: order.blackbox_order_sequence,
            plu_hash: order.plu_hash,
            pos_version: this.session._server_version.server_version,
            blackbox_ticket_counters: order.blackbox_ticket_counters,
            blackbox_unique_fdm_production_number: order.blackbox_unique_fdm_production_number,
            certified_blackbox_identifier: this.config.certified_blackbox_identifier,
            blackbox_signature: order.blackbox_signature,
        };
    },
    getLogFields(
        order,
        blackboxResponse = {},
        blackboxOrderSequence = false,
        receiptType = false,
        lines = false,
        emptyNS = false
    ) {
        if (emptyNS) {
            return this.getEmptyLogFields(order);
        }
        if (!receiptType) {
            receiptType = order.uiState.receipt_type || "PS";
        }
        if (!lines) {
            lines = order.lines;
        }
        const amount_total = Math.abs(order.getTotalWithTaxOfLines(lines));
        const amount_paid = Math.abs(order.getTotalPaid());
        const response = {
            state: order.state,
            create_date: order.date_order,
            employee_name: this.getCashier().name,
            amount_total: receiptType[1] == "R" ? -amount_total : amount_total,
            amount_paid: receiptType[1] == "R" ? -amount_paid : amount_paid,
            currency_id: order.currency.id,
            pos_reference: order.pos_reference,
            config_name: this.config.name,
            session_id: this.session.id,
            lines: this.getLineLogFields(order, receiptType, lines),
            blackbox_order_sequence: blackboxOrderSequence || order.blackbox_order_sequence,
            plu_hash: order.plu_hash,
            pos_version: this.session._server_version.server_version,
            blackbox_ticket_counters: order.blackbox_ticket_counters,
            blackbox_unique_fdm_production_number: order.blackbox_unique_fdm_production_number,
            certified_blackbox_identifier: this.config.certified_blackbox_identifier,
            blackbox_signature: order.blackbox_signature,
        };
        if (Object.keys(blackboxResponse).length > 0) {
            response.blackbox_signature = blackboxResponse.signature;
            response.plu_hash = order.getPlu();
            response.blackbox_unique_fdm_production_number = blackboxResponse.fdm_number;
            response.blackbox_ticket_counters =
                receiptType +
                " " +
                blackboxResponse.ticket_counter +
                "/" +
                blackboxResponse.total_ticket_counter;
        }
        return response;
    },
    getLineLogFields(order, receipt_type, lines = false) {
        if (!lines) {
            lines = order.lines;
        }
        return lines.map((line) => ({
            product_name: line.product_id.display_name,
            qty: receipt_type[1] == "R" ? -line.getQuantity() : line.getQuantity(),
            price_subtotal_incl:
                receipt_type == "R"
                    ? -line.getAllPrices().priceWithTax
                    : line.getAllPrices().priceWithTax,
            discount: receipt_type == "R" ? -line.getDiscount() : line.getDiscount(),
        }));
    },
    async createLog(
        order,
        blackboxResponse = {},
        blackboxOrderSequence = false,
        receiptType = false,
        lines = false,
        emptyNS = false
    ) {
        await this.data.call("pos.order", "create_log", [
            [
                this.getLogFields(
                    order,
                    blackboxResponse,
                    blackboxOrderSequence,
                    receiptType,
                    lines,
                    emptyNS
                ),
            ],
        ]);
    },
    //#region Push to Blackbox
    async pushDataToBlackbox(data, action) {
        // The return value should be someting like this:
        // {
        //     value: {
        //         signature: "123456789",
        //         vsc: "123456789",
        //         fdm_number: "123456789",
        //         ticket_counter: 12,
        //         total_ticket_counter: 99,
        //         time: "123456",
        //         date: "20240101",
        //         // error: {
        //         //     errorCode: "209000",
        //         //     errorMessage: "Fiscal Data Module real time clock corrupt.",
        //         // },
        //         error: {
        //             errorCode: "000000",
        //             errorMessage: "No error.",
        //         },
        //     },
        // };
        const fdm = this.hardwareProxy.deviceControllers.fiscal_data_module;
        return new Promise((resolve, reject) => {
            fdm.addListener((data) => {
                fdm.removeListener(data);
                return data.status.status === "connected" ? resolve(data) : reject(data);
            });
            fdm.action({
                action: action,
                high_level_message: data,
            });
        });
    },
    async pushOrderToBlackbox(order) {
        await this.updateBlackboxFields(order);
        const insz = order.uiState.insz?.[1];
        const dataToSend = this.createOrderDataForBlackbox({
            ...order.serialize(),
            clock: order.uiState.clock,
            insz: insz,
            receipt_type: order.uiState.receipt_type,
            receipt_total: order.getTotalWithTax(),
            plu: order.getPlu(),
        });
        return this.pushToBlackbox(dataToSend);
    },
    async pushToBlackbox(dataToSend) {
        try {
            const data = await this.pushDataToBlackbox(dataToSend, "registerReceipt");
            const dataValue = this.extractValue(data);
            if (dataValue.error && dataValue.error.errorCode != "000000") {
                throw dataValue.error;
            }
            return dataValue;
        } catch (err) {
            //the catch might actually not be an error
            const dataValue = this.extractValue(err);
            if (dataValue?.error && dataValue.error.errorCode == "000000") {
                return dataValue;
            }
            if (err.errorCode.startsWith("202")) {
                this.dialog.add(NumberPopup, {
                    title: _t("Enter Pin Code"),
                    getPayload: (num) => {
                        this.pushDataToBlackbox(num, "registerPIN");
                    },
                });
                throw new Error(_t("Pin code required"));
            } else {
                throw new BlackboxError(err.errorCode, err.errorMessage);
            }
        }
    },
    extractValue(data) {
        if (Array.isArray(data.value)) {
            return data.value[0];
        } else {
            return data.value;
        }
    },
    async getBlackboxFields(order, receiptType = false) {
        return {
            blackbox_tax_category_a: order.getTaxAmountByPercent(21),
            blackbox_tax_category_b: order.getTaxAmountByPercent(12),
            blackbox_tax_category_c: order.getTaxAmountByPercent(6),
            blackbox_tax_category_d: order.getTaxAmountByPercent(0),
            blackbox_order_sequence: await this.getBlackboxSequence(order, receiptType),
            pos_version: this.session._server_version.server_version,
        };
    },
    async updateBlackboxFields(order) {
        const bbFields = await this.getBlackboxFields(order);
        Object.assign(order, bbFields);
        if (!order.uiState.receipt_type) {
            order.updateReceiptType();
        }
    },
    createOrderDataForBlackbox(order) {
        return {
            date: luxon.DateTime.now().toFormat("yyyyMMdd"),
            ticket_time: luxon.DateTime.now().toFormat("HHmmss"),
            insz_or_bis_number:
                order.insz ||
                (this.config.module_pos_hr
                    ? this.session._employee_insz_or_bis_number[this.getCashier().id]
                    : this.user.insz_or_bis_number),
            ticket_number: order.blackbox_order_sequence.toString(),
            type: order.receipt_type,
            receipt_total: Math.abs(order.receipt_total).toFixed(2).toString().replace(".", ""),
            vat1: order.blackbox_tax_category_a
                ? Math.abs(order.blackbox_tax_category_a).toFixed(2).replace(".", "")
                : "",
            vat2: order.blackbox_tax_category_b
                ? Math.abs(order.blackbox_tax_category_b).toFixed(2).replace(".", "")
                : "",
            vat3: order.blackbox_tax_category_c
                ? Math.abs(order.blackbox_tax_category_c).toFixed(2).replace(".", "")
                : "",
            vat4: order.blackbox_tax_category_d
                ? Math.abs(order.blackbox_tax_category_d).toFixed(2).replace(".", "")
                : "",
            plu: order.plu,
            clock: order.clock ? order.clock : false,
        };
    },
    async getBlackboxSequence(order, receiptType = false) {
        const functionToCall = (receiptType || order.uiState.receipt_type || "p")
            .toLowerCase()
            .startsWith("p")
            ? "get_PS_sequence_next"
            : "get_NS_sequence_next";
        return parseInt(await this.data.call("pos.config", functionToCall, [[this.config.id]]));
    },
});
