import { Component, xml } from "@odoo/owl";

import { Softphone } from "@voip/softphone/softphone";
import { useService } from "@web/core/utils/hooks";

export class SoftphoneContainer extends Component {
    static components = { Softphone };
    static props = {};
    static template = xml`
        <div class="o-voip-SoftphoneContainer">
            <Softphone t-if="voip.softphone.isDisplayed"/>
        </div>
    `;

    setup() {
        this.voip = useService("voip");
    }
}
