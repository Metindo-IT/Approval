import { patch } from "@web/core/utils/patch";
import { BankRecKanbanController } from "@account_accountant/components/bank_reconciliation/kanban";

patch(BankRecKanbanController.prototype, {
    updateJournalStateFromGlobalInfo(newState, values) {
        super.updateJournalStateFromGlobalInfo(newState, values);
        newState.journalAvailableBalanceAmount = values.available_balance_amount || "";
    },
});
