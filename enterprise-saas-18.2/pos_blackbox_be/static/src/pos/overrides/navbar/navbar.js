import { Navbar } from "@point_of_sale/app/components/navbar/navbar";
import { patch } from "@web/core/utils/patch";

patch(Navbar.prototype, {
    async clock() {
        if (this.pos.useBlackBoxBe()) {
            if (!this.pos.userSessionStatus) {
                await this.pos.clock(true);
            } else {
                await this.pos.clock(false);
            }
        }
    },
    get workButtonName() {
        return this.pos.userSessionStatus ? "Clock out" : "Clock in";
    },
});
