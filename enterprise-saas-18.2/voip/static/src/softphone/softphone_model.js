import { Correspondence } from "@voip/core/correspondence_model";
import { isSubstring } from "@voip/utils/utils";

export class Softphone {
    activeTabId = "activity";
    isDisplayed = false;
    isFolded = false;
    /**
     * The auto-call mode is turned on when the user clicks on the call button
     * from the “Next Activities” tab.
     */
    isInAutoCallMode = false;
    numpad = {
        isOpen: false,
        value: "",
        selection: {
            start: 0,
            end: 0,
            direction: "none",
        },
    };
    searchBarInputValue = "";
    selectedCorrespondence;
    shouldFocus = false;

    constructor(store, voip) {
        this.store = store;
        this.voip = voip;
    }

    get activities() {
        const searchBarInputValue = this.searchBarInputValue.trim();
        return Object.values(this.store["mail.activity"].records).filter(
            (activity) =>
                activity.activity_category === "phonecall" &&
                ["today", "overdue"].includes(activity.state) &&
                activity.phone &&
                activity.user_id[0] === this.store.self.userId &&
                (!searchBarInputValue ||
                    [
                        activity.partner.name,
                        activity.partner.displayName,
                        activity.phone,
                        activity.name,
                    ].some((x) => isSubstring(x, searchBarInputValue)))
        );
    }

    get contacts() {
        return Object.values(this.store.Persona.records).filter(
            (contact) =>
                contact.phone &&
                (!this.searchBarInputValue ||
                    [
                        contact.name,
                        contact.displayName,
                        contact.phone,
                    ].some((x) => isSubstring(x, this.searchBarInputValue)))
        );
    }

    get recentCalls() {
        const filteredCalls = (() => {
            if (this.searchBarInputValue) {
                return Object.values(this.voip.calls).filter(
                    (call) =>
                        isSubstring(call.phoneNumber, this.searchBarInputValue) ||
                        (call.partner && isSubstring(call.partner.name, this.searchBarInputValue))
                );
            }
            return Object.values(this.voip.calls);
        })();
        return filteredCalls.sort((a, b) => a.id < b.id);
    }

    closeNumpad() {
        this.numpad.isOpen = false;
    }

    fold() {
        if (this.store.isSmall) {
            return;
        }
        this.isFolded = true;
    }

    hide() {
        this.isDisplayed = false;
    }

    openNumpad() {
        this.numpad.isOpen = true;
        this.shouldFocus = true;
    }

    selectCorrespondence({ activity, partner, call }) {
        this.selectedCorrespondence = new Correspondence({ activity, partner, call });
    }

    selectNextActivity() {
        const nextActivity = this.activities.find((activity) => !activity.postponed);
        if (nextActivity) {
            this.selectCorrespondence({ activity: nextActivity });
        } else {
            this.isInAutoCallMode = false;
        }
    }

    show() {
        this.isDisplayed = true;
        this.isFolded = false;
        this.shouldFocus = true;
    }

    unfold() {
        this.isFolded = false;
        this.shouldFocus = true;
    }
}
