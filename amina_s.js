const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const extend = require('zigbee-herdsman-converters/lib/extend');
const utils = require('zigbee-herdsman-converters/lib/utils');
const ota = require('zigbee-herdsman-converters/lib/ota');
const constants = require('zigbee-herdsman-converters/lib/constants');
const e = exposes.presets;
const ea = exposes.access;

const aminaManufacturer = {manufacturerCode: 0x143B};

const Amina_S_Control = {
    cluster: 65255,
    max_current_level: 0,
    alarms: 2,
    ev_status: 3,
    connect_status: 4,
    total_active_energy: 16,
    last_session_energy: 17,
}

const Amina_S_Alarms = ['Welded relay(s)', 'Wrong voltage balance', 'RDC-DD DC Leakage', 'RDC-DD AC Leakage', 
                        'Temperature error', 'Overvoltage alarm', 'Overcurrent alarm', 'Car communication error',
                        'Charger processing error', 'Critical overcurrent alarm'];

const DataType = {
    uint32: 35,
    uint16: 33,
    uint8: 0x20,
    enum8: 0x30,
    bitmap16: 25,
}

const fzLocal = {
    charge_limit: {
        cluster: "genLevelCtrl",
        type: ["attributeReport", "readResponse"],
        convert: (model, msg, publish, options, meta) => {
            const result = {};
            if (msg.data.hasOwnProperty("currentLevel")) {
                result.charge_limit = msg.data["currentLevel"];
            }
            
            return result;
        },
    },
    amina_s: {
        cluster: Amina_S_Control.cluster.toString(),
        type: ["attributeReport", "readResponse"],
        convert: (model, msg, publish, options, meta) => {
            const result = {};
            if (msg.data.hasOwnProperty(Amina_S_Control.charge_limit_max)) {
                result.charge_limit_max = msg.data[Amina_S_Control.charge_limit_max];
            }
            
            if (msg.data.hasOwnProperty(Amina_S_Control.alarms)) {
                result.alarms = [];
                result.alarm_active = false;

                for (let i = 0; i < Amina_S_Alarms.length; i++){
                    if ((msg.data[Amina_S_Control.alarms] >> i) & 0x01) {
                        result.alarms.push(Amina_S_Alarms[i]);
                        result.alarm_active = true;
                    }
                }
            }

            if (msg.data.hasOwnProperty("3")) {
                const connectStatusLookup = {
                    0b0000: 'Not Connected', 
                    0b0001: 'EV Connected', 
                    0b0011: 'Ready to Charge', 
                    0b0111: 'Charging', 
                    0b1011: 'Paused'
                };

                try {
                    result.ev_status = utils.getFromLookup(msg.data["3"] & 0x0F, connectStatusLookup);
                } catch (e) {
                    result.ev_status = 'Unknown Status: ' + msg.data["3"];
                }

                result.derating = (msg.data[Amina_S_Control.ev_status] >> 0x0F) & 0x01;
            }

            if (msg.data.hasOwnProperty(Amina_S_Control.connect_status)) {
                result.connect_status = msg.data[Amina_S_Control.connect_status];
            }
            
            if (msg.data.hasOwnProperty(Amina_S_Control.total_active_energy)) {
                result.total_active_energy = msg.data[Amina_S_Control.total_active_energy];
            }

            if (msg.data.hasOwnProperty(Amina_S_Control.last_session_energy)) {
                result.last_session_energy = msg.data[Amina_S_Control.last_session_energy];
            }
            
            return result;
        },
    },
};

const tzLocal = {
    amina_s: {
        key: ['charge_limit'],
        convertSet: async (entity, key, value, meta) => {
            const endpoint = entity.getDevice().getEndpoint(10);
            switch(key) {
                case 'charge_limit':
                    const payload = {level: value, transtime: 0};
                    await endpoint.command('genLevelCtrl', 'moveToLevel', payload, utils.getOptions(meta.mapped, entity));
                    break;
            }
        },
        
        convertGet: async (entity, key, meta) => {
            const endpoint = entity.getDevice().getEndpoint(10);
            if (key === "charge_limit") {
                await endpoint.read('genLevelCtrl', ['currentLevel'], aminaManufacturer);
            }
        },
    },
    total_active_energy: {
        key: ['total_active_energy'],
        convertGet: async (entity, key, meta) => {
            const endpoint = entity.getDevice().getEndpoint(10);
            await endpoint.read(Amina_S_Control.cluster, [Amina_S_Control.total_active_energy], aminaManufacturer);
        },
    },
    last_session_energy: {
        key: ['last_session_energy'],
        convertGet: async (entity, key, meta) => {
            const endpoint = entity.getDevice().getEndpoint(10);
            await endpoint.read(Amina_S_Control.cluster, [Amina_S_Control.last_session_energy], aminaManufacturer);
        },
    },
};

const definition = {
    zigbeeModel: ['amina S'],
    model: 'amina S',
    vendor: 'Amina Distribution AS',
    description: 'Amina S EV Charger',
    //ota: ota.zigbeeOTA,
    fromZigbee: [fz.on_off, fzLocal.charge_limit, fzLocal.amina_s, fz.electrical_measurement],
    toZigbee: [tz.on_off, tzLocal.amina_s, tzLocal.total_active_energy, tzLocal.last_session_energy],
    exposes: [e.switch(), 
            e.numeric('charge_limit', ea.ALL).withUnit('A')
                .withValueMin(6).withValueMax(32).withValueStep(1)
                .withDescription('Maximum allowed amperage draw'),
            e.text('ev_status', ea.STATE).withDescription('Current charging status'),
            e.power(),
            e.current(),
            e.numeric('total_active_energy', ea.STATE_GET).withUnit('Wh').withDescription('Sum of consumed energy'),
            e.numeric('last_session_energy', ea.STATE_GET).withUnit('Wh').withDescription('Sum of consumed energy last session'),
            e.numeric('alarms', ea.STATE).withDescription('Alarms reported by EV Charger'),
            e.binary('alarm_active', ea.STATE, 'true', 'false').withDescription('An active alarm is present'),
            e.ac_frequency().withCategory('diagnostic'),
            e.voltage().withCategory('diagnostic'),
            e.numeric('voltage_phase_b', ea.STATE).withUnit('V').withDescription('Measured electrical potential value on phase B').withCategory('diagnostic'),
            e.numeric('voltage_phase_c', ea.STATE).withUnit('V').withDescription('Measured electrical potential value on phase C').withCategory('diagnostic'),
            e.numeric('current_phase_b', ea.STATE).withUnit('A').withDescription('Instantaneous measured electrical current on phase B').withCategory('diagnostic'),
            e.numeric('current_phase_c', ea.STATE).withUnit('A').withDescription('Instantaneous measured electrical current on phase C').withCategory('diagnostic'),	
        ],

    endpoint: (device) => {
        return {'default': 10};
    },

    configure: async (device, coordinatorEndpoint, logger) => {
        const endpoint = device.getEndpoint(10);
        await reporting.bind(endpoint, coordinatorEndpoint, ['genOnOff', 'genLevelCtrl', 'haElectricalMeasurement', Amina_S_Control.cluster]);
        await endpoint.read('genOnOff', ['onOff']);
        await reporting.onOff(endpoint);
        await reporting.readEletricalMeasurementMultiplierDivisors(endpoint, true);
        await endpoint.read('genLevelCtrl', ['currentLevel', 'minLevel', 'maxLevel']);
        await endpoint.configureReporting('genLevelCtrl', [{
            attribute: {ID: 'currentLevel', type: DataType.uint8},
            minimumReportInterval: 0,
            maximumReportInterval: constants.repInterval.MINUTE,
            reportableChange: 0}]);

        await endpoint.read(Amina_S_Control.cluster, [// Amina_S_Control.max_current_level, // Not implemented
                                                    Amina_S_Control.alarms, 
                                                    Amina_S_Control.ev_status, 
                                                    Amina_S_Control.connect_status, 
                                                    Amina_S_Control.total_active_energy, 
                                                    Amina_S_Control.last_session_energy
                                                    ]);

        await endpoint.configureReporting(Amina_S_Control.cluster, [{
            attribute: {ID: Amina_S_Control.alarms, type: DataType.bitmap16},
            minimumReportInterval: 0,
            maximumReportInterval: constants.repInterval.MINUTE,
            reportableChange: 0}]);
        await endpoint.configureReporting(Amina_S_Control.cluster, [{
            attribute: {ID: Amina_S_Control.ev_status, type: DataType.bitmap16},
            minimumReportInterval: 0,
            maximumReportInterval: constants.repInterval.MINUTE,
            reportableChange: 0}]);
        await endpoint.configureReporting(Amina_S_Control.cluster, [{
            attribute: {ID: Amina_S_Control.connect_status, type: DataType.bitmap16},
            minimumReportInterval: 0,
            maximumReportInterval: constants.repInterval.MINUTE,
            reportableChange: 0}]);

    },

};

module.exports = definition;