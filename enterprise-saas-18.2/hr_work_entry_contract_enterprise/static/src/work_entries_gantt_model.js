import { useWorkEntry } from "@hr_work_entry_contract/views/work_entry_hook";
import { localStartOf } from "@web_gantt/gantt_helpers";
import { GanttModel } from "@web_gantt/gantt_model";

const { DateTime } = luxon;

export class WorkEntriesGanttModel extends GanttModel {
    /**
     * @override
     */
    setup() {
        super.setup(...arguments);
        const { generateWorkEntries } = useWorkEntry({ getRange: () => this.getRange() });
        this.generateWorkEntries = generateWorkEntries;
    }

    getRange() {
        const { globalStart, globalStop } = this._buildMetaData();
        return { start: globalStart, end: globalStop.minus({ millisecond: 1 }) };
    }

    getRangeFromDate(rangeId, date) {
        const startDate = localStartOf(date, rangeId);
        const stopDate = startDate.plus({ [rangeId]: 1 }).minus({ day: 1 });
        return { focusDate: date, startDate, stopDate, rangeId };
    }

    /**
     * @protected
     * @override
     */
    async _fetchData(metaData) {
        const { globalStart } = metaData;
        if (globalStart <= DateTime.local().plus({ months: 1 })) {
            await this.generateWorkEntries();
        }
        return super._fetchData(...arguments);
    }
}
