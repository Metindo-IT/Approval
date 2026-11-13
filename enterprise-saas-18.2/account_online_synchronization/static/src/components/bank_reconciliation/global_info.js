import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { BankRecGlobalInfo } from "@account_accountant/components/bank_reconciliation/global_info";

patch(BankRecGlobalInfo, {
    props: {
        ...BankRecGlobalInfo.props,
        journalAvailableBalanceAmount: { type: String, optional: true },
    },
});

patch(BankRecGlobalInfo.prototype, {
    setup() {
        super.setup();
        this.orm = useService("orm");
        this.action = useService("action");
    },

    async actionOpenPendingBankStatementLines() {
        this.action.doActionButton({
            type: "object",
            resId: this.props.journalId,
            name: "action_open_pending_bank_statement_lines",
            resModel: "account.journal",
        });
    },
});
