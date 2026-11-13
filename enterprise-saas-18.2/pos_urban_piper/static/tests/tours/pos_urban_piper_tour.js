import * as TicketScreen from "@point_of_sale/../tests/pos/tours/utils/ticket_screen_util";
import * as Order from "@point_of_sale/../tests/generic_helpers/order_widget_util";
import * as UrbanPiper from "@pos_urban_piper/../tests/tours/utils/pos_urban_piper_utils";
import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";
import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("OrderFlowTour", {
    checkDelay: 50,
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            UrbanPiper.fetchDeliveryData(),
            UrbanPiper.checkNewOrderCount(2),
            UrbanPiper.onDropdownStatus("New"),
            UrbanPiper.orderButtonClick("Accept"),
            UrbanPiper.fetchDeliveryData(),
            UrbanPiper.checkNewOrderCount(1),
            TicketScreen.selectOrder("001"),
            TicketScreen.nthRowContains(2, "Acknowledged"),
            TicketScreen.nthRowContains(2, "Just Eat"),
            UrbanPiper.fetchDeliveryData(),
            UrbanPiper.onDropdownStatus("New"),
            TicketScreen.selectOrder("002"),
            UrbanPiper.orderButtonClick("Accept"),
            UrbanPiper.fetchDeliveryData(),
            UrbanPiper.checkNewOrderCount(0),
            TicketScreen.nthRowContains(1, "Acknowledged"),
            UrbanPiper.onDropdownStatus("Ongoing"),
            TicketScreen.selectOrder("001"),
            UrbanPiper.orderButtonClick("Mark as ready"),
            UrbanPiper.fetchDeliveryData(),
            TicketScreen.nthRowContains(1, "Food Ready"),
            UrbanPiper.onDropdownStatus("Ongoing"),
            TicketScreen.selectOrder("002"),
            UrbanPiper.orderButtonClick("Mark as ready"),
            UrbanPiper.fetchDeliveryData(),
            TicketScreen.nthRowContains(2, "Food Ready"),
        ].flat(),
});

registry.category("web_tour.tours").add("OrderWithInstructionTour", {
    checkDelay: 50,
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            UrbanPiper.fetchDeliveryData(),
            UrbanPiper.checkNewOrderCount(1),
            UrbanPiper.onDropdownStatus("New"),
            Order.hasCustomerNote("Make it spicy.."),
            UrbanPiper.orderButtonClick("Accept"),
            UrbanPiper.fetchDeliveryData(),
            UrbanPiper.checkNewOrderCount(0),
            TicketScreen.nthRowContains(1, "Acknowledged"),
            TicketScreen.nthRowContains(1, "Just Eat"),
            TicketScreen.selectOrder("001"),
            UrbanPiper.orderButtonClick("Mark as ready"),
            UrbanPiper.fetchDeliveryData(),
            TicketScreen.nthRowContains(1, "Food Ready"),
        ].flat(),
});

registry.category("web_tour.tours").add("OrderWithChargesAndDiscountTour", {
    checkDelay: 50,
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            UrbanPiper.fetchDeliveryData(),
            UrbanPiper.checkNewOrderCount(1),
            UrbanPiper.onDropdownStatus("New"),
            UrbanPiper.orderButtonClick("Accept"),
            UrbanPiper.fetchDeliveryData(),
            UrbanPiper.checkNewOrderCount(0),
            TicketScreen.nthRowContains(1, "Acknowledged"),
            TicketScreen.nthRowContains(1, "Just Eat"),
            TicketScreen.selectOrder("001"),
            UrbanPiper.orderButtonClick("Mark as ready"),
            UrbanPiper.fetchDeliveryData(),
            TicketScreen.nthRowContains(1, "Food Ready"),
        ].flat(),
});
