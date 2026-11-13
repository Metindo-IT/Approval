import { IotWebsocketService } from "@iot/iot_websocket_service";
import { patch } from "@web/core/utils/patch";

patch(IotWebsocketService, {
    dependencies: IotWebsocketService.dependencies.filter((dep) => dep !== "lazy_session"),
    _requestIotChannel(services, ws) {
        services.orm
            .call("iot.channel", "get_iot_channel", [0])
            .then((iotChannel) => this._addIotChannel(services.bus_service, ws, iotChannel));
    },
});
