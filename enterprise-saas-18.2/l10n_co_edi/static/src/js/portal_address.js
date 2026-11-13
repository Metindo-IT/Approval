import { SelectMenuWrapper } from "@l10n_latam_base/components/select_menu_wrapper/select_menu_wrapper";
import customerAddress from "@portal/js/address";
import { rpc } from "@web/core/network/rpc";
import { attachComponent } from "@web_editor/js/core/owl_utils";

customerAddress.include({
    events: Object.assign({}, customerAddress.prototype.events, {
        "change select[name='l10n_latam_identification_type_id']": "_onChangeIdentificationType",
    }),
    start: function () {
        this._super.apply(this, arguments);
        this.isColombianCompany = this.countryCode === "CO";
        this.elementCountry = this.addressForm.country_id;
        this.useDeliveryAsBilling = this.addressForm["use_delivery_as_billing"].value;
        this.vat = this.addressForm["o_vat"];

        if (this.isColombianCompany) {
            this.elementCities = this.addressForm.city_id;
            this.elementState = this.addressForm.state_id;

            if (!this.vat || (this.addressType !== "billing" && !this.useDeliveryAsBilling)) {
                return;
            }

            const selectEl = this.el.querySelector("select[name='l10n_co_edi_obligation_type_ids']");
            attachComponent(this, selectEl.parentElement, SelectMenuWrapper, {
                el: selectEl,
            });
            $("select[name='l10n_latam_identification_type_id']").change();
        }
    },
    _onChangeIdentificationType(ev) {
        if (!this.isColombianCompany || !this.vat || (this.addressType !== "billing" && !this.useDeliveryAsBilling)) {
            return;
        }

        const selectedIdentificationType = this.addressForm.l10n_latam_identification_type_id.selectedOptions[0].text;

        if (selectedIdentificationType === "NIT") {
            this._showInput("l10n_co_edi_obligation_type_ids");
            this._showInput("l10n_co_edi_fiscal_regimen");
        } else {
            this._hideInput("l10n_co_edi_obligation_type_ids");
            this._hideInput("l10n_co_edi_fiscal_regimen");
        }
    },
    async _onChangeState() {
        await this._super(...arguments);
        const selectedCountry = this.elementCountry.value
            ? this.elementCountry.selectedOptions[0].getAttribute("code")
            : "";
        if (this.isColombianCompany && selectedCountry === "CO") {
            const stateId = this.elementState.value;
            let choices = [];
            if (stateId) {
                const data = await rpc(`/portal/l10n_co_state_infos/${this.elementState.value}`, {});
                choices = data.cities;
            }
            this.elementCities.options.length = 1;
            if (choices.length) {
                choices.forEach((item) => {
                    const option = new Option(item[1], item[0]);
                    option.setAttribute("data-code", item[2]);
                    this.elementCities.appendChild(option);
                });
            }
        }
    },
    async _changeCountry(init=false) {
        await this._super(...arguments);
        if (this.isColombianCompany) {
            const selectedCountry = this.elementCountry.value
                ? this.elementCountry.selectedOptions[0].getAttribute("code")
                : "";
            if (selectedCountry == "CO") {
                let cityInput = this.addressForm.city;
                if (cityInput.value) {
                    cityInput.value = '';
                }
                this._hideInput("city");
                this._showInput("city_id");
            } else {
                this._hideInput("city_id");
                this._showInput("city");
                this.elementCities.value = '';
            }
        }
    },
});
