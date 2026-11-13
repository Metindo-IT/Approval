import { registry } from "@web/core/registry";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { BlackboxError } from "@pos_blackbox_be/pos/app/utils/blackbox_error";

function blackboxErrorHandler(env, error, originalError) {
    if (originalError instanceof BlackboxError) {
        const defaultError = _t("Internal blackbox error, the blackbox may have disconnected.");
        env.services.dialog.add(AlertDialog, {
            title: _t("Blackbox error: ") + originalError.code,
            body: originalError.message || defaultError,
        });
        return true;
    }
}
registry.category("error_handlers").add("blackboxErrorHandler", blackboxErrorHandler);
