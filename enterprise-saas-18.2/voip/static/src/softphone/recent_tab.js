import { useVisible } from "@mail/utils/common/hooks";
import { Component, onMounted } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class RecentTab extends Component {
    static props = { extraClass: { type: String, optional: true }, recentCalls: { type: Array } };
    static defaultProps = { extraClass: "" };
    static template = "voip.RecentTab";

    setup() {
        this.voip = useService("voip");
        this.orm = useService("orm");
        this.callService = useService("voip.call");
        onMounted(() => this.voip.fetchRecentCalls());
        useVisible("last-shown-call", (isVisible) => {
            if (isVisible) {
                this.voip.fetchRecentCalls(this.props.recentCalls.length);
            }
        });
    }

    /**
     * @param {MouseEvent} ev
     * @param {import("@voip/core/call_model").Call} call
     */
    onClickPhoneCall(ev, call) {
        this.voip.softphone.selectCorrespondence({ call });
    }
}
