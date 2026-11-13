import { serializeDateTime } from "@web/core/l10n/dates";
import { fields, models } from "@web/../tests/web_test_helpers";
const { DateTime } = luxon;

export class TimerTimer extends models.Model {
    _name = "timer.timer";

    timer_start = fields.Datetime();
    timer_pause = fields.Datetime();
    is_timer_running = fields.Boolean();
    res_model = fields.Char();
    res_id = fields.Integer();
    user_id = fields.Many2one({ relation: "res.users" });

    action_timer_start(resId) {
        if (!this.read(resId, ["timer_start"])[0].timer_start) {
            this.write(resId, {
                timer_start: this.get_server_time(),
            });
        }
    }

    get_server_time() {
        return serializeDateTime(DateTime.now());
    }
}

export const timerModels = { TimerTimer };
