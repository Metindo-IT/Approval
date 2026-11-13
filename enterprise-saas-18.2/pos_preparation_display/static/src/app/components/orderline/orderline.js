import { Component } from "@odoo/owl";
import { usePreparationDisplay } from "@pos_preparation_display/app/services/preparation_display_service";
import { useService } from "@web/core/utils/hooks";

export class Orderline extends Component {
    static template = "pos_preparation_display.Orderline";
    static props = {
        orderline: Object,
    };

    setup() {
        this.preparationDisplay = usePreparationDisplay();
        this.orm = useService("orm");
    }

    get attributeData() {
        const attributeVal = this.preparationDisplay.attributeValues;
        const attributes = this.preparationDisplay.attributes;

        return Object.values(
            this.props.orderline.attribute_ids.reduce((acc, attr) => {
                const attributeValue = attributeVal.find((v) => v.id === attr);
                const attribute = attributes.find((a) => a.id === attributeValue.attribute_id[0]);

                if (acc[attribute.id]) {
                    acc[attribute.id].value += `, ${attributeValue.name}`;
                } else {
                    acc[attribute.id] = {
                        id: attr,
                        name: attribute.name,
                        value: attributeValue.name,
                    };
                }

                return acc;
            }, {})
        );
    }
    changeChildrenState = (parentOrderline, newState, order) => {
        if (parentOrderline.combo_line_ids && parentOrderline.combo_line_ids.length > 0) {
            parentOrderline.combo_line_ids.forEach((childId) => {
                const childOrderline = order.orderlines.find((line) => line.id === childId);
                if (childOrderline) {
                    childOrderline.todo = newState;
                }
            });
        }
    };

    changeParentState = (childOrderline, newState, order) => {
        if (childOrderline.combo_parent_id) {
            const parentOrderline = order.orderlines.find(
                (line) => line.id === childOrderline.combo_parent_id
            );
            if (parentOrderline) {
                const children = parentOrderline.combo_line_ids
                    .map((childId) => order.orderlines.find((line) => line.id === childId))
                    .filter(Boolean);
                const allChildrenAreFalse = children.every((child) => child.todo === newState);
                if (allChildrenAreFalse) {
                    parentOrderline.todo = newState;
                }
            }
        }
    };
    async changeOrderlineStatus() {
        const orderline = this.props.orderline;
        const newState = !orderline.todo;
        const order = orderline.order;
        orderline.todo = newState;
        this.changeChildrenState(orderline, newState, order);
        this.changeParentState(orderline, newState, order);
        if (order.stageId !== this.preparationDisplay.lastStage.id) {
            this.preparationDisplay.changeOrderStage(order);
        }
    }
}
