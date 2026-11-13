import { Navbar } from "@point_of_sale/app/components/navbar/navbar";
import { patch } from "@web/core/utils/patch";

patch(Navbar.prototype, {
    get mainButton() {
        return this.pos.mainScreen.component.name === "ActionScreen" &&
            this.pos.mainScreen.props.actionName === "ManageBookings"
            ? "booking"
            : super.mainButton;
    },
});
