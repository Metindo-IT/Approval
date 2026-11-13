import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { ScaleCertificationDialog } from "@pos_iot/app/scale_certification_status/scale_certification_dialog";

export class ScaleCertificationStatus extends Component {
    static props = {};
    static template = "pos_iot.ScaleCertificationStatus";

    setup() {
        this.pos = useService("pos");
        this.orm = useService("orm");
        this.dialog = useService("dialog");
    }

    get certificationErrors() {
        const errors = [];
        console.log(this.decimalAccuracy);
        if (this.decimalAccuracy.digits < 3) {
            errors.push(_t("Decimal accuracy is less than 3 decimal places"));
        }
        return errors;
    }

    get isCertified() {
        return this.certificationErrors.length === 0;
    }

    openDialog() {
        this.dialog.add(ScaleCertificationDialog, {
            errors: this.certificationErrors,
            autoFix: this.fixCertificationErrors.bind(this),
        });
    }

    async fixCertificationErrors() {
        await this.orm.call("pos.config", "fix_rounding_for_scale_certification");
        this.decimalAccuracy.digits = 3;

        window.location.reload();
    }

    get decimalAccuracy() {
        return this.pos.models["decimal.precision"].find((dp) => dp.name === "Product Unit");
    }
}
