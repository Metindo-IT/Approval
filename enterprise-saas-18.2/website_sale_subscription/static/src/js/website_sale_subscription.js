import VariantMixin from "@website_sale/js/sale_variant_mixin";
import { WebsiteSale } from '@website_sale/js/website_sale';

WebsiteSale.include({

    /**
     * Override of `_updateRootProduct` to add the subscription plan id to the rootProduct for
     * subscription products.
     *
     * @override
     * @private
     * @param {HTMLFormElement} form - The form in which the product is.
     *
     * @returns {void}
     */
    _updateRootProduct(form) {
        this._super(...arguments);
        const selected_plan =
            form.querySelector('.product_price .plan_select')?.value
            ?? form.querySelector('#add_to_cart')?.dataset.subscriptionPlanId;
        if (selected_plan) {
            Object.assign(this.rootProduct, {
                plan_id: parseInt(selected_plan),
            });
        }
    },

    /**
     * @override
     * @private
     * @param {MouseEvent} ev
     */
    async _onClickAdd(ev) {
        $(ev.currentTarget).closest('form').find('.plan_select > option').each(function() {
            this.disabled = !this.selected;
        })
        return this._super(...arguments);
    },

    /**
     * Update the renting text when the combination change.
     * @override
     */
    _onChangeCombination: function (){
        this._super.apply(this, arguments);
        VariantMixin._onChangeCombinationSubscription.apply(this, arguments);
    },
});
