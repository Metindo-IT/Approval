import { _t } from "@web/core/l10n/translation";

import { AccountReport } from "@account_reports/components/account_report/account_report";
import { AccountReportFilters } from "@account_reports/components/account_report/filters/filters";

export class L10nPhSlspReportFilters extends AccountReportFilters {
    get filterExtraOptionsData() {
        return {
            ...super.filterExtraOptionsData,
            'include_no_tin': {
                'name': _t("Including Partners Without TIN"),
            },
            'include_imports': {
                'name': _t("Including Importations"),
            },
        };
    }

    get selectedExtraOptions() {
        let selectedExtraOptionsName = super.selectedExtraOptions;

        if (this.controller.options.include_no_tin) {
            const includeNoTINName = _t("With Partners without TIN");

            selectedExtraOptionsName = selectedExtraOptionsName
                ? `${selectedExtraOptionsName}, ${includeNoTINName}`
                : includeNoTINName;
        }

        if (this.controller.options.include_imports) {
            const includeImportsName = _t("With Importations");
            selectedExtraOptionsName = selectedExtraOptionsName
                ? `${selectedExtraOptionsName}, ${includeImportsName}`
                : includeImportsName;
        }

        return selectedExtraOptionsName;
    }
};

AccountReport.registerCustomComponent(L10nPhSlspReportFilters, "l10n_ph_reports");
