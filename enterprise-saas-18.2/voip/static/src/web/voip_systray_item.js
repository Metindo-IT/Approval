import { Component, useState } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";

export class VoipSystrayItem extends Component {
    static props = {};
    static template = "voip.SystrayItem";

    setup() {
        this.voip = useState(useService("voip"));
        this.ringtoneService = useService("voip.ringtone");
        this.userAgent = useState(useService("voip.user_agent"));
        this.multiTabService = useService("multi_tab");
        this.softphone = this.voip.softphone;
    }

    /**
     * Number of missed calls used to display in systray item icon.
     *
     * @returns {number}
     */
    get missedCallCount() {
        return this.voip.missedCalls;
    }

    /** @returns {boolean} */
    get shouldDisplayInCallIndicator() {
        const call = this.softphone.selectedCorrespondence?.call;
        if (!call) {
            return false;
        }
        return call.isInProgress && call.state === "ongoing";
    }

    /**
     * Translated text used as the title attribute of the systray item.
     *
     * @returns {string}
     */
    get titleText() {
        if (this.softphone.isDisplayed) {
            if (this.softphone.isFolded) {
                return _t("Unfold Softphone");
            }
            return _t("Close Softphone");
        }
        return _t("Open Softphone");
    }

    /** @param {MouseEvent} ev */
    onClick(ev) {
        if (this.softphone.isDisplayed) {
            if (this.softphone.isFolded) {
                this.softphone.unfold();
                this.voip.resetMissedCalls();
            } else {
                this.softphone.hide();
                if (this.userAgent.hasCallInvitation) {
                    this.ringtoneService.stopPlaying();
                }
            }
        } else {
            this.softphone.show();
            this.voip.resetMissedCalls();
            if (this.userAgent.hasCallInvitation && this.multiTabService.isOnMainTab()) {
                this.ringtoneService.incoming.play();
            }
        }
    }
}
