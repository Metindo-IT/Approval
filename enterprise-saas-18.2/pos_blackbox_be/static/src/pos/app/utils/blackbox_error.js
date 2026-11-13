const errors = {
    "000": "No error",
    "001": "PIN accepted.",
    101: "Fiscal Data Module memory 90% full.",
    102: "Already handled request.",
    103: "No record.",
    199: "Unspecified warning.",
    201: "No Vat Signing Card or Vat Signing Card broken.",
    202: "Please initialize the Vat Signing Card with PIN.",
    203: "Vat Signing Card blocked.",
    204: "Invalid PIN.",
    205: "Fiscal Data Module memory full.",
    206: "Unknown identifier.",
    207: "Invalid data in message.",
    208: "Fiscal Data Module not operational.",
    209: "Fiscal Data Module real time clock corrupt.",
    210: "Vat Signing Card not compatible with Fiscal Data Module.",
    299: "Unspecified error.",
};

export class BlackboxError extends Error {
    constructor(code, message = null) {
        super(message);
        this.name = "BLACKBOX_ERROR";
        this.type = "blackbox";
        this.code = code;
        this.message = message || errors[code.toString().substring(0, 3)];
    }
}
